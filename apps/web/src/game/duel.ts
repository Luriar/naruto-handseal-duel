import {
  getElementMultiplier,
  getJutsuById,
  getVariantById,
  JUTSU_BOOK,
} from '../jutsu/jutsuData'
import type { ElementKo, Jutsu, JutsuVariant } from '../jutsu/jutsuData'
import type { Seal } from '../seal-recognition/sealTypes'

/**
 * 듀얼(대전) 게임 로직 — AI 상대 실시간 전투.
 *
 * 기획 v6 §16.3 Shadow Duel을 실제 전투 루프로 확장:
 * - AI가 variant를 골라 인을 하나씩 시전 (속도 프로필 450~850ms)
 * - 플레이어는 상대 캐스팅 스트립을 읽고 대응한다:
 *     · 속성 카운터 술법을 먼저 완성 → AI 시전 차단 + 1.5x 피해
 *     · 토류벽 → 다음 피격 75% 경감
 *     · 바꿔치기 → 짧은 회피 윈도우
 *     · 분신술 → 다음 피격 1회 무효
 * - 차크라: 초당 4 회복, 시전 소모 (기획 §10)
 */

export type DuelDifficulty = 'genin' | 'chunin' | 'jonin'

export type Combatant = {
  hp: number
  maxHp: number
  chakra: number
  maxChakra: number
  /** 토류벽 유지 종료 시각 */
  guardUntil: number
  /** 바꿔치기 회피 윈도우 종료 시각 */
  evadeUntil: number
  /** 분신 회피 횟수 */
  cloneCharges: number
}

export type EnemyPhase = 'thinking' | 'casting' | 'condensing' | 'recovering'

export type EnemyState = {
  phase: EnemyPhase
  jutsuId: string | null
  variantId: string | null
  sealIndex: number
  nextActionAt: number
  /** 이번 시전에서 확정된 인들 (캐스팅 스트립 표시용) */
  confirmedSeals: Seal[]
}

export type DuelStatus = 'fighting' | 'won' | 'lost'

export type DuelLogEntry = {
  at: number
  textKo: string
  tone: 'info' | 'good' | 'bad' | 'crit'
}

export type DuelState = {
  status: DuelStatus
  player: Combatant
  enemy: Combatant
  enemyAi: EnemyState
  log: DuelLogEntry[]
  startedAt: number
  difficulty: DuelDifficulty
  /** 마지막 회복 계산 시각 */
  lastRegenAt: number
}

export type DuelTickEvent =
  | { kind: 'enemy_cast_start'; jutsu: Jutsu; variant: JutsuVariant }
  | { kind: 'enemy_seal'; seal: Seal }
  | {
      kind: 'enemy_release'
      jutsu: Jutsu
      variant: JutsuVariant
      outcome: 'hit' | 'evaded' | 'blocked' | 'clone'
      damage: number
    }
  | { kind: 'duel_end'; winner: 'player' | 'enemy' }

export type PlayerCastResult =
  | {
      kind: 'attack'
      damage: number
      multiplier: number
      interrupted: boolean
      finished: boolean
    }
  | { kind: 'guard' }
  | { kind: 'evade_ready' }
  | { kind: 'clone_ready' }
  | { kind: 'no_chakra' }

const DIFFICULTY_CONFIG: Record<
  DuelDifficulty,
  { sealMinMs: number; sealMaxMs: number; thinkMinMs: number; thinkMaxMs: number; hp: number }
> = {
  genin: { sealMinMs: 750, sealMaxMs: 1150, thinkMinMs: 1600, thinkMaxMs: 3200, hp: 90 },
  chunin: { sealMinMs: 550, sealMaxMs: 850, thinkMinMs: 1100, thinkMaxMs: 2300, hp: 110 },
  jonin: { sealMinMs: 420, sealMaxMs: 640, thinkMinMs: 800, thinkMaxMs: 1600, hp: 130 },
}

const ENEMY_JUTSU_POOL = [
  'great_fireball',
  'phoenix_flower',
  'chidori',
  'water_dragon',
  'great_breakthrough',
]

const GUARD_DURATION_MS = 4000
const EVADE_DURATION_MS = 2200
const GUARD_DAMAGE_RATIO = 0.25

export function createDuelState(
  difficulty: DuelDifficulty,
  now: number,
): DuelState {
  const config = DIFFICULTY_CONFIG[difficulty]
  return {
    status: 'fighting',
    player: {
      hp: 100,
      maxHp: 100,
      chakra: 100,
      maxChakra: 100,
      guardUntil: 0,
      evadeUntil: 0,
      cloneCharges: 0,
    },
    enemy: {
      hp: config.hp,
      maxHp: config.hp,
      chakra: 100,
      maxChakra: 100,
      guardUntil: 0,
      evadeUntil: 0,
      cloneCharges: 0,
    },
    enemyAi: {
      phase: 'thinking',
      jutsuId: null,
      variantId: null,
      sealIndex: 0,
      nextActionAt: now + randomBetween(1500, 2600),
      confirmedSeals: [],
    },
    log: [
      {
        at: now,
        textKo: `대전 시작! 난이도: ${difficultyLabel(difficulty)}`,
        tone: 'info',
      },
    ],
    startedAt: now,
    difficulty,
    lastRegenAt: now,
  }
}

