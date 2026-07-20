import type { Seal } from '../seal-recognition/sealTypes'

/**
 * 술법 데이터 (기획 v6 §8 JutsuVariant 구조, β 원칙 적용).
 *
 * - 모든 시퀀스는 canonStatus / sourceReference / verificationStatus를 가진다.
 * - 원작 시퀀스가 확인되지 않은 것은 game_interpretation으로 명시한다.
 * - 호화구 5 variant는 기존 설계 문서 값 그대로.
 */

export type ElementKo = '화' | '수' | '뇌' | '토' | '풍' | '무'

export type CanonStatus =
  | 'manga'
  | 'anime'
  | 'databook'
  | 'game'
  | 'fan_interpretation'
  | 'game_interpretation'

export type VerificationStatus =
  | 'verified'
  | 'cross_referenced'
  | 'claimed'
  | 'needs_research'

export type JutsuKind = 'attack' | 'defense' | 'evade' | 'utility'

export type SourceReference = {
  description: string
  mediaTitle?: string
  episodeOrChapter?: string
  publisherOrStudio?: string
  publishedDate?: string
  note?: string
}

export type JutsuVariant = {
  variantId: string
  parentJutsuId: string
  gameLevel: 1 | 2 | 3 | 4
  displayNameKo: string
  seals: Seal[]
  canonStatus: CanonStatus
  sourceReference: SourceReference
  verificationStatus: VerificationStatus
  isActiveInGame: boolean
  /** 응집(콘덴세이션) 윈도우 ms */
  condensationMs: number
  chakraCost: number
  power: number
  recoveryMs: number
}

export type Jutsu = {
  id: string
  nameKo: string
  nameEn: string
  element: ElementKo
  kind: JutsuKind
  vfxId: VfxId
  defaultVariantId: string
  variants: JutsuVariant[]
  loreNote?: string
}

export type VfxId =
  | 'fireball'
  | 'phoenix_flower'
  | 'chidori'
  | 'water_dragon'
  | 'wind_breakthrough'
  | 'earth_wall'
  | 'substitution'
  | 'clone'
  | 'summoning'

