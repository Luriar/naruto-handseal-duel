import type { HandSample, LandmarkPoint } from '../hand-tracking/landmarkTypes'
import type {
  HandCoordinateSpace,
  HandSideBasis,
} from '../hand-tracking/coordinateTypes'

export type Point2D = {
  x: number
  y: number
}

export type BoundingBox = {
  minX: number
  minY: number
  maxX: number
  maxY: number
  width: number
  height: number
  area: number
  center: Point2D
}

export type HandTrackingMode =
  | 'no_hands'
  | 'single_true_hand'
  | 'merged_two_hand_candidate'
  | 'two_hands_tracked'

export type CoarseGestureFeatures = {
  coordinateSpace: HandCoordinateSpace
  handSideBasis: HandSideBasis
  trackingMode: HandTrackingMode
  detectedHandCount: number
  bothHandsVisible: boolean
  leftHandVisible: boolean
  rightHandVisible: boolean
  mediaPipeLeftHandVisible: boolean
  mediaPipeRightHandVisible: boolean
  mediaPipeHandednesses: string[]
  totalLandmarkCount: number
  leftHandCenter: Point2D | null
  rightHandCenter: Point2D | null
  screenLeftHandCenter: Point2D | null
  screenRightHandCenter: Point2D | null
  leftBoundingBox: BoundingBox | null
  rightBoundingBox: BoundingBox | null
  screenLeftBoundingBox: BoundingBox | null
  screenRightBoundingBox: BoundingBox | null
  combinedBoundingBox: BoundingBox | null
  mergedBoundingBox: BoundingBox | null
  mergedAspectRatio: number
  mergedCompactnessProxy: number
  mergedVerticalityScore: number
  mergedHorizontalityScore: number
  mergedFingertipSpreadScore: number
  mergedUpperFingertipScore: number
  mergedLowerFingertipScore: number
  handCenterDistance: number
  normalizedHandCenterDistance: number
  horizontalCenterOffset: number
  verticalCenterOffset: number
  absHorizontalCenterOffset: number
  absVerticalCenterOffset: number
  handBoxOverlapRatio: number
  combinedAspectRatio: number
  verticalityScore: number
  horizontalityScore: number
  compactnessScore: number
  symmetryScore: number
  fingertipSpreadScore: number
  upperFingertipScore: number
  lowerFingertipScore: number
  crossingOrOffsetScore: number
  interlockClaspScore: number
  towerLikeScore: number
  bundledBlobScore: number
  mergedTwoHandCandidateScore: number
  singleHandLikelyScore: number
  detectionInterpretationReason: string[]
  cameraReadability: number
}

export const COARSE_GESTURE_FEATURE_CONFIG = {
  MERGED_CANDIDATE_SCORE_THRESHOLD: 0.56,
  SINGLE_HAND_AREA_MAX: 0.08,
  LARGE_BLOB_AREA_THRESHOLD: 0.075,
  SINGLE_HAND_SPREAD_THRESHOLD: 0.68,
  DENSE_CLUSTER_THRESHOLD: 0.58,
  CENTERED_BLOB_DISTANCE_MAX: 0.38,
  UNUSUAL_ASPECT_LOW: 0.62,
  UNUSUAL_ASPECT_HIGH: 1.48,
  PALM_TO_BOX_SPAN_RATIO_FOR_MERGED: 0.44,
  INTERLOCK_CLASP_COMPACTNESS_MIN: 0.58,
  TOWER_LIKE_VERTICALITY_MIN: 0.58,
  BUNDLED_BLOB_COMPACTNESS_MIN: 0.62,
} as const

const FINGERTIP_INDICES = [4, 8, 12, 16, 20] as const
const PALM_INDICES = [0, 1, 5, 9, 13, 17] as const