export function difficultyLabel(difficulty: DuelDifficulty): string {
  return difficulty === 'genin' ? '하급닌자' : difficulty === 'chunin' ? '중급닌자' : '상급닌자'
}

/** 매 프레임 호출. 이번 틱에 발생한 이벤트를 반환한다. */
export function tickDuel(state: DuelState, now: number): DuelTickEvent[] {
  if (state.status !== 'fighting') {
    return []
  }

  const events: DuelTickEvent[] = []

  // 차크라 회복 (초당 4, 기획 §10)
  const regenDt = (now - state.lastRegenAt) / 1000
  if (regenDt > 0.1) {
    state.lastRegenAt = now
    state.player.chakra = Math.min(
      state.player.maxChakra,
      state.player.chakra + 4 * regenDt,
    )
    // AI는 캐스팅 중 회복 없음
    if (state.enemyAi.phase !== 'casting' && state.enemyAi.phase !== 'condensing') {
      state.enemy.chakra = Math.min(
        state.enemy.maxChakra,
        state.enemy.chakra + 4 * regenDt,
      )
    }
  }

  const ai = state.enemyAi
  const config = DIFFICULTY_CONFIG[state.difficulty]

  if (now >= ai.nextActionAt) {
    switch (ai.phase) {
      case 'thinking': {
        const choice = pickEnemyJutsu(state)
        if (!choice) {
          ai.nextActionAt = now + 900
          break
        }
        ai.phase = 'casting'
        ai.jutsuId = choice.jutsu.id
        ai.variantId = choice.variant.variantId
        ai.sealIndex = 0
        ai.confirmedSeals = []
        ai.nextActionAt = now + randomBetween(config.sealMinMs, config.sealMaxMs)
        events.push({ kind: 'enemy_cast_start', jutsu: choice.jutsu, variant: choice.variant })
        break
      }
      case 'casting': {
        const found = ai.variantId ? getVariantById(ai.variantId) : null
        if (!found) {
          ai.phase = 'thinking'
          ai.nextActionAt = now + 1000
          break
        }
        const seal = found.variant.seals[ai.sealIndex]
        if (seal) {
          ai.confirmedSeals = [...ai.confirmedSeals, seal]
          ai.sealIndex += 1
          events.push({ kind: 'enemy_seal', seal })
        }
        if (ai.sealIndex >= found.variant.seals.length) {
          ai.phase = 'condensing'
          ai.nextActionAt = now + found.variant.condensationMs + 220
        } else {
          ai.nextActionAt = now + randomBetween(config.sealMinMs, config.sealMaxMs)
        }
        break
      }
      case 'condensing': {
        const found = ai.variantId ? getVariantById(ai.variantId) : null
        if (found) {
          const releaseEvent = resolveEnemyAttack(state, found.jutsu, found.variant, now)
          events.push(releaseEvent)
        }
        ai.phase = 'recovering'
        ai.nextActionAt = now + (found?.variant.recoveryMs ?? 800)
        break
      }
      case 'recovering': {
        ai.phase = 'thinking'
        ai.jutsuId = null
        ai.variantId = null
        ai.confirmedSeals = []
        ai.nextActionAt = now + randomBetween(config.thinkMinMs, config.thinkMaxMs)
        break
      }
    }
  }

  // 종료 판정
  if (state.player.hp <= 0) {
    state.status = 'lost'
    state.player.hp = 0
    events.push({ kind: 'duel_end', winner: 'enemy' })
  } else if (state.enemy.hp <= 0) {
    state.status = 'won'
    state.enemy.hp = 0
    events.push({ kind: 'duel_end', winner: 'player' })
  }

  return events
}

function pickEnemyJutsu(
  state: DuelState,
): { jutsu: Jutsu; variant: JutsuVariant } | null {
  const affordable = ENEMY_JUTSU_POOL.map((id) => getJutsuById(id))
    .filter((jutsu): jutsu is Jutsu => jutsu !== null)
    .flatMap((jutsu) =>
      jutsu.variants
        .filter(
          (variant) =>
            variant.isActiveInGame && variant.chakraCost <= state.enemy.chakra,
        )
        .map((variant) => ({ jutsu, variant })),
    )

  if (affordable.length === 0) {
    return null
  }

  return affordable[Math.floor(Math.random() * affordable.length)]
}

