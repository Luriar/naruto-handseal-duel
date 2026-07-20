import type { HandSample } from '../hand-tracking/landmarkTypes'
import { extractCoarseGestureFeatures } from './coarseGestureFeatures'
import { extractPoseFeatures } from './handPoseFeatures'
import type { PoseFrameFeatures } from './handPoseFeatures'
import {
  CLASSIFIABLE_SEAL_LIST,
  SEAL_TEMPLATES,
  flattenMergedFeatures,
  flattenTwoHandFeatures,
} from './sealTemplates'
import type { FeatureKey, FeatureTarget, MergedFeatureKey } from './sealTemplates'
import type { CalibrationStore } from './userCalibration'
import {
  SEAL_TO_FAMILY,
  areSameFamily,
  getSealsInFamily,
} from './ruleBasedSealClassifier'
import type {
  SealFamilyScore,
  SealPrediction,
  SealRuleScore,
} from './ruleBasedSealClassifier'
import type { Seal } from './sealTypes'

/**
 * v2 인 분류기 — 템플릿 매칭 기반.
 *
 * 기존 룰 기반 분류기(블롭 통계)를 대체한다. 핵심 개선:
 *
 * 1. 손가락 단위 특징 사용 — 인은 결국 "어떤 손가락을 펴고 어떻게 맞대는가"다.
 * 2. 좌우 역할 스왑 동시 평가 — 거울/반대 손 수행 자동 대응.
 * 3. merged(한 손 blob) 모드 — 겹친 손이 한 손으로 잡혀도 인식 계속.
 * 4. 개인 캘리브레이션 혼합 — 등록된 사용자 손 템플릿이 있으면 우선 반영.
 * 5. 시퀀스 문맥 보정 — 수련/대전 중 기대 인에 소폭 가산 (게임 판정용).
 *
 * 출력은 기존 SealPrediction과 완전 호환된다 (Lab/리플레이 스키마 유지).
 */

export type ClassifyOptions = {
  /** 시퀀스 진행 중 기대하는 인 (소폭 가산점) */
  expectedSeal?: Seal
  /** 사용자 캘리브레이션 저장소 */
  calibration?: CalibrationStore | null
}

const CONFIG = {
  /** 이 점수 미만이면 unknown (low_confidence) */
  ACCEPT_THRESHOLD: 0.42,
  /** 1·2위 격차가 이보다 작고 1위가 확신 구간이 아니면 ambiguous */
  AMBIGUITY_GAP: 0.045,
  /** 1위가 이 점수 이상이면 격차가 작아도 수용 */
  CONFIDENT_OVERRIDE: 0.66,
  /** provisional 최소 점수 */
  PROVISIONAL_MIN: 0.3,
  /** 기대 인 가산점 */
  EXPECTED_BONUS: 0.07,
  /** 기대 인 가산점을 주기 위한 최소 원점수 */
  EXPECTED_FLOOR: 0.33,
  /** merged 후보 판정 최소 likelihood */
  MERGED_MIN_LIKELIHOOD: 0.42,
  /** 캘리브레이션 혼합 비율 (개인 템플릿 쪽 가중) */
  USER_BLEND: 0.62,
} as const

export function classifySealV2(
  hands: HandSample[],
  options?: ClassifyOptions,
): SealPrediction {
  const coarse = extractCoarseGestureFeatures(hands)
  const pose = extractPoseFeatures(hands)
  const calibration = options?.calibration ?? null

  // ── 손 없음 ──
  if (pose.handCount === 0) {
    return buildPrediction({
      coarse,
      scores: emptyScores(),
      finalSeal: 'unknown',
      confidence: 0,
      failureReason: 'hands_lost',
      status: 'missing_hands',
      merged: false,
    })
  }

  // ── 한 손 검출 ──
  if (pose.handCount === 1) {
    const mergedLikely =
      coarse.trackingMode === 'merged_two_hand_candidate' ||
      pose.mergedLikelihood >= CONFIG.MERGED_MIN_LIKELIHOOD

    if (!mergedLikely) {
      // 진짜 한 손: 양손 인은 판정 불가
      return buildPrediction({
        coarse,
        scores: emptyScores(),
        finalSeal: 'unknown',
        confidence: 0,
        failureReason: 'one_hand_missing',
        status: 'missing_hands',
        merged: false,
      })
    }

    // merged blob: 겹친 양손으로 간주하고 merged 템플릿으로 평가
    const scores = scoreMergedMode(pose, options?.expectedSeal)
    return decide({ coarse, scores, merged: true })
  }

  // ── 양손 정상 추적 ──
  const scores = scoreTwoHandMode(pose, calibration, options?.expectedSeal)
  return decide({ coarse, scores, merged: false })
}

