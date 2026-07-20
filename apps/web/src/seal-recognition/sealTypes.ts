import type { HandSample } from '../hand-tracking/landmarkTypes'
import type { CoarseGestureFeatures } from './coarseGestureFeatures'
import type { SealPrediction } from './ruleBasedSealClassifier'

export type Seal =
  | 'rat'
  | 'ox'
  | 'tiger'
  | 'rabbit'
  | 'dragon'
  | 'snake'
  | 'horse'
  | 'ram'
  | 'monkey'
  | 'rooster'
  | 'dog'
  | 'boar'
  | 'unknown'

export type CaptureCondition = {
  lighting: 'bright' | 'normal' | 'dark'
  cameraAngle: 'front' | 'slightly_top' | 'slightly_bottom'
  userId?: string
}

export type SealSample = {
  label: Seal
  timestamp: number
  hands: HandSample[]
  coarseGestureFeatures?: CoarseGestureFeatures
  prediction?: SealPrediction
  condition?: CaptureCondition
}

export const ALL_SEALS: Seal[] = [
  'rat',
  'ox',
  'tiger',
  'rabbit',
  'dragon',
  'snake',
  'horse',
  'ram',
  'monkey',
  'rooster',
  'dog',
  'boar',
  'unknown',
]

export const MVP_0_TARGET_SEALS: Seal[] = [
  'snake',
  'ram',
  'monkey',
  'boar',
  'horse',
  'tiger',
]

export const MVP_0_LABELS: Seal[] = [...MVP_0_TARGET_SEALS, 'unknown']

export const SEAL_DISPLAY_NAMES: Record<Seal, string> = {
  rat: 'Rat / 자',
  ox: 'Ox / 축',
  tiger: 'Tiger / 인',
  rabbit: 'Rabbit / 묘',
  dragon: 'Dragon / 진',
  snake: 'Snake / 사',
  horse: 'Horse / 오',
  ram: 'Ram / 미',
  monkey: 'Monkey / 신',
  rooster: 'Rooster/Bird / 유',
  dog: 'Dog / 술',
  boar: 'Boar / 해',
  unknown: 'Unknown',
}
