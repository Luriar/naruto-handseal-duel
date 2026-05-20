import type { HandSample } from '../hand-tracking/landmarkTypes'
import {
  extractCoarseGestureFeatures,
  type CoarseGestureFeatures,
} from './coarseGestureFeatures'
import type { RecognitionFailureReason } from './sealFailureReason'
import { ALL_SEALS, type Seal } from './sealTypes'

export type SealFamily =
  | 'vertical_tower'
  | 'compact_clasp'
  | 'compact_hidden'
  | 'wide_interlock'
  | 'offset_cross'
  | 'complex_raised'
  | 'unknown'

export type PredictionStatus =
  | 'accepted'
  | 'family_accepted_seal_ambiguous'
  | 'ambiguous_same_family'
  | 'ambiguous_cross_family'
  | 'family_ambiguous'
  | 'low_confidence'
  | 'missing_hands'

export type SealRuleScore = {
  seal: Seal
  score: number
  reasons: string[]
}

export type SealFamilyScore = {
  family: SealFamily
  score: number
  reasons: string[]
}

export type SealPrediction = {
  seal: Seal
  confidence: number
  failureReason: RecognitionFailureReason
  predictionStatus: PredictionStatus
  provisionalSeal: Seal
  provisionalConfidence: number
  provisionalFamily: SealFamily
  bestGuessSeal: Seal
  bestGuessConfidence: number
  isAmbiguous: boolean
  ambiguityGap: number
  secondBestSeal: Seal
  secondBestConfidence: number
  bestInFamilySeal: Seal
  bestInFamilyConfidence: number
  secondInFamilySeal: Seal
  secondInFamilyConfidence: number
  inFamilyAmbiguityGap: number
  inFamilyIsAmbiguous: boolean
  scores: SealRuleScore[]
  familyScores: SealFamilyScore[]
  bestFamily: SealFamily
  bestFamilyConfidence: number
  secondBestFamily: SealFamily
  secondBestFamilyConfidence: number
  familyAmbiguityGap: number
  familyIsAmbiguous: boolean
  features: CoarseGestureFeatures
  featureEvaluationMode: 'normal_two_hand_features' | 'merged_single_blob_features'
  usedMirrorVariant: 'not_applicable'
}

type WeightedRule = {
  value: number
  weight: number
  reason: string
}

export const SEAL_TO_FAMILY: Record<Seal, SealFamily> = {
  rat: 'compact_hidden',
  ox: 'offset_cross',
  tiger: 'vertical_tower',
  rabbit: 'offset_cross',
  dragon: 'complex_raised',
  snake: 'compact_clasp',
  horse: 'wide_interlock',
  ram: 'vertical_tower',
  monkey: 'offset_cross',
  rooster: 'wide_interlock',
  dog: 'compact_clasp',
  boar: 'compact_clasp',
  unknown: 'unknown',
}

export const FAMILY_TO_SEALS: Record<SealFamily, Seal[]> = {
  vertical_tower: ['tiger', 'ram'],
  compact_clasp: ['snake', 'dog', 'boar'],
  compact_hidden: ['rat'],
  wide_interlock: ['horse', 'rooster'],
  offset_cross: ['ox', 'monkey', 'rabbit'],
  complex_raised: ['dragon'],
  unknown: ['unknown'],
}

export const SEAL_RULE_CONFIG = {
  READABILITY_UNKNOWN_THRESHOLD: 0.4,
  BEST_SCORE_THRESHOLD: 0.3,
  AMBIGUITY_GAP_THRESHOLD: 0.06,
  FAMILY_ACCEPT_THRESHOLD: 0.45,
  FAMILY_AMBIGUITY_GAP_THRESHOLD: 0.08,
  SAME_FAMILY_SEAL_AMBIGUITY_GAP_THRESHOLD: 0.025,
  CROSS_FAMILY_SEAL_AMBIGUITY_GAP_THRESHOLD: 0.06,
  PROVISIONAL_MIN_CONFIDENCE: 0.35,
  OVERLAP_HIGH: 0.58,
  OVERLAP_MODERATE_LOW: 0.22,
  OVERLAP_MODERATE_HIGH: 0.68,
  COMPACTNESS_HIGH: 0.64,
  VERTICALITY_HIGH: 0.58,
  HORIZONTALITY_HIGH: 0.56,
  CLOSE_HAND_DISTANCE: 0.42,
  OFFSET_HIGH: 0.42,
  SYMMETRY_HIGH: 0.66,
  FINGERTIP_SPREAD_HIGH: 0.58,
  LOW_FINGERTIP_SPREAD: 0.42,
  MERGED_CONFIDENCE_MULTIPLIER: 0.78,
  INTERLOCK_HIGH: 0.62,
  TOWER_LIKE_HIGH: 0.62,
  BUNDLED_BLOB_HIGH: 0.62,
  RAM_INTERLOCK_PENALTY: 0.42,
  TIGER_INTERLOCK_PENALTY: 0.22,
  DRAGON_FAMILY_GATE_FLOOR: 0.35,
  DRAGON_FAMILY_GATE_PENALTY: 0.6,
} as const

