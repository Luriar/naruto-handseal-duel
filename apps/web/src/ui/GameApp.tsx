import { useCallback, useEffect, useState } from 'react'
import { initSfx, isSfxMuted, playSfx, setSfxMuted } from '../audio/sfx'
import '../game.css'
import { CalibrationMode } from './CalibrationMode'
import { DuelMode } from './DuelMode'
import { HandSealRecognitionLab } from './HandSealRecognitionLab'
import { SealIcon } from './SealIcon'
import { TrainingMode } from './TrainingMode'
import { useHandTracking } from './useHandTracking'

type Screen = 'home' | 'training' | 'duel' | 'calibration' | 'lab'

const NAV_ITEMS: { screen: Screen; label: string }[] = [
  { screen: 'home', label: '홈' },
  { screen: 'training', label: '수련장' },
  { screen: 'duel', label: '대전' },
  { screen: 'calibration', label: '내 손 등록' },
  { screen: 'lab', label: '인식 실험실' },
]

export function GameApp() {
  const [screen, setScreen] = useState<Screen>('home')
  const [muted, setMuted] = useState(isSfxMuted)
  const tracking = useHandTracking()

  // 실험실/홈으로 가면 공용 카메라를 놓아준다 (실험실은 자체 카메라 사용)
  useEffect(() => {
    if (screen === 'home' || screen === 'lab') {
      tracking.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen])

  const navigate = useCallback((next: Screen) => {
    initSfx()
    playSfx('click')
    setScreen(next)
  }, [])

  const toggleMute = useCallback(() => {
    initSfx()
    setMuted((value) => {
      setSfxMuted(!value)
      return !value
    })
  }, [])

  return (
    <div className="g-root">
      <header className="g-header">
        <button type="button" className="g-logo" onClick={() => navigate('home')}>
          <span className="g-logo-mark">忍</span>
          <span className="g-logo-text">
            인술 대전 <em>HAND SEAL DUEL</em>
          </span>
        </button>

        <nav className="g-nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.screen}
              type="button"
              data-active={screen === item.screen}
              onClick={() => navigate(item.screen)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="g-header-right">
          {tracking.calibratedCount > 0 && (
            <span className="g-calib-count" title="등록된 인 개수">
              ✋ {tracking.calibratedCount}/12
            </span>
          )}
          <button
            type="button"
            className="g-mute-btn"
            onClick={toggleMute}
            title={muted ? '소리 켜기' : '소리 끄기'}
          >
            {muted ? '🔇' : '🔊'}
          </button>
        </div>
      </header>

      <main className="g-main">
        {screen === 'home' && <HomeScreen onNavigate={navigate} calibratedCount={tracking.calibratedCount} />}
        {screen === 'training' && <TrainingMode tracking={tracking} />}
        {screen === 'duel' && <DuelMode tracking={tracking} />}
        {screen === 'calibration' && <CalibrationMode tracking={tracking} />}
        {screen === 'lab' && (
          <div className="g-lab-wrap">
            <HandSealRecognitionLab />
          </div>
        )}
      </main>

      {tracking.error && screen !== 'lab' && (
        <div className="g-error-toast">{tracking.error}</div>
      )}

      <footer className="g-footer">
        비영리 팬 게임입니다. NARUTO는 키시모토 마사시 / 슈에이샤의 작품이며, 본
        프로젝트는 공식과 무관합니다. 모든 그래픽·사운드는 자체 제작입니다.
      </footer>
    </div>
  )
}

function HomeScreen({
  onNavigate,
  calibratedCount,
}: {
  onNavigate: (screen: Screen) => void
  calibratedCount: number
}) {
  return (
    <div className="g-home">
      <section className="g-hero">
        <div className="g-hero-seals">
          {(['snake', 'ram', 'monkey', 'boar', 'horse', 'tiger'] as const).map(
            (seal, index) => (
              <span key={seal} style={{ animationDelay: `${index * 0.14}s` }}>
                <SealIcon seal={seal} size={40} />
              </span>
            ),
          )}
        </div>
        <h1>
          손으로 인을 맺어라.
          <br />
          <strong>술법이 발동된다.</strong>
        </h1>
        <p>
          웹캠 앞에서 12간지 인을 실제 손으로 맺어 인술을 시전하는 대전 게임.
          사→미→신→해→오→인, 그리고 화둔·호화구의 술.
        </p>
        <div className="g-hero-actions">
          <button type="button" className="g-primary-btn g-big-btn" onClick={() => onNavigate('training')}>
            수련 시작
          </button>
          <button type="button" className="g-secondary-btn g-big-btn" onClick={() => onNavigate('duel')}>
            바로 대전
          </button>
        </div>
      </section>

      {calibratedCount < 6 && (
        <section className="g-calib-nudge">
          <div>
            <strong>먼저 "내 손 등록"을 추천!</strong>
            <p>
              12개 인을 내 손으로 한 번씩 등록하면 (약 1분) 인식이 내 손에
              맞춰져서 훨씬 정확해진다. 특히 손이 겹치는 인에서 차이가 크다.
            </p>
          </div>
          <button type="button" className="g-primary-btn" onClick={() => onNavigate('calibration')}>
            등록하러 가기 ({calibratedCount}/12)
          </button>
        </section>
      )}

      <section className="g-mode-cards">
        <button type="button" className="g-mode-card" onClick={() => onNavigate('training')}>
          <h3>수련장</h3>
          <p>술법을 골라 인 시퀀스를 연습한다. 성공하면 술법이 발동하고 S~D 랭크로 채점된다.</p>
        </button>
        <button type="button" className="g-mode-card" onClick={() => onNavigate('duel')}>
          <h3>대전</h3>
          <p>AI 닌자와 실시간 전투. 상대의 인을 읽고 속성 상성(화풍뇌토수)으로 카운터하라.</p>
        </button>
        <button type="button" className="g-mode-card" onClick={() => onNavigate('calibration')}>
          <h3>내 손 등록</h3>
          <p>내 손 모양을 등록해 인식률을 끌어올린다. 인당 1.6초, 총 1분이면 끝.</p>
        </button>
        <button type="button" className="g-mode-card" onClick={() => onNavigate('lab')}>
          <h3>인식 실험실</h3>
          <p>개발용 MVP 0 랩. 분류 점수·특징값·혼동 행렬을 실시간으로 확인한다.</p>
        </button>
      </section>

      <section className="g-howto">
        <h2>카메라 잘 잡히게 하는 법</h2>
        <ol>
          <li>가슴 위~머리가 나오게 앉고, 손은 가슴 앞 화면 중앙에.</li>
          <li>밝은 조명 + 무늬가 적은 배경이 유리하다.</li>
          <li>인을 맺고 반 박자(0.3초) 유지하면 확정된다. 링 게이지가 차는 게 보인다.</li>
          <li>손이 겹치는 인(사·해·술)은 카메라와 30~50cm 거리가 좋다.</li>
        </ol>
      </section>
    </div>
  )
}
