import { useEffect, useRef } from 'react'
import type { Seal } from '../seal-recognition/sealTypes'
import { createVfxEngine } from '../vfx/effects'
import type { VfxEngine } from '../vfx/effects'
import { SealIcon } from './SealIcon'
import { SEAL_KO, SEAL_KO_FULL } from './sealNames'

// ───────────────────────── 웹캠 비디오 ─────────────────────────

type TrackedVideoProps = {
  /** useHandTracking().attachVideo */
  attach: (element: HTMLVideoElement | null) => void
  className?: string
}

/**
 * 추적 파이프라인에 연결되는 <video>.
 * ref 연결을 컴포넌트 내부 effect로 감춰서 상위 렌더를 깨끗하게 유지한다.
 */
export function TrackedVideo({ attach, className }: TrackedVideoProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    attach(videoRef.current)
    return () => attach(null)
  }, [attach])

  return (
    <video
      ref={videoRef}
      className={className ?? 'g-stage-video'}
      muted
      playsInline
    />
  )
}

// ───────────────────────── 시퀀스 스트립 ─────────────────────────

type SealStripProps = {
  seals: Seal[]
  /** 완료된 인 개수 */
  doneCount: number
  /** 현재 목표 인의 진행도 0..1 (안정화 게이지) */
  currentProgress?: number
  compact?: boolean
}

export function SealStrip({
  seals,
  doneCount,
  currentProgress = 0,
  compact = false,
}: SealStripProps) {
  return (
    <div className={`g-seal-strip${compact ? ' g-seal-strip-compact' : ''}`}>
      {seals.map((seal, index) => {
        const status =
          index < doneCount ? 'done' : index === doneCount ? 'current' : 'pending'
        return (
          <div className="g-seal-chip" data-status={status} key={`${seal}-${index}`}>
            <div className="g-seal-chip-icon">
              <SealIcon seal={seal} size={compact ? 26 : 38} />
              {status === 'current' && (
                <svg className="g-seal-ring" viewBox="0 0 48 48">
                  <circle
                    cx={24}
                    cy={24}
                    r={21}
                    fill="none"
                    strokeWidth={3}
                    strokeDasharray={`${currentProgress * 132} 132`}
                  />
                </svg>
              )}
            </div>
            <span className="g-seal-chip-label">{SEAL_KO[seal]}</span>
          </div>
        )
      })}
    </div>
  )
}

// ───────────────────────── 스탯 바 ─────────────────────────

type StatBarProps = {
  label: string
  value: number
  max: number
  kind: 'hp' | 'chakra'
  mirrored?: boolean
}

export function StatBar({ label, value, max, kind, mirrored = false }: StatBarProps) {
  const ratio = Math.max(0, Math.min(1, value / max))
  return (
    <div className="g-stat-bar" data-kind={kind} data-mirrored={mirrored}>
      <div className="g-stat-bar-head">
        <span>{label}</span>
        <span>
          {Math.ceil(value)} / {max}
        </span>
      </div>
      <div className="g-stat-bar-track">
        <div
          className="g-stat-bar-fill"
          style={{ width: `${ratio * 100}%` }}
          data-low={kind === 'hp' && ratio < 0.3}
        />
      </div>
    </div>
  )
}

// ───────────────────────── VFX 캔버스 ─────────────────────────

type VfxCanvasProps = {
  onEngineReady: (engine: VfxEngine) => void
  className?: string
}

export function VfxCanvas({ onEngineReady, className }: VfxCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const engineRef = useRef<VfxEngine | null>(null)
  const onReadyRef = useRef(onEngineReady)

  useEffect(() => {
    onReadyRef.current = onEngineReady
  }, [onEngineReady])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const engine = createVfxEngine(canvas)
    engineRef.current = engine
    onReadyRef.current(engine)
    return () => {
      engine.destroy()
      engineRef.current = null
    }
  }, [])

  return <canvas ref={canvasRef} className={className ?? 'g-vfx-canvas'} aria-hidden />
}

// ───────────────────────── 인식 상태 배지 ─────────────────────────

type LiveSealBadgeProps = {
  candidateSeal: Seal
  progress: number
  heldSeal: Seal
  trackingNote: string
}

export function LiveSealBadge({
  candidateSeal,
  progress,
  heldSeal,
  trackingNote,
}: LiveSealBadgeProps) {
  const displaySeal = heldSeal !== 'unknown' ? heldSeal : candidateSeal
  const state =
    heldSeal !== 'unknown' ? 'held' : candidateSeal !== 'unknown' ? 'building' : 'idle'

  return (
    <div className="g-live-badge" data-state={state}>
      <div className="g-live-badge-icon">
        <SealIcon seal={displaySeal} size={34} />
      </div>
      <div className="g-live-badge-text">
        <strong>{SEAL_KO_FULL[displaySeal]}</strong>
        <span>{trackingNote}</span>
      </div>
      {state === 'building' && (
        <div className="g-live-badge-progress">
          <div style={{ width: `${progress * 100}%` }} />
        </div>
      )}
    </div>
  )
}