const CLASSIFIABLE_SEALS = ALL_SEALS.filter((seal) => seal !== 'unknown')

export function classifySeal(hands: HandSample[]): SealPrediction {
  const features = extractCoarseGestureFeatures(hands)
  const baseScores = CLASSIFIABLE_SEALS.map((seal) =>
    scoreSeal(seal, features),
  )
  const familyScores = scoreSealFamilies(features)
  const scores = applyFamilyContextToScores(baseScores, familyScores).sort(
    (a, b) => b.score - a.score,
  )
  const context = createPredictionContext(features, scores, familyScores)

  if (
    features.trackingMode === 'no_hands' ||
    features.trackingMode === 'single_true_hand'
  ) {
    return buildPrediction(context, {
      finalSeal: 'unknown',
      finalConfidence: 0,
      failureReason:
        features.trackingMode === 'no_hands' ? 'hands_lost' : 'one_hand_missing',
      status: 'missing_hands',
      provisionalSeal: getProvisionalSeal(context.globalBest, 'unknown'),
      provisionalConfidence: getProvisionalConfidence(context.globalBest),
      provisionalFamily: getSealFamily(context.globalBest.seal),
    })
  }

  if (
    features.cameraReadability < SEAL_RULE_CONFIG.READABILITY_UNKNOWN_THRESHOLD ||
    context.bestFamily.score < SEAL_RULE_CONFIG.FAMILY_ACCEPT_THRESHOLD
  ) {
    return buildPrediction(context, {
      finalSeal: 'unknown',
      finalConfidence: 0,
      failureReason: 'low_confidence',
      status: 'low_confidence',
      provisionalSeal: getProvisionalSeal(context.globalBest, 'unknown'),
      provisionalConfidence: getProvisionalConfidence(context.globalBest),
      provisionalFamily: getSealFamily(context.globalBest.seal),
    })
  }

  if (context.familyIsAmbiguous) {
    return buildPrediction(context, {
      finalSeal: 'unknown',
      finalConfidence: 0,
      failureReason: 'ambiguous_between_seals',
      status: 'family_ambiguous',
      provisionalSeal: getProvisionalSeal(context.globalBest, 'unknown'),
      provisionalConfidence: getProvisionalConfidence(context.globalBest),
      provisionalFamily: getSealFamily(context.globalBest.seal),
    })
  }

  if (
    !areSameFamily(context.globalBest.seal, context.globalSecond.seal) &&
    context.globalAmbiguityGap <
      SEAL_RULE_CONFIG.CROSS_FAMILY_SEAL_AMBIGUITY_GAP_THRESHOLD
  ) {
    return buildPrediction(context, {
      finalSeal: 'unknown',
      finalConfidence: 0,
      failureReason: 'ambiguous_between_seals',
      status: 'ambiguous_cross_family',
      provisionalSeal: getProvisionalSeal(context.globalBest, 'unknown'),
      provisionalConfidence: getProvisionalConfidence(context.globalBest),
      provisionalFamily: getSealFamily(context.globalBest.seal),
    })
  }

  if (context.inFamilyIsAmbiguous) {
    const sameFamilyStatus = areSameFamily(
      context.globalBest.seal,
      context.globalSecond.seal,
    )
      ? 'ambiguous_same_family'
      : 'family_accepted_seal_ambiguous'

    return buildPrediction(context, {
      finalSeal: 'unknown',
      finalConfidence: 0,
      failureReason: 'ambiguous_between_seals',
      status: sameFamilyStatus,
      provisionalSeal: getProvisionalSeal(context.familyBest, 'unknown'),
      provisionalConfidence: getProvisionalConfidence(context.familyBest),
      provisionalFamily: context.bestFamily.family,
    })
  }

  if (context.familyBest.score < SEAL_RULE_CONFIG.BEST_SCORE_THRESHOLD) {
    return buildPrediction(context, {
      finalSeal: 'unknown',
      finalConfidence: 0,
      failureReason: 'low_confidence',
      status: 'low_confidence',
      provisionalSeal: getProvisionalSeal(context.familyBest, 'unknown'),
      provisionalConfidence: getProvisionalConfidence(context.familyBest),
      provisionalFamily: context.bestFamily.family,
    })
  }

  return buildPrediction(context, {
    finalSeal: context.familyBest.seal,
    finalConfidence: applyTrackingConfidenceMultiplier(
      context.familyBest.score,
      features,
    ),
    failureReason: 'none',
    status: 'accepted',
    provisionalSeal: context.familyBest.seal,
    provisionalConfidence: applyTrackingConfidenceMultiplier(
      context.familyBest.score,
      features,
    ),
    provisionalFamily: context.bestFamily.family,
  })
}

