import type { HandSample, LandmarkPoint } from '../hand-tracking/landmarkTypes'

/**
 * 손가락 단위 + 양손 관계 특징 추출.
 *
 * 기존 coarseGestureFeatures는 바운딩박스 통계(블롭 형태)만 봐서
 * "손가락이 어떤 상태인가"라는 인(印)의 핵심 정보를 버리고 있었다.
 * 여기서는 12간지 인을 구분하는 데 실제로 필요한 정보를 뽑는다:
 *
 *  - 손가락별 폄/접힘 정도 (0..1)
 *  - 편 손가락의 방향 (위/옆)
 *  - 양손 중심 거리, 수직 관계, 겹침, 맞물림(interlock)
 *  - 손끝 구름의 분포 (스프레드, 상단 집중도)
 */

export type FingerName = 'thumb' | 'index' | 'middle' | 'ring' | 'pinky'

export type SingleHandPose = {
  /** 손가락별 폄 정도 0(완전 접힘)..1(완전 폄) */
  ext: Record<FingerName, number>
  /** 손가락별 위쪽 방향성 -1(아래)..1(위). 화면 기준. */
  up: Record<FingerName, number>
  center: { x: number; y: number }
  wrist: { x: number; y: number }
  /** 손목→중지MCP 거리 (손 크기 기준값) */
  handSize: number
  /** 손끝 5개의 평균 상호거리 / 손 박스 대각선 (0=뭉침, 1=활짝) */
  tipSpread: number
  box: { minX: number; minY: number; maxX: number; maxY: number }
  palmBox: { minX: number; minY: number; maxX: number; maxY: number }
}

export type TwoHandRelation = {
  /** 손 중심 거리 / 결합 대각선 */
  dist: number
  /** hand2가 hand1보다 위에 있는 정도 (+ = hand2가 위) */
  h2Higher: number
  /** 수평 오프셋 절대값 (정규화) */
  dxAbs: number
  /** 바운딩박스 겹침 비율 (작은 쪽 기준) */
  overlap: number
  /** log2(size2/size1) */
  sizeRatio: number
  /** 상대 손끝이 내 손바닥 영역 안에 들어온 비율 0..1 (맞물림 증거) */
  interlock: number
  /** 결합 박스 가로/세로 비 */
  aspect: number
  /** 손끝 평균 상호거리 / 결합 대각선 (정규화 스프레드) */
  spread: number
  /** 손끝 중 상단 40% 구역에 있는 비율 */
  topShare: number
  /** 양손 손가락 상태 차이 평균 0(동일)..1(정반대) */
  extDiff: number
}

export type PoseFrameFeatures = {
  handCount: number
  hands: SingleHandPose[]
  relation: TwoHandRelation | null
  combinedBox: { minX: number; minY: number; maxX: number; maxY: number } | null
  combinedDiagonal: number
  /** 한 손만 검출됐지만 실제로는 맞잡은 양손일 가능성 0..1 */
  mergedLikelihood: number
}

const FINGER_JOINTS: Record<FingerName, [number, number, number, number]> = {
  thumb: [1, 2, 3, 4],
  index: [5, 6, 7, 8],
  middle: [9, 10, 11, 12],
  ring: [13, 14, 15, 16],
  pinky: [17, 18, 19, 20],
}

const FINGER_NAMES: FingerName[] = ['thumb', 'index', 'middle', 'ring', 'pinky']
const NON_THUMB: FingerName[] = ['index', 'middle', 'ring', 'pinky']
const TIP_INDICES = [4, 8, 12, 16, 20] as const
const PALM_INDICES = [0, 1, 2, 5, 9, 13, 17] as const

export function extractPoseFeatures(hands: HandSample[]): PoseFrameFeatures {
  const detected = hands
    .filter((hand) => hand.landmarks.length >= 21)
    .slice(0, 2)
    // 화면 x 기준 정렬: hands[0] = 화면 왼쪽 손
    .sort((a, b) => meanX(a.landmarks) - meanX(b.landmarks))

  const poses = detected.map((hand) => extractSingleHandPose(hand.landmarks))
  const combinedBox = boxOfAll(detected.flatMap((hand) => hand.landmarks))
  const combinedDiagonal = combinedBox
    ? Math.hypot(combinedBox.maxX - combinedBox.minX, combinedBox.maxY - combinedBox.minY)
    : 0

  let relation: TwoHandRelation | null = null
  if (poses.length === 2 && combinedBox && combinedDiagonal > 0) {
    relation = extractRelation(detected, poses, combinedBox, combinedDiagonal)
  }

  const mergedLikelihood =
    poses.length === 1 && combinedBox
      ? estimateMergedLikelihood(detected[0], poses[0], combinedBox, combinedDiagonal)
      : 0

  return {
    handCount: poses.length,
    hands: poses,
    relation,
    combinedBox,
    combinedDiagonal,
    mergedLikelihood,
  }
}