export function extractCoarseGestureFeatures(
  hands: HandSample[],
): CoarseGestureFeatures {
  const detectedHands = hands
    .filter((hand) => hand.landmarks.length > 0)
    .slice(0, 2)
  const totalLandmarkCount = detectedHands.reduce(
    (sum, hand) => sum + hand.landmarks.length,
    0,
  )
  const { screenLeftHand, screenRightHand } = splitHandsByScreenX(detectedHands)
  const { mediaPipeLeftHand, mediaPipeRightHand } =
    splitHandsByMediaPipeHandedness(detectedHands)
  const leftBoundingBox = screenLeftHand
    ? createBoundingBox(screenLeftHand.landmarks)
    : null
  const rightBoundingBox = screenRightHand
    ? createBoundingBox(screenRightHand.landmarks)
    : null
  const combinedBoundingBox = createBoundingBox(
    detectedHands.flatMap((hand) => hand.landmarks),
  )
  const leftHandCenter = leftBoundingBox?.center ?? null
  const rightHandCenter = rightBoundingBox?.center ?? null
  const bothHandsVisible = Boolean(screenLeftHand && screenRightHand)
  const centerDelta =
    leftHandCenter && rightHandCenter
      ? {
          x: rightHandCenter.x - leftHandCenter.x,
          y: rightHandCenter.y - leftHandCenter.y,
        }
      : { x: 0, y: 0 }
  const handCenterDistance = Math.hypot(centerDelta.x, centerDelta.y)
  const absHorizontalCenterOffset = Math.abs(centerDelta.x)
  const absVerticalCenterOffset = Math.abs(centerDelta.y)
  const combinedDiagonal = combinedBoundingBox
    ? Math.hypot(combinedBoundingBox.width, combinedBoundingBox.height)
    : 0
  const normalizedHandCenterDistance =
    combinedDiagonal > 0 ? clamp01(handCenterDistance / combinedDiagonal) : 0
  const handBoxOverlapRatio =
    leftBoundingBox && rightBoundingBox
      ? calculateOverlapRatio(leftBoundingBox, rightBoundingBox)
      : 0
  const mergedBoundingBox = combinedBoundingBox
  const combinedAspectRatio = combinedBoundingBox
    ? safeDivide(combinedBoundingBox.width, combinedBoundingBox.height)
    : 0
  const verticalityScore = combinedBoundingBox
    ? safeDivide(combinedBoundingBox.height, combinedBoundingBox.width + combinedBoundingBox.height)
    : 0
  const horizontalityScore = combinedBoundingBox
    ? safeDivide(combinedBoundingBox.width, combinedBoundingBox.width + combinedBoundingBox.height)
    : 0
  const fingertipSpreadScore = calculateFingertipSpread(
    detectedHands,
    combinedDiagonal,
  )
  const { upperFingertipScore, lowerFingertipScore } =
    calculateFingertipHeightScores(detectedHands, combinedBoundingBox)
  const mergedFingertipSpreadScore = fingertipSpreadScore
  const mergedAspectRatio = combinedAspectRatio
  const mergedVerticalityScore = verticalityScore
  const mergedHorizontalityScore = horizontalityScore
  const mergedCompactnessProxy = calculateMergedCompactnessProxy({
    boundingBox: mergedBoundingBox,
    fingertipSpreadScore: mergedFingertipSpreadScore,
    aspectRatio: mergedAspectRatio,
    hands: detectedHands,
  })
  const mergedUpperFingertipScore = upperFingertipScore
  const mergedLowerFingertipScore = lowerFingertipScore
  const interpretation = interpretTrackingMode({
    detectedHands,
    combinedBoundingBox,
    combinedAspectRatio,
    fingertipSpreadScore,
    mergedCompactnessProxy,
  })
  const usesMergedFallback =
    interpretation.trackingMode === 'merged_two_hand_candidate'
  const compactnessScore = usesMergedFallback
    ? mergedCompactnessProxy
    : calculateCompactness({
    bothHandsVisible,
    handBoxOverlapRatio,
    normalizedHandCenterDistance,
    fingertipSpreadScore,
    combinedAspectRatio,
      })
  const symmetryScore = usesMergedFallback
    ? 0.52
    : calculateSymmetry({
    bothHandsVisible,
    leftBoundingBox,
    rightBoundingBox,
    verticalCenterOffset: centerDelta.y,
    combinedBoundingBox,
      })
  const crossingOrOffsetScore = usesMergedFallback
    ? clamp01((1 - mergedCompactnessProxy) * 0.25 + fingertipSpreadScore * 0.35)
    : calculateCrossingOrOffset({
    bothHandsVisible,
    normalizedHandCenterDistance,
    horizontalCenterOffset: centerDelta.x,
    verticalCenterOffset: centerDelta.y,
    handBoxOverlapRatio,
    combinedBoundingBox,
      })
  const cameraReadability = calculateCameraReadability({
    detectedHandCount: detectedHands.length,
    totalLandmarkCount,
    combinedBoundingBox,
  })
  const shapeDiagnostics = calculateShapeDiagnostics({
    trackingMode: interpretation.trackingMode,
    compactnessScore,
    mergedCompactnessProxy,
    handBoxOverlapRatio,
    fingertipSpreadScore,
    upperFingertipScore,
    lowerFingertipScore,
    combinedAspectRatio,
    verticalityScore,
    horizontalityScore,
  })

  return {
    detectedHandCount: detectedHands.length,
    coordinateSpace: 'camera',
    handSideBasis: 'screen_x_order',
    trackingMode: interpretation.trackingMode,
    bothHandsVisible,
    leftHandVisible: Boolean(screenLeftHand),
    rightHandVisible: Boolean(screenRightHand),
    mediaPipeLeftHandVisible: Boolean(mediaPipeLeftHand),
    mediaPipeRightHandVisible: Boolean(mediaPipeRightHand),
    mediaPipeHandednesses: detectedHands.map((hand) => hand.handedness),
    totalLandmarkCount,
    leftHandCenter,
    rightHandCenter,
    screenLeftHandCenter: leftHandCenter,
    screenRightHandCenter: rightHandCenter,
    leftBoundingBox,
    rightBoundingBox,
    screenLeftBoundingBox: leftBoundingBox,
    screenRightBoundingBox: rightBoundingBox,
    combinedBoundingBox,
    mergedBoundingBox,
    mergedAspectRatio,
    mergedCompactnessProxy,
    mergedVerticalityScore,
    mergedHorizontalityScore,
    mergedFingertipSpreadScore,
    mergedUpperFingertipScore,
    mergedLowerFingertipScore,
    handCenterDistance,
    normalizedHandCenterDistance,
    horizontalCenterOffset: centerDelta.x,
    verticalCenterOffset: centerDelta.y,
    absHorizontalCenterOffset,
    absVerticalCenterOffset,
    handBoxOverlapRatio,
    combinedAspectRatio,
    verticalityScore,
    horizontalityScore,
    compactnessScore,
    symmetryScore,
    fingertipSpreadScore,
    upperFingertipScore,
    lowerFingertipScore,
    crossingOrOffsetScore,
    interlockClaspScore: shapeDiagnostics.interlockClaspScore,
    towerLikeScore: shapeDiagnostics.towerLikeScore,
    bundledBlobScore: shapeDiagnostics.bundledBlobScore,
    mergedTwoHandCandidateScore: interpretation.mergedTwoHandCandidateScore,
    singleHandLikelyScore: interpretation.singleHandLikelyScore,
    detectionInterpretationReason: interpretation.detectionInterpretationReason,
    cameraReadability,
  }
}

