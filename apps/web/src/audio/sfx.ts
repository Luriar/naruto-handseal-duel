/**
 * WebAudio 신디사이저 SFX.
 *
 * 저작권 있는 오디오 없이 전부 실시간 합성한다.
 * 첫 사용자 제스처(버튼 클릭) 후 init()을 호출해야 소리가 난다.
 */

export type SfxName =
  | 'seal'
  | 'fail'
  | 'fire'
  | 'water'
  | 'lightning'
  | 'wind'
  | 'earth'
  | 'poof'
  | 'summon'
  | 'clone'
  | 'hit'
  | 'win'
  | 'lose'
  | 'click'

let audioContext: AudioContext | null = null
let masterGain: GainNode | null = null
let noiseBuffer: AudioBuffer | null = null
let muted = false

export function initSfx(): void {
  if (audioContext) {
    if (audioContext.state === 'suspended') {
      void audioContext.resume()
    }
    return
  }
  try {
    audioContext = new AudioContext()
    masterGain = audioContext.createGain()
    masterGain.gain.value = muted ? 0 : 0.85
    masterGain.connect(audioContext.destination)

    const length = audioContext.sampleRate * 2
    noiseBuffer = audioContext.createBuffer(1, length, audioContext.sampleRate)
    const data = noiseBuffer.getChannelData(0)
    for (let i = 0; i < length; i += 1) {
      data[i] = Math.random() * 2 - 1
    }
  } catch {
    audioContext = null
  }
}

export function setSfxMuted(value: boolean): void {
  muted = value
  if (masterGain && audioContext) {
    masterGain.gain.setTargetAtTime(value ? 0 : 0.85, audioContext.currentTime, 0.02)
  }
}

export function isSfxMuted(): boolean {
  return muted
}

export function playSfx(name: SfxName): void {
  if (!audioContext || !masterGain || !noiseBuffer) return
  if (audioContext.state === 'suspended') {
    void audioContext.resume()
  }

  switch (name) {
    case 'seal':
      // 짧은 차크라 '틱' — 물방울 같은 상승 펄스
      tone('sine', 620, 940, 0.09, 0.22)
      tone('triangle', 1240, 1880, 0.07, 0.08)
      break
    case 'click':
      tone('triangle', 480, 380, 0.06, 0.12)
      break
    case 'fail':
      tone('sawtooth', 220, 90, 0.32, 0.16)
      noise(0.28, 'lowpass', 500, 180, 0.16)
      break
    case 'fire':
      // 화염 방사: 노이즈 로어 + 저음 우르릉
      noise(1.3, 'lowpass', 2600, 700, 0.5)
      noise(1.1, 'bandpass', 420, 260, 0.3, 1.2)
      tone('sawtooth', 90, 55, 1.1, 0.14)
      break
    case 'water':
      // 물살: 로우패스 노이즈에 주파수 흔들림
      noiseWobble(1.6, 900, 340, 0.45, 5.2)
      tone('sine', 180, 90, 1.2, 0.1)
      break
    case 'lightning':
      // 치도리: 지지직 크랙클 (빠른 임펄스 연타) + 버즈
      crackle(1.7, 0.34)
      tone('sawtooth', 2200, 1600, 1.4, 0.045)
      break
    case 'wind':
      noise(1.3, 'bandpass', 700, 2400, 0.4, 0.8)
      noise(1.1, 'highpass', 1200, 3200, 0.18)
      break
    case 'earth':
      tone('sine', 70, 34, 1.0, 0.5)
      noise(0.9, 'lowpass', 260, 90, 0.42)
      break
    case 'poof':
      noise(0.4, 'lowpass', 1800, 400, 0.4)
      tone('sine', 300, 120, 0.25, 0.2)
      break
    case 'summon':
      tone('sine', 60, 30, 1.4, 0.55)
      noise(1.2, 'lowpass', 900, 200, 0.4)
      window.setTimeout(() => {
        // 개구리 울음 비슷한 저음 꾹꾹
        tone('square', 140, 90, 0.22, 0.18)
        window.setTimeout(() => tone('square', 120, 80, 0.26, 0.16), 260)
      }, 700)
      break
    case 'clone':
      tone('sine', 500, 1000, 0.35, 0.16)
      tone('sine', 750, 1500, 0.35, 0.1)
      noise(0.35, 'highpass', 2000, 5000, 0.12)
      break
    case 'hit':
      tone('sine', 160, 50, 0.28, 0.5)
      noise(0.22, 'lowpass', 800, 200, 0.3)
      break
    case 'win':
      arpeggio([523, 659, 784, 1047], 0.13, 0.24)
      break
    case 'lose':
      arpeggio([392, 330, 262, 196], 0.19, 0.2)
      break
  }
}

