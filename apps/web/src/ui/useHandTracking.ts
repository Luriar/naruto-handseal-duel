import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createHandLandmarker,
  detectHandLandmarks,
} from '../hand-tracking/handLandmarker'
import type { MediaPipeHandLandmarker } from '../hand-tracking/handLandmarker'
import { createLandmarkSmoother } from '../hand-tracking/oneEuroFilter'
import type { HandLandmarkerFrame } from '../hand-tracking/landmarkTypes'
import { classifySealV2 } from '../seal-recognition/sealClassifier'
import type { SealPrediction } from '../seal-recognition/ruleBasedSealClassifier'
import { createSealStabilizer } from '../seal-recognition/sealStabilizer'
import type { StabilizerOutput } from '../seal-recognition/sealStabilizer'
import { extractPoseFeatures } from '../seal-recognition/handPoseFeatures'
import { flattenTwoHandFeatures } from '../seal-recognition/sealTemplates'
import type { FeatureKey } from '../seal-recognition/sealTemplates'
import { loadCalibrationStore } from '../seal-recognition/userCalibration'
import type { CalibrationStore } from '../seal-recognition/userCalibration'
import type { Seal } from '../seal-recognition/sealTypes'

/**
 * 게임 공용 손 추적 파이프라인 훅.
 *
 * 웹캠 → MediaPipe → One Euro 스무딩 → v2 분류기 → 시간적 안정화
 * 를 하나의 rAF 루프로 돌리고, 화면들이 소비할 상태를 노출한다.
 *
 * MediaPipe 로더는 모듈 레벨에 캐시해 화면 전환 시 재로딩을 막는다.
 */

let sharedLandmarkerPromise: Promise<MediaPipeHandLandmarker> | null = null

function getSharedLandmarker(): Promise<MediaPipeHandLandmarker> {
  if (!sharedLandmarkerPromise) {
    sharedLandmarkerPromise = createHandLandmarker()
  }
  return sharedLandmarkerPromise
}

export type TrackingStatus = 'idle' | 'starting' | 'ready' | 'error'

export type SealConfirmEvent = {
  seal: Seal
  timestamp: number
  confidence: number
  /** 단조 증가 시퀀스 번호 (useEffect 트리거용) */
  serial: number
}

export type HandTrackingState = {
  status: TrackingStatus
  error: string | null
  frame: HandLandmarkerFrame | null
  prediction: SealPrediction | null
  stabilizer: StabilizerOutput | null
  lastConfirm: SealConfirmEvent | null
  calibratedCount: number
}

export type HandTracking = HandTrackingState & {
  attachVideo: (element: HTMLVideoElement | null) => void
  start: () => Promise<void>
  stop: () => void
  setExpectedSeal: (seal: Seal | null) => void
  reloadCalibration: () => void
  /** 현재 프레임의 양손 특징 (캘리브레이션 수집용). 양손이 아닐 때 null */
  sampleFeatures: () => Record<FeatureKey, number> | null
  /** 손 위치 앵커 (0..1). 손이 없으면 null */
  getHandAnchor: () => { nx: number; ny: number } | null
}