function scoreSeal(seal: Seal, features: CoarseGestureFeatures): SealRuleScore {
  const measures = getEffectiveMeasures(features)
  const {
    isMergedCandidate,
    compact,
    overlapHigh,
    overlapModerate,
    vertical,
    horizontal,
    symmetric,
    asymmetric,
    spread,
    lowSpread,
    offset,
    upperTips,
    lowerTips,
    notTall,
    tallNarrow,
    squareOrCompactAspect,
    wide,
    notTooCompact,
    lowToModerateCompact,
    interlockClasp,
    towerLike,
    bundledBlob,
    effectiveHandDistance,
    effectiveOverlap,
    effectiveAspectRatio,
    effectiveCompactness,
    effectiveFingertipSpread,
  } = measures
  const ramInterlockPenalty =
    interlockClasp *
    (1 - towerLike * 0.65) *
    (isMergedCandidate ? 1 : 0.78) *
    SEAL_RULE_CONFIG.RAM_INTERLOCK_PENALTY
  const tigerInterlockPenalty =
    interlockClasp *
    (1 - towerLike * 0.8) *
    SEAL_RULE_CONFIG.TIGER_INTERLOCK_PENALTY
  const dragonTowerPenalty = towerLike * symmetric * 0.45
  const dragonCompactPenalty = compact * 0.32
  const dragonInterlockPenalty = interlockClasp * 0.36
  const dragonBundledPenalty = bundledBlob * 0.38
  const dragonWidePenalty = horizontal * wide * 0.24
  const dragonOffsetPenalty = offset * 0.34
  const dragonNotSimpleTower = 1 - towerLike * symmetric * 0.8
  const flatStack = horizontal * scoreMax(features.absVerticalCenterOffset, 0.22)

  const ruleMap: Record<Exclude<Seal, 'unknown'>, WeightedRule[]> = {
    rat: [
      weighted(compact, 0.2, 'compact hidden-finger clasp'),
      weighted(scoreMax(effectiveHandDistance, 0.42), 0.18, 'hand centers close'),
      weighted(overlapModerate, 0.16, 'moderate overlap (not snake-tight)'),
      weighted(scoreBetween(effectiveFingertipSpread, 0.12, 0.52), 0.14, 'low-to-moderate fingertip spread'),
      weighted(scoreNear(effectiveAspectRatio, 1.05, 0.72), 0.1, 'box-like but not wide'),
      weighted(1 - towerLike * 0.72, 0.06, 'not tower-like'),
      weighted(1 - bundledBlob * 0.6, 0.08, 'less bundled than boar'),
      weighted(scoreMax(features.handBoxOverlapRatio, 0.55), 0.08, 'overlap not snake-tight'),
      weighted(1 - interlockClasp * 0.6, 0.06, 'less interlocked than snake'),
    ],
    ox: [
      weighted(offset, 0.3, 'strong crossing/offset structure'),
      weighted(asymmetric, 0.2, 'angular asymmetric hand relation'),
      weighted(scoreMin(features.handBoxOverlapRatio, 0.32), 0.18, 'noticeable overlap from crossing'),
      weighted(scoreMin(effectiveHandDistance, 0.36), 0.14, 'noticeable center offset'),
      weighted(notTooCompact, 0.1, 'not a bundled clasp'),
      weighted(interlockClasp * 0.5 + 0.25, 0.08, 'some clasp/interlock evidence'),
    ],
    tiger: [
      weighted(tallNarrow, 0.28, 'tall narrow central tower'),
      weighted(vertical, 0.2, 'strong verticality'),
      weighted(towerLike, 0.18, 'tower-like family evidence'),
      weighted(symmetric, 0.14, 'high left-right symmetry'),
      weighted(upperTips, 0.12, 'fingertips concentrated high'),
      weighted(scoreMax(effectiveFingertipSpread, 0.5), 0.08, 'narrow tower, not gathered/spread'),
      weighted(scoreMax(effectiveAspectRatio, 0.8), 0.06, 'narrower than ram'),
      weighted(-tigerInterlockPenalty, 0.18, 'tiger penalty: compact interlock, not tower-like'),
    ],
    rabbit: [
      weighted(asymmetric, 0.26, 'one-sided/protruding tendency'),
      weighted(compact, 0.2, 'compact one-sided sign'),
      weighted(scoreMax(effectiveOverlap, 0.5), 0.2, 'less overlap than ox'),
      weighted(offset * 0.7 + 0.2, 0.16, 'small but real side offset'),
      weighted(scoreBetween(effectiveFingertipSpread, 0.18, 0.56), 0.14, 'controlled protrusion'),
      weighted(scoreMax(features.normalizedHandCenterDistance, 0.6), 0.06, 'hands not far apart'),
    ],
    dragon: [
      weighted(vertical * dragonNotSimpleTower, 0.16, 'raised vertical structure'),
      weighted(spread, 0.3, 'high visible fingertip spread'),
      weighted(lowToModerateCompact, 0.16, 'low-to-moderate compactness'),
      weighted(upperTips * (1 - towerLike * 0.55), 0.1, 'upper detail without simple tower'),
      weighted(scoreBetween(effectiveAspectRatio, 0.72, 1.38), 0.08, 'complex raised proportion'),
      weighted(-dragonTowerPenalty, 0.24, 'dragon penalty: tower-like symmetric seal'),
      weighted(-dragonCompactPenalty, 0.2, 'dragon penalty: compact clasp'),
      weighted(-dragonInterlockPenalty, 0.22, 'dragon penalty: interlocked clasp'),
      weighted(-dragonBundledPenalty, 0.2, 'dragon penalty: bundled compact blob'),
      weighted(-dragonWidePenalty, 0.14, 'dragon penalty: wide horizontal family'),
      weighted(-dragonOffsetPenalty, 0.18, 'dragon penalty: offset/crossed structure'),
    ],
    snake: [
      weighted(compact, 0.22, 'very compact central clasp'),
      weighted(overlapHigh, 0.22, 'high hand overlap/interlock'),
      weighted(interlockClasp, 0.18, 'interlocked clasp shape'),
      weighted(lowSpread, 0.16, 'low visible fingertip spread'),
      weighted(squareOrCompactAspect, 0.1, 'square/compact aspect'),
      weighted(scoreBetween(features.verticalityScore, 0.42, 0.66), 0.08, 'slightly vertical central axis'),
      weighted(1 - bundledBlob * 0.5, 0.04, 'tighter than boar bundle'),
      weighted(1 - towerLike * 0.55, 0.06, 'not a vertical tower'),
    ],
    horse: [
      weighted(wide, 0.22, 'wide interlock aspect'),
      weighted(overlapHigh, 0.22, 'overlapped interlaced center'),
      weighted(interlockClasp, 0.16, 'interlocked center'),
      weighted(compact, 0.14, 'compact interlaced center'),
      weighted(horizontal, 0.14, 'horizontal tendency'),
      weighted(scoreBetween(effectiveFingertipSpread, 0.18, 0.52), 0.12, 'moderate spread, not wing-like'),
      weighted(1 - towerLike * 0.7, 0.06, 'not tower-like'),
    ],
    ram: [
      weighted(towerLike, 0.3, 'upward gathered tower shape'),
      weighted(upperTips, 0.22, 'upper fingertip concentration'),
      weighted(vertical, 0.16, 'vertical gathered shape'),
      weighted(scoreBetween(effectiveAspectRatio, 0.5, 1.0), 0.1, 'triangular/tower proportion'),
      weighted(scoreBetween(effectiveCompactness, 0.36, 0.74), 0.08, 'gathered but not fully bundled'),
      weighted(scoreBetween(effectiveFingertipSpread, 0.18, 0.6), 0.08, 'gathered but not narrow tiger'),
      weighted(scoreMin(effectiveAspectRatio, 0.7), 0.06, 'wider than tiger'),
      weighted(-ramInterlockPenalty, 0.24, 'ram penalty: compact interlock, not tower-like'),
    ],
    monkey: [
      weighted(offset, 0.28, 'clear offset hand arrangement'),
      weighted(horizontal, 0.2, 'horizontal/sideways structure'),
      weighted(asymmetric, 0.18, 'lower symmetry than tower seals'),
      weighted(overlapModerate, 0.14, 'moderate overlap while crossed'),
      weighted(scoreBetween(features.verticalityScore, 0.36, 0.62), 0.12, 'not a pure vertical tower'),
      weighted(scoreMin(features.normalizedHandCenterDistance, 0.32), 0.08, 'hands clearly offset, not stacked'),
    ],
    rooster: [
      weighted(horizontal, 0.28, 'flat wing-like tendency'),
      weighted(wide, 0.22, 'wide combined silhouette'),
      weighted(spread, 0.2, 'lateral fingertip spread'),
      weighted(1 - compact * 0.65, 0.12, 'low-to-moderate compactness'),
      weighted(flatStack, 0.1, 'flat top-bottom stack'),
      weighted(scoreMax(features.handBoxOverlapRatio, 0.6), 0.08, 'less tight overlap than horse'),
    ],
    dog: [
      weighted(compact, 0.22, 'stable compact clasp'),
      weighted(squareOrCompactAspect, 0.2, 'box-like square aspect'),
      weighted(overlapModerate, 0.14, 'moderate overlap'),
      weighted(symmetric, 0.18, 'balanced stable hand pair'),
      weighted(scoreBetween(features.verticalityScore, 0.36, 0.6), 0.08, 'not strongly vertical'),
      weighted(1 - bundledBlob * 0.55, 0.08, 'less bundle-like than boar'),
      weighted(1 - towerLike * 0.7, 0.1, 'not a tower'),
    ],
    boar: [
      weighted(bundledBlob, 0.24, 'bundled compact blob'),
      weighted(compact, 0.18, 'fist-like compactness'),
      weighted(lowSpread, 0.18, 'low visible fingertip spread'),
      weighted(lowerTips, 0.14, 'fingertips sit lower in the bundle'),
      weighted(horizontal, 0.1, 'low or wide bundle'),
      weighted(notTall, 0.08, 'not tower-like'),
      weighted(1 - interlockClasp * 0.5, 0.08, 'bundle, not snake-tight interlock'),
    ],
  }

  const rules = ruleMap[seal as Exclude<Seal, 'unknown'>]
  const score = weightedAverage(rules)

  return {
    seal,
    score,
    reasons: rules
      .sort((a, b) => b.value * b.weight - a.value * a.weight)
      .slice(0, 4)
      .map((rule) => `${rule.reason}: ${formatScore(rule.value)}`),
  }
}