// ───────────────────────── 점수 계산 ─────────────────────────

type ScoredSeal = {
  seal: Seal
  score: number
  reasons: string[]
}

function scoreTwoHandMode(
  pose: PoseFrameFeatures,
  calibration: CalibrationStore | null,
  expectedSeal: Seal | undefined,
): ScoredSeal[] {
  const normal = flattenTwoHandFeatures(pose, false)
  const swapped = flattenTwoHandFeatures(pose, true)

  if (!normal) {
    return emptyScores()
  }

  const scores: ScoredSeal[] = CLASSIFIABLE_SEAL_LIST.map((seal) => {
    const template = SEAL_TEMPLATES[seal]

    const canonNormal = gaussianMatch(normal, template.twoHand)
    const canonSwapped =
      !template.symmetric && swapped
        ? gaussianMatch(swapped, template.twoHand)
        : null
    const canon =
      canonSwapped && canonSwapped.score > canonNormal.score
        ? canonSwapped
        : canonNormal

    let finalScore = canon.score
    let reasons = canon.reasons

    // 개인 캘리브레이션 혼합
    const calibrated = calibration?.seals?.[seal]
    if (calibrated) {
      const userTargets = calibratedToTargets(calibrated.mean, calibrated.std)
      const userNormal = gaussianMatch(normal, userTargets)
      const userSwapped = swapped ? gaussianMatch(swapped, userTargets) : null
      const user =
        userSwapped && userSwapped.score > userNormal.score
          ? userSwapped
          : userNormal

      const blended =
        canon.score * (1 - CONFIG.USER_BLEND) + user.score * CONFIG.USER_BLEND
      // 개인 템플릿이 기본 템플릿을 심하게 깎지는 못하게 하한 유지
      const guarded = Math.max(blended, canon.score * 0.82)

      if (user.score > canon.score) {
        reasons = [`calibrated match ${user.score.toFixed(2)}`, ...canon.reasons]
      }
      finalScore = guarded
    }

    return { seal, score: clamp01(finalScore), reasons }
  })

  return applyExpectedBonus(scores, expectedSeal)
}

function scoreMergedMode(
  pose: PoseFrameFeatures,
  expectedSeal: Seal | undefined,
): ScoredSeal[] {
  const mergedFeatures = flattenMergedFeatures(pose)

  const scores: ScoredSeal[] = CLASSIFIABLE_SEAL_LIST.map((seal) => {
    const template = SEAL_TEMPLATES[seal]
    if (!template.merged || !mergedFeatures) {
      return { seal, score: 0, reasons: ['merged 프로필 없음'] }
    }

    const match = gaussianMatchMerged(mergedFeatures, template.merged.targets)
    return {
      seal,
      score: clamp01(Math.min(match.score, template.merged.cap)),
      reasons: ['merged-blob 평가', ...match.reasons],
    }
  })

  return applyExpectedBonus(scores, expectedSeal)
}

function applyExpectedBonus(
  scores: ScoredSeal[],
  expectedSeal: Seal | undefined,
): ScoredSeal[] {
  const sorted = scores
    .map((entry) => {
      if (
        expectedSeal &&
        entry.seal === expectedSeal &&
        entry.score >= CONFIG.EXPECTED_FLOOR
      ) {
        return {
          ...entry,
          score: clamp01(entry.score + CONFIG.EXPECTED_BONUS),
          reasons: ['기대 인 보정 +', ...entry.reasons],
        }
      }
      return entry
    })
    .sort((a, b) => b.score - a.score)

  return sorted
}

