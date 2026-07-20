import type { Seal } from '../seal-recognition/sealTypes'
import type { JutsuVariant } from './jutsuData'

/**
 * variant-aware 시퀀스 판정기 (기획 v6 §10).
 *
 * - 시작 시 선언된 variant의 seals만 기준으로 진행한다 (자동 분기 없음).
 * - 확정된 인이 기대 인과 다르면 관용 1회 후 술식 붕괴.
 *   (안정화기를 통과한 "확정" 이벤트만 들어오므로 오입력은 대부분 진짜 오입력이다.
 *    그래도 카메라 환경을 감안해 첫 오입력은 경고로 처리한다.)
 * - 인 사이 간격이 timeout을 넘으면 차크라 조형 중단.
 * - 마지막 인 이후 condensation 윈도우가 지나면 발동(release).
 */

export type CastPhase =
  | 'idle'
  | 'casting'
  | 'condensing'
  | 'released'
  | 'failed'
  | 'cancelled'

export type CastFailureReason =
  | 'wrong_seal'
  | 'timeout'
  | 'hands_lost'
  | 'manual_cancel'
  | null

export type SealTimingRecord = {
  seal: Seal
  timestamp: number
  /** 이전 인 확정 → 이번 인 확정까지 ms */
  transitionMs: number
  confidence: number
}

export type CastSession = {
  variant: JutsuVariant
  phase: CastPhase
  expectedIndex: number
  confirmed: SealTimingRecord[]
  startedAt: number | null
  condensingSince: number | null
  releasedAt: number | null
  failureReason: CastFailureReason
  wrongSealWarnings: number
  /** 마지막으로 무시(경고)된 잘못된 인 */
  lastWrongSeal: Seal | null
}

export type CastScore = {
  totalMs: number
  meanTransitionMs: number
  meanConfidence: number
  /** 0..100 */
  accuracyScore: number
  /** 0..100 */
  speedScore: number
  /** 0..100 */
  stabilityScore: number
  /** 0..100 종합 */
  totalScore: number
  rankLabel: string
}

export const SEQUENCE_CONFIG = {
  /** 다음 인까지 허용 시간 */
  SEAL_TIMEOUT_MS: 6000,
  /** 잘못된 인 관용 횟수 */
  WRONG_SEAL_GRACE: 1,
} as const

export function createCastSession(variant: JutsuVariant): CastSession {
  return {
    variant,
    phase: 'idle',
    expectedIndex: 0,
    confirmed: [],
    startedAt: null,
    condensingSince: null,
    releasedAt: null,
    failureReason: null,
    wrongSealWarnings: 0,
    lastWrongSeal: null,
  }
}

export function getExpectedSeal(session: CastSession): Seal | null {
  if (session.phase === 'idle' || session.phase === 'casting') {
    return session.variant.seals[session.expectedIndex] ?? null
  }
  return null
}

/** 확정된 인 이벤트 반영 */
export function onSealConfirmed(
  session: CastSession,
  seal: Seal,
  timestamp: number,
  confidence: number,
): CastSession {
  if (
    session.phase === 'released' ||
    session.phase === 'failed' ||
    session.phase === 'cancelled' ||
    session.phase === 'condensing'
  ) {
    return session
  }

  const expected = session.variant.seals[session.expectedIndex]
  if (!expected) {
    return session
  }

  if (seal === expected) {
    const prevTimestamp =
      session.confirmed.length > 0
        ? session.confirmed[session.confirmed.length - 1].timestamp
        : timestamp
    const record: SealTimingRecord = {
      seal,
      timestamp,
      transitionMs: session.confirmed.length > 0 ? timestamp - prevTimestamp : 0,
      confidence,
    }
    const confirmed = [...session.confirmed, record]
    const nextIndex = session.expectedIndex + 1
    const isLast = nextIndex >= session.variant.seals.length

    return {
      ...session,
      phase: isLast ? 'condensing' : 'casting',
      expectedIndex: nextIndex,
      confirmed,
      startedAt: session.startedAt ?? timestamp,
      condensingSince: isLast ? timestamp : null,
      lastWrongSeal: null,
    }
  }

  // 잘못된 인
  if (session.phase === 'idle') {
    // 아직 시작 전이면 무시 (첫 인이 나올 때까지 대기)
    return { ...session, lastWrongSeal: seal }
  }

  if (session.wrongSealWarnings < SEQUENCE_CONFIG.WRONG_SEAL_GRACE) {
    return {
      ...session,
      wrongSealWarnings: session.wrongSealWarnings + 1,
      lastWrongSeal: seal,
    }
  }

  return {
    ...session,
    phase: 'failed',
    failureReason: 'wrong_seal',
    lastWrongSeal: seal,
  }
}

