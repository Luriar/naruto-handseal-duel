import { useEffect, useRef } from 'react'
import type { HandLandmarkerFrame } from '../hand-tracking/landmarkTypes'

type DebugLandmarkOverlayProps = {
  frame: HandLandmarkerFrame | null
  videoRef: React.RefObject<HTMLVideoElement | null>
}

const HAND_CONNECTIONS = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [13, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  [0, 17],
] as const

export function DebugLandmarkOverlay({
  frame,
  videoRef,
}: DebugLandmarkOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const video = videoRef.current
    if (!canvas || !video) {
      return
    }

    const width = video.videoWidth || video.clientWidth || 1280
    const height = video.videoHeight || video.clientHeight || 720
    canvas.width = width
    canvas.height = height

    const context = canvas.getContext('2d')
    if (!context) {
      return
    }

    context.clearRect(0, 0, width, height)

    if (!frame) {
      return
    }

    context.lineCap = 'round'
    context.lineJoin = 'round'

    frame.hands.forEach((hand) => {
      context.strokeStyle =
        hand.handedness === 'Left' ? '#22c55e' : '#38bdf8'
      context.fillStyle = '#f97316'
      context.lineWidth = 3

      HAND_CONNECTIONS.forEach(([startIndex, endIndex]) => {
        const start = hand.landmarks[startIndex]
        const end = hand.landmarks[endIndex]
        if (!start || !end) {
          return
        }

        context.beginPath()
        context.moveTo(start.x * width, start.y * height)
        context.lineTo(end.x * width, end.y * height)
        context.stroke()
      })

      hand.landmarks.forEach((landmark) => {
        context.beginPath()
        context.arc(landmark.x * width, landmark.y * height, 4, 0, Math.PI * 2)
        context.fill()
      })
    })
  }, [frame, videoRef])

  return <canvas ref={canvasRef} className="landmark-overlay" aria-hidden />
}