function calculateShapeDiagnostics({
  trackingMode,
  compactnessScore,
  mergedCompactnessProxy,
  handBoxOverlapRatio,
  fingertipSpreadScore,
  upperFingertipScore,
  lowerFingertipScore,
  combinedAspectRatio,
  verticalityScore,
  horizontalityScore,
}: {
  trackingMode: HandTrackingMode
  compactnessScore: number
  mergedCompactnessProxy: number
  handBoxOverlapRatio: number
  fingertipSpreadScore: number
  upperFingertipScore: number
  lowerFingertipScore: number
  combinedAspectRatio: number
  verticalityScore: number
  horizontalityScore: number
}): {
  interlockClaspScore: number
  towerLikeScore: number
  bundledBlobScore: number
} {
  const compact = scoreMin(
    Math.max(compactnessScore, mergedCompactnessProxy),
    COARSE_GESTURE_FEATURE_CONFIG.INTERLOCK_CLASP_COMPACTNESS_MIN,
  )
  const overlapOrMerged =
    trackingMode === 'merged_two_hand_candidate'
      ? scoreMin(mergedCompactnessProxy, 0.54)
      : scoreMin(handBoxOverlapRatio, 0.58)
  const lowToModerateSpread = scoreMax(fingertipSpreadScore, 0.62)
  const squareOrWide = Math.max(
    scoreNear(combinedAspectRatio, 1, 0.82),
    scoreMin(combinedAspectRatio, 1.08),
  )
  const notTallNarrow =
    1 - scoreMin(verticalityScore, 0.64) * scoreMax(combinedAspectRatio, 0.82)
  const interlockClaspScore = clamp01(
    compact * 0.28 +
      overlapOrMerged * 0.24 +
      lowToModerateSpread * 0.2 +
      squareOrWide * 0.16 +
      notTallNarrow * 0.12,
  )

  const tallNarrow = scoreMin(verticalityScore, 0.6) * scoreMax(combinedAspectRatio, 0.82)
  const moderateCompactness = scoreBetween(
    Math.max(compactnessScore, mergedCompactnessProxy),
    0.38,
    0.76,
  )
  const notFullyBundled = 1 - scoreMin(interlockClaspScore, 0.86) * 0.55
  const fingertipNotHidden = scoreBetween(fingertipSpreadScore, 0.22, 0.72)
  const towerLikeScore = clamp01(
    scoreMin(verticalityScore, COARSE_GESTURE_FEATURE_CONFIG.TOWER_LIKE_VERTICALITY_MIN) * 0.24 +
      scoreMin(upperFingertipScore, 0.6) * 0.24 +
      tallNarrow * 0.22 +
      moderateCompactness * 0.16 +
      fingertipNotHidden * 0.14,
  ) * notFullyBundled

  const lowSpread = scoreMax(fingertipSpreadScore, 0.44)
  const lowerBundle = scoreMin(lowerFingertipScore, 0.54)
  const squareOrHorizontal = Math.max(
    scoreNear(combinedAspectRatio, 1, 0.78),
    scoreMin(horizontalityScore, 0.54),
  )
  const notTower = 1 - scoreMin(towerLikeScore, 0.72) * 0.7
  const bundledBlobScore =
    clamp01(
      compact * 0.32 +
        lowSpread * 0.26 +
        lowerBundle * 0.16 +
        squareOrHorizontal * 0.16 +
        notTower * 0.1,
    ) * notTower

  return {
    interlockClaspScore,
    towerLikeScore: clamp01(towerLikeScore),
    bundledBlobScore: clamp01(bundledBlobScore),
  }
}

