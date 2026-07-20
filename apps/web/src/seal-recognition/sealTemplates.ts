import type { Seal } from './sealTypes'
import type { PoseFrameFeatures } from './handPoseFeatures'

/**
 * 12간지 인(印) 퍼지 템플릿.
 *
 * 각 인을 "관측 가능한 특징의 목표값 ± 허용폭 (가중치)"으로 기술한다.
 * 분류기는 가우시안 유사도의 가중 평균으로 인별 점수를 낸다.
 *
 * hand1/hand2는 물리적 왼손/오른손이 아니라 "역할"이다.
 * 분류기가 (화면왼손=1, 화면오른손=2)와 그 반대 배치를 모두 평가해
 * 더 높은 점수를 쓰기 때문에, 거울 모드/좌우 반대 수행도 자동 대응된다.
 */

export type FeatureKey =
  // hand1 손가락
  | 'h1ThumbExt'
  | 'h1IndexExt'
  | 'h1MiddleExt'
  | 'h1RingExt'
  | 'h1PinkyExt'
  | 'h1IndexUp'
  | 'h1MiddleUp'
  // hand2 손가락
  | 'h2ThumbExt'
  | 'h2IndexExt'
  | 'h2MiddleExt'
  | 'h2RingExt'
  | 'h2PinkyExt'
  | 'h2IndexUp'
  | 'h2MiddleUp'
  // 양손 관계
  | 'dist'
  | 'h2Higher'
  | 'dxAbs'
  | 'overlap'
  | 'interlock'
  | 'aspect'
  | 'spread'
  | 'topShare'
  | 'extDiff'

export type MergedFeatureKey =
  | 'mThumbExt'
  | 'mIndexExt'
  | 'mMiddleExt'
  | 'mRingExt'
  | 'mPinkyExt'
  | 'mIndexUp'
  | 'mAspect'
  | 'mSpread'

export type FeatureTarget = {
  /** 목표값 */
  t: number
  /** 허용폭 (가우시안 시그마) */
  tol: number
  /** 가중치 */
  w: number
}

export type SealTemplate = {
  seal: Exclude<Seal, 'unknown'>
  /** 양손 정상 추적 시 사용 */
  twoHand: Partial<Record<FeatureKey, FeatureTarget>>
  /**
   * 한 손 blob으로 합쳐 검출됐을 때 사용.
   * 없으면 이 인은 merged 모드에서 후보가 되지 않는다.
   */
  merged?: {
    targets: Partial<Record<MergedFeatureKey, FeatureTarget>>
    /** merged 모드 신뢰도 상한 */
    cap: number
  }
  /** 좌우 대칭 인이면 역할 스왑 평가 생략 (연산 절약) */
  symmetric: boolean
  /** 수련장/캘리브레이션 안내 문구 */
  tipsKo: string[]
}

export function flattenTwoHandFeatures(
  features: PoseFrameFeatures,
  swapped: boolean,
): Record<FeatureKey, number> | null {
  if (features.handCount < 2 || !features.relation) {
    return null
  }

  const pose1 = swapped ? features.hands[1] : features.hands[0]
  const pose2 = swapped ? features.hands[0] : features.hands[1]
  const relation = features.relation
  const sign = swapped ? -1 : 1

  return {
    h1ThumbExt: pose1.ext.thumb,
    h1IndexExt: pose1.ext.index,
    h1MiddleExt: pose1.ext.middle,
    h1RingExt: pose1.ext.ring,
    h1PinkyExt: pose1.ext.pinky,
    h1IndexUp: pose1.up.index,
    h1MiddleUp: pose1.up.middle,
    h2ThumbExt: pose2.ext.thumb,
    h2IndexExt: pose2.ext.index,
    h2MiddleExt: pose2.ext.middle,
    h2RingExt: pose2.ext.ring,
    h2PinkyExt: pose2.ext.pinky,
    h2IndexUp: pose2.up.index,
    h2MiddleUp: pose2.up.middle,
    dist: relation.dist,
    h2Higher: relation.h2Higher * sign,
    dxAbs: relation.dxAbs,
    overlap: relation.overlap,
    interlock: relation.interlock,
    aspect: relation.aspect,
    spread: relation.spread,
    topShare: relation.topShare,
    extDiff: relation.extDiff,
  }
}