// ───────────────────────── 합성 프리미티브 ─────────────────────────

function tone(
  type: OscillatorType,
  freqFrom: number,
  freqTo: number,
  duration: number,
  peakGain: number,
): void {
  if (!audioContext || !masterGain) return
  const now = audioContext.currentTime
  const osc = audioContext.createOscillator()
  const gain = audioContext.createGain()

  osc.type = type
  osc.frequency.setValueAtTime(freqFrom, now)
  osc.frequency.exponentialRampToValueAtTime(Math.max(freqTo, 1), now + duration)

  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(Math.max(peakGain, 0.001), now + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)

  osc.connect(gain)
  gain.connect(masterGain)
  osc.start(now)
  osc.stop(now + duration + 0.05)
}

function noise(
  duration: number,
  filterType: BiquadFilterType,
  freqFrom: number,
  freqTo: number,
  peakGain: number,
  q?: number,
): void {
  if (!audioContext || !masterGain || !noiseBuffer) return
  const now = audioContext.currentTime
  const source = audioContext.createBufferSource()
  source.buffer = noiseBuffer
  source.loop = true

  const filter = audioContext.createBiquadFilter()
  filter.type = filterType
  filter.frequency.setValueAtTime(freqFrom, now)
  filter.frequency.exponentialRampToValueAtTime(Math.max(freqTo, 1), now + duration)
  if (q !== undefined) {
    filter.Q.value = q
  }

  const gain = audioContext.createGain()
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(Math.max(peakGain, 0.001), now + 0.05)
  gain.gain.setValueAtTime(peakGain, now + duration * 0.6)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)

  source.connect(filter)
  filter.connect(gain)
  gain.connect(masterGain)
  source.start(now)
  source.stop(now + duration + 0.05)
}

function noiseWobble(
  duration: number,
  centerFreq: number,
  wobbleDepth: number,
  peakGain: number,
  wobbleHz: number,
): void {
  if (!audioContext || !masterGain || !noiseBuffer) return
  const now = audioContext.currentTime
  const source = audioContext.createBufferSource()
  source.buffer = noiseBuffer
  source.loop = true

  const filter = audioContext.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = centerFreq

  const lfo = audioContext.createOscillator()
  lfo.frequency.value = wobbleHz
  const lfoGain = audioContext.createGain()
  lfoGain.gain.value = wobbleDepth
  lfo.connect(lfoGain)
  lfoGain.connect(filter.frequency)

  const gain = audioContext.createGain()
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(peakGain, now + 0.08)
  gain.gain.setValueAtTime(peakGain, now + duration * 0.65)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)

  source.connect(filter)
  filter.connect(gain)
  gain.connect(masterGain)
  source.start(now)
  lfo.start(now)
  source.stop(now + duration + 0.05)
  lfo.stop(now + duration + 0.05)
}

function crackle(duration: number, peakGain: number): void {
  if (!audioContext) return
  const impulses = Math.floor(duration * 46)
  for (let i = 0; i < impulses; i += 1) {
    const delay = Math.random() * duration * 1000
    window.setTimeout(() => {
      noise(0.035, 'highpass', 1500, 4500, peakGain * (0.4 + Math.random() * 0.6))
    }, delay)
  }
}

function arpeggio(freqs: number[], noteDuration: number, peakGain: number): void {
  freqs.forEach((freq, index) => {
    window.setTimeout(() => {
      tone('triangle', freq, freq, noteDuration * 1.8, peakGain)
    }, index * noteDuration * 1000)
  })
}