function scoreSealFamilies(features: CoarseGestureFeatures): SealFamilyScore[] {
  const measures = getEffectiveMeasures(features)
  const {
    vertical,
    horizontal,
    compact,
    spread,
    lowSpread,
    towerLike,
    interlockClasp,
    bundledBlob,
    wide,
    tallNarrow,
    overlapModerate,
    offset,
    asymmetric,
    effectiveCompactness,
  } = measures
  const handOffset = scoreMin(features.normalizedHandCenterDistance, 0.36)
  const lowToModerateCompact = scoreBetween(effectiveCompactness, 0.16, 0.66)
  const notCompactInterlock = 1 - Math.max(interlockClasp, compact * 0.85) * 0.85
  const notTowerLike = 1 - towerLike * 0.75
  const notBundled = 1 - bundledBlob * 0.7
  const complexRaised =
    spread *
    vertical *
    lowToModerateCompact *
    (1 - towerLike * 0.65) *
    (1 - interlockClasp * 0.55) *
    (1 - bundledBlob * 0.5) *
    (1 - horizontal * wide * 0.4) *
    (1 - offset * 0.35)

  const familyScores: SealFamilyScore[] = [
    {
      family: 'vertical_tower',
      score: weightedAverage([
        weighted(towerLike, 0.32, 'tower-like upper gathered shape'),
        weighted(vertical, 0.2, 'vertical structure'),
        weighted(scoreMin(features.upperFingertipScore, 0.58), 0.2, 'upper fingertip concentration'),
        weighted(tallNarrow, 0.18, 'tall/narrow aspect'),
        weighted(notCompactInterlock, 0.1, 'not a compact interlock'),
      ]),
      reasons: ['tiger/ram: tower-like, vertical, upper fingertips, not interlock'],
    },
    {
      family: 'compact_clasp',
      score: weightedAverage([
        weighted(Math.max(interlockClasp, bundledBlob), 0.28, 'interlock OR bundle evidence'),
        weighted(compact, 0.22, 'compactness'),
        weighted(lowSpread, 0.18, 'low fingertip spread'),
        weighted(scoreMin(features.handBoxOverlapRatio, 0.4), 0.14, 'moderate-to-high overlap'),
        weighted(notTowerLike, 0.1, 'not tower-like'),
        weighted(1 - wide * 0.5, 0.08, 'not wide-horizontal'),
      ]),
      reasons: ['snake/dog/boar: compact clasp or bundle, not tower, not wide'],
    },
    {
      family: 'compact_hidden',
      score: weightedAverage([
        weighted(compact, 0.22, 'moderate/high compactness'),
        weighted(overlapModerate, 0.18, 'moderate overlap'),
        weighted(scoreMax(features.normalizedHandCenterDistance, 0.42), 0.18, 'close hand centers'),
        weighted(scoreBetween(features.fingertipSpreadScore, 0.12, 0.56), 0.16, 'low-to-moderate fingertip spread'),
        weighted(notTowerLike, 0.12, 'not tower-like'),
        weighted(1 - wide * horizontal * 0.78, 0.06, 'not wide interlock'),
        weighted(notBundled, 0.04, 'less bundled than boar'),
        weighted(1 - interlockClasp * 0.55, 0.04, 'less interlocked than snake'),
      ]),
      reasons: ['rat: compact hidden-finger clasp, not snake-tight, not boar-bundled'],
    },
    {
      family: 'wide_interlock',
      score: weightedAverage([
        weighted(horizontal, 0.26, 'horizontal tendency'),
        weighted(wide, 0.24, 'wide aspect'),
        weighted(scoreMin(features.handBoxOverlapRatio, 0.34), 0.18, 'interlock/overlap presence'),
        weighted(scoreBetween(features.fingertipSpreadScore, 0.2, 0.76), 0.18, 'moderate lateral spread'),
        weighted(notTowerLike, 0.08, 'not tower-like'),
        weighted(1 - scoreMax(features.normalizedHandCenterDistance, 0.34) * 0.6, 0.06, 'not super-tight compact_hidden'),
      ]),
      reasons: ['horse/rooster: wide horizontal interlock, not tower, not hidden-tight'],
    },
    {
      family: 'offset_cross',
      score: weightedAverage([
        weighted(offset, 0.32, 'crossing or offset score'),
        weighted(asymmetric, 0.24, 'asymmetry'),
        weighted(handOffset, 0.2, 'hand center offset'),
        weighted(1 - compact * 0.6, 0.12, 'not a pure compact clasp'),
        weighted(notBundled, 0.06, 'not a bundled blob'),
        weighted(notTowerLike, 0.06, 'not a vertical tower'),
      ]),
      reasons: ['ox/monkey/rabbit: offset or crossed hands, not compact/tower/bundle'],
    },
    {
      family: 'complex_raised',
      score: clamp01(complexRaised),
      reasons: ['dragon: spread + raised + non-compact + not simple tower + not bundle + not offset'],
    },
    {
      family: 'unknown',
      score: 0,
      reasons: ['fallback family'],
    },
  ]

  return familyScores.sort((a, b) => b.score - a.score)
}

