export type Handedness = 'Left' | 'Right' | 'Unknown'

export type LandmarkPoint = {
  x: number
  y: number
  z: number
}

export type HandSample = {
  handedness: Handedness
  landmarks: LandmarkPoint[]
}

export type HandLandmarkerFrame = {
  timestamp: number
  hands: HandSample[]
}