export const JUTSU_BOOK: Jutsu[] = [
  // ─────────── 화둔·호화구의 술 ───────────
  {
    id: 'great_fireball',
    nameKo: '화둔·호화구의 술',
    nameEn: 'Fire Release: Great Fireball Technique',
    element: '화',
    kind: 'attack',
    vfxId: 'fireball',
    defaultVariantId: 'great_fireball_lv1',
    loreNote:
      '우치하 일족의 성인식 술법. 만화에서는 우치하만, 애니에서는 비우치하도 사용.',
    variants: [
      {
        variantId: 'great_fireball_lv1',
        parentJutsuId: 'great_fireball',
        gameLevel: 1,
        displayNameKo: 'Lv.1 표준형',
        seals: ['snake', 'ram', 'monkey', 'boar', 'horse', 'tiger'],
        canonStatus: 'manga',
        sourceReference: {
          description: '우치하 일족 일반 사용 사례 (사스케 첫 시전 등)',
          mediaTitle: 'Naruto Manga',
        },
        verificationStatus: 'cross_referenced',
        isActiveInGame: true,
        condensationMs: 300,
        chakraCost: 25,
        power: 30,
        recoveryMs: 800,
      },
      {
        variantId: 'great_fireball_lv2',
        parentJutsuId: 'great_fireball',
        gameLevel: 2,
        displayNameKo: 'Lv.2 단축형',
        seals: ['boar', 'horse', 'tiger'],
        canonStatus: 'anime',
        sourceReference: {
          description: '이타치 vs 카카시 일행 전투에서 사용',
          mediaTitle: 'Naruto: Shippūden',
          episodeOrChapter: 'Episode 15',
          publisherOrStudio: 'Studio Pierrot',
        },
        verificationStatus: 'cross_referenced',
        isActiveInGame: true,
        condensationMs: 230,
        chakraCost: 34,
        power: 30,
        recoveryMs: 600,
      },
      {
        variantId: 'great_fireball_lv3',
        parentJutsuId: 'great_fireball',
        gameLevel: 3,
        displayNameKo: 'Lv.3 마스터형',
        seals: ['horse', 'tiger'],
        canonStatus: 'databook',
        sourceReference: {
          description: '공식 데이터북 1권 기재',
          mediaTitle: 'Hiden: Rin no Sho (1st Databook)',
          publisherOrStudio: 'Shueisha',
          publishedDate: '2002-07',
        },
        verificationStatus: 'cross_referenced',
        isActiveInGame: true,
        condensationMs: 200,
        chakraCost: 38,
        power: 32,
        recoveryMs: 500,
      },
      {
        variantId: 'great_fireball_lv4',
        parentJutsuId: 'great_fireball',
        gameLevel: 4,
        displayNameKo: 'Lv.4 전설형',
        seals: ['tiger'],
        canonStatus: 'databook',
        sourceReference: {
          description: '효노쇼 기재',
          mediaTitle: 'Hyō no Sho (1st Fanbook)',
          publisherOrStudio: 'Shueisha',
          note: '효노쇼는 정식 데이터북 시리즈와 별개의 팬북.',
        },
        verificationStatus: 'cross_referenced',
        isActiveInGame: false,
        condensationMs: 160,
        chakraCost: 42,
        power: 34,
        recoveryMs: 450,
      },
    ],
  },

  // ─────────── 화둔·봉선화의 술 ───────────
  {
    id: 'phoenix_flower',
    nameKo: '화둔·봉선화의 술',
    nameEn: 'Fire Release: Phoenix Sage Fire Technique',
    element: '화',
    kind: 'attack',
    vfxId: 'phoenix_flower',
    defaultVariantId: 'phoenix_flower_lv1',
    variants: [
      {
        variantId: 'phoenix_flower_lv1',
        parentJutsuId: 'phoenix_flower',
        gameLevel: 1,
        displayNameKo: 'Lv.1 표준형',
        seals: ['rat', 'tiger', 'dog', 'ox', 'rabbit', 'tiger'],
        canonStatus: 'anime',
        sourceReference: {
          description: '사스케 시전 장면 기준 시퀀스',
          mediaTitle: 'Naruto (Anime)',
          note: '위키 교차 확인. 1차 매체 재확인 권장.',
        },
        verificationStatus: 'cross_referenced',
        isActiveInGame: true,
        condensationMs: 260,
        chakraCost: 28,
        power: 24,
        recoveryMs: 700,
      },
    ],
  },

  // ─────────── 뇌둔·치도리 ───────────
  {
    id: 'chidori',
    nameKo: '뇌둔·치도리(천조)',
    nameEn: 'Lightning Release: Chidori',
    element: '뇌',
    kind: 'attack',
    vfxId: 'chidori',
    defaultVariantId: 'chidori_lv1',
    loreNote: '카카시가 개발한 암살 기술. 사스케에게 전수됐다.',
    variants: [
      {
        variantId: 'chidori_lv1',
        parentJutsuId: 'chidori',
        gameLevel: 1,
        displayNameKo: 'Lv.1 표준형',
        seals: ['ox', 'rabbit', 'monkey'],
        canonStatus: 'anime',
        sourceReference: {
          description: '축→묘→신 3인 시퀀스',
          mediaTitle: 'Naruto (Anime) / Narutopedia',
          note: 'Narutopedia 교차 확인 완료.',
        },
        verificationStatus: 'cross_referenced',
        isActiveInGame: true,
        condensationMs: 240,
        chakraCost: 34,
        power: 34,
        recoveryMs: 700,
      },
    ],
  },

  // ─────────── 수둔·수룡탄의 술 ───────────
  {
    id: 'water_dragon',
    nameKo: '수둔·수룡탄의 술',
    nameEn: 'Water Release: Water Dragon Bullet Technique',
    element: '수',
    kind: 'attack',
    vfxId: 'water_dragon',
    defaultVariantId: 'water_dragon_game',
    loreNote: '원작(자부자전 카카시)은 44개 인을 사용하는 것으로 유명하다.',
    variants: [
      {
        variantId: 'water_dragon_game',
        parentJutsuId: 'water_dragon',
        gameLevel: 1,
        displayNameKo: '게임 단축형',
        seals: ['ox', 'monkey', 'dragon'],
        canonStatus: 'game_interpretation',
        sourceReference: {
          description:
            '원작 44인 시퀀스는 플레이 불가능하여 본 프로젝트가 3인으로 축약. 원작 시퀀스의 시작(축·신) 인용.',
          note: '원작 첫 인은 축(Ox)→신(Monkey) 순으로 시작한다고 알려져 있음. needs_research.',
        },
        verificationStatus: 'needs_research',
        isActiveInGame: true,
        condensationMs: 280,
        chakraCost: 30,
        power: 28,
        recoveryMs: 750,
      },
    ],
  },

  // ─────────── 풍둔·대돌파 ───────────
  {
    id: 'great_breakthrough',
    nameKo: '풍둔·대돌파',
    nameEn: 'Wind Release: Great Breakthrough',
    element: '풍',
    kind: 'attack',
    vfxId: 'wind_breakthrough',
    defaultVariantId: 'great_breakthrough_game',
    variants: [
      {
        variantId: 'great_breakthrough_game',
        parentJutsuId: 'great_breakthrough',
        gameLevel: 1,
        displayNameKo: '게임형',
        seals: ['rooster', 'ram', 'horse'],
        canonStatus: 'game_interpretation',
        sourceReference: {
          description: '원작 시퀀스 미확인. 본 프로젝트 게임 디자인 시퀀스.',
        },
        verificationStatus: 'needs_research',
        isActiveInGame: true,
        condensationMs: 240,
        chakraCost: 26,
        power: 26,
        recoveryMs: 650,
      },
    ],
  },

  // ─────────── 토둔·토류벽 ───────────
  {
    id: 'earth_wall',
    nameKo: '토둔·토류벽',
    nameEn: 'Earth Release: Earth-Style Wall',
    element: '토',
    kind: 'defense',
    vfxId: 'earth_wall',
    defaultVariantId: 'earth_wall_game',
    variants: [
      {
        variantId: 'earth_wall_game',
        parentJutsuId: 'earth_wall',
        gameLevel: 1,
        displayNameKo: '게임형',
        seals: ['tiger', 'boar', 'dog'],
        canonStatus: 'game_interpretation',
        sourceReference: {
          description: '원작 시퀀스 미확인. 본 프로젝트 게임 디자인 시퀀스.',
        },
        verificationStatus: 'needs_research',
        isActiveInGame: true,
        condensationMs: 220,
        chakraCost: 22,
        power: 0,
        recoveryMs: 500,
      },
    ],
  },

  // ─────────── 바꿔치기의 술 ───────────
  {
    id: 'substitution',
    nameKo: '바꿔치기의 술',
    nameEn: 'Body Replacement Technique',
    element: '무',
    kind: 'evade',
    vfxId: 'substitution',
    defaultVariantId: 'substitution_lv1',
    variants: [
      {
        variantId: 'substitution_lv1',
        parentJutsuId: 'substitution',
        gameLevel: 1,
        displayNameKo: 'Lv.1 표준형',
        seals: ['tiger', 'boar', 'ox', 'dog', 'snake'],
        canonStatus: 'anime',
        sourceReference: {
          description: '인→해→축→술→사 5인 시퀀스',
          mediaTitle: 'Naruto (Anime)',
          note: '위키 교차 확인. 매체별 표기 차이 있음(진 포함 6인 판본 존재).',
        },
        verificationStatus: 'cross_referenced',
        isActiveInGame: true,
        condensationMs: 200,
        chakraCost: 15,
        power: 0,
        recoveryMs: 400,
      },
    ],
  },

  // ─────────── 분신술 ───────────
  {
    id: 'clone_technique',
    nameKo: '분신술',
    nameEn: 'Clone Technique',
    element: '무',
    kind: 'utility',
    vfxId: 'clone',
    defaultVariantId: 'clone_lv1',
    variants: [
      {
        variantId: 'clone_lv1',
        parentJutsuId: 'clone_technique',
        gameLevel: 1,
        displayNameKo: 'Lv.1 표준형',
        seals: ['ram', 'snake', 'tiger'],
        canonStatus: 'anime',
        sourceReference: {
          description: '미→사→인 3인 시퀀스',
          mediaTitle: 'Naruto (Anime) / Narutopedia',
        },
        verificationStatus: 'cross_referenced',
        isActiveInGame: true,
        condensationMs: 220,
        chakraCost: 12,
        power: 0,
        recoveryMs: 450,
      },
    ],
  },

  // ─────────── 소환술 ───────────
  {
    id: 'summoning',
    nameKo: '소환술 (구찌요세)',
    nameEn: 'Summoning Technique',
    element: '무',
    kind: 'attack',
    vfxId: 'summoning',
    defaultVariantId: 'summoning_lv1',
    loreNote: '피의 계약이 필요한 시공간 인술.',
    variants: [
      {
        variantId: 'summoning_lv1',
        parentJutsuId: 'summoning',
        gameLevel: 1,
        displayNameKo: 'Lv.1 표준형',
        seals: ['boar', 'dog', 'rooster', 'monkey', 'ram'],
        canonStatus: 'manga',
        sourceReference: {
          description: '해→술→유→신→미 5인 시퀀스',
          mediaTitle: 'Naruto Manga / Narutopedia',
          note: '유(酉)는 프로젝트 표기 원칙상 rooster enum 사용 (Bird 표기 alias 금지).',
        },
        verificationStatus: 'cross_referenced',
        isActiveInGame: true,
        condensationMs: 340,
        chakraCost: 45,
        power: 42,
        recoveryMs: 1100,
      },
    ],
  },
]