function applyFamilyContextToScores(
  scores: SealRuleScore[],
  familyScores: SealFamilyScore[],
): SealRuleScore[] {
  const familyScoreMap = Object.fromEntries(
    familyScores.map((familyScore) => [familyScore.family, familyScore.score]),
  ) as Record<SealFamily, number>

  return scores.map((score) => {
    const family = getSealFamily(score.seal)
    const familyScore = familyScoreMap[family] ?? 0
    const complexRaisedScore = familyScoreMap.complex_raised ?? 0
    const verticalTowerScore = familyScoreMap.vertical_tower ?? 0
    const compactClaspScore = familyScoreMap.compact_clasp ?? 0
    const compactHiddenScore = familyScoreMap.compact_hidden ?? 0
    const wideInterlockScore = familyScoreMap.wide_interlock ?? 0
    const offsetCrossScore = familyScoreMap.offset_cross ?? 0
    const familyAdjustedScore =
      score.seal === 'dragon'
        ? score.score *
          clamp01(
            complexRaisedScore -
              Math.max(
                verticalTowerScore,
                compactClaspScore,
                compactHiddenScore,
                wideInterlockScore,
                offsetCrossScore,
              ) *
                SEAL_RULE_CONFIG.DRAGON_FAMILY_GATE_PENALTY +
              SEAL_RULE_CONFIG.DRAGON_FAMILY_GATE_FLOOR,
          )
        : score.score * (0.72 + familyScore * 0.28)

    return {
      ...score,
      score: clamp01(familyAdjustedScore),
    }
  })
}

