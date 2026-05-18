import type { HandSample, LandmarkPoint } from './landmarkTypes'

export function normalizeLandmarks(hands: HandSample[]): HandSample[] {
  return hands.map((hand) => ({
    ...hand,
    landmarks: normalizeHand(hand.landmarks),
  }))
}

function normalizeHand(landmarks: LandmarkPoint[]): LandmarkPoint[] {
  const wrist = landmarks[0]
  if (!wrist) {
    return landmarks
  }

  const middleMcp = landmarks[9]
  const scale = middleMcp ? distance(wrist, middleMcp) || 1 : 1

  return landmarks.map((point) => ({
    x: (point.x - wrist.x) / scale,
    y: (point.y - wrist.y) / scale,
    z: (point.z - wrist.z) / scale,
  }))
}

function distance(a: LandmarkPoint, b: LandmarkPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
}
