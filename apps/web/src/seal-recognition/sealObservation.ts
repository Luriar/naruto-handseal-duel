import type { CoarseGestureFeatures } from './coarseGestureFeatures'
import type {
  PredictionStatus,
  SealFamily,
  SealFamilyScore,
  SealRuleScore,
} from './ruleBasedSealClassifier'
import type { RecognitionFailureReason } from './sealFailureReason'
import type { Seal } from './sealTypes'

export type SealObservation = {
  observationId: string
  timestamp: number
  intendedSeal: Seal
  note: string
  finalPrediction: Seal
  finalConfidence: number
  provisionalPrediction: Seal
  provisionalConfidence: number
  predictionStatus: PredictionStatus
  failureReason: RecognitionFailureReason
  bestFamily: SealFamily
  bestFamilyConfidence: number
  secondFamily: SealFamily
  secondFamilyConfidence: number
  familyAmbiguityGap: number
  bestInFamilySeal: Seal
  bestInFamilyConfidence: number
  secondInFamilySeal: Seal
  secondInFamilyConfidence: number
  inFamilyAmbiguityGap: number
  topSealScores: SealRuleScore[]
  familyScores: SealFamilyScore[]
  coarseGestureFeatures: CoarseGestureFeatures
  trackingMode: CoarseGestureFeatures['trackingMode']
  featureEvaluationMode:
    | 'normal_two_hand_features'
    | 'merged_single_blob_features'
}

export type SealObservationExport = {
  schemaVersion: 1
  exportedAt: string
  observations: SealObservation[]
}

export function createSealObservationExport(
  observations: SealObservation[],
): SealObservationExport {
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    observations,
  }
}