type PredictionContext = {
  features: CoarseGestureFeatures
  scores: SealRuleScore[]
  familyScores: SealFamilyScore[]
  globalBest: SealRuleScore
  globalSecond: SealRuleScore
  globalAmbiguityGap: number
  globalIsAmbiguous: boolean
  bestFamily: SealFamilyScore
  secondBestFamily: SealFamilyScore
  familyAmbiguityGap: number
  familyIsAmbiguous: boolean
  familyBest: SealRuleScore
  familySecond: SealRuleScore
  inFamilyAmbiguityGap: number
  inFamilyIsAmbiguous: boolean
  featureEvaluationMode: 'normal_two_hand_features' | 'merged_single_blob_features'
}

function createPredictionContext(
  features: CoarseGestureFeatures,
  scores: SealRuleScore[],
  familyScores: SealFamilyScore[],
): PredictionContext {
  const globalBest = scores[0] ?? createEmptySealScore('unknown')
  const globalSecond = scores[1] ?? createEmptySealScore('unknown')
  const bestFamily = familyScores[0] ?? createEmptyFamilyScore('unknown')
  const secondBestFamily = familyScores[1] ?? createEmptyFamilyScore('unknown')
  const familyScoresInBestFamily = getTopScoresInFamily(
    scores,
    bestFamily.family,
  )
  const familyBest =
    familyScoresInBestFamily[0] ?? createEmptySealScore('unknown')
  const familySecond =
    familyScoresInBestFamily[1] ?? createEmptySealScore('unknown')
  const globalAmbiguityGap = globalBest.score - globalSecond.score
  const familyAmbiguityGap = bestFamily.score - secondBestFamily.score
  const inFamilyAmbiguityGap = familyBest.score - familySecond.score

  return {
    features,
    scores,
    familyScores,
    globalBest,
    globalSecond,
    globalAmbiguityGap,
    globalIsAmbiguous:
      globalAmbiguityGap < SEAL_RULE_CONFIG.AMBIGUITY_GAP_THRESHOLD,
    bestFamily,
    secondBestFamily,
    familyAmbiguityGap,
    familyIsAmbiguous:
      familyAmbiguityGap < SEAL_RULE_CONFIG.FAMILY_AMBIGUITY_GAP_THRESHOLD,
    familyBest,
    familySecond,
    inFamilyAmbiguityGap,
    inFamilyIsAmbiguous:
      inFamilyAmbiguityGap <
      SEAL_RULE_CONFIG.SAME_FAMILY_SEAL_AMBIGUITY_GAP_THRESHOLD,
    featureEvaluationMode:
      features.trackingMode === 'merged_two_hand_candidate'
        ? 'merged_single_blob_features'
        : 'normal_two_hand_features',
  }
}