export function splitHandsByScreenX(hands: HandSample[]): {
  screenLeftHand: HandSample | null
  screenRightHand: HandSample | null
} {
  const sortedByX = [...hands].sort(
    (a, b) => averageX(a.landmarks) - averageX(b.landmarks),
  )

  return {
    screenLeftHand: sortedByX[0] ?? null,
    screenRightHand: sortedByX[1] ?? null,
  }
}

function splitHandsByMediaPipeHandedness(hands: HandSample[]): {
  mediaPipeLeftHand: HandSample | null
  mediaPipeRightHand: HandSample | null
} {
  return {
    mediaPipeLeftHand:
      hands.find((hand) => hand.handedness === 'Left') ?? null,
    mediaPipeRightHand:
      hands.find((hand) => hand.handedness === 'Right') ?? null,
  }
}

function createBoundingBox(landmarks: LandmarkPoint[]): BoundingBox | null {
  if (landmarks.length === 0) {
    return null
  }

  const xs = landmarks.map((landmark) => landmark.x)
  const ys = landmarks.map((landmark) => landmark.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const maxX = Math.max(...xs)
  const maxY = Math.max(...ys)
  const width = Math.max(maxX - minX, 0)
  const height = Math.max(maxY - minY, 0)

  return {
    minX,
    minY,
    maxX,
    maxY,
    width,
    height,
    area: width * height,
    center: {
      x: minX + width / 2,
      y: minY + height / 2,
    },
  }
}

function calculateOverlapRatio(a: BoundingBox, b: BoundingBox): number {
  const overlapWidth = Math.max(0, Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX))
  const overlapHeight = Math.max(0, Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY))
  const overlapArea = overlapWidth * overlapHeight
  const smallerArea = Math.max(Math.min(a.area, b.area), 0.0001)

  return clamp01(overlapArea / smallerArea)
}

function calculateFingertipSpread(
  hands: HandSample[],
  combinedDiagonal: number,
): number {
  const fingertips = hands.flatMap((hand) =>
    FINGERTIP_INDICES.flatMap((index) => hand.landmarks[index] ?? []),
  )

  if (fingertips.length < 2 || combinedDiagonal <= 0) {
    return 0
  }

  const distances: number[] = []
  for (let i = 0; i < fingertips.length; i += 1) {
    for (let j = i + 1; j < fingertips.length; j += 1) {
      distances.push(
        Math.hypot(fingertips[i].x - fingertips[j].x, fingertips[i].y - fingertips[j].y),
      )
    }
  }

  const averageDistance =
    distances.reduce((sum, distance) => sum + distance, 0) / distances.length

  return clamp01(averageDistance / combinedDiagonal / 0.42)
}

