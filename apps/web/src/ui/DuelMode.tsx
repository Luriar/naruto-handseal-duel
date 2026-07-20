import { useCallback, useEffect, useRef, useState } from 'react'
import { initSfx, playSfx } from '../audio/sfx'
import type { SfxName } from '../audio/sfx'
import {
  applyPlayerCast,
  createDuelState,
  difficultyLabel,
  getEnemyCastingInfo,
  getPlayerDuelChoices,
  tickDuel,
} from '../game/duel'
import type { DuelDifficulty, DuelState } from '../game/duel'
import { ELEMENT_COLOR } from '../jutsu/jutsuData'
import type { ElementKo, Jutsu, JutsuVariant } from '../jutsu/jutsuData'
import {
  createCastSession,
  getCondensationProgress,
  getExpectedSeal,
  onSealConfirmed,
  onTick,
} from '../jutsu/sequenceMatcher'
import type { CastSession } from '../jutsu/sequenceMatcher'
import {
  playCastFailure,
  playHitImpact,
  playJutsuVfx,
  playSealConfirmPulse,
} from '../vfx/effects'
import type { VfxEngine } from '../vfx/effects'
import { SealIcon } from './SealIcon'
import {
  LiveSealBadge,
  SealStrip,
  StatBar,
  TrackedVideo,
  VfxCanvas,
} from './gameWidgets'
import { SEAL_KO, trackingNote } from './sealNames'
import type { HandTracking } from './useHandTracking'

const ELEMENT_SFX: Record<ElementKo, SfxName> = {
  화: 'fire',
  수: 'water',
  뇌: 'lightning',
  토: 'earth',
  풍: 'wind',
  무: 'poof',
}

const JUTSU_SFX_OVERRIDE: Record<string, SfxName> = {
  substitution: 'poof',
  clone_technique: 'clone',
  summoning: 'summon',
}

/** 대전에서 고를 수 있는 술법 (모듈 로드 시 1회 구성) */
const DUEL_CHOICES = getPlayerDuelChoices()

type DuelModeProps = {
  tracking: HandTracking
}