function buildPrediction(
  context: PredictionContext,
  decision: {
    finalSeal: Seal
    finalConfidence: number
    failureReason: RecognitionFailureReason
    status: PredictionStatus
    provisionalSeal: Seal
    provisionalConfidence: number
    provisionalFamily: SealFamily
  },
): SealPrediction {
  return {
    seal: decision.finalSeal,
    confidence: clamp01(decision.finalConfidence),
    failureReason: decision.failureReason,
    predictionStatus: decision.status,
    provisionalSeal: decision.provisionalSeal,
    provisionalConfidence: clamp01(decision.provisionalConfidence),
    provisionalFamily: decision.provisionalFamily,
    bestGuessSeal: context.globalBest.seal,
    bestGuessConfidence: applyTrackingConfidenceMultiplier(
      context.globalBest.score,
      context.features,
    ),
    isAmbiguous: context.globalIsAmbiguous,
    ambiguityGap: context.globalAmbiguityGap,
    secondBestSeal: context.globalSecond.seal,
    secondBestConfidence: context.globalSecond.score,
    bestInFamilySeal: context.familyBest.seal,
    bestInFamilyConfidence: applyTrackingConfidenceMultiplier(
      context.familyBest.score,
      context.features,
    ),
    secondInFamilySeal: context.familySecond.seal,
    secondInFamilyConfidence: context.familySecond.score,
    inFamilyAmbiguityGap: context.inFamilyAmbiguityGap,
    inFamilyIsAmbiguous: context.inFamilyIsAmbiguous,
    scores: context.scores,
    familyScores: context.familyScores,
    bestFamily: context.bestFamily.family,
    bestFamilyConfidence: context.bestFamily.score,
    secondBestFamily: context.secondBestFamily.family,
    secondBestFamilyConfidence: context.secondBestFamily.score,
    familyAmbiguityGap: context.familyAmbiguityGap,
    familyIsAmbiguous: context.familyIsAmbiguous,
    features: context.features,
    featureEvaluationMode: context.featureEvaluationMode,
    usedMirrorVariant: 'not_applicable',
  }
}

export function getSealFamily(seal: Seal): SealFamily {
  return SEAL_TO_FAMILY[seal]
}

export function getSealsInFamily(family: SealFamily): Seal[] {
  return FAMILY_TO_SEALS[family]
}

export function getBestScoreForFamily(
  scores: SealRuleScore[],
  family: SealFamily,
): SealRuleScore {
  return getTopScoresInFamily(scores, family)[0] ?? createEmptySealScore('unknown')
}

export function getTopScoresInFamily(
  scores: SealRuleScore[],
  family: SealFamily,
): SealRuleScore[] {
  const familySeals = new Set(getSealsInFamily(family))
  return scores.filter((score) => familySeals.has(score.seal))
}

export function areSameFamily(a: Seal, b: Seal): boolean {
  return getSealFamily(a) === getSealFamily(b)
}

function getProvisionalSeal(score: SealRuleScore, fallback: Seal): Seal {
  return score.score >= SEAL_RULE_CONFIG.PROVISIONAL_MIN_CONFIDENCE
    ? score.seal
    : fallback
}

function getProvisionalConfidence(score: SealRuleScore): number {
  return score.score >= SEAL_RULE_CONFIG.PROVISIONAL_MIN_CONFIDENCE
    ? score.score
    : 0
}

function applyTrackingConfidenceMultiplier(
  confidence: number,
  features: CoarseGestureFeatures,
): number {
  return clamp01(
    features.trackingMode === 'merged_two_hand_candidate'
      ? confidence * SEAL_RULE_CONFIG.MERGED_CONFIDENCE_MULTIPLIER
      : confidence,
  )
}

function createEmptySealScore(seal: Seal): SealRuleScore {
  return {
    seal,
    score: 0,
    reasons: [],
  }
}

function createEmptyFamilyScore(family: SealFamily): SealFamilyScore {
  return {
    family,
    score: 0,
    reasons: [],
  }
}