function calculateFingertipHeightScores(
  hands: HandSample[],
  combinedBoundingBox: BoundingBox | null,
): {
  upperFingertipScore: number
  lowerFingertipScore: number
} {
  const fingertips = hands.flatMap((hand) =>
    FINGERTIP_INDICES.flatMap((index) => hand.landmarks[index] ?? []),
  )

  if (!combinedBoundingBox || fingertips.length === 0 || combinedBoundingBox.height === 0) {
    return {
      upperFingertipScore: 0,
      lowerFingertipScore: 0,
    }
  }

  const averageY =
    fingertips.reduce((sum, fingertip) => sum + fingertip.y, 0) /
    fingertips.length
  const relativeY = clamp01(
    (averageY - combinedBoundingBox.minY) / combinedBoundingBox.height,
  )

  return {
    upperFingertipScore: 1 - relativeY,
    lowerFingertipScore: relativeY,
  }
}

function calculateMergedCompactnessProxy({
  boundingBox,
  fingertipSpreadScore,
  aspectRatio,
  hands,
}: {
  boundingBox: BoundingBox | null
  fingertipSpreadScore: number
  aspectRatio: number
  hands: HandSample[]
}): number {
  if (!boundingBox || hands.length === 0) {
    return 0
  }

  const squareBias = scoreNear(aspectRatio, 1, 0.9)
  const lowSpread = 1 - fingertipSpreadScore
  const density = calculateLandmarkDensity(hands, boundingBox)
  const areaCompactness = scoreBetween(boundingBox.area, 0.035, 0.18)

  return clamp01(
    squareBias * 0.25 +
      lowSpread * 0.3 +
      density * 0.25 +
      areaCompactness * 0.2,
  )
}

