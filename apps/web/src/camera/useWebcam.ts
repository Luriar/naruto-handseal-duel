import { useCallback, useEffect, useRef, useState } from 'react'

type WebcamStatus = 'idle' | 'starting' | 'ready' | 'error'

export function useWebcam() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [status, setStatus] = useState<WebcamStatus>('idle')
  const [error, setError] = useState<string | null>(null)

  const stopWebcam = useCallback(() => {
    setStream((currentStream) => {
      currentStream?.getTracks().forEach((track) => track.stop())
      return null
    })
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setStatus('idle')
  }, [])

  const startWebcam = useCallback(async () => {
    if (stream) {
      return
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('This browser does not support webcam capture.')
      setStatus('error')
      return
    }

    setStatus('starting')
    setError(null)

    try {
      const nextStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      })

      if (videoRef.current) {
        videoRef.current.srcObject = nextStream
        await videoRef.current.play()
      }

      setStream(nextStream)
      setStatus('ready')
    } catch (unknownError) {
      setError(
        unknownError instanceof Error
          ? unknownError.message
          : 'Unable to start webcam.',
      )
      setStatus('error')
    }
  }, [stream])

  useEffect(() => stopWebcam, [stopWebcam])

  return {
    videoRef,
    stream,
    isReady: status === 'ready',
    status,
    error,
    startWebcam,
    stopWebcam,
  }
}