function gaussianMatch(
  values: Record<FeatureKey, number>,
  targets: Partial<Record<FeatureKey, FeatureTarget>>,
): { score: number; reasons: string[] } {
  let weightedSum = 0
  let weightTotal = 0
  const contributions: { key: string; g: number; w: number }[] = []

  for (const key of Object.keys(targets) as FeatureKey[]) {
    const target = targets[key]
    if (!target) continue
    const value = values[key]
    if (typeof value !== 'number' || !Number.isFinite(value)) continue

    const z = (value - target.t) / Math.max(target.tol, 0.0001)
    const g = Math.exp(-0.5 * z * z)
    weightedSum += g * target.w
    weightTotal += target.w
    contributions.push({ key, g, w: target.w })
  }

  if (weightTotal === 0) {
    return { score: 0, reasons: [] }
  }

  const score = weightedSum / weightTotal
  const reasons = contributions
    .sort((a, b) => b.g * b.w - a.g * a.w)
    .slice(0, 3)
    .map((entry) => `${entry.key}:${entry.g.toFixed(2)}`)

  return { score, reasons }
}

function gaussianMatchMerged(
  values: Record<MergedFeatureKey, number>,
  targets: Partial<Record<MergedFeatureKey, FeatureTarget>>,
): { score: number; reasons: string[] } {
  let weightedSum = 0
  let weightTotal = 0
  const contributions: { key: string; g: number; w: number }[] = []

  for (const key of Object.keys(targets) as MergedFeatureKey[]) {
    const target = targets[key]
    if (!target) continue
    const value = values[key]
    if (typeof value !== 'number' || !Number.isFinite(value)) continue

    const z = (value - target.t) / Math.max(target.tol, 0.0001)
    const g = Math.exp(-0.5 * z * z)
    weightedSum += g * target.w
    weightTotal += target.w
    contributions.push({ key, g, w: target.w })
  }

  if (weightTotal === 0) {
    return { score: 0, reasons: [] }
  }

  const score = weightedSum / weightTotal
  const reasons = contributions
    .sort((a, b) => b.g * b.w - a.g * a.w)
    .slice(0, 3)
    .map((entry) => `${entry.key}:${entry.g.toFixed(2)}`)

  return { score, reasons }
}

function calibratedToTargets(
  mean: Partial<Record<FeatureKey, number>>,
  std: Partial<Record<FeatureKey, number>>,
): Partial<Record<FeatureKey, FeatureTarget>> {
  const targets: Partial<Record<FeatureKey, FeatureTarget>> = {}
  for (const key of Object.keys(mean) as FeatureKey[]) {
    const t = mean[key]
    if (typeof t !== 'number') continue
    targets[key] = {
      t,
      tol: Math.max(std[key] ?? 0.14, 0.08),
      w: 1,
    }
  }
  return targets
}

// ───────────────────────── 판정 ─────────────────────────

function decide(args: {
  coarse: SealPrediction['features']
  scores: ScoredSeal[]
  merged: boolean
}): SealPrediction {
  const { coarse, scores, merged } = args
  const best = scores[0] ?? { seal: 'unknown' as Seal, score: 0, reasons: [] }
  const second = scores[1] ?? { seal: 'unknown' as Seal, score: 0, reasons: [] }
  const gap = best.score - second.score

  // 저신뢰
  if (best.score < CONFIG.ACCEPT_THRESHOLD) {
    return buildPrediction({
      coarse,
      scores,
      finalSeal: 'unknown',
      confidence: 0,
      failureReason: 'low_confidence',
      status: 'low_confidence',
      merged,
    })
  }

  // 애매함 (단, 1위가 확신 구간이면 수용)
  if (gap < CONFIG.AMBIGUITY_GAP && best.score < CONFIG.CONFIDENT_OVERRIDE) {
    const sameFamily =
      best.seal !== 'unknown' &&
      second.seal !== 'unknown' &&
      areSameFamily(best.seal, second.seal)

    return buildPrediction({
      coarse,
      scores,
      finalSeal: 'unknown',
      confidence: 0,
      failureReason: 'ambiguous_between_seals',
      status: sameFamily ? 'ambiguous_same_family' : 'ambiguous_cross_family',
      merged,
    })
  }

  // 수용
  return buildPrediction({
    coarse,
    scores,
    finalSeal: best.seal,
    confidence: best.score,
    failureReason: 'none',
    status: 'accepted',
    merged,
  })
}

