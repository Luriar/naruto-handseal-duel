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
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
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