function interpretTrackingMode({
  detectedHands,
  combinedBoundingBox,
  combinedAspectRatio,
  fingertipSpreadScore,
  mergedCompactnessProxy,
}: {
  detectedHands: HandSample[]
  combinedBoundingBox: BoundingBox | null
  combinedAspectRatio: number
  fingertipSpreadScore: number
  mergedCompactnessProxy: number
}): {
  trackingMode: HandTrackingMode
  mergedTwoHandCandidateScore: number
  singleHandLikelyScore: number
  detectionInterpretationReason: string[]
} {
  if (detectedHands.length === 0 || !combinedBoundingBox) {
    return {
      trackingMode: 'no_hands',
      mergedTwoHandCandidateScore: 0,
      singleHandLikelyScore: 0,
      detectionInterpretationReason: ['no landmarks detected'],
    }
  }

  if (detectedHands.length >= 2) {
    return {
      trackingMode: 'two_hands_tracked',
      mergedTwoHandCandidateScore: 0,
      singleHandLikelyScore: 0,
      detectionInterpretationReason: ['two MediaPipe hands tracked'],
    }
  }

  const hand = detectedHands[0]
  const reasons: string[] = []
  const areaScore = scoreMin(
    combinedBoundingBox.area,
    COARSE_GESTURE_FEATURE_CONFIG.LARGE_BLOB_AREA_THRESHOLD,
  )
  const normalSingleAreaScore = scoreMax(
    combinedBoundingBox.area,
    COARSE_GESTURE_FEATURE_CONFIG.SINGLE_HAND_AREA_MAX,
  )
  const unusualAspectScore = Math.max(
    scoreMax(
      combinedAspectRatio,
      COARSE_GESTURE_FEATURE_CONFIG.UNUSUAL_ASPECT_LOW,
    ),
    scoreMin(
      combinedAspectRatio,
      COARSE_GESTURE_FEATURE_CONFIG.UNUSUAL_ASPECT_HIGH,
    ),
  )
  const denseClusterScore = scoreMin(
    calculateLandmarkDensity(detectedHands, combinedBoundingBox),
    COARSE_GESTURE_FEATURE_CONFIG.DENSE_CLUSTER_THRESHOLD,
  )
  const clusteredTipsScore = scoreMax(
    fingertipSpreadScore,
    COARSE_GESTURE_FEATURE_CONFIG.SINGLE_HAND_SPREAD_THRESHOLD,
  )
  const centerDistance = Math.hypot(
    combinedBoundingBox.center.x - 0.5,
    combinedBoundingBox.center.y - 0.5,
  )
  const centeredScore = scoreMax(
    centerDistance,
    COARSE_GESTURE_FEATURE_CONFIG.CENTERED_BLOB_DISTANCE_MAX,
  )
  const palmToBoxScore = scoreMax(
    calculatePalmToBoxSpanRatio(hand, combinedBoundingBox),
    COARSE_GESTURE_FEATURE_CONFIG.PALM_TO_BOX_SPAN_RATIO_FOR_MERGED,
  )

  if (areaScore > 0.65) {
    reasons.push('single detected blob is large')
  }
  if (unusualAspectScore > 0.55) {
    reasons.push('single blob aspect is unusual for one open hand')
  }
  if (denseClusterScore > 0.55) {
    reasons.push('landmarks are dense inside the blob')
  }
  if (clusteredTipsScore > 0.55) {
    reasons.push('fingertips are clustered for a merged seal')
  }
  if (centeredScore > 0.55) {
    reasons.push('blob is centered in the camera frame')
  }
  if (palmToBoxScore > 0.55) {
    reasons.push('palm span is small relative to the full blob')
  }

  const mergedTwoHandCandidateScore = clamp01(
    areaScore * 0.22 +
      unusualAspectScore * 0.14 +
      denseClusterScore * 0.16 +
      clusteredTipsScore * 0.16 +
      centeredScore * 0.12 +
      mergedCompactnessProxy * 0.12 +
      palmToBoxScore * 0.08,
  )
  const singleHandLikelyScore = clamp01(
    normalSingleAreaScore * 0.32 +
      fingertipSpreadScore * 0.24 +
      (1 - denseClusterScore) * 0.18 +
      (1 - palmToBoxScore) * 0.16 +
      (1 - unusualAspectScore) * 0.1,
  )

  return {
    trackingMode:
      mergedTwoHandCandidateScore >=
      COARSE_GESTURE_FEATURE_CONFIG.MERGED_CANDIDATE_SCORE_THRESHOLD
        ? 'merged_two_hand_candidate'
        : 'single_true_hand',
    mergedTwoHandCandidateScore,
    singleHandLikelyScore,
    detectionInterpretationReason:
      reasons.length > 0 ? reasons : ['single hand shape looks ordinary'],
  }
}

function calculateCompactness({
  bothHandsVisible,
  handBoxOverlapRatio,
  normalizedHandCenterDistance,
  fingertipSpreadScore,
  combinedAspectRatio,
}: {
  bothHandsVisible: boolean
  handBoxOverlapRatio: number
  normalizedHandCenterDistance: number
  fingertipSpreadScore: number
  combinedAspectRatio: number
}): number {
  if (!bothHandsVisible) {
    return 0
  }

  const centerCloseness = 1 - normalizedHandCenterDistance
  const squareBias = scoreNear(combinedAspectRatio, 1, 0.85)

  return clamp01(
    centerCloseness * 0.35 +
      handBoxOverlapRatio * 0.3 +
      (1 - fingertipSpreadScore) * 0.2 +
      squareBias * 0.15,
  )
}

function calculateSymmetry({
  bothHandsVisible,
  leftBoundingBox,
  rightBoundingBox,
  verticalCenterOffset,
  combinedBoundingBox,
}: {
  bothHandsVisible: boolean
  leftBoundingBox: BoundingBox | null
  rightBoundingBox: BoundingBox | null
  verticalCenterOffset: number
  combinedBoundingBox: BoundingBox | null
}): number {
  if (!bothHandsVisible || !leftBoundingBox || !rightBoundingBox || !combinedBoundingBox) {
    return 0
  }

  const widthSimilarity =
    1 -
    clamp01(
      Math.abs(leftBoundingBox.width - rightBoundingBox.width) /
        Math.max(leftBoundingBox.width, rightBoundingBox.width, 0.0001),
    )
  const heightSimilarity =
    1 -
    clamp01(
      Math.abs(leftBoundingBox.height - rightBoundingBox.height) /
        Math.max(leftBoundingBox.height, rightBoundingBox.height, 0.0001),
    )
  const verticalAlignment =
    1 -
    clamp01(Math.abs(verticalCenterOffset) / Math.max(combinedBoundingBox.height, 0.0001))

  return clamp01(
    widthSimilarity * 0.35 +
      heightSimilarity * 0.35 +
      verticalAlignment * 0.3,
  )
}

