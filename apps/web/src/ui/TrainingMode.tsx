import { useCallback, useEffect, useRef, useState } from 'react'
import { initSfx, playSfx } from '../audio/sfx'
import type { SfxName } from '../audio/sfx'
import {
  CANON_STATUS_LABEL_KO,
  ELEMENT_COLOR,
  JUTSU_BOOK,
  getVariantById,
} from '../jutsu/jutsuData'
import type { ElementKo, Jutsu, JutsuVariant } from '../jutsu/jutsuData'
import {
  cancelCast,
  createCastSession,
  getCondensationProgress,
  getExpectedSeal,
  onSealConfirmed,
  onTick,
  scoreCast,
} from '../jutsu/sequenceMatcher'
import type { CastSession, CastScore } from '../jutsu/sequenceMatcher'
import { SEAL_TEMPLATES } from '../seal-recognition/sealTemplates'
import {
  playCastFailure,
  playCondensation,
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
import { SEAL_KO_FULL, trackingNote } from './sealNames'
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

type TrainingModeProps = {
  tracking: HandTracking
}

export function TrainingMode({ tracking }: TrainingModeProps) {
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null)
  const [session, setSession] = useState<CastSession | null>(null)
  const [score, setScore] = useState<CastScore | null>(null)
  const [chakra, setChakra] = useState(100)
  const [condenseProgress, setCondenseProgress] = useState(0)
  const sessionRef = useRef<CastSession | null>(null)
  const engineRef = useRef<VfxEngine | null>(null)
  const flickerSamplesRef = useRef<number[]>([])
  const releasedHandledRef = useRef(false)

  const selected = selectedVariantId ? getVariantById(selectedVariantId) : null

  // 세션 갱신 헬퍼
  const updateSession = useCallback(
    (next: CastSession | null) => {
      sessionRef.current = next
      setSession(next)
      const expected = next ? getExpectedSeal(next) : null
      tracking.setExpectedSeal(expected)
    },
    [tracking],
  )

  const startCast = useCallback(
    (variant: JutsuVariant) => {
      initSfx()
      playSfx('click')
      setSelectedVariantId(variant.variantId)
      setScore(null)
      setCondenseProgress(0)
      releasedHandledRef.current = false
      flickerSamplesRef.current = []
      updateSession(createCastSession(variant))
      void tracking.start()
    },
    [tracking, updateSession],
  )

  const stopCast = useCallback(() => {
    const current = sessionRef.current
    if (current && (current.phase === 'casting' || current.phase === 'condensing')) {
      updateSession(cancelCast(current))
    } else {
      updateSession(null)
    }
    setScore(null)
  }, [updateSession])

  // 인 확정 이벤트 → 시퀀스 진행
  const lastConfirmSerial = tracking.lastConfirm?.serial ?? 0
  useEffect(() => {
    const confirm = tracking.lastConfirm
    const current = sessionRef.current
    if (!confirm || !current || confirm.serial === 0) return
    if (current.phase !== 'idle' && current.phase !== 'casting') return

    const before = current.expectedIndex
    const next = onSealConfirmed(current, confirm.seal, confirm.timestamp, confirm.confidence)

    if (next !== current) {
      updateSession(next)

      if (next.expectedIndex > before) {
        playSfx('seal')
        const anchor = tracking.getHandAnchor()
        if (engineRef.current) {
          playSealConfirmPulse(engineRef.current, anchor?.nx ?? 0.5, anchor?.ny ?? 0.55)
        }
        if (next.phase === 'condensing' && engineRef.current) {
          const element = selected?.jutsu.element ?? '무'
          const color = hexToRgb(ELEMENT_COLOR[element])
          playCondensation(
            engineRef.current,
            anchor?.nx ?? 0.5,
            anchor?.ny ?? 0.55,
            next.variant.condensationMs,
            color,
          )
        }
      } else if (next.phase === 'failed') {
        playSfx('fail')
        if (engineRef.current) {
          playCastFailure(engineRef.current, 0.5, 0.55)
        }
      } else if (next.wrongSealWarnings > current.wrongSealWarnings) {
        playSfx('click')
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastConfirmSerial])

  // 프레임마다 시간 경과 처리 (타임아웃 / 응집 → 발동)
  useEffect(() => {
    const current = sessionRef.current
    if (!current) return
    if (tracking.stabilizer) {
      flickerSamplesRef.current.push(tracking.stabilizer.flicker)
      if (flickerSamplesRef.current.length > 400) {
        flickerSamplesRef.current.shift()
      }
    }

    const now = performance.now()

    // 응집 게이지는 세션 객체가 안 바뀌어도 시간에 따라 차오른다
    if (current.phase === 'condensing') {
      setCondenseProgress(getCondensationProgress(current, now))
    }

    const next = onTick(current, now)
    if (next === current) return

    updateSession(next)

    if (next.phase === 'failed' && current.phase !== 'failed') {
      playSfx('fail')
      if (engineRef.current) {
        playCastFailure(engineRef.current, 0.5, 0.55)
      }
    }

    if (next.phase === 'released' && !releasedHandledRef.current) {
      releasedHandledRef.current = true
      setCondenseProgress(1)
      const found = selected
      if (found && engineRef.current) {
        const sfxName =
          JUTSU_SFX_OVERRIDE[found.jutsu.id] ?? ELEMENT_SFX[found.jutsu.element]
        playSfx(sfxName)
        const anchor = tracking.getHandAnchor()
        playJutsuVfx(engineRef.current, found.jutsu.vfxId, {
          nx: anchor?.nx ?? 0.5,
          ny: anchor?.ny ?? 0.58,
        })
      }
      setChakra((value) => Math.max(0, value - (found?.variant.chakraCost ?? 0)))

      const flickers = flickerSamplesRef.current
      const flickerMean =
        flickers.length > 0
          ? flickers.reduce((sum, value) => sum + value, 0) / flickers.length
          : 0
      setScore(scoreCast(next, flickerMean))
      window.setTimeout(() => playSfx('win'), 600)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracking.frame])

  // 차크라 자연 회복
  useEffect(() => {
    const timer = window.setInterval(() => {
      setChakra((value) => Math.min(100, value + 1))
    }, 250)
    return () => window.clearInterval(timer)
  }, [])

  // ───────────── 술법 선택 화면 ─────────────
  if (!session || !selected) {
    return (
      <div className="g-training">
        <h2 className="g-screen-title">수련장 — 술법 선택</h2>
        <p className="g-screen-sub">
          시전할 술법을 골라. 인 순서를 외우고, 손으로 직접 맺는 거야.
        </p>
        <div className="g-jutsu-grid">
          {JUTSU_BOOK.map((jutsu) => (
            <JutsuCard key={jutsu.id} jutsu={jutsu} onSelect={startCast} />
          ))}
        </div>
      </div>
    )
  }

  // ───────────── 시전 화면 ─────────────
  const expected = getExpectedSeal(session)
  const expectedTemplate =
    expected && expected !== 'unknown' ? SEAL_TEMPLATES[expected] : null
  const stab = tracking.stabilizer

  return (
    <div className="g-training g-training-cast">
      <div className="g-cast-top">
        <div className="g-cast-jutsu-name">
          <span
            className="g-element-badge"
            style={{ background: ELEMENT_COLOR[selected.jutsu.element] }}
          >
            {selected.jutsu.element}
          </span>
          <strong>{selected.jutsu.nameKo}</strong>
          <em>{selected.variant.displayNameKo}</em>
          <span className="g-source-tag">
            출처: {CANON_STATUS_LABEL_KO[selected.variant.canonStatus]}
          </span>
        </div>
        <SealStrip
          seals={selected.variant.seals}
          doneCount={session.expectedIndex}
          currentProgress={stab?.candidateProgress ?? 0}
        />
      </div>

      <div className="g-cast-stage-row">
        <div className="g-stage">
          <TrackedVideo attach={tracking.attachVideo} />
          <StageOverlay tracking={tracking} />
          <VfxCanvas
            onEngineReady={(engine) => {
              engineRef.current = engine
            }}
          />

          {session.phase === 'condensing' && (
            <div className="g-condense-banner">
              <div
                className="g-condense-fill"
                style={{ width: `${condenseProgress * 100}%` }}
              />
              <span>차크라 응집 중...</span>
            </div>
          )}

          {session.phase === 'failed' && (
            <div className="g-cast-result" data-tone="fail">
              <h3>술식 붕괴</h3>
              <p>
                {session.failureReason === 'timeout'
                  ? '차크라 조형이 중단됐다 (너무 오래 걸림)'
                  : session.failureReason === 'wrong_seal'
                    ? `잘못된 인 (${session.lastWrongSeal ? SEAL_KO_FULL[session.lastWrongSeal] : '?'})이 섞였다`
                    : '시전이 끊겼다'}
              </p>
              <div className="g-result-actions">
                <button type="button" onClick={() => startCast(selected.variant)}>
                  다시 시전
                </button>
                <button type="button" onClick={() => updateSession(null)}>
                  술법 선택으로
                </button>
              </div>
            </div>
          )}

          {session.phase === 'released' && score && (
            <div className="g-cast-result" data-tone="success">
              <h3>
                {selected.jutsu.nameKo} 발동! <span className="g-rank">{score.rankLabel}</span>
              </h3>
              <div className="g-score-grid">
                <div>
                  <span>정확도</span>
                  <strong>{score.accuracyScore}</strong>
                </div>
                <div>
                  <span>속도</span>
                  <strong>{score.speedScore}</strong>
                </div>
                <div>
                  <span>안정성</span>
                  <strong>{score.stabilityScore}</strong>
                </div>
                <div>
                  <span>종합</span>
                  <strong>{score.totalScore}</strong>
                </div>
              </div>
              <p className="g-score-meta">
                총 {(score.totalMs / 1000).toFixed(1)}초 · 인 전환 평균{' '}
                {(score.meanTransitionMs / 1000).toFixed(1)}초
              </p>
              <div className="g-result-actions">
                <button type="button" onClick={() => startCast(selected.variant)}>
                  다시 시전
                </button>
                <button type="button" onClick={() => updateSession(null)}>
                  술법 선택으로
                </button>
              </div>
            </div>
          )}
        </div>

        <aside className="g-cast-side">
          <div className="g-target-panel">
            <p className="g-target-label">
              {session.phase === 'condensing' || session.phase === 'released'
                ? '모든 인 완성!'
                : `다음 인 (${session.expectedIndex + 1}/${selected.variant.seals.length})`}
            </p>
            {expected && expected !== 'unknown' ? (
              <>
                <div className="g-target-icon">
                  <SealIcon seal={expected} size={110} />
                </div>
                <h3>{SEAL_KO_FULL[expected]}</h3>
                <ul className="g-tips">
                  {(expectedTemplate?.tipsKo ?? []).map((tip) => (
                    <li key={tip}>{tip}</li>
                  ))}
                </ul>
              </>
            ) : (
              <div className="g-target-icon g-target-done">🔥</div>
            )}
          </div>

          {stab && (
            <LiveSealBadge
              candidateSeal={stab.candidateSeal}
              progress={stab.candidateProgress}
              heldSeal={stab.heldSeal}
              trackingNote={trackingNote(tracking)}
            />
          )}

          <StatBar label="차크라" value={chakra} max={100} kind="chakra" />

          <button type="button" className="g-ghost-btn" onClick={stopCast}>
            시전 중단 (페이크/캔슬)
          </button>
        </aside>
      </div>
    </div>
  )
}

// ───────────────────────── 보조 컴포넌트 ─────────────────────────

function JutsuCard({
  jutsu,
  onSelect,
}: {
  jutsu: Jutsu
  onSelect: (variant: JutsuVariant) => void
}) {
  const activeVariants = jutsu.variants.filter((variant) => variant.isActiveInGame)
  const [variantId, setVariantId] = useState(
    activeVariants[0]?.variantId ?? jutsu.defaultVariantId,
  )
  const variant =
    activeVariants.find((entry) => entry.variantId === variantId) ?? activeVariants[0]

  if (!variant) return null

  return (
    <div className="g-jutsu-card">
      <div className="g-jutsu-card-head">
        <span
          className="g-element-badge"
          style={{ background: ELEMENT_COLOR[jutsu.element] }}
        >
          {jutsu.element}
        </span>
        <strong>{jutsu.nameKo}</strong>
      </div>
      <p className="g-jutsu-en">{jutsu.nameEn}</p>

      {activeVariants.length > 1 && (
        <div className="g-variant-tabs">
          {activeVariants.map((entry) => (
            <button
              key={entry.variantId}
              type="button"
              data-active={entry.variantId === variant.variantId}
              onClick={() => setVariantId(entry.variantId)}
            >
              Lv.{entry.gameLevel}
            </button>
          ))}
        </div>
      )}

      <div className="g-jutsu-seals">
        {variant.seals.map((seal, index) => (
          <span key={`${seal}-${index}`} className="g-jutsu-seal-mini" title={seal}>
            <SealIcon seal={seal} size={26} />
          </span>
        ))}
      </div>

      <p className="g-jutsu-meta">
        차크라 {variant.chakraCost} · 위력 {variant.power || '-'} · 인{' '}
        {variant.seals.length}개
      </p>
      <p className="g-jutsu-source" title={variant.sourceReference.description}>
        {CANON_STATUS_LABEL_KO[variant.canonStatus]}
        {variant.verificationStatus === 'needs_research' && ' · 검증 필요'}
      </p>

      <button type="button" className="g-primary-btn" onClick={() => onSelect(variant)}>
        수련 시작
      </button>
    </div>
  )
}

function StageOverlay({ tracking }: { tracking: HandTracking }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const frame = tracking.frame
    const width = 1280
    const height = 720
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, width, height)
    if (!frame) return

    for (const hand of frame.hands) {
      ctx.strokeStyle = 'rgba(120, 200, 255, 0.85)'
      ctx.fillStyle = 'rgba(160, 220, 255, 0.9)'
      ctx.lineWidth = 3
      ctx.lineCap = 'round'

      for (const [startIndex, endIndex] of HAND_CONNECTIONS) {
        const start = hand.landmarks[startIndex]
        const end = hand.landmarks[endIndex]
        if (!start || !end) continue
        ctx.beginPath()
        ctx.moveTo(start.x * width, start.y * height)
        ctx.lineTo(end.x * width, end.y * height)
        ctx.stroke()
      }
      for (const landmark of hand.landmarks) {
        ctx.beginPath()
        ctx.arc(landmark.x * width, landmark.y * height, 4, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }, [tracking.frame])

  return <canvas ref={canvasRef} className="g-skeleton-overlay" aria-hidden />
}

const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
]

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '')
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ]
}