export function extractSingleHandPose(landmarks: LandmarkPoint[]): SingleHandPose {
  const wrist = landmarks[0]
  const middleMcp = landmarks[9]
  const handSize = Math.max(dist2d(wrist, middleMcp), 0.0001)

  const ext = {} as Record<FingerName, number>
  const up = {} as Record<FingerName, number>

  for (const finger of NON_THUMB) {
    const [mcpIdx, pipIdx, , tipIdx] = FINGER_JOINTS[finger]
    const mcp = landmarks[mcpIdx]
    const pip = landmarks[pipIdx]
    const tip = landmarks[tipIdx]

    // 곧게 폈는가: (mcp→pip)와 (pip→tip) 방향 일치도
    const straight = cosSimilarity(sub(pip, mcp), sub(tip, pip))
    const straightScore = clamp01((straight - 0.1) / 0.85)

    // 손끝이 손목에서 얼마나 멀리 뻗었는가
    const reach = dist2d(tip, wrist) / Math.max(dist2d(pip, wrist), 0.0001)
    const reachScore = clamp01((reach - 0.85) / 0.55)

    ext[finger] = clamp01(straightScore * 0.62 + reachScore * 0.38)

    const dir = sub(tip, mcp)
    const len = Math.hypot(dir.x, dir.y)
    up[finger] = len > 0.0001 ? -dir.y / len : 0
  }

  // 엄지: 관절 직선성 + 손끝이 손바닥에서 벗어난 거리
  {
    const [cmcIdx, mcpIdx, ipIdx, tipIdx] = FINGER_JOINTS.thumb
    const cmc = landmarks[cmcIdx]
    const mcp = landmarks[mcpIdx]
    const ip = landmarks[ipIdx]
    const tip = landmarks[tipIdx]
    const indexMcp = landmarks[5]

    const straight = cosSimilarity(sub(ip, mcp), sub(tip, ip))
    const straightScore = clamp01((straight - 0.1) / 0.85)
    const away = dist2d(tip, indexMcp) / handSize
    const awayScore = clamp01((away - 0.35) / 0.75)

    ext.thumb = clamp01(straightScore * 0.45 + awayScore * 0.55)

    const dir = sub(tip, cmc)
    const len = Math.hypot(dir.x, dir.y)
    up.thumb = len > 0.0001 ? -dir.y / len : 0
  }

  const box = boxOfAll(landmarks) ?? { minX: 0, minY: 0, maxX: 0, maxY: 0 }
  const boxDiagonal = Math.hypot(box.maxX - box.minX, box.maxY - box.minY)
  const tips = TIP_INDICES.map((index) => landmarks[index])
  const tipSpread =
    boxDiagonal > 0.0001
      ? Math.min(meanPairwiseDistance(tips) / boxDiagonal, 1)
      : 0
  const palmPoints = PALM_INDICES.map((index) => landmarks[index])
  const palmBoxRaw = boxOfAll(palmPoints) ?? box
  const pad = handSize * 0.22
  const palmBox = {
    minX: palmBoxRaw.minX - pad,
    minY: palmBoxRaw.minY - pad,
    maxX: palmBoxRaw.maxX + pad,
    maxY: palmBoxRaw.maxY + pad,
  }

  const center = centroid(landmarks)

  return {
    ext,
    up,
    center,
    wrist: { x: wrist.x, y: wrist.y },
    handSize,
    tipSpread,
    box,
    palmBox,
  }
}

function extractRelation(
  detected: HandSample[],
  poses: SingleHandPose[],
  combinedBox: { minX: number; minY: number; maxX: number; maxY: number },
  combinedDiagonal: number,
): TwoHandRelation {
  const [pose1, pose2] = poses
  const [hand1, hand2] = detected

  const dx = pose2.center.x - pose1.center.x
  const dy = pose2.center.y - pose1.center.y
  const distValue = Math.hypot(dx, dy) / combinedDiagonal
  const h2Higher = -dy / combinedDiagonal
  const dxAbs = Math.abs(dx) / combinedDiagonal

  const overlap = boxOverlapRatio(pose1.box, pose2.box)
  const sizeRatio = Math.log2(
    Math.max(pose2.handSize, 0.0001) / Math.max(pose1.handSize, 0.0001),
  )

  // 맞물림: 상대 손 손바닥 박스 안에 들어온 (엄지 제외) 손끝 개수
  let inside = 0
  for (const tipIdx of [8, 12, 16, 20]) {
    if (pointInBox(hand1.landmarks[tipIdx], pose2.palmBox)) inside += 1
    if (pointInBox(hand2.landmarks[tipIdx], pose1.palmBox)) inside += 1
  }
  const interlock = inside / 8

  const width = Math.max(combinedBox.maxX - combinedBox.minX, 0.0001)
  const height = Math.max(combinedBox.maxY - combinedBox.minY, 0.0001)
  const aspect = width / height

  const tips = detected.flatMap((hand) =>
    TIP_INDICES.map((index) => hand.landmarks[index]),
  )
  const spread = meanPairwiseDistance(tips) / combinedDiagonal
  const topThreshold = combinedBox.minY + height * 0.4
  const topShare =
    tips.filter((tip) => tip.y <= topThreshold).length / Math.max(tips.length, 1)

  let extDiffSum = 0
  for (const finger of FINGER_NAMES) {
    extDiffSum += Math.abs(pose1.ext[finger] - pose2.ext[finger])
  }
  const extDiff = extDiffSum / FINGER_NAMES.length

  return {
    dist: distValue,
    h2Higher,
    dxAbs,
    overlap,
    sizeRatio,
    interlock,
    aspect,
    spread,
    topShare,
    extDiff,
  }
}

