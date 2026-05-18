import type { RefObject } from 'react'
import type { HandLandmarkerFrame } from '../hand-tracking/landmarkTypes'
import { DebugLandmarkOverlay } from '../ui/DebugLandmarkOverlay'

type WebcamViewProps = {
  videoRef: RefObject<HTMLVideoElement | null>
  frame: HandLandmarkerFrame | null
  mirrorPreview: boolean
}

export function WebcamView({ videoRef, frame, mirrorPreview }: WebcamViewProps) {
  return (
    <div className="webcam-stage" data-mirror={mirrorPreview}>
      <video
        ref={videoRef}
        className="webcam-video"
        muted
        playsInline
        aria-label="Webcam preview"
      />
      <DebugLandmarkOverlay frame={frame} videoRef={videoRef} />
    </div>
  )
}