export function DuelMode({ tracking }: DuelModeProps) {
  /** 렌더용 스냅샷 (원본은 duelRef에서 변이 후 매 틱 복사) */
  const [duel, setDuel] = useState<DuelState | null>(null)
  const [frameNow, setFrameNow] = useState(0)
  const [session, setSession] = useState<CastSession | null>(null)
  const [selectedChoice, setSelectedChoice] = useState<{
    jutsu: Jutsu
    variant: JutsuVariant
  } | null>(null)

  const duelRef = useRef<DuelState | null>(null)
  const sessionRef = useRef<CastSession | null>(null)
  const engineRef = useRef<VfxEngine | null>(null)

  const updateSession = useCallback(
    (next: CastSession | null) => {
      sessionRef.current = next
      setSession(next)
      tracking.setExpectedSeal(next ? getExpectedSeal(next) : null)
    },
    [tracking],
  )

  const startDuel = useCallback(
    (level: DuelDifficulty) => {
      initSfx()
      playSfx('click')
      const created = createDuelState(level, performance.now())
      duelRef.current = created
      setDuel({ ...created })
      updateSession(null)
      setSelectedChoice(null)
      void tracking.start()
    },
    [tracking, updateSession],
  )

  const exitDuel = useCallback(() => {
    duelRef.current = null
    setDuel(null)
    updateSession(null)
    setSelectedChoice(null)
  }, [updateSession])

  const selectJutsu = useCallback(
    (choice: { jutsu: Jutsu; variant: JutsuVariant }) => {
      const current = duelRef.current
      if (!current || current.status !== 'fighting') return
      if (current.player.chakra < choice.variant.chakraCost) {
        playSfx('fail')
        return
      }
      playSfx('click')
      setSelectedChoice(choice)
      updateSession(createCastSession(choice.variant))
    },
    [updateSession],
  )

  // ── 인 확정 → 플레이어 시퀀스 진행 ──
  const lastConfirmSerial = tracking.lastConfirm?.serial ?? 0
  useEffect(() => {
    const confirm = tracking.lastConfirm
    const current = sessionRef.current
    if (!confirm || !current || confirm.serial === 0) return
    if (current.phase !== 'idle' && current.phase !== 'casting') return

    const before = current.expectedIndex
    const next = onSealConfirmed(current, confirm.seal, confirm.timestamp, confirm.confidence)
    if (next === current) return

    updateSession(next)

    if (next.expectedIndex > before) {
      playSfx('seal')
      const anchor = tracking.getHandAnchor()
      if (engineRef.current) {
        playSealConfirmPulse(engineRef.current, anchor?.nx ?? 0.5, anchor?.ny ?? 0.55)
      }
    } else if (next.phase === 'failed') {
      playSfx('fail')
      if (engineRef.current) playCastFailure(engineRef.current, 0.5, 0.55)
      window.setTimeout(() => updateSession(null), 900)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastConfirmSerial])

  // ── 프레임 틱: AI 진행 + 플레이어 응집/타임아웃 + 스냅샷 ──
  useEffect(() => {
    const duelState = duelRef.current
    if (!duelState) return
    const now = performance.now()

    // AI / 회복 / 종료
    const events = tickDuel(duelState, now)
    for (const event of events) {
      switch (event.kind) {
        case 'enemy_cast_start':
          break
        case 'enemy_seal':
          break
        case 'enemy_release': {
          const sfxName =
            JUTSU_SFX_OVERRIDE[event.jutsu.id] ?? ELEMENT_SFX[event.jutsu.element]
          playSfx(sfxName)
          if (engineRef.current) {
            if (event.outcome === 'hit') {
              playJutsuVfx(engineRef.current, event.jutsu.vfxId, {
                nx: 0.5,
                ny: 0.5,
                intensity: 0.9,
              })
              const strong = event.damage >= 28
              window.setTimeout(() => {
                playSfx('hit')
                if (engineRef.current) {
                  playHitImpact(engineRef.current, strong)
                }
              }, 600)
            } else if (event.outcome === 'blocked') {
              playJutsuVfx(engineRef.current, 'earth_wall', { intensity: 0.7 })
            } else {
              playJutsuVfx(engineRef.current, 'substitution', { nx: 0.5, ny: 0.6 })
            }
          }
          break
        }
        case 'duel_end':
          playSfx(event.winner === 'player' ? 'win' : 'lose')
          updateSession(null)
          break
      }
    }

    // 플레이어 시퀀스 시간 처리
    const current = sessionRef.current
    if (current) {
      const next = onTick(current, now)
      if (next !== current) {
        updateSession(next)

        if (next.phase === 'failed' && current.phase !== 'failed') {
          playSfx('fail')
          if (engineRef.current) playCastFailure(engineRef.current, 0.5, 0.55)
          window.setTimeout(() => updateSession(null), 900)
        }

        if (next.phase === 'released') {
          const choice = selectedChoice
          if (choice) {
            const result = applyPlayerCast(duelState, choice.jutsu, choice.variant, now)

            if (result.kind !== 'no_chakra') {
              const sfxName =
                JUTSU_SFX_OVERRIDE[choice.jutsu.id] ?? ELEMENT_SFX[choice.jutsu.element]
              playSfx(sfxName)
              if (engineRef.current) {
                const anchor = tracking.getHandAnchor()
                playJutsuVfx(engineRef.current, choice.jutsu.vfxId, {
                  nx: anchor?.nx ?? 0.5,
                  ny: anchor?.ny ?? 0.58,
                })
              }
            }
          }
          window.setTimeout(() => updateSession(null), 500)
        }
      }
    }

    // 렌더 스냅샷
    setFrameNow(now)
    setDuel({ ...duelState })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracking.frame])

  // ───────────── 난이도 선택 ─────────────
  if (!duel) {
    return (
      <div className="g-duel g-duel-lobby">
        <h2 className="g-screen-title">대전 — 상대 선택</h2>
        <p className="g-screen-sub">
          AI 닌자와 실시간 인술 대전. 상대의 인을 읽고, 속성 상성으로 시전을
          끊어. (화→풍→뇌→토→수→화)
        </p>
        <div className="g-difficulty-row">
          {(['genin', 'chunin', 'jonin'] as DuelDifficulty[]).map((level) => (
            <button
              key={level}
              type="button"
              className="g-difficulty-card"
              onClick={() => startDuel(level)}
            >
              <strong>{difficultyLabel(level)}</strong>
              <span>
                {level === 'genin'
                  ? '느린 시전 · HP 90'
                  : level === 'chunin'
                    ? '보통 시전 · HP 110'
                    : '빠른 시전 · HP 130'}
              </span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  // ───────────── 전투 화면 ─────────────
  const enemyCasting = getEnemyCastingInfo(duel)
  const stab = tracking.stabilizer
  const condenseProgress = session ? getCondensationProgress(session, frameNow) : 0

  return (
    <div className="g-duel">
      <div className="g-duel-arena">
        {/* 플레이어 스테이지 */}
        <div className="g-stage g-duel-stage">
          <TrackedVideo attach={tracking.attachVideo} />
          <VfxCanvas
            onEngineReady={(engine) => {
              engineRef.current = engine
            }}
          />

          <div className="g-duel-player-bars">
            <StatBar label="내 HP" value={duel.player.hp} max={duel.player.maxHp} kind="hp" />
            <StatBar
              label="차크라"
              value={duel.player.chakra}
              max={duel.player.maxChakra}
              kind="chakra"
            />
            <div className="g-buff-row">
              {duel.player.guardUntil > frameNow && <span className="g-buff">토류벽</span>}
              {duel.player.evadeUntil > frameNow && (
                <span className="g-buff">바꿔치기 대기</span>
              )}
              {duel.player.cloneCharges > 0 && (
                <span className="g-buff">분신 x{duel.player.cloneCharges}</span>
              )}
            </div>
          </div>

          {session && selectedChoice && (
            <div className="g-duel-casting">
              <SealStrip
                seals={selectedChoice.variant.seals}
                doneCount={session.expectedIndex}
                currentProgress={stab?.candidateProgress ?? 0}
                compact
              />
              {session.phase === 'condensing' && (
                <div className="g-condense-banner g-condense-compact">
                  <div
                    className="g-condense-fill"
                    style={{ width: `${condenseProgress * 100}%` }}
                  />
                  <span>응집!</span>
                </div>
              )}
            </div>
          )}

          {stab && (
            <div className="g-duel-live-badge">
              <LiveSealBadge
                candidateSeal={stab.candidateSeal}
                progress={stab.candidateProgress}
                heldSeal={stab.heldSeal}
                trackingNote={trackingNote(tracking)}
              />
            </div>
          )}

          {duel.status !== 'fighting' && (
            <div
              className="g-cast-result"
              data-tone={duel.status === 'won' ? 'success' : 'fail'}
            >
              <h3>{duel.status === 'won' ? '승리!' : '패배...'}</h3>
              <p>
                {duel.status === 'won'
                  ? `${difficultyLabel(duel.difficulty)}를 쓰러뜨렸다!`
                  : '차크라를 가다듬고 다시 도전하자.'}
              </p>
              <div className="g-result-actions">
                <button type="button" onClick={() => startDuel(duel.difficulty)}>
                  재대결
                </button>
                <button type="button" onClick={exitDuel}>
                  나가기
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 상대 패널 */}
        <aside className="g-enemy-panel">
          <div className="g-enemy-head">
            <EnemyAvatar
              casting={enemyCasting !== null}
              element={enemyCasting?.jutsu.element ?? '무'}
              phase={duel.enemyAi.phase}
            />
            <div>
              <strong>{difficultyLabel(duel.difficulty)}</strong>
              <span className="g-enemy-phase">
                {duel.enemyAi.phase === 'thinking'
                  ? '기회를 엿보는 중'
                  : duel.enemyAi.phase === 'casting'
                    ? '인을 맺는 중!'
                    : duel.enemyAi.phase === 'condensing'
                      ? '차크라 응집!'
                      : '후딜레이'}
              </span>
            </div>
          </div>

          <StatBar label="상대 HP" value={duel.enemy.hp} max={duel.enemy.maxHp} kind="hp" mirrored />
          <StatBar
            label="상대 차크라"
            value={duel.enemy.chakra}
            max={duel.enemy.maxChakra}
            kind="chakra"
            mirrored
          />

          {/* 정보전: 술법명은 숨기고 확정된 인만 보여준다 */}
          <div className="g-enemy-strip">
            <p>상대 캐스팅 스트립</p>
            {enemyCasting && enemyCasting.confirmedSeals.length > 0 ? (
              <div className="g-enemy-seals">
                {enemyCasting.confirmedSeals.map((seal, index) => (
                  <span key={`${seal}-${index}`} className="g-enemy-seal">
                    <SealIcon seal={seal} size={26} />
                    <em>{SEAL_KO[seal]}</em>
                  </span>
                ))}
                {duel.enemyAi.phase === 'condensing' && (
                  <span className="g-enemy-danger">!</span>
                )}
              </div>
            ) : (
              <p className="g-enemy-strip-empty">아직 인이 없다</p>
            )}
          </div>

          <div className="g-battle-log">
            {duel.log.slice(-6).map((entry, index) => (
              <p key={`${entry.at}-${index}`} data-tone={entry.tone}>
                {entry.textKo}
              </p>
            ))}
          </div>
        </aside>
      </div>

      {/* 술법 선택 바 */}
      <div className="g-jutsu-bar">
        {DUEL_CHOICES.map((choice) => {
          const disabled =
            duel.status !== 'fighting' ||
            duel.player.chakra < choice.variant.chakraCost ||
            (session !== null && session.phase !== 'failed')
          const active = selectedChoice?.variant.variantId === choice.variant.variantId

          return (
            <button
              key={choice.variant.variantId}
              type="button"
              className="g-jutsu-slot"
              data-active={active}
              disabled={disabled}
              onClick={() => selectJutsu(choice)}
              title={`${choice.jutsu.nameKo} ${choice.variant.displayNameKo} · 차크라 ${choice.variant.chakraCost}`}
            >
              <span
                className="g-element-dot"
                style={{ background: ELEMENT_COLOR[choice.jutsu.element] }}
              />
              <strong>{shortJutsuName(choice.jutsu)}</strong>
              <em>
                {choice.jutsu.id === 'great_fireball'
                  ? `Lv.${choice.variant.gameLevel}`
                  : `${choice.variant.seals.length}인`}
              </em>
              <span className="g-slot-cost">{choice.variant.chakraCost}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function shortJutsuName(jutsu: Jutsu): string {
  return jutsu.nameKo.includes('·') ? jutsu.nameKo.split('·')[1] : jutsu.nameKo
}

function EnemyAvatar({
  casting,
  element,
  phase,
}: {
  casting: boolean
  element: ElementKo
  phase: string
}) {
  const auraColor = casting ? ELEMENT_COLOR[element] : 'transparent'
  return (
    <div
      className="g-enemy-avatar"
      data-casting={casting}
      data-phase={phase}
      style={{ boxShadow: casting ? `0 0 26px ${auraColor}` : undefined }}
    >
      <svg viewBox="0 0 64 64" width={62} height={62} aria-hidden>
        {/* 닌자 실루엣 */}
        <circle cx={32} cy={20} r={11} fill="#2a2438" />
        <path d="M14 56 C14 38 50 38 50 56 Z" fill="#2a2438" />
        {/* 머리띠 */}
        <rect x={21} y={15} width={22} height={5.5} rx={2} fill="#4a4462" />
        <circle cx={32} cy={17.8} r={1.8} fill="#8f86b8" />
        {/* 눈 */}
        <rect x={25} y={22} width={4.5} height={1.8} rx={0.9} fill="#a89ecf" />
        <rect x={34.5} y={22} width={4.5} height={1.8} rx={0.9} fill="#a89ecf" />
      </svg>
    </div>
  )
}
