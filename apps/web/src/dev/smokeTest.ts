/**
 * 인식 코어 스모크 테스트 (합성 랜드마크).
 *
 * 실행: apps/web에서
 *   npx tsx src/dev/smokeTest.ts
 *
 * 템플릿(sealTemplates.ts) 수치를 튜닝한 뒤 회귀 확인용으로 사용.
 * 실제 손 데이터가 아니라 기하학적 근사이므로, 여기서 통과해도
 * 최종 검증은 인식 실험실 + 실사용으로 해야 한다.
 */
import { classifySealV2 } from '../seal-recognition/sealClassifier'
import { createSealStabilizer } from '../seal-recognition/sealStabilizer'
import type { HandSample, LandmarkPoint } from '../hand-tracking/landmarkTypes'

type FingerSpec = { ext: boolean; dir?: 'up' | 'side' | 'down' }
type HandSpec = {
  cx: number
  cy: number
  s: number
  thumb: FingerSpec
  index: FingerSpec
  middle: FingerSpec
  ring: FingerSpec
  pinky: FingerSpec
}

function P(x: number, y: number): LandmarkPoint {
  return { x, y, z: 0 }
}

function makeHand(spec: HandSpec): HandSample {
  const { cx, cy, s } = spec
  const lm: LandmarkPoint[] = new Array(21)
  lm[0] = P(cx, cy) // wrist
  // thumb: 1 cmc, 2 mcp, 3 ip, 4 tip
  lm[1] = P(cx - 0.5 * s, cy - 0.15 * s)
  lm[2] = P(cx - 0.62 * s, cy - 0.4 * s)
  if (spec.thumb.ext) {
    lm[3] = P(cx - 0.75 * s, cy - 0.75 * s)
    lm[4] = P(cx - 0.85 * s, cy - 1.1 * s)
  } else {
    lm[3] = P(cx - 0.5 * s, cy - 0.62 * s)
    lm[4] = P(cx - 0.28 * s, cy - 0.75 * s)
  }
  const fingers: ('index' | 'middle' | 'ring' | 'pinky')[] = [
    'index',
    'middle',
    'ring',
    'pinky',
  ]
  const dxs = [-0.3, -0.1, 0.1, 0.3]
  const bases = [5, 9, 13, 17]
  fingers.forEach((name, i) => {
    const dx = cx + dxs[i] * s
    const base = bases[i]
    const f = spec[name]
    lm[base] = P(dx, cy - s)
    if (f.ext) {
      const dir = f.dir ?? 'up'
      if (dir === 'up') {
        lm[base + 1] = P(dx, cy - 1.45 * s)
        lm[base + 2] = P(dx, cy - 1.75 * s)
        lm[base + 3] = P(dx, cy - 2.05 * s)
      } else if (dir === 'side') {
        const sideSign = cx < 0.5 ? 1 : -1
        lm[base + 1] = P(dx + sideSign * 0.45 * s, cy - 1.0 * s)
        lm[base + 2] = P(dx + sideSign * 0.75 * s, cy - 1.0 * s)
        lm[base + 3] = P(dx + sideSign * 1.05 * s, cy - 1.0 * s)
      } else {
        lm[base + 1] = P(dx, cy - 0.6 * s)
        lm[base + 2] = P(dx, cy - 0.3 * s)
        lm[base + 3] = P(dx, cy + 0.0 * s)
      }
    } else {
      lm[base + 1] = P(dx, cy - 1.2 * s)
      lm[base + 2] = P(dx + 0.06 * s, cy - 0.92 * s)
      lm[base + 3] = P(dx + 0.1 * s, cy - 0.72 * s)
    }
  })
  return { handedness: 'Unknown', landmarks: lm }
}

const E: FingerSpec = { ext: true }
const ES: FingerSpec = { ext: true, dir: 'side' }
const F: FingerSpec = { ext: false }

const cases: { name: string; expect: string; hands: HandSample[] }[] = [
  {
    name: '인(Tiger): 양손 밀착, 검지+중지 위로',
    expect: 'tiger',
    hands: [
      makeHand({ cx: 0.465, cy: 0.56, s: 0.085, thumb: F, index: E, middle: E, ring: F, pinky: F }),
      makeHand({ cx: 0.535, cy: 0.56, s: 0.085, thumb: F, index: E, middle: E, ring: F, pinky: F }),
    ],
  },
  {
    name: '해(Boar): 두 주먹 나란히',
    expect: 'boar',
    hands: [
      makeHand({ cx: 0.43, cy: 0.56, s: 0.085, thumb: F, index: F, middle: F, ring: F, pinky: F }),
      makeHand({ cx: 0.57, cy: 0.56, s: 0.085, thumb: F, index: F, middle: F, ring: F, pinky: F }),
    ],
  },
  {
    name: '오(Horse): 검지만 위로, 밀착',
    expect: 'horse',
    hands: [
      makeHand({ cx: 0.465, cy: 0.56, s: 0.085, thumb: F, index: E, middle: F, ring: F, pinky: F }),
      makeHand({ cx: 0.535, cy: 0.56, s: 0.085, thumb: F, index: E, middle: F, ring: F, pinky: F }),
    ],
  },
  {
    name: '신(Monkey): 양손 수평 포개기',
    expect: 'monkey',
    hands: [
      makeHand({ cx: 0.47, cy: 0.53, s: 0.08, thumb: F, index: ES, middle: ES, ring: ES, pinky: ES }),
      makeHand({ cx: 0.53, cy: 0.585, s: 0.08, thumb: F, index: ES, middle: ES, ring: ES, pinky: ES }),
    ],
  },
  {
    name: '미(Ram): 검지+중지 위로, 위아래 어긋남',
    expect: 'ram',
    hands: [
      makeHand({ cx: 0.475, cy: 0.6, s: 0.085, thumb: F, index: E, middle: E, ring: F, pinky: F }),
      makeHand({ cx: 0.525, cy: 0.5, s: 0.085, thumb: F, index: E, middle: E, ring: F, pinky: F }),
    ],
  },
]

let pass = 0
for (const testCase of cases) {
  const prediction = classifySealV2(testCase.hands)
  const top3 = prediction.scores
    .slice(0, 3)
    .map((entry) => `${entry.seal}:${entry.score.toFixed(2)}`)
    .join('  ')
  const ok = prediction.bestGuessSeal === testCase.expect
  if (ok) pass += 1
  console.log(`${ok ? '✅' : '❌'} ${testCase.name}`)
  console.log(`    final=${prediction.seal} status=${prediction.predictionStatus} | top3: ${top3}`)
}

// 안정화기: 같은 인 12프레임 → 정확히 1회 확정
const stabilizer = createSealStabilizer()
let confirms = 0
for (let i = 0; i < 12; i += 1) {
  const out = stabilizer.push(classifySealV2(cases[0].hands), 1000 + i * 33)
  if (out.justConfirmed) confirms += 1
}
console.log(`${confirms === 1 ? '✅' : '❌'} 안정화기: 12프레임 → 확정 ${confirms}회 (기대 1회)`)

// 한 손 입력 처리
const single = classifySealV2([cases[0].hands[0]])
const singleOk =
  single.predictionStatus === 'missing_hands' ||
  single.featureEvaluationMode === 'merged_single_blob_features'
console.log(`${singleOk ? '✅' : '❌'} 한 손 입력 처리: ${single.predictionStatus}`)

console.log(`\n결과: ${pass}/${cases.length} 인 분류 통과`)