export function flattenMergedFeatures(
  features: PoseFrameFeatures,
): Record<MergedFeatureKey, number> | null {
  if (features.handCount !== 1 || !features.combinedBox) {
    return null
  }

  const pose = features.hands[0]
  const box = features.combinedBox
  const width = Math.max(box.maxX - box.minX, 0.0001)
  const height = Math.max(box.maxY - box.minY, 0.0001)

  return {
    mThumbExt: pose.ext.thumb,
    mIndexExt: pose.ext.index,
    mMiddleExt: pose.ext.middle,
    mRingExt: pose.ext.ring,
    mPinkyExt: pose.ext.pinky,
    mIndexUp: pose.up.index,
    mAspect: width / height,
    mSpread: pose.tipSpread,
  }
}

const T = (t: number, tol: number, w: number): FeatureTarget => ({ t, tol, w })

export const SEAL_TEMPLATES: Record<Exclude<Seal, 'unknown'>, SealTemplate> = {
  // ───────────────── 자 / Rat (子) ─────────────────
  // 한 손의 검지+중지를 세우고, 다른 손이 그 주위를 감싼다.
  rat: {
    seal: 'rat',
    symmetric: false,
    twoHand: {
      h1IndexExt: T(0.15, 0.25, 1.0),
      h1MiddleExt: T(0.15, 0.25, 1.0),
      h1RingExt: T(0.15, 0.28, 0.8),
      h1PinkyExt: T(0.2, 0.3, 0.6),
      h2IndexExt: T(0.85, 0.22, 1.2),
      h2MiddleExt: T(0.8, 0.24, 1.2),
      h2RingExt: T(0.2, 0.28, 0.9),
      h2PinkyExt: T(0.2, 0.28, 0.8),
      h2IndexUp: T(0.8, 0.3, 1.0),
      h2MiddleUp: T(0.8, 0.3, 1.0),
      dist: T(0.13, 0.12, 1.0),
      overlap: T(0.55, 0.3, 0.8),
      spread: T(0.22, 0.15, 1.0),
      topShare: T(0.42, 0.25, 0.6),
      interlock: T(0.35, 0.3, 0.6),
      extDiff: T(0.45, 0.28, 0.8),
      aspect: T(0.85, 0.4, 0.5),
    },
    merged: {
      targets: {
        mIndexExt: T(0.8, 0.3, 1.0),
        mMiddleExt: T(0.7, 0.32, 0.9),
        mRingExt: T(0.25, 0.3, 0.8),
        mIndexUp: T(0.75, 0.35, 0.9),
        mAspect: T(0.8, 0.38, 0.8),
        mSpread: T(0.45, 0.25, 0.6),
      },
      cap: 0.68,
    },
    tipsKo: [
      '한 손의 검지·중지를 위로 세워',
      '다른 손으로 세운 손가락 아래를 감싸 쥐어',
      '두 손을 가슴 앞 중앙에 딱 붙여',
    ],
  },

  // ───────────────── 축 / Ox (丑) ─────────────────
  // 한 손은 세로, 한 손은 가로로 손가락을 펴서 십자로 교차.
  ox: {
    seal: 'ox',
    symmetric: false,
    twoHand: {
      h1IndexExt: T(0.8, 0.25, 1.0),
      h1MiddleExt: T(0.78, 0.26, 1.0),
      h1RingExt: T(0.7, 0.3, 0.7),
      h1IndexUp: T(0.72, 0.28, 1.35),
      h2IndexExt: T(0.8, 0.25, 1.0),
      h2MiddleExt: T(0.78, 0.26, 1.0),
      h2RingExt: T(0.7, 0.3, 0.7),
      h2IndexUp: T(0.05, 0.32, 1.0),
      dist: T(0.28, 0.16, 0.8),
      overlap: T(0.32, 0.2, 0.7),
      spread: T(0.52, 0.2, 1.0),
      aspect: T(1.12, 0.45, 0.5),
      extDiff: T(0.14, 0.24, 0.5),
      interlock: T(0.2, 0.3, 0.3),
    },
    tipsKo: [
      '한 손은 손가락을 위로, 한 손은 옆으로 펴',
      '두 손을 십자(十) 모양으로 교차시켜',
      '교차 지점이 화면 중앙에 오게 해',
    ],
  },

  // ───────────────── 인 / Tiger (寅) ─────────────────
  // 양손 합장에서 양손 검지+중지만 위로 세워 맞댄다.
  tiger: {
    seal: 'tiger',
    symmetric: true,
    twoHand: {
      h1IndexExt: T(0.85, 0.2, 1.3),
      h1MiddleExt: T(0.82, 0.22, 1.3),
      h1RingExt: T(0.15, 0.25, 1.1),
      h1PinkyExt: T(0.15, 0.25, 1.0),
      h1IndexUp: T(0.85, 0.25, 1.2),
      h1MiddleUp: T(0.82, 0.26, 1.1),
      h2IndexExt: T(0.85, 0.2, 1.3),
      h2MiddleExt: T(0.82, 0.22, 1.3),
      h2RingExt: T(0.15, 0.25, 1.1),
      h2PinkyExt: T(0.15, 0.25, 1.0),
      h2IndexUp: T(0.85, 0.25, 1.2),
      h2MiddleUp: T(0.82, 0.26, 1.1),
      dist: T(0.1, 0.1, 1.2),
      h2Higher: T(0, 0.14, 1.0),
      overlap: T(0.6, 0.3, 1.0),
      aspect: T(0.62, 0.3, 1.2),
      spread: T(0.3, 0.18, 0.9),
      topShare: T(0.5, 0.25, 1.0),
      extDiff: T(0.1, 0.2, 0.9),
      interlock: T(0.3, 0.3, 0.5),
    },
    merged: {
      targets: {
        mIndexExt: T(0.85, 0.25, 1.2),
        mMiddleExt: T(0.8, 0.28, 1.1),
        mRingExt: T(0.25, 0.3, 0.9),
        mIndexUp: T(0.8, 0.3, 1.0),
        mAspect: T(0.6, 0.3, 1.1),
        mSpread: T(0.5, 0.25, 0.6),
      },
      cap: 0.75,
    },
    tipsKo: [
      '양손 손바닥을 가슴 앞에서 맞대',
      '양손 검지와 중지만 위로 곧게 세워 붙여',
      '나머지 손가락은 서로 깍지 껴 접어',
    ],
  },

  // ───────────────── 묘 / Rabbit (卯) ─────────────────
  // 아래 손은 주먹(엄지 세움), 위 손은 그 위에 얹어 손가락을 아래로 늘어뜨린다.
  rabbit: {
    seal: 'rabbit',
    symmetric: false,
    twoHand: {
      h1ThumbExt: T(0.7, 0.3, 0.8),
      h1IndexExt: T(0.15, 0.25, 1.0),
      h1MiddleExt: T(0.15, 0.25, 1.0),
      h1RingExt: T(0.15, 0.28, 0.8),
      h2IndexExt: T(0.55, 0.3, 0.7),
      h2MiddleExt: T(0.55, 0.3, 0.7),
      h2IndexUp: T(-0.35, 0.38, 0.8),
      h2Higher: T(0.26, 0.18, 1.1),
      dist: T(0.28, 0.15, 0.8),
      overlap: T(0.35, 0.3, 0.6),
      aspect: T(0.8, 0.35, 0.6),
      extDiff: T(0.4, 0.28, 0.7),
      spread: T(0.35, 0.2, 0.5),
    },
    tipsKo: [
      '아래 손은 주먹을 쥐고 엄지를 위로 세워',
      '다른 손을 주먹 위에 얹고 손가락을 아래로 늘어뜨려',
      '위아래로 쌓인 모양이 잘 보이게 해',
    ],
  },

  // ───────────────── 진 / Dragon (辰) ─────────────────
  // 손가락을 서로 깍지 껴 맞물리고 양 엄지를 세운다.
  dragon: {
    seal: 'dragon',
    symmetric: true,
    twoHand: {
      h1ThumbExt: T(0.7, 0.3, 0.9),
      h1IndexExt: T(0.55, 0.3, 0.6),
      h1MiddleExt: T(0.52, 0.3, 0.6),
      h1RingExt: T(0.5, 0.3, 0.5),
      h2ThumbExt: T(0.7, 0.3, 0.9),
      h2IndexExt: T(0.55, 0.3, 0.6),
      h2MiddleExt: T(0.52, 0.3, 0.6),
      h2RingExt: T(0.5, 0.3, 0.5),
      interlock: T(0.55, 0.3, 1.2),
      overlap: T(0.5, 0.3, 0.9),
      dist: T(0.15, 0.12, 0.9),
      aspect: T(1.2, 0.45, 0.6),
      spread: T(0.45, 0.2, 0.6),
      extDiff: T(0.12, 0.25, 0.5),
      topShare: T(0.35, 0.22, 0.4),
    },
    merged: {
      targets: {
        mThumbExt: T(0.7, 0.32, 0.9),
        mIndexExt: T(0.5, 0.32, 0.6),
        mAspect: T(1.15, 0.45, 0.8),
        mSpread: T(0.5, 0.25, 0.6),
      },
      cap: 0.66,
    },
    tipsKo: [
      '양손 손가락을 서로 깍지 껴 맞물려',
      '양쪽 엄지를 나란히 위로 세워',
      '손끝 물결 모양이 카메라에 보이게 해',
    ],
  },

  // ───────────────── 사 / Snake (巳) ─────────────────
  // 손가락을 완전히 깍지 껴 감싸 쥔 납작한 합장.
  snake: {
    seal: 'snake',
    symmetric: true,
    twoHand: {
      h1ThumbExt: T(0.35, 0.3, 0.5),
      h1IndexExt: T(0.3, 0.3, 0.9),
      h1MiddleExt: T(0.3, 0.3, 0.9),
      h1RingExt: T(0.3, 0.3, 0.8),
      h1PinkyExt: T(0.3, 0.3, 0.7),
      h2ThumbExt: T(0.35, 0.3, 0.5),
      h2IndexExt: T(0.3, 0.3, 0.9),
      h2MiddleExt: T(0.3, 0.3, 0.9),
      h2RingExt: T(0.3, 0.3, 0.8),
      h2PinkyExt: T(0.3, 0.3, 0.7),
      interlock: T(0.6, 0.3, 1.3),
      overlap: T(0.65, 0.25, 1.1),
      dist: T(0.09, 0.1, 1.2),
      h2Higher: T(0, 0.15, 0.7),
      spread: T(0.18, 0.13, 1.1),
      aspect: T(0.95, 0.4, 0.7),
      extDiff: T(0.1, 0.2, 0.8),
      topShare: T(0.3, 0.2, 0.4),
    },
    merged: {
      targets: {
        mIndexExt: T(0.35, 0.3, 0.9),
        mMiddleExt: T(0.35, 0.3, 0.9),
        mRingExt: T(0.35, 0.3, 0.8),
        mAspect: T(0.95, 0.4, 0.9),
        mSpread: T(0.35, 0.22, 0.9),
      },
      cap: 0.72,
    },
    tipsKo: [
      '양손 손가락을 전부 깍지 껴 맞잡아',
      '손바닥을 서로 붙여 납작한 상자 모양을 만들어',
      '가슴 앞 중앙에서 고정해',
    ],
  },

  // ───────────────── 오 / Horse (午) ─────────────────
  // 양손 검지만 세워 봉우리처럼 맞대고 나머지는 주먹으로 맞붙인다.
  horse: {
    seal: 'horse',
    symmetric: true,
    twoHand: {
      h1IndexExt: T(0.8, 0.25, 1.3),
      h1MiddleExt: T(0.2, 0.25, 1.1),
      h1RingExt: T(0.15, 0.25, 1.0),
      h1PinkyExt: T(0.15, 0.25, 0.9),
      h1IndexUp: T(0.75, 0.28, 1.1),
      h2IndexExt: T(0.8, 0.25, 1.3),
      h2MiddleExt: T(0.2, 0.25, 1.1),
      h2RingExt: T(0.15, 0.25, 1.0),
      h2PinkyExt: T(0.15, 0.25, 0.9),
      h2IndexUp: T(0.75, 0.28, 1.1),
      h2Higher: T(0, 0.15, 0.8),
      dist: T(0.13, 0.11, 1.1),
      overlap: T(0.55, 0.3, 0.9),
      interlock: T(0.45, 0.3, 0.8),
      aspect: T(1.05, 0.4, 0.8),
      topShare: T(0.42, 0.25, 0.9),
      spread: T(0.3, 0.18, 0.8),
      extDiff: T(0.1, 0.2, 0.8),
    },
    merged: {
      targets: {
        mIndexExt: T(0.8, 0.28, 1.2),
        mMiddleExt: T(0.25, 0.3, 1.0),
        mIndexUp: T(0.72, 0.32, 1.0),
        mAspect: T(1.0, 0.4, 0.8),
        mSpread: T(0.45, 0.25, 0.6),
      },
      cap: 0.72,
    },
    tipsKo: [
      '양손 검지만 위로 세워 끝을 맞대',
      '나머지 손가락은 접어 주먹끼리 맞붙여',
      '검지 봉우리가 삼각형처럼 보이게 해',
    ],
  },

  // ───────────────── 미 / Ram (未) ─────────────────
  // 인(Tiger)과 비슷하지만 한 손이 위로 어긋나게 겹친다.
  ram: {
    seal: 'ram',
    symmetric: false,
    twoHand: {
      h1IndexExt: T(0.78, 0.25, 1.2),
      h1MiddleExt: T(0.72, 0.27, 1.1),
      h1RingExt: T(0.2, 0.26, 1.0),
      h1PinkyExt: T(0.2, 0.26, 0.9),
      h2IndexExt: T(0.78, 0.25, 1.2),
      h2MiddleExt: T(0.72, 0.27, 1.1),
      h2RingExt: T(0.2, 0.26, 1.0),
      h2PinkyExt: T(0.2, 0.26, 0.9),
      h1IndexUp: T(0.72, 0.3, 1.0),
      h2IndexUp: T(0.72, 0.3, 1.0),
      h2Higher: T(0.22, 0.16, 1.2),
      dist: T(0.24, 0.14, 0.9),
      overlap: T(0.35, 0.28, 0.7),
      aspect: T(0.7, 0.32, 0.8),
      topShare: T(0.45, 0.25, 0.8),
      extDiff: T(0.12, 0.22, 0.7),
      spread: T(0.32, 0.18, 0.6),
    },
    tipsKo: [
      '양손 검지·중지를 펴고 한 손을 다른 손 위로 어긋나게 겹쳐',
      '위 손이 살짝 더 높게, 대각선 탑 모양을 만들어',
      '인(호랑이)과 달리 두 손이 위아래로 어긋나야 해',
    ],
  },

  // ───────────────── 신 / Monkey (申) ─────────────────
  // 양손을 옆으로 눕혀 포개고 손가락은 수평으로 편다.
  monkey: {
    seal: 'monkey',
    symmetric: false,
    twoHand: {
      h1IndexExt: T(0.75, 0.26, 1.1),
      h1MiddleExt: T(0.72, 0.27, 1.1),
      h1RingExt: T(0.7, 0.3, 0.9),
      h1PinkyExt: T(0.6, 0.3, 0.7),
      h1IndexUp: T(0.05, 0.3, 1.1),
      h2IndexExt: T(0.75, 0.26, 1.1),
      h2MiddleExt: T(0.72, 0.27, 1.1),
      h2RingExt: T(0.7, 0.3, 0.9),
      h2PinkyExt: T(0.6, 0.3, 0.7),
      h2IndexUp: T(0.05, 0.3, 1.1),
      aspect: T(1.5, 0.5, 1.3),
      overlap: T(0.5, 0.3, 0.8),
      dist: T(0.16, 0.13, 0.8),
      h2Higher: T(0.1, 0.18, 0.4),
      spread: T(0.45, 0.2, 0.6),
      extDiff: T(0.1, 0.2, 0.7),
      topShare: T(0.3, 0.2, 0.4),
    },
    tipsKo: [
      '양손을 옆으로 눕혀 손가락을 수평으로 펴',
      '한 손을 다른 손 위에 포개 넓적한 모양을 만들어',
      '축(소)과 달리 두 손 모두 수평이어야 해',
    ],
  },

  // ───────────────── 유 / Rooster·Bird (酉) ─────────────────
  // 손끝을 가운데로 모아 새 부리/날개 모양. 손목은 벌어진다.
  rooster: {
    seal: 'rooster',
    symmetric: true,
    twoHand: {
      h1ThumbExt: T(0.6, 0.3, 0.6),
      h1IndexExt: T(0.7, 0.28, 0.9),
      h1MiddleExt: T(0.5, 0.3, 0.6),
      h1RingExt: T(0.4, 0.3, 0.5),
      h2ThumbExt: T(0.6, 0.3, 0.6),
      h2IndexExt: T(0.7, 0.28, 0.9),
      h2MiddleExt: T(0.5, 0.3, 0.6),
      h2RingExt: T(0.4, 0.3, 0.5),
      dist: T(0.3, 0.15, 1.0),
      overlap: T(0.18, 0.2, 0.9),
      aspect: T(1.35, 0.45, 0.9),
      spread: T(0.4, 0.2, 0.6),
      extDiff: T(0.12, 0.22, 0.5),
      topShare: T(0.35, 0.22, 0.4),
    },
    tipsKo: [
      '양손 손끝을 가운데로 모아 새 부리 모양을 만들어',
      '손목은 바깥으로 벌려 날개처럼 펼쳐',
      '두 손이 겹치지 않고 끝만 닿아야 해',
    ],
  },

  // ───────────────── 술 / Dog (戌) ─────────────────
  // 아래 손은 주먹, 위 손은 손바닥을 펴서 주먹 위에 얹는다.
  dog: {
    seal: 'dog',
    symmetric: false,
    twoHand: {
      h1IndexExt: T(0.15, 0.25, 1.1),
      h1MiddleExt: T(0.15, 0.25, 1.1),
      h1RingExt: T(0.15, 0.26, 0.9),
      h1ThumbExt: T(0.35, 0.3, 0.4),
      h2IndexExt: T(0.8, 0.25, 1.1),
      h2MiddleExt: T(0.8, 0.25, 1.1),
      h2RingExt: T(0.75, 0.28, 0.9),
      h2PinkyExt: T(0.65, 0.3, 0.7),
      h2IndexUp: T(0.05, 0.32, 0.8),
      h2Higher: T(0.24, 0.16, 1.2),
      overlap: T(0.5, 0.3, 0.8),
      dist: T(0.18, 0.13, 0.8),
      extDiff: T(0.55, 0.26, 1.1),
      aspect: T(1.1, 0.4, 0.6),
      spread: T(0.3, 0.18, 0.6),
    },
    merged: {
      targets: {
        mIndexExt: T(0.7, 0.35, 0.9),
        mIndexUp: T(0.05, 0.35, 0.7),
        mAspect: T(1.15, 0.42, 0.8),
        mSpread: T(0.4, 0.24, 0.6),
      },
      cap: 0.66,
    },
    tipsKo: [
      '아래 손은 주먹을 쥐어',
      '위 손은 손바닥을 펴서 주먹 위에 평평하게 얹어',
      '위 손 손가락은 수평 방향으로 펴',
    ],
  },

  // ───────────────── 해 / Boar (亥) ─────────────────
  // 양손을 주먹처럼 말아 옆으로 나란히 맞붙인 낮고 넓은 덩어리.
  boar: {
    seal: 'boar',
    symmetric: true,
    twoHand: {
      h1ThumbExt: T(0.3, 0.3, 0.5),
      h1IndexExt: T(0.15, 0.22, 1.2),
      h1MiddleExt: T(0.15, 0.22, 1.2),
      h1RingExt: T(0.15, 0.25, 1.0),
      h1PinkyExt: T(0.15, 0.25, 0.9),
      h2ThumbExt: T(0.3, 0.3, 0.5),
      h2IndexExt: T(0.15, 0.22, 1.2),
      h2MiddleExt: T(0.15, 0.22, 1.2),
      h2RingExt: T(0.15, 0.25, 1.0),
      h2PinkyExt: T(0.15, 0.25, 0.9),
      dist: T(0.2, 0.13, 0.9),
      overlap: T(0.35, 0.3, 0.7),
      aspect: T(1.3, 0.45, 0.9),
      spread: T(0.16, 0.12, 1.2),
      topShare: T(0.22, 0.18, 0.7),
      extDiff: T(0.1, 0.2, 0.9),
      h2Higher: T(0, 0.15, 0.6),
    },
    merged: {
      targets: {
        mIndexExt: T(0.2, 0.28, 1.1),
        mMiddleExt: T(0.2, 0.28, 1.1),
        mRingExt: T(0.2, 0.3, 0.9),
        mAspect: T(1.25, 0.45, 0.9),
        mSpread: T(0.3, 0.2, 0.9),
      },
      cap: 0.7,
    },
    tipsKo: [
      '양손 손가락을 말아 주먹처럼 만들어',
      '두 주먹을 옆으로 나란히 맞붙여',
      '낮고 넓은 덩어리 모양이 되게 해',
    ],
  },
}

export const CLASSIFIABLE_SEAL_LIST = Object.keys(SEAL_TEMPLATES) as Exclude<
  Seal,
  'unknown'
>[]
