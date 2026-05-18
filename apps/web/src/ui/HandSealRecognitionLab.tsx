import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { WebcamView } from '../camera/WebcamView'
import { useWebcam } from '../camera/useWebcam'
import type { MirrorMode } from '../hand-tracking/coordinateTypes'
import {
  createHandLandmarker,
  detectHandLandmarks,
  type MediaPipeHandLandmarker,
} from '../hand-tracking/handLandmarker'
import type { HandLandmarkerFrame } from '../hand-tracking/landmarkTypes'
import { createRawReplayExport, type RawReplayFrame } from '../replay/rawReplay'
import {
  addConfusionMatrixObservation,
  calculateSealMetrics,
  createConfusionMatrix,
} from '../seal-recognition/confusionMatrix'
import { classifySeal } from '../seal-recognition/ruleBasedSealClassifier'
import {
  ALL_SEALS,
  MVP_0_LABELS,
  MVP_0_TARGET_SEALS,
  SEAL_DISPLAY_NAMES,
  type Seal,
  type SealSample,
} from '../seal-recognition/sealTypes'

type TrackerStatus = 'idle' | 'loading' | 'ready' | 'error'

export function HandSealRecognitionLab() {
  const {
    videoRef,
    isReady: isWebcamReady,
    status: webcamStatus,
    error: webcamError,
    startWebcam,
    stopWebcam,
  } = useWebcam()
  const [trackerStatus, setTrackerStatus] = useState<TrackerStatus>('idle')
  const [trackerError, setTrackerError] = useState<string | null>(null)
  const [selectedLabel, setSelectedLabel] = useState<Seal>('snake')
  const [isRecording, setIsRecording] = useState(false)
  const [mirrorPreview, setMirrorPreview] = useState(true)
  const [latestFrame, setLatestFrame] = useState<HandLandmarkerFrame | null>(
    null,
  )
  const [samples, setSamples] = useState<SealSample[]>([])
  const [replayFrames, setReplayFrames] = useState<RawReplayFrame[]>([])
  const handLandmarkerRef = useRef<MediaPipeHandLandmarker | null>(null)
  const animationFrameRef = useRef<number | null>(null)

  const stopTrackingLoop = useCallback(() => {
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
  }, [])

  const startTrackingLoop = useCallback(() => {
    stopTrackingLoop()

    const track = () => {
      const handLandmarker = handLandmarkerRef.current
      const video = videoRef.current

      if (handLandmarker && video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        const timestamp = performance.now()
        const frame = detectHandLandmarks(handLandmarker, video, timestamp)
        const prediction = classifySeal(frame.hands)
        const replayFrame: RawReplayFrame = {
          timestamp,
          coordinateSpace: 'camera',
          mirrorMode: getMirrorMode(mirrorPreview),
          hands: frame.hands,
          rawPrediction: prediction.seal,
          predictedSeal: prediction.seal,
          stabilizedSeal: prediction.seal,
          provisionalSeal: prediction.provisionalSeal,
          provisionalConfidence: prediction.provisionalConfidence,
          provisionalFamily: prediction.provisionalFamily,
          predictionStatus: prediction.predictionStatus,
          bestGuessSeal: prediction.bestGuessSeal,
          bestGuessConfidence: prediction.bestGuessConfidence,
          isAmbiguous: prediction.isAmbiguous,
          ambiguityGap: prediction.ambiguityGap,
          secondBestSeal: prediction.secondBestSeal,
          secondBestConfidence: prediction.secondBestConfidence,
          bestFamily: prediction.bestFamily,
          bestFamilyConfidence: prediction.bestFamilyConfidence,
          secondBestFamily: prediction.secondBestFamily,
          secondBestFamilyConfidence: prediction.secondBestFamilyConfidence,
          familyAmbiguityGap: prediction.familyAmbiguityGap,
          familyIsAmbiguous: prediction.familyIsAmbiguous,
          bestInFamilySeal: prediction.bestInFamilySeal,
          bestInFamilyConfidence: prediction.bestInFamilyConfidence,
          secondInFamilySeal: prediction.secondInFamilySeal,
          secondInFamilyConfidence: prediction.secondInFamilyConfidence,
          inFamilyAmbiguityGap: prediction.inFamilyAmbiguityGap,
          inFamilyIsAmbiguous: prediction.inFamilyIsAmbiguous,
          confidence: prediction.confidence,
          failureReason: prediction.failureReason,
          coarseGestureFeatures: prediction.features,
          topRuleScores: prediction.scores.slice(0, 5),
          familyScores: prediction.familyScores,
          featureEvaluationMode: prediction.featureEvaluationMode,
          usedMirrorVariant: prediction.usedMirrorVariant,
        }

        setLatestFrame(frame)
        setReplayFrames((currentFrames) => [...currentFrames, replayFrame])
        setSamples((currentSamples) => {
          if (!isRecording || frame.hands.length === 0) {
            return currentSamples
          }

          return [
            ...currentSamples,
            {
              label: selectedLabel,
              timestamp,
              hands: frame.hands,
              coarseGestureFeatures: prediction.features,
              prediction,
            },
          ]
        })
      }

      animationFrameRef.current = window.requestAnimationFrame(track)
    }

    animationFrameRef.current = window.requestAnimationFrame(track)
  }, [isRecording, mirrorPreview, selectedLabel, stopTrackingLoop, videoRef])

  const loadHandTracker = useCallback(async () => {
    if (handLandmarkerRef.current || trackerStatus === 'loading') {
      return
    }

    setTrackerStatus('loading')
    setTrackerError(null)

    try {
      handLandmarkerRef.current = await createHandLandmarker()
      setTrackerStatus('ready')
    } catch (unknownError) {
      setTrackerError(
        unknownError instanceof Error
          ? unknownError.message
          : 'Unable to load MediaPipe Hand Landmarker.',
      )
      setTrackerStatus('error')
    }
  }, [trackerStatus])

  useEffect(() => {
    if (isWebcamReady && trackerStatus === 'ready') {
      startTrackingLoop()
    }

    return stopTrackingLoop
  }, [isWebcamReady, startTrackingLoop, stopTrackingLoop, trackerStatus])

  useEffect(
    () => () => {
      stopTrackingLoop()
      handLandmarkerRef.current?.close?.()
    },
    [stopTrackingLoop],
  )

  const sampleCounts = useMemo(
    () =>
      Object.fromEntries(
        MVP_0_LABELS.map((label) => [
          label,
          samples.filter((sample) => sample.label === label).length,
        ]),
      ) as Record<Seal, number>,
    [samples],
  )

  const confusionMatrix = useMemo(() => {
    const matrix = createConfusionMatrix(ALL_SEALS)
    return samples.reduce(
      (currentMatrix, sample) =>
        addConfusionMatrixObservation(
          currentMatrix,
          sample.label,
          sample.prediction?.seal ?? 'unknown',
        ),
      matrix,
    )
  }, [samples])

  const sealMetrics = useMemo(
    () => calculateSealMetrics(confusionMatrix, ALL_SEALS),
    [confusionMatrix],
  )

  const latestPrediction = replayFrames.at(-1)

  const handleStart = async () => {
    await startWebcam()
    await loadHandTracker()
  }

  const handleStopCamera = () => {
    setIsRecording(false)
    stopTrackingLoop()
    stopWebcam()
    setLatestFrame(null)
  }

  const exportSamples = () => {
    downloadJson('hand-seal-samples.json', {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      targetSeals: MVP_0_TARGET_SEALS,
      samples,
    })
  }

  const exportReplay = () => {
    downloadJson('hand-seal-raw-replay.json', createRawReplayExport(replayFrames))
  }

  return (
    <main className="lab-shell">
      <header className="lab-header">
        <div>
          <p className="eyebrow">MVP 0 Recognition Lab</p>
          <h1>HandSealRecognitionLab</h1>
        </div>
        <div className="status-row" aria-label="System status">
          <span data-state={webcamStatus}>Camera: {webcamStatus}</span>
          <span data-state={trackerStatus}>MediaPipe: {trackerStatus}</span>
          <span data-state={isRecording ? 'ready' : 'idle'}>
            Recording: {isRecording ? 'on' : 'off'}
          </span>
        </div>
      </header>

      <section className="lab-grid">
        <div className="preview-panel">
          <WebcamView
            videoRef={videoRef}
            frame={latestFrame}
            mirrorPreview={mirrorPreview}
          />
          <div className="camera-actions">
            <button
              type="button"
              onClick={handleStart}
              disabled={webcamStatus === 'starting' || trackerStatus === 'loading'}
            >
              Start Camera + Tracker
            </button>
            <button type="button" onClick={handleStopCamera}>
              Stop Camera
            </button>
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={mirrorPreview}
                onChange={(event) => setMirrorPreview(event.target.checked)}
              />
              Mirror preview
            </label>
          </div>
          {(webcamError || trackerError) && (
            <p className="error-text">{webcamError ?? trackerError}</p>
          )}
        </div>

        <aside className="control-panel">
          <section className="panel-section">
            <h2>Collection</h2>
            <label className="field-label" htmlFor="seal-label">
              Label
            </label>
            <select
              id="seal-label"
              value={selectedLabel}
              onChange={(event) => setSelectedLabel(event.target.value as Seal)}
            >
              {MVP_0_LABELS.map((seal) => (
                <option key={seal} value={seal}>
                  {SEAL_DISPLAY_NAMES[seal]}
                </option>
              ))}
            </select>
            <div className="record-actions">
              <button
                type="button"
                onClick={() => setIsRecording(true)}
                disabled={!isWebcamReady || trackerStatus !== 'ready'}
              >
                Record
              </button>
              <button type="button" onClick={() => setIsRecording(false)}>
                Stop
              </button>
            </div>
          </section>

          <section className="panel-section">
            <h2>Classifier</h2>
            <dl className="prediction-list">
              <div>
                <dt>Coordinate</dt>
                <dd>camera/raw</dd>
              </div>
              <div>
                <dt>Side Basis</dt>
                <dd>
                  {latestPrediction?.coarseGestureFeatures?.handSideBasis ??
                    'screen_x_order'}
                </dd>
              </div>
              <div>
                <dt>Preview Mirror</dt>
                <dd>{mirrorPreview ? 'on' : 'off'}</dd>
              </div>
              <div>
                <dt>Feature Mode</dt>
                <dd>
                  {latestPrediction?.featureEvaluationMode ??
                    'normal_two_hand_features'}
                </dd>
              </div>
              <div>
                <dt>Final Prediction</dt>
                <dd>
                  {SEAL_DISPLAY_NAMES[
                    latestPrediction?.predictedSeal ??
                      latestPrediction?.rawPrediction ??
                      'unknown'
                  ]}
                </dd>
              </div>
              <div>
                <dt>Provisional</dt>
                <dd>
                  {SEAL_DISPLAY_NAMES[
                    latestPrediction?.provisionalSeal ?? 'unknown'
                  ]}{' '}
                  ({formatPercent(latestPrediction?.provisionalConfidence ?? 0)})
                </dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{latestPrediction?.predictionStatus ?? 'missing_hands'}</dd>
              </div>
              <div>
                <dt>Best Guess</dt>
                <dd>
                  {SEAL_DISPLAY_NAMES[
                    latestPrediction?.bestGuessSeal ?? 'unknown'
                  ]}{' '}
                  ({formatPercent(latestPrediction?.bestGuessConfidence ?? 0)})
                </dd>
              </div>
              <div>
                <dt>Second Guess</dt>
                <dd>
                  {SEAL_DISPLAY_NAMES[
                    latestPrediction?.secondBestSeal ?? 'unknown'
                  ]}{' '}
                  ({formatPercent(latestPrediction?.secondBestConfidence ?? 0)})
                </dd>
              </div>
              <div>
                <dt>Ambiguity Gap</dt>
                <dd>{formatDecimal(latestPrediction?.ambiguityGap ?? 0)}</dd>
              </div>
              <div>
                <dt>Stabilized</dt>
                <dd>
                  {SEAL_DISPLAY_NAMES[
                    latestPrediction?.stabilizedSeal ?? 'unknown'
                  ]}
                </dd>
              </div>
              <div>
                <dt>Confidence</dt>
                <dd>{formatPercent(latestPrediction?.confidence ?? 0)}</dd>
              </div>
              <div>
                <dt>Failure</dt>
                <dd>{latestPrediction?.failureReason ?? 'none'}</dd>
              </div>
            </dl>
          </section>

          <section className="panel-section">
            <h2>Family</h2>
            <dl className="prediction-list">
              <div>
                <dt>Best Family</dt>
                <dd>
                  {latestPrediction?.bestFamily ?? 'unknown'} (
                  {formatPercent(latestPrediction?.bestFamilyConfidence ?? 0)})
                </dd>
              </div>
              <div>
                <dt>Second Family</dt>
                <dd>
                  {latestPrediction?.secondBestFamily ?? 'unknown'} (
                  {formatPercent(
                    latestPrediction?.secondBestFamilyConfidence ?? 0,
                  )}
                  )
                </dd>
              </div>
              <div>
                <dt>Family Gap</dt>
                <dd>
                  {formatDecimal(latestPrediction?.familyAmbiguityGap ?? 0)}
                </dd>
              </div>
              <div>
                <dt>Family Ambiguous</dt>
                <dd>{latestPrediction?.familyIsAmbiguous ? 'yes' : 'no'}</dd>
              </div>
              <div>
                <dt>Best In Family</dt>
                <dd>
                  {SEAL_DISPLAY_NAMES[
                    latestPrediction?.bestInFamilySeal ?? 'unknown'
                  ]}{' '}
                  (
                  {formatPercent(
                    latestPrediction?.bestInFamilyConfidence ?? 0,
                  )}
                  )
                </dd>
              </div>
              <div>
                <dt>Second In Family</dt>
                <dd>
                  {SEAL_DISPLAY_NAMES[
                    latestPrediction?.secondInFamilySeal ?? 'unknown'
                  ]}{' '}
                  (
                  {formatPercent(
                    latestPrediction?.secondInFamilyConfidence ?? 0,
                  )}
                  )
                </dd>
              </div>
              <div>
                <dt>In-Family Gap</dt>
                <dd>
                  {formatDecimal(latestPrediction?.inFamilyAmbiguityGap ?? 0)}
                </dd>
              </div>
              <div>
                <dt>In-Family Ambiguous</dt>
                <dd>{latestPrediction?.inFamilyIsAmbiguous ? 'yes' : 'no'}</dd>
              </div>
            </dl>
            <ol className="score-list">
              {(latestPrediction?.familyScores ?? []).map((score) => (
                <li key={score.family}>
                  <div>
                    <strong>{score.family}</strong>
                    <span>{formatDecimal(score.score)}</span>
                  </div>
                  <p>{score.reasons.join(' | ')}</p>
                </li>
              ))}
            </ol>
          </section>

          <section className="panel-section">
            <h2>Geometry</h2>
            <dl className="prediction-list">
              <div>
                <dt>Hands</dt>
                <dd>
                  {latestPrediction?.coarseGestureFeatures?.detectedHandCount ?? 0}
                </dd>
              </div>
              <div>
                <dt>Tracking Mode</dt>
                <dd>
                  {latestPrediction?.coarseGestureFeatures?.trackingMode ??
                    'no_hands'}
                </dd>
              </div>
              <div>
                <dt>Merged Candidate</dt>
                <dd>
                  {formatDecimal(
                    latestPrediction?.coarseGestureFeatures
                      ?.mergedTwoHandCandidateScore ?? 0,
                  )}
                </dd>
              </div>
              <div>
                <dt>Single-Hand Likely</dt>
                <dd>
                  {formatDecimal(
                    latestPrediction?.coarseGestureFeatures
                      ?.singleHandLikelyScore ?? 0,
                  )}
                </dd>
              </div>
              <div>
                <dt>MediaPipe Handedness</dt>
                <dd>
                  {latestPrediction?.coarseGestureFeatures?.mediaPipeHandednesses.join(
                    ', ',
                  ) || 'none'}
                </dd>
              </div>
              <div>
                <dt>Readability</dt>
                <dd>
                  {formatDecimal(
                    latestPrediction?.coarseGestureFeatures
                      ?.cameraReadability ?? 0,
                  )}
                </dd>
              </div>
              <div>
                <dt>Center Distance</dt>
                <dd>
                  {formatDecimal(
                    latestPrediction?.coarseGestureFeatures
                      ?.handCenterDistance ?? 0,
                  )}
                </dd>
              </div>
              <div>
                <dt>Abs X Offset</dt>
                <dd>
                  {formatDecimal(
                    latestPrediction?.coarseGestureFeatures
                      ?.absHorizontalCenterOffset ?? 0,
                  )}
                </dd>
              </div>
              <div>
                <dt>Abs Y Offset</dt>
                <dd>
                  {formatDecimal(
                    latestPrediction?.coarseGestureFeatures
                      ?.absVerticalCenterOffset ?? 0,
                  )}
                </dd>
              </div>
              <div>
                <dt>Overlap</dt>
                <dd>
                  {formatDecimal(
                    latestPrediction?.coarseGestureFeatures
                      ?.handBoxOverlapRatio ?? 0,
                  )}
                </dd>
              </div>
              <div>
                <dt>Aspect</dt>
                <dd>
                  {formatDecimal(
                    latestPrediction?.coarseGestureFeatures
                      ?.combinedAspectRatio ?? 0,
                  )}
                </dd>
              </div>
              <div>
                <dt>Compact</dt>
                <dd>
                  {formatDecimal(
                    latestPrediction?.coarseGestureFeatures
                      ?.compactnessScore ?? 0,
                  )}
                </dd>
              </div>
              <div>
                <dt>Vertical</dt>
                <dd>
                  {formatDecimal(
                    latestPrediction?.coarseGestureFeatures
                      ?.verticalityScore ?? 0,
                  )}
                </dd>
              </div>
              <div>
                <dt>Horizontal</dt>
                <dd>
                  {formatDecimal(
                    latestPrediction?.coarseGestureFeatures
                      ?.horizontalityScore ?? 0,
                  )}
                </dd>
              </div>
              <div>
                <dt>Symmetry</dt>
                <dd>
                  {formatDecimal(
                    latestPrediction?.coarseGestureFeatures?.symmetryScore ?? 0,
                  )}
                </dd>
              </div>
              <div>
                <dt>Fingertip Spread</dt>
                <dd>
                  {formatDecimal(
                    latestPrediction?.coarseGestureFeatures
                      ?.fingertipSpreadScore ?? 0,
                  )}
                </dd>
              </div>
              <div>
                <dt>Interlock Clasp</dt>
                <dd>
                  {formatDecimal(
                    latestPrediction?.coarseGestureFeatures
                      ?.interlockClaspScore ?? 0,
                  )}
                </dd>
              </div>
              <div>
                <dt>Tower-Like</dt>
                <dd>
                  {formatDecimal(
                    latestPrediction?.coarseGestureFeatures?.towerLikeScore ??
                      0,
                  )}
                </dd>
              </div>
              <div>
                <dt>Bundled Blob</dt>
                <dd>
                  {formatDecimal(
                    latestPrediction?.coarseGestureFeatures?.bundledBlobScore ??
                      0,
                  )}
                </dd>
              </div>
            </dl>
            <div className="reason-box">
              <strong>Detection interpretation</strong>
              <p>
                {latestPrediction?.coarseGestureFeatures?.detectionInterpretationReason.join(
                  ' | ',
                ) ?? 'no landmarks detected'}
              </p>
            </div>
          </section>

          <section className="panel-section">
            <h2>Top Rule Scores</h2>
            <ol className="score-list">
              {(latestPrediction?.topRuleScores ?? []).map((score) => (
                <li key={score.seal}>
                  <div>
                    <strong>{SEAL_DISPLAY_NAMES[score.seal]}</strong>
                    <span>{formatDecimal(score.score)}</span>
                  </div>
                  <p>{score.reasons.join(' | ')}</p>
                </li>
              ))}
            </ol>
          </section>

          <section className="panel-section">
            <h2>Exports</h2>
            <div className="export-actions">
              <button type="button" onClick={exportSamples}>
                Export Samples JSON
              </button>
              <button type="button" onClick={exportReplay}>
                Export Raw Replay
              </button>
            </div>
          </section>
        </aside>
      </section>

      <section className="analysis-grid">
        <div className="panel-section">
          <h2>Sample Counts</h2>
          <div className="count-grid">
            {MVP_0_LABELS.map((label) => (
              <div className="count-tile" key={label}>
                <span>{label}</span>
                <strong>{sampleCounts[label] ?? 0}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="panel-section">
          <h2>Confusion Matrix Shell</h2>
          <div className="matrix-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Actual \ Pred</th>
                  {ALL_SEALS.map((label) => (
                    <th scope="col" key={label}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ALL_SEALS.map((actual) => (
                  <tr key={actual}>
                    <th scope="row">{actual}</th>
                    {ALL_SEALS.map((predicted) => (
                      <td key={predicted}>{confusionMatrix[actual][predicted]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="metric-row">
            {sealMetrics.map((metric) => (
              <span key={metric.seal}>
                {metric.seal}: P {formatPercent(metric.precision)} / R{' '}
                {formatPercent(metric.recall)}
              </span>
            ))}
          </div>
        </div>
      </section>
    </main>
  )
}

function downloadJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`
}

function formatDecimal(value: number): string {
  return value.toFixed(2)
}

function getMirrorMode(mirrorPreview: boolean): MirrorMode {
  return mirrorPreview ? 'selfie_preview' : 'none'
}