// ───────────────────────── 조회 유틸 ─────────────────────────

export function getJutsuById(jutsuId: string): Jutsu | null {
  return JUTSU_BOOK.find((jutsu) => jutsu.id === jutsuId) ?? null
}

export function getVariantById(variantId: string): {
  jutsu: Jutsu
  variant: JutsuVariant
} | null {
  for (const jutsu of JUTSU_BOOK) {
    const variant = jutsu.variants.find((entry) => entry.variantId === variantId)
    if (variant) {
      return { jutsu, variant }
    }
  }
  return null
}

export function getActiveVariants(jutsu: Jutsu): JutsuVariant[] {
  return jutsu.variants.filter((variant) => variant.isActiveInGame)
}

export const CANON_STATUS_LABEL_KO: Record<CanonStatus, string> = {
  manga: '만화',
  anime: '애니메이션',
  databook: '데이터북',
  game: '공식 게임',
  fan_interpretation: '팬 해석',
  game_interpretation: '본 게임 해석',
}

/**
 * 속성 상성 (기획 §9): 화>풍>뇌>토>수>화
 * counter[x] = x를 이기는(카운터하는) 속성
 */
export const ELEMENT_COUNTER: Record<ElementKo, ElementKo | null> = {
  화: '수',
  풍: '화',
  뇌: '풍',
  토: '뇌',
  수: '토',
  무: null,
}

export function getElementMultiplier(
  attacker: ElementKo,
  defender: ElementKo,
): number {
  if (attacker === '무' || defender === '무') return 1
  if (ELEMENT_COUNTER[defender] === attacker) return 1.5
  if (ELEMENT_COUNTER[attacker] === defender) return 0.67
  return 1
}

export const ELEMENT_COLOR: Record<ElementKo, string> = {
  화: '#ff5a3c',
  수: '#3ca9ff',
  뇌: '#ffd93c',
  토: '#c98850',
  풍: '#5aE8a0',
  무: '#b8a8d8',
}
