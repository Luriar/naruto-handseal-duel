import type { SealPrediction } from './ruleBasedSealClassifier'
import type { Seal } from './sealTypes'

/**
 * 시간적 안정화기.
 *
 * 프레임 단위 예측은 아무리 좋아도 튄다. 설계 문서의
 * Ready → SealDetected → SealConfirmed → WaitForRelease 상태 머신을 구현해
 * "확정된 인" 이벤트를 안정적으로 발생시킨다.
 *
 * - 최근 프레임 창에서 다수결 + 평균 신뢰도로 후보를 세운다.
 * - 후보가 CONFIRM_FRAMES 이상 유지되면 확정 이벤트를 1회 발생.
 * - 확정 후에는 릴리즈(인을 풀거나 다른 인으로 전환)될 때까지
 *   같은 인을 다시 확정하지 않는다 (중복 입력 방지).
 * - 짧은 refractory로 전환 중 오확정을 막는다.
 */

export type StabilizerPhase = 'idle' | 'building' | 'held'

export type StabilizerFrame = {
  seal: Seal
  confidence: number
  timestamp: number
}

export type StabilizerOutput = {
  phase: StabilizerPhase
  /** 현재 다수결 후보 (확정 전) */
  candidateSeal: Seal
  /** 확정까지의 진행도 0..1 (UI 링 게이지용) */
  candidateProgress: number
  /** 이번 프레임에 새로 확정된 인 (이벤트, 1프레임만 non-null) */
  justConfirmed: Seal | null
  /** 현재 유지 중인 확정 인 */
  heldSeal: Seal
  /** 창 내 예측 변동성 0(안정)..1(널뜀) — 안정성 점수에 사용 */
  flicker: number
  /** 창 내 평균 신뢰도 */
  meanConfidence: number
}

export type SealStabilizerConfig = {
  windowSize: number
  confirmFrames: number
  confirmWindow: number
  minConfidence: number
  releaseFrames: number
  refractoryMs: number
  provisionalFloor: number
}

export const DEFAULT_STABILIZER_CONFIG: SealStabilizerConfig = {
  windowSize: 12,
  confirmFrames: 6,
  confirmWindow: 9,
  minConfidence: 0.48,
  releaseFrames: 4,
  refractoryMs: 180,
  provisionalFloor: 0.36,
}

export type SealStabilizer = {
  push: (prediction: SealPrediction, timestamp: number) => StabilizerOutput
  reset: () => void
}

export function createSealStabilizer(
  partialConfig?: Partial<SealStabilizerConfig>,
): SealStabilizer {
  const config: SealStabilizerConfig = {
    ...DEFAULT_STABILIZER_CONFIG,
    ...partialConfig,
  }

  let frames: StabilizerFrame[] = []
  let heldSeal: Seal = 'unknown'
  let refractoryUntil = 0

  const reset = () => {
    frames = []
    heldSeal = 'unknown'
    refractoryUntil = 0
  }

  const push = (
    prediction: SealPrediction,
    timestamp: number,
  ): StabilizerOutput => {
    // 프레임의 "유효 인": 확정 판정이면 그 인, 아니면 임계 이상의 provisional
    const effectiveSeal: Seal =
      prediction.seal !== 'unknown'
        ? prediction.seal
        : prediction.provisionalConfidence >= config.provisionalFloor
          ? prediction.provisionalSeal
          : 'unknown'
    const effectiveConfidence =
      prediction.seal !== 'unknown'
        ? prediction.confidence
        : prediction.provisionalConfidence

    frames.push({
      seal: effectiveSeal,
      confidence: effectiveConfidence,
      timestamp,
    })
    if (frames.length > config.windowSize) {
      frames = frames.slice(frames.length - config.windowSize)
    }

    const recent = frames.slice(-config.confirmWindow)

    // 다수결 후보
    const counts = new Map<Seal, { count: number; confSum: number }>()
    for (const frame of recent) {
      if (frame.seal === 'unknown') continue
      const entry = counts.get(frame.seal) ?? { count: 0, confSum: 0 }
      entry.count += 1
      entry.confSum += frame.confidence
      counts.set(frame.seal, entry)
    }

    let candidateSeal: Seal = 'unknown'
    let candidateCount = 0
    let candidateConf = 0
    for (const [seal, entry] of counts) {
      if (entry.count > candidateCount) {
        candidateSeal = seal
        candidateCount = entry.count
        candidateConf = entry.confSum / entry.count
      }
    }

    // 변동성: 창 내 인이 바뀐 횟수 비율
    let changes = 0
    for (let i = 1; i < frames.length; i += 1) {
      if (frames[i].seal !== frames[i - 1].seal) changes += 1
    }
    const flicker = frames.length > 1 ? changes / (frames.length - 1) : 0
    const meanConfidence =
      frames.length > 0
        ? frames.reduce((sum, frame) => sum + frame.confidence, 0) / frames.length
        : 0

    // ── 릴리즈 판정 (held 상태에서) ──
    if (heldSeal !== 'unknown') {
      const releaseWindow = frames.slice(-config.releaseFrames)
      const stillHolding = releaseWindow.some((frame) => frame.seal === heldSeal)

      if (releaseWindow.length >= config.releaseFrames && !stillHolding) {
        heldSeal = 'unknown'
        // 릴리즈 직후 곧바로 다음 확정이 가능해야 빠른 연계(전환 속도)가 산다.
      } else {
        return {
          phase: 'held',
          candidateSeal,
          candidateProgress: 0,
          justConfirmed: null,
          heldSeal,
          flicker,
          meanConfidence,
        }
      }
    }

    // ── 확정 판정 ──
    const inRefractory = timestamp < refractoryUntil
    const progress =
      candidateSeal === 'unknown' || inRefractory
        ? 0
        : Math.min(candidateCount / config.confirmFrames, 1)

    if (
      !inRefractory &&
      candidateSeal !== 'unknown' &&
      candidateCount >= config.confirmFrames &&
      candidateConf >= config.minConfidence
    ) {
      heldSeal = candidateSeal
      refractoryUntil = timestamp + config.refractoryMs
      return {
        phase: 'held',
        candidateSeal,
        candidateProgress: 1,
        justConfirmed: candidateSeal,
        heldSeal,
        flicker,
        meanConfidence,
      }
    }

    return {
      phase: candidateSeal === 'unknown' ? 'idle' : 'building',
      candidateSeal,
      candidateProgress: progress,
      justConfirmed: null,
      heldSeal: 'unknown',
      flicker,
      meanConfidence,
    }
  }

  return { push, reset }
}
