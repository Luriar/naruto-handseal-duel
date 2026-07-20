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
import { classifySealV2 as classifySeal } from '../seal-recognition/sealClassifier'
import type { PredictionStatus } from '../seal-recognition/ruleBasedSealClassifier'
import {
  ALL_SEALS,
  MVP_0_LABELS,
  MVP_0_TARGET_SEALS,
  SEAL_DISPLAY_NAMES,
  type Seal,
  type SealSample,
} from '../seal-recognition/sealTypes'
import {
  createSealObservationExport,
  type SealObservation,
} from '../seal-recognition/sealObservation'

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
  const [intendedSeal, setIntendedSeal] = useState<Seal>('snake')
  const [observationNote, setObservationNote] = useState('')
  const [observations, setObservations] = useState<SealObservation[]>([])
  const latestPredictionRef = useRef<RawReplayFrame | null>(null)
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

        latestPredictionRef.current = replayFrame
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

  const saveObservation = () => {
    const frame = latestPredictionRef.current
    if (!frame || !frame.coarseGestureFeatures) {
      return
    }

    const observation: SealObservation = {
      observationId: `${frame.timestamp.toFixed(0)}-${observations.length + 1}`,
      timestamp: frame.timestamp,
      intendedSeal,
      note: observationNote,
      finalPrediction: frame.predictedSeal ?? frame.rawPrediction,
      finalConfidence: frame.confidence,
      provisionalPrediction: frame.provisionalSeal ?? 'unknown',
      provisionalConfidence: frame.provisionalConfidence ?? 0,
      predictionStatus: frame.predictionStatus ?? 'missing_hands',
      failureReason: frame.failureReason,
      bestFamily: frame.bestFamily ?? 'unknown',
      bestFamilyConfidence: frame.bestFamilyConfidence ?? 0,
      secondFamily: frame.secondBestFamily ?? 'unknown',
      secondFamilyConfidence: frame.secondBestFamilyConfidence ?? 0,
      familyAmbiguityGap: frame.familyAmbiguityGap ?? 0,
      bestInFamilySeal: frame.bestInFamilySeal ?? 'unknown',
      bestInFamilyConfidence: frame.bestInFamilyConfidence ?? 0,
      secondInFamilySeal: frame.secondInFamilySeal ?? 'unknown',
      secondInFamilyConfidence: frame.secondInFamilyConfidence ?? 0,
      inFamilyAmbiguityGap: frame.inFamilyAmbiguityGap ?? 0,
      topSealScores: frame.topRuleScores ?? [],
      familyScores: frame.familyScores ?? [],
      coarseGestureFeatures: frame.coarseGestureFeatures,
      trackingMode: frame.coarseGestureFeatures.trackingMode,
      featureEvaluationMode:
        frame.featureEvaluationMode ?? 'normal_two_hand_features',
    }

    setObservations((current) => [...current, observation])
    setObservationNote('')
  }

  const clearObservations = () => setObservations([])

  const exportObservations = () => {
    downloadJson(
      'hand-seal-observations.json',
      createSealObservationExport(observations),
    )
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
            <StatusBanner
              status={latestPrediction?.predictionStatus ?? 'missing_hands'}
              finalSeal={
                latestPrediction?.predictedSeal ??
                latestPrediction?.rawPrediction ??
                'unknown'
              }
              provisionalSeal={latestPrediction?.provisionalSeal ?? 'unknown'}
              provisionalConfidence={
                latestPrediction?.provisionalConfidence ?? 0
              }
              trackingMode={
                latestPrediction?.coarseGestureFeatures?.trackingMode ??
                'no_hands'
              }
              featureMode={
                latestPrediction?.featureEvaluationMode ??
                'normal_two_hand_features'
              }
              failureReason={latestPrediction?.failureReason ?? 'none'}
            />
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
            <h2>Observation Logger</h2>
            <p className="hint-text">
              Snapshot the live prediction + features against the seal you
              intended to perform. Used for manual tuning, not ML training.
            </p>
            <label className="field-label" htmlFor="intended-seal">
              Intended Seal
            </label>
            <select
              id="intended-seal"
              value={intendedSeal}
              onChange={(event) => setIntendedSeal(event.target.value as Seal)}
            >
              {ALL_SEALS.filter((seal) => seal !== 'unknown').map((seal) => (
                <option key={seal} value={seal}>
                  {SEAL_DISPLAY_NAMES[seal]}
                </option>
              ))}
            </select>
            <label className="field-label" htmlFor="observation-note">
              Note (optional)
            </label>
            <input
              id="observation-note"
              type="text"
              className="note-input"
              value={observationNote}
              onChange={(event) => setObservationNote(event.target.value)}
              placeholder="e.g. lighting dim, slight tilt"
            />
            <div className="observation-actions">
              <button
                type="button"
                onClick={saveObservation}
                disabled={!latestPrediction}
              >
                Save Observation
              </button>
              <button type="button" onClick={clearObservations}>
                Clear ({observations.length})
              </button>
              <button
                type="button"
                onClick={exportObservations}
                disabled={observations.length === 0}
              >
                Export JSON
              </button>
            </div>
            <ObservationSummary observations={observations} />
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

type StatusTone = 'accepted' | 'provisional' | 'ambiguous' | 'tracking' | 'idle'

const STATUS_LABEL: Record<PredictionStatus, string> = {
  accepted: 'Accepted',
  family_accepted_seal_ambiguous: 'Family OK, seal ambiguous',
  ambiguous_same_family: 'Ambiguous within family',
  ambiguous_cross_family: 'Ambiguous across families',
  family_ambiguous: 'Family ambiguous',
  low_confidence: 'Low confidence',
  missing_hands: 'Missing hands',
}

const STATUS_TONE: Record<PredictionStatus, StatusTone> = {
  accepted: 'accepted',
  family_accepted_seal_ambiguous: 'provisional',
  ambiguous_same_family: 'provisional',
  ambiguous_cross_family: 'ambiguous',
  family_ambiguous: 'ambiguous',
  low_confidence: 'ambiguous',
  missing_hands: 'tracking',
}

type StatusBannerProps = {
  status: PredictionStatus
  finalSeal: Seal
  provisionalSeal: Seal
  provisionalConfidence: number
  trackingMode: string
  featureMode: string
  failureReason: string
}

function StatusBanner({
  status,
  finalSeal,
  provisionalSeal,
  provisionalConfidence,
  trackingMode,
  featureMode,
  failureReason,
}: StatusBannerProps) {
  const tone: StatusTone =
    status === 'missing_hands' && trackingMode === 'merged_two_hand_candidate'
      ? 'provisional'
      : (STATUS_TONE[status] ?? 'idle')
  const trackingNote =
    trackingMode === 'merged_two_hand_candidate'
      ? 'merged-blob candidate'
      : trackingMode === 'single_true_hand'
        ? 'only one hand tracked'
        : trackingMode === 'no_hands'
          ? 'no hands detected'
          : featureMode === 'merged_single_blob_features'
            ? 'merged-blob features in use'
            : 'two-hand features'

  return (
    <div className="status-banner" data-tone={tone}>
      <div className="status-banner-row">
        <span className="status-banner-label">Status</span>
        <strong className="status-banner-value">{STATUS_LABEL[status]}</strong>
      </div>
      <div className="status-banner-row">
        <span className="status-banner-label">Final</span>
        <strong className="status-banner-value">
          {SEAL_DISPLAY_NAMES[finalSeal]}
        </strong>
      </div>
      <div className="status-banner-row">
        <span className="status-banner-label">Provisional</span>
        <strong className="status-banner-value">
          {SEAL_DISPLAY_NAMES[provisionalSeal]} (
          {Math.round(provisionalConfidence * 100)}%)
        </strong>
      </div>
      <div className="status-banner-row status-banner-meta">
        <span>{trackingNote}</span>
        {failureReason !== 'none' && <span>reason: {failureReason}</span>}
      </div>
    </div>
  )
}

type ObservationSummaryProps = {
  observations: SealObservation[]
}

function ObservationSummary({ observations }: ObservationSummaryProps) {
  if (observations.length === 0) {
    return <p className="hint-text">No observations saved yet.</p>
  }

  const recent = observations.slice(-5).reverse()

  return (
    <div className="observation-summary">
      <p className="hint-text">
        Saved: {observations.length}. Showing latest {recent.length}.
      </p>
      <ol className="observation-list">
        {recent.map((observation) => {
          const matched =
            observation.finalPrediction === observation.intendedSeal
              ? 'match'
              : observation.provisionalPrediction === observation.intendedSeal
                ? 'provisional'
                : 'miss'
          return (
            <li key={observation.observationId} data-match={matched}>
              <strong>
                {SEAL_DISPLAY_NAMES[observation.intendedSeal]}
                {' → '}
                {SEAL_DISPLAY_NAMES[observation.finalPrediction]}
              </strong>
              <span>
                prov: {SEAL_DISPLAY_NAMES[observation.provisionalPrediction]}
                {' | '}
                fam: {observation.bestFamily}
                {' | '}
                {observation.predictionStatus}
              </span>
              {observation.note && <em>{observation.note}</em>}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
