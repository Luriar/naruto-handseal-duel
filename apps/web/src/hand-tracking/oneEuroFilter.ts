import type { HandSample, LandmarkPoint } from './landmarkTypes'

/**
 * One Euro Filter (Casiez et al.) 기반 랜드마크 스무딩.
 *
 * 손이 겹치는 인(사/해/술 등)에서는 MediaPipe 랜드마크가 심하게 떨리는데,
 * 프레임 단위 지터를 눌러주면 분류기와 안정화기가 훨씬 일관된 입력을 받는다.
 * 느린 움직임에서는 강하게 스무딩, 빠른 전환(인 교체)에서는 지연 없이 따라간다.
 */

const MIN_CUTOFF = 1.4
const BETA = 0.02
const DERIVATIVE_CUTOFF = 1.0

type AxisFilterState = {
  hasPrev: boolean
  prevValue: number
  prevDerivative: number
}

type PointFilterState = {
  x: AxisFilterState
  y: AxisFilterState
  z: AxisFilterState
}

export type LandmarkSmoother = {
  smooth: (hands: HandSample[], timestampMs: number) => HandSample[]
  reset: () => void
}

function createAxisState(): AxisFilterState {
  return { hasPrev: false, prevValue: 0, prevDerivative: 0 }
}

function createPointState(): PointFilterState {
  return { x: createAxisState(), y: createAxisState(), z: createAxisState() }
}

function smoothingFactor(cutoff: number, dtSeconds: number): number {
  const r = 2 * Math.PI * cutoff * dtSeconds
  return r / (r + 1)
}

function filterAxis(
  state: AxisFilterState,
  value: number,
  dtSeconds: number,
): number {
  if (!state.hasPrev) {
    state.hasPrev = true
    state.prevValue = value
    state.prevDerivative = 0
    return value
  }

  const derivative = (value - state.prevValue) / Math.max(dtSeconds, 0.0001)
  const derivativeAlpha = smoothingFactor(DERIVATIVE_CUTOFF, dtSeconds)
  const smoothedDerivative =
    derivativeAlpha * derivative + (1 - derivativeAlpha) * state.prevDerivative
  const cutoff = MIN_CUTOFF + BETA * Math.abs(smoothedDerivative)
  const alpha = smoothingFactor(cutoff, dtSeconds)
  const smoothedValue = alpha * value + (1 - alpha) * state.prevValue

  state.prevValue = smoothedValue
  state.prevDerivative = smoothedDerivative

  return smoothedValue
}

export function createLandmarkSmoother(): LandmarkSmoother {
  // handSlot(0/1) -> landmarkIndex -> filter
  let slots: PointFilterState[][] = []
  let prevTimestamp = 0
  let prevHandCount = -1

  const reset = () => {
    slots = []
    prevTimestamp = 0
    prevHandCount = -1
  }

  const smooth = (hands: HandSample[], timestampMs: number): HandSample[] => {
    // 손 개수가 바뀌면 슬롯 매칭이 흔들리므로 필터를 초기화한다.
    if (hands.length !== prevHandCount) {
      slots = hands.map(() => [])
      prevHandCount = hands.length
      prevTimestamp = timestampMs
      return hands
    }

    const dtSeconds = Math.min(
      Math.max((timestampMs - prevTimestamp) / 1000, 0.001),
      0.1,
    )
    prevTimestamp = timestampMs

    return hands.map((hand, handIndex) => {
      const slot = slots[handIndex] ?? []
      slots[handIndex] = slot

      const landmarks: LandmarkPoint[] = hand.landmarks.map(
        (point, pointIndex) => {
          const filter = slot[pointIndex] ?? createPointState()
          slot[pointIndex] = filter

          return {
            x: filterAxis(filter.x, point.x, dtSeconds),
            y: filterAxis(filter.y, point.y, dtSeconds),
            z: filterAxis(filter.z, point.z, dtSeconds),
          }
        },
      )

      return { ...hand, landmarks }
    })
  }

  return { smooth, reset }
}
