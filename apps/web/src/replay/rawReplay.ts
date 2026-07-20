import type { HandSample } from '../hand-tracking/landmarkTypes'
import type {
  HandCoordinateSpace,
  MirrorMode,
} from '../hand-tracking/coordinateTypes'
import type { CoarseGestureFeatures } from '../seal-recognition/coarseGestureFeatures'
import type { RecognitionFailureReason } from '../seal-recognition/sealFailureReason'
import type {
  SealFamily,
  SealFamilyScore,
  PredictionStatus,
  SealRuleScore,
} from '../seal-recognition/ruleBasedSealClassifier'
import type { Seal } from '../seal-recognition/sealTypes'

export type RawReplayFrame = {
  timestamp: number
  coordinateSpace?: HandCoordinateSpace
  mirrorMode?: MirrorMode
  hands: HandSample[]
  rawPrediction: Seal
  predictedSeal?: Seal
  stabilizedSeal: Seal
  provisionalSeal?: Seal
  provisionalConfidence?: number
  provisionalFamily?: SealFamily
  predictionStatus?: PredictionStatus
  bestGuessSeal?: Seal
  bestGuessConfidence?: number
  isAmbiguous?: boolean
  ambiguityGap?: number
  secondBestSeal?: Seal
  secondBestConfidence?: number
  bestFamily?: SealFamily
  bestFamilyConfidence?: number
  secondBestFamily?: SealFamily
  secondBestFamilyConfidence?: number
  familyAmbiguityGap?: number
  familyIsAmbiguous?: boolean
  bestInFamilySeal?: Seal
  bestInFamilyConfidence?: number
  secondInFamilySeal?: Seal
  secondInFamilyConfidence?: number
  inFamilyAmbiguityGap?: number
  inFamilyIsAmbiguous?: boolean
  confidence: number
  failureReason: RecognitionFailureReason
  coarseGestureFeatures?: CoarseGestureFeatures
  topRuleScores?: SealRuleScore[]
  familyScores?: SealFamilyScore[]
  featureEvaluationMode?:
    | 'normal_two_hand_features'
    | 'merged_single_blob_features'
  usedMirrorVariant?: 'original' | 'mirrored' | 'not_applicable'
}

export type RawReplayExport = {
  schemaVersion: 1
  exportedAt: string
  frames: RawReplayFrame[]
}

export function createRawReplayExport(frames: RawReplayFrame[]): RawReplayExport {
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    frames,
  }
}
