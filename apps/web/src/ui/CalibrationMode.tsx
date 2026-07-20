import { useCallback, useEffect, useRef, useState } from 'react'
import { initSfx, playSfx } from '../audio/sfx'
import { SEAL_TEMPLATES } from '../seal-recognition/sealTemplates'
import type { FeatureKey } from '../seal-recognition/sealTemplates'
import { ALL_SEALS } from '../seal-recognition/sealTypes'
import type { Seal } from '../seal-recognition/sealTypes'
import {
  buildCalibratedSeal,
  clearCalibration,
  loadCalibrationStore,
  upsertCalibratedSeal,
} from '../seal-recognition/userCalibration'
import { SealIcon } from './SealIcon'
import { LiveSealBadge, TrackedVideo } from './gameWidgets'
import { SEAL_KO_FULL, trackingNote } from './sealNames'
import type { HandTracking } from './useHandTracking'

/**
 * 내 손 등록 (캘리브레이션).
 *
 * 각 인을 1.6초 유지하면 사용자 손 기준의 개인 템플릿이 저장된다.
 * 등록된 인은 분류기에서 개인 템플릿이 우선 반영되어 인식률이 크게 오른다.
 */

const CAPTURE_MS = 1600
const SAMPLE_INTERVAL_MS = 55

type CaptureState = 'idle' | 'countdown' | 'capturing' | 'saved' | 'failed'

type CalibrationModeProps = {
  tracking: HandTracking
}

const TARGET_SEALS = ALL_SEALS.filter((seal) => seal !== 'unknown')