/**
 * 한 손만 검출됐을 때, 실제로는 맞잡은 양손(merged blob)일 가능성 추정.
 * MediaPipe는 맞잡은 손을 종종 "큰 한 손"으로 잘못 읽는다.
 */
function estimateMergedLikelihood(
  hand: HandSample,
  pose: SingleHandPose,
  box: { minX: number; minY: number; maxX: number; maxY: number },
  diagonal: number,
): number {
  const width = box.maxX - box.minX
  const height = box.maxY - box.minY
  const area = width * height

  // 한 손치고 면적이 큼
  const areaScore = clamp01((area - 0.045) / 0.06)

  // 손바닥 스팬 대비 전체 박스가 비정상적으로 큼 (다른 손이 박스를 키움)
  const palmSpan = Math.hypot(
    pose.palmBox.maxX - pose.palmBox.minX,
    pose.palmBox.maxY - pose.palmBox.minY,
  )
  const palmScore = diagonal > 0 ? clamp01(1 - palmSpan / diagonal / 0.62) : 0

  // 손끝이 뭉쳐 있음 (맞잡은 인의 특징)
  const tips = TIP_INDICES.map((index) => hand.landmarks[index])
  const spread = diagonal > 0 ? meanPairwiseDistance(tips) / diagonal : 0
  const clusterScore = clamp01(1 - spread / 0.38)

  // 랜드마크가 중심으로 밀집
  const landmarksCenter = centroid(hand.landmarks)
  const meanCenterDist =
    hand.landmarks.reduce(
      (sum, point) => sum + Math.hypot(point.x - landmarksCenter.x, point.y - landmarksCenter.y),
      0,
    ) / hand.landmarks.length
  const densityScore = diagonal > 0 ? clamp01(1 - meanCenterDist / diagonal / 0.42) : 0

  return clamp01(
    areaScore * 0.3 + palmScore * 0.28 + clusterScore * 0.22 + densityScore * 0.2,
  )
}

// ---------- 기하 유틸 ----------

function meanX(landmarks: LandmarkPoint[]): number {
  if (landmarks.length === 0) return 0
  return landmarks.reduce((sum, point) => sum + point.x, 0) / landmarks.length
}

function centroid(landmarks: LandmarkPoint[]): { x: number; y: number } {
  if (landmarks.length === 0) return { x: 0, y: 0 }
  let x = 0
  let y = 0
  for (const point of landmarks) {
    x += point.x
    y += point.y
  }
  return { x: x / landmarks.length, y: y / landmarks.length }
}

function boxOfAll(
  landmarks: LandmarkPoint[],
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (landmarks.length === 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const point of landmarks) {
    if (point.x < minX) minX = point.x
    if (point.y < minY) minY = point.y
    if (point.x > maxX) maxX = point.x
    if (point.y > maxY) maxY = point.y
  }
  return { minX, minY, maxX, maxY }
}

function boxOverlapRatio(
  a: { minX: number; minY: number; maxX: number; maxY: number },
  b: { minX: number; minY: number; maxX: number; maxY: number },
): number {
  const overlapWidth = Math.max(0, Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX))
  const overlapHeight = Math.max(0, Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY))
  const overlapArea = overlapWidth * overlapHeight
  const areaA = (a.maxX - a.minX) * (a.maxY - a.minY)
  const areaB = (b.maxX - b.minX) * (b.maxY - b.minY)
  const smaller = Math.max(Math.min(areaA, areaB), 0.000001)
  return clamp01(overlapArea / smaller)
}

function pointInBox(
  point: LandmarkPoint,
  box: { minX: number; minY: number; maxX: number; maxY: number },
): boolean {
  return (
    point.x >= box.minX &&
    point.x <= box.maxX &&
    point.y >= box.minY &&
    point.y <= box.maxY
  )
}

function meanPairwiseDistance(points: LandmarkPoint[]): number {
  if (points.length < 2) return 0
  let sum = 0
  let count = 0
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      sum += Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y)
      count += 1
    }
  }
  return count === 0 ? 0 : sum / count
}

function sub(a: LandmarkPoint, b: LandmarkPoint): { x: number; y: number } {
  return { x: a.x - b.x, y: a.y - b.y }
}

function dist2d(a: LandmarkPoint, b: LandmarkPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function cosSimilarity(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const lenA = Math.hypot(a.x, a.y)
  const lenB = Math.hypot(b.x, b.y)
  if (lenA < 0.0001 || lenB < 0.0001) return 0
  return (a.x * b.x + a.y * b.y) / (lenA * lenB)
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
}