function calculateCrossingOrOffset({
  bothHandsVisible,
  normalizedHandCenterDistance,
  horizontalCenterOffset,
  verticalCenterOffset,
  handBoxOverlapRatio,
  combinedBoundingBox,
}: {
  bothHandsVisible: boolean
  normalizedHandCenterDistance: number
  horizontalCenterOffset: number
  verticalCenterOffset: number
  handBoxOverlapRatio: number
  combinedBoundingBox: BoundingBox | null
}): number {
  if (!bothHandsVisible || !combinedBoundingBox) {
    return 0
  }

  const horizontalOffset = clamp01(
    Math.abs(horizontalCenterOffset) / Math.max(combinedBoundingBox.width, 0.0001),
  )
  const verticalOffset = clamp01(
    Math.abs(verticalCenterOffset) / Math.max(combinedBoundingBox.height, 0.0001),
  )
  const usefulOverlap = scoreBetween(handBoxOverlapRatio, 0.18, 0.78)

  return clamp01(
    horizontalOffset * 0.3 +
      verticalOffset * 0.25 +
      usefulOverlap * 0.25 +
      normalizedHandCenterDistance * 0.2,
  )
}

function calculateCameraReadability({
  detectedHandCount,
  totalLandmarkCount,
  combinedBoundingBox,
}: {
  detectedHandCount: number
  totalLandmarkCount: number
  combinedBoundingBox: BoundingBox | null
}): number {
  if (!combinedBoundingBox || detectedHandCount === 0) {
    return 0
  }

  const landmarkScore = clamp01(totalLandmarkCount / 42)
  const areaScore = scoreBetween(combinedBoundingBox.area, 0.03, 0.48)
  const centerDistance = Math.hypot(
    combinedBoundingBox.center.x - 0.5,
    combinedBoundingBox.center.y - 0.5,
  )
  const centerScore = 1 - clamp01(centerDistance / 0.55)
  const insideFrameScore =
    combinedBoundingBox.minX >= 0 &&
    combinedBoundingBox.maxX <= 1 &&
    combinedBoundingBox.minY >= 0 &&
    combinedBoundingBox.maxY <= 1
      ? 1
      : 0.35

  return clamp01(
    landmarkScore * 0.5 +
      areaScore * 0.2 +
      centerScore * 0.2 +
      insideFrameScore * 0.1,
  )
}

function calculateLandmarkDensity(
  hands: HandSample[],
  boundingBox: BoundingBox,
): number {
  const landmarks = hands.flatMap((hand) => hand.landmarks)
  if (landmarks.length === 0 || boundingBox.area === 0) {
    return 0
  }

  const centerDistanceAverage =
    landmarks.reduce(
      (sum, landmark) =>
        sum +
        Math.hypot(
          landmark.x - boundingBox.center.x,
          landmark.y - boundingBox.center.y,
        ),
      0,
    ) / landmarks.length
  const diagonal = Math.hypot(boundingBox.width, boundingBox.height)

  return diagonal === 0 ? 0 : clamp01(1 - centerDistanceAverage / diagonal / 0.45)
}

function calculatePalmToBoxSpanRatio(
  hand: HandSample,
  boundingBox: BoundingBox,
): number {
  const palmLandmarks = PALM_INDICES.flatMap(
    (index) => hand.landmarks[index] ?? [],
  )
  const palmBox = createBoundingBox(palmLandmarks)
  const boxDiagonal = Math.hypot(boundingBox.width, boundingBox.height)
  const palmDiagonal = palmBox ? Math.hypot(palmBox.width, palmBox.height) : 0

  return boxDiagonal === 0 ? 0 : clamp01(palmDiagonal / boxDiagonal)
}

function averageX(landmarks: LandmarkPoint[]): number {
  if (landmarks.length === 0) {
    return 0
  }

  return landmarks.reduce((sum, landmark) => sum + landmark.x, 0) / landmarks.length
}

function safeDivide(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator
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
  const tolerance = Math.max(high - low, 0.0001)

  return clamp01(1 - distance / tolerance)
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
}
