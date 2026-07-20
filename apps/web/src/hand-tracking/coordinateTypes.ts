// camera coordinate = raw MediaPipe/video coordinate before any CSS mirror.
// display coordinate = what the user sees after optional preview mirroring.
// Classifier input should remain camera coordinate or canonicalized features.
// UI preview may mirror for comfort, but classification must not rely on it.
export type HandCoordinateSpace = 'camera' | 'display'

export type MirrorMode = 'none' | 'selfie_preview'

export type HandSideBasis = 'mediapipe_handedness' | 'screen_x_order'
