import type {
  Handedness,
  HandLandmarkerFrame,
  LandmarkPoint,
} from './landmarkTypes'

type MediaPipeCategory = {
  categoryName?: string
  displayName?: string
  score?: number
}

type MediaPipeHandLandmarkerResult = {
  landmarks?: LandmarkPoint[][]
  handednesses?: MediaPipeCategory[][]
}

type MediaPipeHandLandmarker = {
  detectForVideo: (
    video: HTMLVideoElement,
    timestamp: number,
  ) => MediaPipeHandLandmarkerResult
  close?: () => void
}

type MediaPipeFilesetResolver = {
  forVisionTasks: (wasmLoaderPath: string) => Promise<unknown>
}

type MediaPipeHandLandmarkerFactory = {
  createFromOptions: (
    vision: unknown,
    options: Record<string, unknown>,
  ) => Promise<MediaPipeHandLandmarker>
}

type MediaPipeTasksVision = {
  FilesetResolver: MediaPipeFilesetResolver
  HandLandmarker: MediaPipeHandLandmarkerFactory
}

const TASKS_VERSION = '0.10.20'
const TASKS_BASE_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}`
const HAND_LANDMARKER_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'

/**
 * 겹친 손(맞잡은 인) 대응 튜닝:
 *
 * - minHandDetectionConfidence 0.5 → 0.3
 *   맞잡은 손은 detection score가 크게 떨어져서 두 번째 손을 통째로 놓치는 일이
 *   잦다. 임계값을 낮추면 겹친 상태에서도 두 손을 훨씬 자주 잡는다.
 * - minHandPresenceConfidence 0.5 → 0.3
 *   presence가 낮아 추적이 끊기고 재검출을 반복하는 플리커를 줄인다.
 * - minTrackingConfidence 0.5 → 0.25
 *   이미 잡은 손을 겹침 중에도 계속 물고 있게 한다.
 *
 * 낮은 임계값에서 생기는 노이즈(가짜 손, 떨리는 랜드마크)는 상위 파이프라인의
 * One Euro 스무딩 + 시간적 안정화(sealStabilizer)가 흡수한다.
 */
export async function createHandLandmarker(): Promise<MediaPipeHandLandmarker> {
  const tasksVision = (await import(
    /* @vite-ignore */ `${TASKS_BASE_URL}/vision_bundle.mjs`
  )) as MediaPipeTasksVision

  const vision = await tasksVision.FilesetResolver.forVisionTasks(
    `${TASKS_BASE_URL}/wasm`,
  )

  return tasksVision.HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: HAND_LANDMARKER_MODEL_URL,
      delegate: 'GPU',
    },
    runningMode: 'VIDEO',
    numHands: 2,
    minHandDetectionConfidence: 0.3,
    minHandPresenceConfidence: 0.3,
    minTrackingConfidence: 0.25,
  })
}

export function detectHandLandmarks(
  handLandmarker: MediaPipeHandLandmarker,
  video: HTMLVideoElement,
  timestamp: number,
): HandLandmarkerFrame {
  const result = handLandmarker.detectForVideo(video, timestamp)

  return {
    timestamp,
    hands: (result.landmarks ?? []).map((landmarks, index) => ({
      handedness: parseHandedness(result.handednesses?.[index]?.[0]),
      landmarks,
    })),
  }
}

function parseHandedness(category: MediaPipeCategory | undefined): Handedness {
  const handedness = category?.categoryName ?? category?.displayName

  if (handedness === 'Left' || handedness === 'Right') {
    return handedness
  }

  return 'Unknown'
}

export type { MediaPipeHandLandmarker }