/** 매 프레임 시간 경과 반영. released로 전이되는 순간을 잡는다. */
export function onTick(session: CastSession, timestamp: number): CastSession {
  if (session.phase === 'casting') {
    const lastConfirmedAt =
      session.confirmed.length > 0
        ? session.confirmed[session.confirmed.length - 1].timestamp
        : session.startedAt

    if (
      lastConfirmedAt !== null &&
      timestamp - lastConfirmedAt > SEQUENCE_CONFIG.SEAL_TIMEOUT_MS
    ) {
      return { ...session, phase: 'failed', failureReason: 'timeout' }
    }
    return session
  }

  if (session.phase === 'condensing' && session.condensingSince !== null) {
    if (timestamp - session.condensingSince >= session.variant.condensationMs) {
      return { ...session, phase: 'released', releasedAt: timestamp }
    }
  }

  return session
}

export function cancelCast(session: CastSession): CastSession {
  if (session.phase === 'casting' || session.phase === 'condensing') {
    return { ...session, phase: 'cancelled', failureReason: 'manual_cancel' }
  }
  return session
}

/** 응집 진행도 0..1 */
export function getCondensationProgress(
  session: CastSession,
  timestamp: number,
): number {
  if (session.phase !== 'condensing' || session.condensingSince === null) {
    return session.phase === 'released' ? 1 : 0
  }
  return Math.min(
    (timestamp - session.condensingSince) / session.variant.condensationMs,
    1,
  )
}

/** 완료된 시전 채점 */
export function scoreCast(session: CastSession, flickerMean: number): CastScore {
  const confirmed = session.confirmed
  const totalMs =
    confirmed.length >= 1 && session.releasedAt !== null && session.startedAt !== null
      ? session.releasedAt - session.startedAt
      : 0
  const transitions = confirmed.slice(1).map((record) => record.transitionMs)
  const meanTransitionMs =
    transitions.length > 0
      ? transitions.reduce((sum, value) => sum + value, 0) / transitions.length
      : 0
  const meanConfidence =
    confirmed.length > 0
      ? confirmed.reduce((sum, record) => sum + record.confidence, 0) /
        confirmed.length
      : 0

  const accuracyScore = Math.round(
    Math.max(0, meanConfidence * 100 - session.wrongSealWarnings * 12),
  )
  // 인당 700ms 이하면 만점, 2500ms면 0점
  const speedScore =
    transitions.length === 0
      ? 70
      : Math.round(
          Math.max(0, Math.min(1, (2500 - meanTransitionMs) / 1800)) * 100,
        )
  const stabilityScore = Math.round(Math.max(0, (1 - flickerMean * 1.6) * 100))
  const totalScore = Math.round(
    accuracyScore * 0.45 + speedScore * 0.3 + stabilityScore * 0.25,
  )

  const rankLabel =
    totalScore >= 92
      ? 'S'
      : totalScore >= 80
        ? 'A'
        : totalScore >= 65
          ? 'B'
          : totalScore >= 50
            ? 'C'
            : 'D'

  return {
    totalMs,
    meanTransitionMs,
    meanConfidence,
    accuracyScore,
    speedScore,
    stabilityScore,
    totalScore,
    rankLabel,
  }
}