export function useHandTracking(): HandTracking {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const landmarkerRef = useRef<MediaPipeHandLandmarker | null>(null)
  const rafRef = useRef<number | null>(null)
  const smootherRef = useRef(createLandmarkSmoother())
  const stabilizerRef = useRef(createSealStabilizer())
  const expectedSealRef = useRef<Seal | null>(null)
  const calibrationRef = useRef<CalibrationStore>(loadCalibrationStore())
  const lastHandsRef = useRef<HandLandmarkerFrame | null>(null)
  const confirmSerialRef = useRef(0)
  const runningRef = useRef(false)

  const [state, setState] = useState<HandTrackingState>({
    status: 'idle',
    error: null,
    frame: null,
    prediction: null,
    stabilizer: null,
    lastConfirm: null,
    calibratedCount: Object.keys(calibrationRef.current.seals).length,
  })

  const stopLoop = useCallback(() => {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [])

  const loop = useCallback(() => {
    const video = videoRef.current
    const landmarker = landmarkerRef.current

    if (
      runningRef.current &&
      video &&
      landmarker &&
      video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
    ) {
      const timestamp = performance.now()
      const rawFrame = detectHandLandmarks(landmarker, video, timestamp)
      const smoothedHands = smootherRef.current.smooth(rawFrame.hands, timestamp)
      const frame: HandLandmarkerFrame = { timestamp, hands: smoothedHands }
      lastHandsRef.current = frame

      const prediction = classifySealV2(smoothedHands, {
        expectedSeal: expectedSealRef.current ?? undefined,
        calibration: calibrationRef.current,
      })
      const stabilized = stabilizerRef.current.push(prediction, timestamp)

      let lastConfirm: SealConfirmEvent | null = null
      if (stabilized.justConfirmed) {
        confirmSerialRef.current += 1
        lastConfirm = {
          seal: stabilized.justConfirmed,
          timestamp,
          confidence: stabilized.meanConfidence,
          serial: confirmSerialRef.current,
        }
      }

      setState((prev) => ({
        ...prev,
        frame,
        prediction,
        stabilizer: stabilized,
        lastConfirm: lastConfirm ?? prev.lastConfirm,
      }))
    }

    if (runningRef.current) {
      rafRef.current = window.requestAnimationFrame(loop)
    }
  }, [])

  const start = useCallback(async () => {
    if (runningRef.current) return

    setState((prev) => ({ ...prev, status: 'starting', error: null }))

    try {
      if (!streamRef.current) {
        streamRef.current = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: 'user',
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        })
      }

      const video = videoRef.current
      if (video && video.srcObject !== streamRef.current) {
        video.srcObject = streamRef.current
        await video.play()
      }

      if (!landmarkerRef.current) {
        landmarkerRef.current = await getSharedLandmarker()
      }

      smootherRef.current.reset()
      stabilizerRef.current.reset()
      runningRef.current = true
      setState((prev) => ({ ...prev, status: 'ready' }))
      rafRef.current = window.requestAnimationFrame(loop)
    } catch (unknownError) {
      setState((prev) => ({
        ...prev,
        status: 'error',
        error:
          unknownError instanceof Error
            ? unknownError.message
            : '웹캠 또는 손 추적 모델을 시작하지 못했어요.',
      }))
    }
  }, [loop])

  const stop = useCallback(() => {
    runningRef.current = false
    stopLoop()
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    lastHandsRef.current = null
    setState((prev) => ({
      ...prev,
      status: 'idle',
      frame: null,
      prediction: null,
      stabilizer: null,
    }))
  }, [stopLoop])

  useEffect(
    () => () => {
      runningRef.current = false
      stopLoop()
      streamRef.current?.getTracks().forEach((track) => track.stop())
    },
    [stopLoop],
  )

  const attachVideo = useCallback((element: HTMLVideoElement | null) => {
    videoRef.current = element
    if (element && streamRef.current) {
      element.srcObject = streamRef.current
      void element.play().catch(() => {})
    }
  }, [])

  const setExpectedSeal = useCallback((seal: Seal | null) => {
    expectedSealRef.current = seal
  }, [])

  const reloadCalibration = useCallback(() => {
    calibrationRef.current = loadCalibrationStore()
    setState((prev) => ({
      ...prev,
      calibratedCount: Object.keys(calibrationRef.current.seals).length,
    }))
  }, [])

  const sampleFeatures = useCallback((): Record<FeatureKey, number> | null => {
    const frame = lastHandsRef.current
    if (!frame) return null
    const pose = extractPoseFeatures(frame.hands)
    return flattenTwoHandFeatures(pose, false)
  }, [])

  const getHandAnchor = useCallback((): { nx: number; ny: number } | null => {
    const frame = lastHandsRef.current
    if (!frame || frame.hands.length === 0) return null
    let x = 0
    let y = 0
    let count = 0
    for (const hand of frame.hands) {
      for (const landmark of hand.landmarks) {
        x += landmark.x
        y += landmark.y
        count += 1
      }
    }
    if (count === 0) return null
    // 미러 프리뷰 기준 (CSS로 좌우 반전되므로 x도 반전)
    return { nx: 1 - x / count, ny: y / count }
  }, [])

  return {
    ...state,
    attachVideo,
    start,
    stop,
    setExpectedSeal,
    reloadCalibration,
    sampleFeatures,
    getHandAnchor,
  }
}