function getEffectiveMeasures(features: CoarseGestureFeatures) {
  const isMergedCandidate = features.trackingMode === 'merged_two_hand_candidate'
  const effectiveCompactness = isMergedCandidate
    ? features.mergedCompactnessProxy
    : features.compactnessScore
  const effectiveHandDistance = isMergedCandidate
    ? 0.24
    : features.normalizedHandCenterDistance
  const effectiveOverlap = isMergedCandidate
    ? Math.max(0.46, features.mergedCompactnessProxy * 0.72)
    : features.handBoxOverlapRatio
  const effectiveSymmetry = isMergedCandidate ? 0.52 : features.symmetryScore
  const effectiveAspectRatio = isMergedCandidate
    ? features.mergedAspectRatio
    : features.combinedAspectRatio
  const effectiveVerticality = isMergedCandidate
    ? features.mergedVerticalityScore
    : features.verticalityScore
  const effectiveHorizontality = isMergedCandidate
    ? features.mergedHorizontalityScore
    : features.horizontalityScore
  const effectiveFingertipSpread = isMergedCandidate
    ? features.mergedFingertipSpreadScore
    : features.fingertipSpreadScore
  const effectiveUpperTips = isMergedCandidate
    ? features.mergedUpperFingertipScore
    : features.upperFingertipScore
  const effectiveLowerTips = isMergedCandidate
    ? features.mergedLowerFingertipScore
    : features.lowerFingertipScore
  const compact = scoreMin(
    effectiveCompactness,
    SEAL_RULE_CONFIG.COMPACTNESS_HIGH,
  )
  const overlapHigh = scoreMin(effectiveOverlap, SEAL_RULE_CONFIG.OVERLAP_HIGH)
  const overlapModerate = scoreBetween(
    effectiveOverlap,
    SEAL_RULE_CONFIG.OVERLAP_MODERATE_LOW,
    SEAL_RULE_CONFIG.OVERLAP_MODERATE_HIGH,
  )
  const vertical = scoreMin(
    effectiveVerticality,
    SEAL_RULE_CONFIG.VERTICALITY_HIGH,
  )
  const horizontal = scoreMin(
    effectiveHorizontality,
    SEAL_RULE_CONFIG.HORIZONTALITY_HIGH,
  )
  const symmetric = scoreMin(effectiveSymmetry, SEAL_RULE_CONFIG.SYMMETRY_HIGH)
  const asymmetric = 1 - symmetric
  const spread = scoreMin(
    effectiveFingertipSpread,
    SEAL_RULE_CONFIG.FINGERTIP_SPREAD_HIGH,
  )
  const lowSpread = scoreMax(
    effectiveFingertipSpread,
    SEAL_RULE_CONFIG.LOW_FINGERTIP_SPREAD,
  )
  const offset = scoreMin(
    features.crossingOrOffsetScore,
    SEAL_RULE_CONFIG.OFFSET_HIGH,
  )
  const upperTips = scoreMin(effectiveUpperTips, 0.58)
  const lowerTips = scoreMin(effectiveLowerTips, 0.55)
  const notTall = 1 - vertical
  const tallNarrow = vertical * scoreMax(effectiveAspectRatio, 0.82)
  const squareOrCompactAspect = scoreNear(effectiveAspectRatio, 1, 0.75)
  const wide = scoreMin(effectiveAspectRatio, 1.12)
  const notTooCompact = 1 - scoreMin(effectiveCompactness, 0.82) * 0.5
  const lowToModerateCompact = scoreBetween(effectiveCompactness, 0.18, 0.66)
  const interlockClasp = scoreMin(
    features.interlockClaspScore,
    SEAL_RULE_CONFIG.INTERLOCK_HIGH,
  )
  const towerLike = scoreMin(
    features.towerLikeScore,
    SEAL_RULE_CONFIG.TOWER_LIKE_HIGH,
  )
  const bundledBlob = scoreMin(
    features.bundledBlobScore,
    SEAL_RULE_CONFIG.BUNDLED_BLOB_HIGH,
  )

  return {
    isMergedCandidate,
    effectiveCompactness,
    effectiveHandDistance,
    effectiveOverlap,
    effectiveAspectRatio,
    effectiveVerticality,
    effectiveFingertipSpread,
    compact,
    overlapHigh,
    overlapModerate,
    vertical,
    horizontal,
    symmetric,
    asymmetric,
    spread,
    lowSpread,
    offset,
    upperTips,
    lowerTips,
    notTall,
    tallNarrow,
    squareOrCompactAspect,
    wide,
    notTooCompact,
    lowToModerateCompact,
    interlockClasp,
    towerLike,
    bundledBlob,
  }
}

function weighted(value: number, weight: number, reason: string): WeightedRule {
  return {
    value: clamp(value, -1, 1),
    weight,
    reason,
  }
}

function weightedAverage(rules: WeightedRule[]): number {
  const totalWeight = rules.reduce((sum, rule) => sum + rule.weight, 0)
  if (totalWeight === 0) {
    return 0
  }

  return clamp01(
    rules.reduce((sum, rule) => sum + rule.value * rule.weight, 0) /
      totalWeight,
  )
}

function scoreMin(value: number, minimum: number): number {
  return clamp01(value / minimum)
}

function scoreMax(value: number, maximum: number): number {
  return clamp01(1 - value / maximum)
}

function scoreNear(value: number, target: number, tolerance: number): number {
  return clamp01(1 - Math.abs(value - target) / tolerance)
}

function scoreBetween(value: number, low: number, high: number): number {
  if (value >= low && value <= high) {
    return 1
  }

  const distance = value < low ? low - value : value - high
  return clamp01(1 - distance / Math.max(high - low, 0.0001))
}

function formatScore(value: number): string {
  return value.toFixed(2)
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : 0))
}