function resolveEnemyAttack(
  state: DuelState,
  jutsu: Jutsu,
  variant: JutsuVariant,
  now: number,
): DuelTickEvent {
  state.enemy.chakra = Math.max(0, state.enemy.chakra - variant.chakraCost)

  // 회피/방어 판정
  if (state.player.evadeUntil > now) {
    state.player.evadeUntil = 0
    pushLog(state, now, `바꿔치기 성공! ${jutsu.nameKo}을(를) 회피했다`, 'good')
    return { kind: 'enemy_release', jutsu, variant, outcome: 'evaded', damage: 0 }
  }

  if (state.player.cloneCharges > 0) {
    state.player.cloneCharges -= 1
    pushLog(state, now, `분신이 대신 맞았다! (${jutsu.nameKo})`, 'good')
    return { kind: 'enemy_release', jutsu, variant, outcome: 'clone', damage: 0 }
  }

  if (state.player.guardUntil > now) {
    const damage = Math.round(variant.power * GUARD_DAMAGE_RATIO)
    state.player.hp -= damage
    pushLog(state, now, `토류벽이 ${jutsu.nameKo}을(를) 막아냈다 (-${damage})`, 'good')
    return { kind: 'enemy_release', jutsu, variant, outcome: 'blocked', damage }
  }

  const damage = variant.power
  state.player.hp -= damage
  pushLog(state, now, `${jutsu.nameKo} 피격! (-${damage})`, 'bad')
  return { kind: 'enemy_release', jutsu, variant, outcome: 'hit', damage }
}

/** 플레이어가 술법 시전을 완성했을 때 호출 */
export function applyPlayerCast(
  state: DuelState,
  jutsu: Jutsu,
  variant: JutsuVariant,
  now: number,
): PlayerCastResult {
  if (state.status !== 'fighting') {
    return { kind: 'no_chakra' }
  }

  if (state.player.chakra < variant.chakraCost) {
    pushLog(state, now, '차크라가 부족하다!', 'bad')
    return { kind: 'no_chakra' }
  }

  state.player.chakra -= variant.chakraCost

  switch (jutsu.kind) {
    case 'defense': {
      state.player.guardUntil = now + GUARD_DURATION_MS
      pushLog(state, now, `${jutsu.nameKo} 전개! 잠시 피해 대폭 경감`, 'good')
      return { kind: 'guard' }
    }
    case 'evade': {
      state.player.evadeUntil = now + EVADE_DURATION_MS
      pushLog(state, now, `${jutsu.nameKo} 준비! 다음 공격 회피`, 'good')
      return { kind: 'evade_ready' }
    }
    case 'utility': {
      state.player.cloneCharges += 1
      pushLog(state, now, `${jutsu.nameKo}! 분신이 다음 피격을 대신한다`, 'good')
      return { kind: 'clone_ready' }
    }
    case 'attack': {
      // 속성 카운터: AI가 시전 중이고 내 속성이 상대 술법을 이기면 차단 + 보너스
      const ai = state.enemyAi
      let interrupted = false
      let multiplier = 1

      if (
        (ai.phase === 'casting' || ai.phase === 'condensing') &&
        ai.variantId !== null
      ) {
        const enemyCasting = getVariantById(ai.variantId)
        if (enemyCasting) {
          const enemyElement: ElementKo = enemyCasting.jutsu.element
          multiplier = getElementMultiplier(jutsu.element, enemyElement)
          if (multiplier > 1) {
            interrupted = true
            ai.phase = 'recovering'
            ai.nextActionAt = now + 1400
            ai.confirmedSeals = []
            pushLog(
              state,
              now,
              `속성 상성! ${jutsu.element}둔이 ${enemyElement}둔을 꿰뚫어 시전을 끊었다`,
              'crit',
            )
          }
        }
      }

      const damage = Math.round(variant.power * multiplier)
      state.enemy.hp -= damage
      pushLog(
        state,
        now,
        `${jutsu.nameKo} 명중! (-${damage}${multiplier > 1 ? ', 상성 보너스' : ''})`,
        multiplier > 1 ? 'crit' : 'good',
      )

      const finished = state.enemy.hp <= 0
      return { kind: 'attack', damage, multiplier, interrupted, finished }
    }
  }
}

export function pushLog(
  state: DuelState,
  now: number,
  textKo: string,
  tone: DuelLogEntry['tone'],
): void {
  state.log = [...state.log.slice(-30), { at: now, textKo, tone }]
}

/** AI가 현재 시전 중인 술법 정보 (UI 표시용) */
export function getEnemyCastingInfo(state: DuelState): {
  jutsu: Jutsu
  variant: JutsuVariant
  confirmedSeals: Seal[]
  phase: EnemyPhase
} | null {
  const ai = state.enemyAi
  if (!ai.variantId) return null
  const found = getVariantById(ai.variantId)
  if (!found) return null
  return {
    jutsu: found.jutsu,
    variant: found.variant,
    confirmedSeals: ai.confirmedSeals,
    phase: ai.phase,
  }
}

/** 플레이어가 대전에서 고를 수 있는 술법 목록 */
export function getPlayerDuelChoices(): { jutsu: Jutsu; variant: JutsuVariant }[] {
  return JUTSU_BOOK.flatMap((jutsu) =>
    jutsu.variants
      .filter((variant) => variant.isActiveInGame)
      .map((variant) => ({ jutsu, variant })),
  )
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min)
}