export function CalibrationMode({ tracking }: CalibrationModeProps) {
  const [store, setStore] = useState(loadCalibrationStore)
  const [selectedSeal, setSelectedSeal] = useState<Seal>('snake')
  const [captureState, setCaptureState] = useState<CaptureState>('idle')
  const [countdown, setCountdown] = useState(3)
  const [captureProgress, setCaptureProgress] = useState(0)
  const samplesRef = useRef<Partial<Record<FeatureKey, number>>[]>([])
  const timersRef = useRef<number[]>([])

  useEffect(() => {
    void tracking.start()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(
    () => () => {
      timersRef.current.forEach((timer) => window.clearInterval(timer))
      timersRef.current.forEach((timer) => window.clearTimeout(timer))
    },
    [],
  )

  const clearTimers = () => {
    timersRef.current.forEach((timer) => {
      window.clearInterval(timer)
      window.clearTimeout(timer)
    })
    timersRef.current = []
  }

  const beginCapture = useCallback(() => {
    initSfx()
    playSfx('click')
    clearTimers()
    setCaptureState('countdown')
    setCountdown(3)

    let remaining = 3
    const countdownTimer = window.setInterval(() => {
      remaining -= 1
      setCountdown(remaining)
      if (remaining <= 0) {
        window.clearInterval(countdownTimer)
        startSampling()
      }
    }, 800)
    timersRef.current.push(countdownTimer)

    const startSampling = () => {
      samplesRef.current = []
      setCaptureState('capturing')
      setCaptureProgress(0)
      const startedAt = performance.now()

      const sampleTimer = window.setInterval(() => {
        const elapsed = performance.now() - startedAt
        setCaptureProgress(Math.min(elapsed / CAPTURE_MS, 1))

        const features = tracking.sampleFeatures()
        if (features) {
          samplesRef.current.push(features)
        }

        if (elapsed >= CAPTURE_MS) {
          window.clearInterval(sampleTimer)
          finishCapture()
        }
      }, SAMPLE_INTERVAL_MS)
      timersRef.current.push(sampleTimer)
    }

    const finishCapture = () => {
      const calibrated = buildCalibratedSeal(selectedSeal, samplesRef.current)
      if (!calibrated) {
        playSfx('fail')
        setCaptureState('failed')
        return
      }
      const nextStore = upsertCalibratedSeal(calibrated)
      setStore(nextStore)
      tracking.reloadCalibration()
      playSfx('seal')
      setCaptureState('saved')
    }
  }, [selectedSeal, tracking])

  const removeOne = useCallback(
    (seal: Seal) => {
      playSfx('click')
      setStore(clearCalibration(seal))
      tracking.reloadCalibration()
    },
    [tracking],
  )

  const removeAll = useCallback(() => {
    playSfx('click')
    setStore(clearCalibration())
    tracking.reloadCalibration()
  }, [tracking])

  const calibratedCount = Object.keys(store.seals).length
  const template = selectedSeal !== 'unknown' ? SEAL_TEMPLATES[selectedSeal] : null
  const stab = tracking.stabilizer

  // 라이브 매칭 점수 (선택된 인 기준)
  const liveScore =
    tracking.prediction?.scores.find((entry) => entry.seal === selectedSeal)?.score ?? 0

  return (
    <div className="g-calibration">
      <div className="g-calib-head">
        <div>
          <h2 className="g-screen-title">내 손 등록 (캘리브레이션)</h2>
          <p className="g-screen-sub">
            각 인을 내 손으로 1.6초 유지해서 등록하면, 게임이 <strong>내 손</strong>에
            맞춰진다. 전부 등록하면 인식률이 확 오른다. ({calibratedCount}/12)
          </p>
        </div>
        {calibratedCount > 0 && (
          <button type="button" className="g-ghost-btn" onClick={removeAll}>
            전체 초기화
          </button>
        )}
      </div>

      <div className="g-calib-body">
        {/* 인 선택 목록 */}
        <div className="g-calib-list">
          {TARGET_SEALS.map((seal) => {
            const done = Boolean(store.seals[seal])
            return (
              <button
                key={seal}
                type="button"
                className="g-calib-item"
                data-selected={seal === selectedSeal}
                data-done={done}
                onClick={() => {
                  setSelectedSeal(seal)
                  setCaptureState('idle')
                }}
              >
                <SealIcon seal={seal} size={30} />
                <span>{SEAL_KO_FULL[seal]}</span>
                {done && <em className="g-calib-check">등록됨</em>}
              </button>
            )
          })}
        </div>

        {/* 캡처 스테이지 */}
        <div className="g-calib-stage-wrap">
          <div className="g-stage g-calib-stage">
            <TrackedVideo attach={tracking.attachVideo} />

            {captureState === 'countdown' && (
              <div className="g-calib-overlay">
                <span className="g-countdown">{countdown}</span>
                <p>{SEAL_KO_FULL[selectedSeal]} 인을 준비해!</p>
              </div>
            )}

            {captureState === 'capturing' && (
              <div className="g-calib-overlay g-calib-capturing">
                <p>그대로 유지...</p>
                <div className="g-capture-bar">
                  <div style={{ width: `${captureProgress * 100}%` }} />
                </div>
              </div>
            )}

            {captureState === 'saved' && (
              <div className="g-calib-overlay g-calib-saved">
                <p>
                  {SEAL_KO_FULL[selectedSeal]} 등록 완료!{' '}
                  <strong>라이브 매칭 {Math.round(liveScore * 100)}%</strong>
                </p>
              </div>
            )}

            {captureState === 'failed' && (
              <div className="g-calib-overlay g-calib-failed">
                <p>양손이 충분히 안 보였어. 카메라 중앙에서 다시 해보자.</p>
              </div>
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
        </div>

        {/* 가이드 패널 */}
        <aside className="g-calib-guide">
          <div className="g-target-icon">
            <SealIcon seal={selectedSeal} size={120} />
          </div>
          <h3>{SEAL_KO_FULL[selectedSeal]}</h3>
          <ul className="g-tips">
            {(template?.tipsKo ?? []).map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>

          <div className="g-live-match">
            <span>라이브 매칭</span>
            <div className="g-live-match-bar">
              <div style={{ width: `${liveScore * 100}%` }} />
            </div>
            <strong>{Math.round(liveScore * 100)}%</strong>
          </div>

          <button
            type="button"
            className="g-primary-btn"
            disabled={captureState === 'countdown' || captureState === 'capturing'}
            onClick={beginCapture}
          >
            {store.seals[selectedSeal] ? '다시 등록' : '이 인 등록하기'}
          </button>

          {store.seals[selectedSeal] && (
            <button
              type="button"
              className="g-ghost-btn"
              onClick={() => removeOne(selectedSeal)}
            >
              이 인 등록 삭제
            </button>
          )}
        </aside>
      </div>
    </div>
  )
}