function buildPrediction(args: {
  coarse: SealPrediction['features']
  scores: ScoredSeal[]
  finalSeal: Seal
  confidence: number
  failureReason: SealPrediction['failureReason']
  status: SealPrediction['predictionStatus']
  merged: boolean
}): SealPrediction {
  const { coarse, scores, finalSeal, confidence, failureReason, status, merged } =
    args

  const ruleScores: SealRuleScore[] = scores.map((entry) => ({
    seal: entry.seal,
    score: entry.score,
    reasons: entry.reasons,
  }))

  const best = ruleScores[0] ?? { seal: 'unknown' as Seal, score: 0, reasons: [] }
  const second = ruleScores[1] ?? { seal: 'unknown' as Seal, score: 0, reasons: [] }

  // 패밀리 점수: 패밀리 내 최고 인 점수
  const familyMap = new Map<string, number>()
  for (const entry of ruleScores) {
    if (entry.seal === 'unknown') continue
    const family = SEAL_TO_FAMILY[entry.seal]
    const current = familyMap.get(family) ?? 0
    if (entry.score > current) {
      familyMap.set(family, entry.score)
    }
  }
  const familyScores: SealFamilyScore[] = [...familyMap.entries()]
    .map(([family, score]) => ({
      family: family as SealFamilyScore['family'],
      score,
      reasons: ['템플릿 매칭 최고점 기반'],
    }))
    .sort((a, b) => b.score - a.score)

  const bestFamily = familyScores[0] ?? {
    family: 'unknown' as SealFamilyScore['family'],
    score: 0,
    reasons: [],
  }
  const secondFamily = familyScores[1] ?? {
    family: 'unknown' as SealFamilyScore['family'],
    score: 0,
    reasons: [],
  }

  const familySeals = new Set(
    bestFamily.family === 'unknown' ? [] : getSealsInFamily(bestFamily.family),
  )
  const inFamily = ruleScores.filter((entry) => familySeals.has(entry.seal))
  const bestInFamily = inFamily[0] ?? best
  const secondInFamily =
    inFamily[1] ?? ({ seal: 'unknown' as Seal, score: 0, reasons: [] } as SealRuleScore)

  const provisionalSeal =
    best.score >= CONFIG.PROVISIONAL_MIN ? best.seal : ('unknown' as Seal)
  const provisionalConfidence = best.score >= CONFIG.PROVISIONAL_MIN ? best.score : 0

  return {
    seal: finalSeal,
    confidence: clamp01(confidence),
    failureReason,
    predictionStatus: status,
    provisionalSeal,
    provisionalConfidence,
    provisionalFamily:
      provisionalSeal === 'unknown' ? 'unknown' : SEAL_TO_FAMILY[provisionalSeal],
    bestGuessSeal: best.seal,
    bestGuessConfidence: best.score,
    isAmbiguous: best.score - second.score < CONFIG.AMBIGUITY_GAP,
    ambiguityGap: best.score - second.score,
    secondBestSeal: second.seal,
    secondBestConfidence: second.score,
    bestInFamilySeal: bestInFamily.seal,
    bestInFamilyConfidence: bestInFamily.score,
    secondInFamilySeal: secondInFamily.seal,
    secondInFamilyConfidence: secondInFamily.score,
    inFamilyAmbiguityGap: bestInFamily.score - secondInFamily.score,
    inFamilyIsAmbiguous:
      bestInFamily.score - secondInFamily.score < CONFIG.AMBIGUITY_GAP,
    scores: ruleScores,
    familyScores,
    bestFamily: bestFamily.family,
    bestFamilyConfidence: bestFamily.score,
    secondBestFamily: secondFamily.family,
    secondBestFamilyConfidence: secondFamily.score,
    familyAmbiguityGap: bestFamily.score - secondFamily.score,
    familyIsAmbiguous:
      bestFamily.score - secondFamily.score < CONFIG.AMBIGUITY_GAP,
    features: coarse,
    featureEvaluationMode: merged
      ? 'merged_single_blob_features'
      : 'normal_two_hand_features',
    usedMirrorVariant: 'not_applicable',
  }
}

function emptyScores(): ScoredSeal[] {
  return CLASSIFIABLE_SEAL_LIST.map((seal) => ({
    seal,
    score: 0,
    reasons: [],
  }))
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
}
