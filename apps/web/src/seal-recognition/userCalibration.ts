import type { Seal } from './sealTypes'
import type { FeatureKey } from './sealTemplates'

/**
 * 사용자 손 캘리브레이션 저장소.
 *
 * "내 손 모양을 못 읽는다"의 궁극적 해결책:
 * 각 인을 사용자가 직접 1~2초 유지해 등록하면, 그 사람 손 크기/비율/습관에
 * 맞는 개인화 템플릿이 만들어진다. 분류기는 기본 템플릿과 개인 템플릿을
 * 혼합해 점수를 내므로 등록 후 인식률이 크게 오른다.
 *
 * localStorage에 저장되어 새로고침 후에도 유지된다.
 */

export type CalibratedSeal = {
  seal: Seal
  /** 특징별 평균값 */
  mean: Partial<Record<FeatureKey, number>>
  /** 특징별 표준편차 (허용폭 하한 적용) */
  std: Partial<Record<FeatureKey, number>>
  sampleCount: number
  updatedAt: string
}

export type CalibrationStore = {
  schemaVersion: 1
  seals: Partial<Record<Seal, CalibratedSeal>>
}

const STORAGE_KEY = 'nhd_seal_calibration_v1'

/** 캘리브레이션 시 수집하는 특징 (템플릿 매칭과 동일 축) */
export const CALIBRATION_FEATURE_KEYS: FeatureKey[] = [
  'h1ThumbExt',
  'h1IndexExt',
  'h1MiddleExt',
  'h1RingExt',
  'h1PinkyExt',
  'h1IndexUp',
  'h1MiddleUp',
  'h2ThumbExt',
  'h2IndexExt',
  'h2MiddleExt',
  'h2RingExt',
  'h2PinkyExt',
  'h2IndexUp',
  'h2MiddleUp',
  'dist',
  'h2Higher',
  'dxAbs',
  'overlap',
  'interlock',
  'aspect',
  'spread',
  'topShare',
  'extDiff',
]

/** 특징별 표준편차 하한 (너무 빡빡한 개인 템플릿 방지) */
const MIN_STD: Partial<Record<FeatureKey, number>> = {
  aspect: 0.2,
  spread: 0.08,
  dist: 0.06,
  overlap: 0.15,
  interlock: 0.15,
  topShare: 0.12,
  extDiff: 0.1,
  h2Higher: 0.08,
  dxAbs: 0.08,
}

const DEFAULT_MIN_STD = 0.12

export function loadCalibrationStore(): CalibrationStore {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return { schemaVersion: 1, seals: {} }
    }
    const parsed = JSON.parse(raw) as CalibrationStore
    if (parsed.schemaVersion !== 1 || typeof parsed.seals !== 'object') {
      return { schemaVersion: 1, seals: {} }
    }
    return parsed
  } catch {
    return { schemaVersion: 1, seals: {} }
  }
}

export function saveCalibrationStore(store: CalibrationStore): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    // 저장 실패(시크릿 모드 등)는 치명적이지 않다.
  }
}

export function clearCalibration(seal?: Seal): CalibrationStore {
  const store = loadCalibrationStore()
  if (seal) {
    delete store.seals[seal]
  } else {
    store.seals = {}
  }
  saveCalibrationStore(store)
  return store
}

/**
 * 수집된 프레임 특징들로 개인 템플릿을 만든다.
 * 수집 프레임 중 이상치(중앙값에서 크게 벗어난 프레임)는 제외한다.
 */
export function buildCalibratedSeal(
  seal: Seal,
  frames: Partial<Record<FeatureKey, number>>[],
): CalibratedSeal | null {
  if (frames.length < 6) {
    return null
  }

  const mean: Partial<Record<FeatureKey, number>> = {}
  const std: Partial<Record<FeatureKey, number>> = {}

  for (const key of CALIBRATION_FEATURE_KEYS) {
    const values = frames
      .map((frame) => frame[key])
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))

    if (values.length < frames.length * 0.5) {
      continue
    }

    const sorted = [...values].sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)]
    // 중앙값 기준 상하 12.5% 트리밍
    const trimCount = Math.floor(sorted.length * 0.125)
    const trimmed = sorted.slice(trimCount, sorted.length - trimCount)
    const usable = trimmed.length >= 4 ? trimmed : sorted

    const meanValue = usable.reduce((sum, value) => sum + value, 0) / usable.length
    const variance =
      usable.reduce((sum, value) => sum + (value - meanValue) ** 2, 0) /
      usable.length
    const minStd = MIN_STD[key] ?? DEFAULT_MIN_STD

    mean[key] = Number.isFinite(meanValue) ? meanValue : median
    std[key] = Math.max(Math.sqrt(variance) * 1.6, minStd)
  }

  if (Object.keys(mean).length < 10) {
    return null
  }

  return {
    seal,
    mean,
    std,
    sampleCount: frames.length,
    updatedAt: new Date().toISOString(),
  }
}

export function upsertCalibratedSeal(calibrated: CalibratedSeal): CalibrationStore {
  const store = loadCalibrationStore()
  store.seals[calibrated.seal] = calibrated
  saveCalibrationStore(store)
  return store
}

export function getCalibratedSealCount(store: CalibrationStore): number {
  return Object.keys(store.seals).length
}
