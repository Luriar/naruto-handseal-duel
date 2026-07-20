import type { Seal } from '../seal-recognition/sealTypes'
import type { HandTracking } from './useHandTracking'

/** 인 한글 약칭 (12간지 지지) */
export const SEAL_KO: Record<Seal, string> = {
  rat: '자',
  ox: '축',
  tiger: '인',
  rabbit: '묘',
  dragon: '진',
  snake: '사',
  horse: '오',
  ram: '미',
  monkey: '신',
  rooster: '유',
  dog: '술',
  boar: '해',
  unknown: '?',
}

export const SEAL_KO_FULL: Record<Seal, string> = {
  rat: '자 (쥐)',
  ox: '축 (소)',
  tiger: '인 (호랑이)',
  rabbit: '묘 (토끼)',
  dragon: '진 (용)',
  snake: '사 (뱀)',
  horse: '오 (말)',
  ram: '미 (양)',
  monkey: '신 (원숭이)',
  rooster: '유 (새)',
  dog: '술 (개)',
  boar: '해 (돼지)',
  unknown: '미인식',
}

/** 추적 상태 안내 문구 */
export function trackingNote(tracking: HandTracking): string {
  const mode = tracking.prediction?.features.trackingMode
  if (!mode || mode === 'no_hands') return '손이 안 보여'
  if (mode === 'single_true_hand') return '한 손만 보여 — 양손을 화면에'
  if (mode === 'merged_two_hand_candidate') return '겹친 손 인식 중 (merged)'
  return '양손 추적 중'
}
