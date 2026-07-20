import type { VfxId } from '../jutsu/jutsuData'
import {
  createVfxEngine,
  easeInCubic,
  easeOutBack,
  easeOutCubic,
  makeParticle,
  randomBetween,
} from './vfxEngine'
import type { VfxEngine } from './vfxEngine'

export { createVfxEngine }
export type { VfxEngine }

type VfxOptions = {
  /** 발동 기준점 (0..1 정규화). 기본 화면 중앙 약간 아래(손 위치). */
  nx?: number
  ny?: number
  /** 위력 배율 (파티클 양/흔들림) */
  intensity?: number
}

/** 술법 이펙트 재생. 총 연출 길이(ms)를 반환한다. */
export function playJutsuVfx(
  engine: VfxEngine,
  vfxId: VfxId,
  options?: VfxOptions,
): number {
  const nx = options?.nx ?? 0.5
  const ny = options?.ny ?? 0.58
  const intensity = options?.intensity ?? 1

  switch (vfxId) {
    case 'fireball':
      return playFireball(engine, nx, ny, intensity)
    case 'phoenix_flower':
      return playPhoenixFlower(engine, nx, ny, intensity)
    case 'chidori':
      return playChidori(engine, nx, ny, intensity)
    case 'water_dragon':
      return playWaterDragon(engine, nx, ny, intensity)
    case 'wind_breakthrough':
      return playWindBreakthrough(engine, nx, ny, intensity)
    case 'earth_wall':
      return playEarthWall(engine, intensity)
    case 'substitution':
      return playSubstitution(engine, nx, ny)
    case 'clone':
      return playClone(engine, nx, ny)
    case 'summoning':
      return playSummoning(engine, nx, intensity)
  }
}

// ───────────────────────── 화둔·호화구 ─────────────────────────

function playFireball(
  engine: VfxEngine,
  nx: number,
  ny: number,
  intensity: number,
): number {
  const growMs = 900
  const blastMs = 900
  const total = growMs + blastMs + 400

  // 1) 응집: 화염 구체가 커진다
  engine.addProp({
    duration: growMs,
    draw: (ctx, t, w, h) => {
      const cx = nx * w
      const cy = ny * h
      const radius = 14 + easeOutCubic(t) * Math.min(w, h) * 0.16
      const flicker = 1 + Math.sin(t * 40) * 0.06
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * flicker)
      gradient.addColorStop(0, 'rgba(255, 250, 210, 0.95)')
      gradient.addColorStop(0.35, 'rgba(255, 190, 70, 0.9)')
      gradient.addColorStop(0.75, 'rgba(255, 100, 30, 0.65)')
      gradient.addColorStop(1, 'rgba(210, 40, 10, 0)')
      ctx.globalCompositeOperation = 'lighter'
      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.arc(cx, cy, radius * flicker, 0, Math.PI * 2)
      ctx.fill()
    },
  })

  // 응집 중 불티 흡수
  engine.addEmitter({
    duration: growMs,
    rate: 90 * intensity,
    spawn: () => {
      const { w, h } = engine.getSize()
      const cx = nx * w
      const cy = ny * h
      const angle = Math.random() * Math.PI * 2
      const dist = randomBetween(60, 180)
      return makeParticle({
        x: cx + Math.cos(angle) * dist,
        y: cy + Math.sin(angle) * dist,
        vx: -Math.cos(angle) * dist * 2.4,
        vy: -Math.sin(angle) * dist * 2.4,
        maxLife: 0.42,
        size: randomBetween(2, 5),
        sizeEnd: 1,
        colorFrom: [255, 200, 90],
        colorTo: [255, 120, 40],
        shape: 'ember',
        drag: 1.2,
      })
    },
  })

  // 2) 폭발
  window.setTimeout(() => {
    engine.flash([255, 170, 60], 0.5, 500)
    engine.shake(22 * intensity, 700)

    engine.addEmitter({
      duration: blastMs,
      rate: 420 * intensity,
      spawn: (t) => {
        const { w, h } = engine.getSize()
        const cx = nx * w
        const cy = ny * h
        const angle = Math.random() * Math.PI * 2
        const speed = randomBetween(180, 620) * (1 - t * 0.55)
        return makeParticle({
          x: cx + Math.cos(angle) * 10,
          y: cy + Math.sin(angle) * 10,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 60,
          ay: -140,
          maxLife: randomBetween(0.5, 1.05),
          size: randomBetween(10, 30) * intensity,
          sizeEnd: 2,
          colorFrom: [255, 215, 120],
          colorTo: [225, 60, 20],
          alphaFrom: 0.95,
          drag: 2.6,
          shape: 'circle',
        })
      },
    })

    // 연기 테두리
    engine.addEmitter({
      duration: blastMs + 300,
      rate: 60,
      spawn: () => {
        const { w, h } = engine.getSize()
        const cx = nx * w
        const cy = ny * h
        const angle = Math.random() * Math.PI * 2
        const speed = randomBetween(60, 190)
        return makeParticle({
          x: cx,
          y: cy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 40,
          maxLife: randomBetween(0.9, 1.6),
          size: randomBetween(14, 26),
          sizeEnd: randomBetween(38, 60),
          colorFrom: [70, 52, 44],
          colorTo: [30, 26, 24],
          alphaFrom: 0.5,
          blend: 'normal',
          shape: 'smoke',
          drag: 1.4,
        })
      },
    })
  }, growMs)

  return total
}

// ───────────────────────── 화둔·봉선화 ─────────────────────────

function playPhoenixFlower(
  engine: VfxEngine,
  nx: number,
  ny: number,
  intensity: number,
): number {
  const shots = 5
  const interval = 240
  const total = shots * interval + 1200

  for (let i = 0; i < shots; i += 1) {
    window.setTimeout(() => {
      const { w, h } = engine.getSize()
      const cx = nx * w
      const cy = ny * h
      const angle = -Math.PI / 2 + (i - (shots - 1) / 2) * 0.42
      const speed = randomBetween(360, 460)

      engine.shake(5, 160)

      // 작은 화염구 본체 + 꼬리
      engine.addEmitter({
        duration: 700,
        rate: 160,
        onFrame: () => {},
        spawn: (t) => {
          const px = cx + Math.cos(angle) * speed * t * 0.7
          const py = cy + Math.sin(angle) * speed * t * 0.7
          return makeParticle({
            x: px + randomBetween(-4, 4),
            y: py + randomBetween(-4, 4),
            vx: randomBetween(-30, 30),
            vy: randomBetween(-30, 30),
            maxLife: 0.4,
            size: randomBetween(8, 15) * intensity,
            sizeEnd: 2,
            colorFrom: [255, 205, 100],
            colorTo: [235, 80, 25],
            shape: 'circle',
          })
        },
      })

      // 도착 지점 작은 폭발
      window.setTimeout(() => {
        engine.addEmitter({
          duration: 300,
          rate: 300,
          spawn: () => {
            const px = cx + Math.cos(angle) * speed * 0.5
            const py = cy + Math.sin(angle) * speed * 0.5
            const a2 = Math.random() * Math.PI * 2
            const sp = randomBetween(80, 260)
            return makeParticle({
              x: px,
              y: py,
              vx: Math.cos(a2) * sp,
              vy: Math.sin(a2) * sp,
              maxLife: 0.45,
              size: randomBetween(5, 12),
              sizeEnd: 1,
              colorFrom: [255, 190, 90],
              colorTo: [230, 70, 20],
              drag: 2.5,
              shape: 'ember',
            })
          },
        })
      }, 500)
    }, i * interval)
  }

  return total
}

// ───────────────────────── 뇌둔·치도리 ─────────────────────────

function playChidori(
  engine: VfxEngine,
  nx: number,
  ny: number,
  intensity: number,
): number {
  const total = 2100

  // 번개 볼트 (매 프레임 다시 그림)
  engine.addProp({
    duration: total,
    draw: (ctx, t, w, h) => {
      const cx = nx * w
      const cy = ny * h
      const power = t < 0.15 ? t / 0.15 : t > 0.85 ? (1 - t) / 0.15 : 1
      const boltCount = Math.round(7 * power * intensity) + 2
      const maxLen = Math.min(w, h) * (0.12 + 0.16 * power)

      ctx.globalCompositeOperation = 'lighter'

      // 코어 글로우
      const coreRadius = 26 * power + Math.sin(t * 90) * 4
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreRadius * 2.4)
      gradient.addColorStop(0, `rgba(240, 250, 255, ${0.9 * power})`)
      gradient.addColorStop(0.4, `rgba(140, 200, 255, ${0.55 * power})`)
      gradient.addColorStop(1, 'rgba(70, 130, 255, 0)')
      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.arc(cx, cy, coreRadius * 2.4, 0, Math.PI * 2)
      ctx.fill()

      // 지그재그 볼트
      for (let i = 0; i < boltCount; i += 1) {
        const angle = Math.random() * Math.PI * 2
        const segments = 5 + Math.floor(Math.random() * 3)
        const length = maxLen * randomBetween(0.5, 1)
        let px = cx
        let py = cy
        ctx.strokeStyle = `rgba(190, 225, 255, ${randomBetween(0.5, 0.95) * power})`
        ctx.lineWidth = randomBetween(1, 2.6)
        ctx.beginPath()
        ctx.moveTo(px, py)
        for (let s = 1; s <= segments; s += 1) {
          const progress = s / segments
          const jitter = (1 - progress) * 18
          px = cx + Math.cos(angle) * length * progress + randomBetween(-jitter, jitter)
          py = cy + Math.sin(angle) * length * progress + randomBetween(-jitter, jitter)
          ctx.lineTo(px, py)
        }
        ctx.stroke()
      }
    },
  })

  // 스파크 파티클
  engine.addEmitter({
    duration: total - 200,
    rate: 150 * intensity,
    spawn: () => {
      const { w, h } = engine.getSize()
      const cx = nx * w
      const cy = ny * h
      const angle = Math.random() * Math.PI * 2
      const speed = randomBetween(150, 520)
      return makeParticle({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        maxLife: randomBetween(0.12, 0.3),
        size: randomBetween(1.5, 3),
        sizeEnd: 0.5,
        colorFrom: [220, 240, 255],
        colorTo: [120, 180, 255],
        shape: 'spark',
        drag: 1.5,
      })
    },
  })

  // 찌릿거리는 미세 흔들림 + 파란 플래시
  engine.shake(7 * intensity, total - 300)
  engine.flash([150, 200, 255], 0.18, 300)
  window.setTimeout(() => engine.flash([170, 215, 255], 0.24, 260), 800)
  window.setTimeout(() => engine.flash([190, 225, 255], 0.3, 300), 1500)

  return total
}

// ───────────────────────── 수둔·수룡탄 ─────────────────────────

function playWaterDragon(
  engine: VfxEngine,
  nx: number,
  ny: number,
  intensity: number,
): number {
  const total = 2700
  const trail: { x: number; y: number }[] = []

  engine.addProp({
    duration: total,
    draw: (ctx, t, w, h) => {
      // 용의 머리 경로: 아래에서 나선을 그리며 상승 후 중앙으로 강하
      const path = (u: number): { x: number; y: number } => {
        if (u < 0.62) {
          const p = u / 0.62
          const angle = p * Math.PI * 3.1 - Math.PI / 2
          const radius = (0.34 - p * 0.1) * Math.min(w, h)
          return {
            x: nx * w + Math.cos(angle) * radius,
            y: h * (0.95 - p * 0.62) + Math.sin(angle) * radius * 0.35,
          }
        }
        const p = (u - 0.62) / 0.38
        const startX = nx * w + Math.cos(0.62 * Math.PI * 3.1 - Math.PI / 2) * 0.24 * Math.min(w, h)
        return {
          x: startX + (nx * w - startX) * easeInCubic(p),
          y: h * 0.33 + (ny * h - h * 0.33) * easeInCubic(p),
        }
      }

      const u = easeOutCubic(Math.min(t / 0.92, 1))
      const head = path(u)
      trail.push(head)
      if (trail.length > 34) trail.shift()

      ctx.globalCompositeOperation = 'lighter'

      // 몸통 (꼬리로 갈수록 가늘어지는 물기둥)
      for (let i = 0; i < trail.length; i += 1) {
        const seg = trail[i]
        const rel = i / trail.length
        const radius = (6 + rel * 26) * intensity * (t > 0.9 ? (1 - t) / 0.1 : 1)
        if (radius <= 0.3) continue
        const gradient = ctx.createRadialGradient(seg.x, seg.y, 0, seg.x, seg.y, radius)
        gradient.addColorStop(0, `rgba(210, 240, 255, ${0.5 * rel + 0.2})`)
        gradient.addColorStop(0.6, `rgba(80, 170, 255, ${0.4 * rel + 0.12})`)
        gradient.addColorStop(1, 'rgba(30, 90, 220, 0)')
        ctx.fillStyle = gradient
        ctx.beginPath()
        ctx.arc(seg.x, seg.y, radius, 0, Math.PI * 2)
        ctx.fill()
      }

      // 용 머리 (삼각 주둥이 + 눈)
      if (t < 0.92 && trail.length > 2) {
        const prev = trail[trail.length - 2]
        const angle = Math.atan2(head.y - prev.y, head.x - prev.x)
        ctx.save()
        ctx.translate(head.x, head.y)
        ctx.rotate(angle)
        const headSize = 34 * intensity
        const gradient = ctx.createLinearGradient(-headSize, 0, headSize, 0)
        gradient.addColorStop(0, 'rgba(90, 175, 255, 0.55)')
        gradient.addColorStop(1, 'rgba(225, 245, 255, 0.95)')
        ctx.fillStyle = gradient
        ctx.beginPath()
        ctx.moveTo(headSize, 0)
        ctx.lineTo(-headSize * 0.5, -headSize * 0.62)
        ctx.lineTo(-headSize * 0.22, 0)
        ctx.lineTo(-headSize * 0.5, headSize * 0.62)
        ctx.closePath()
        ctx.fill()
        // 눈
        ctx.fillStyle = 'rgba(255, 250, 200, 0.95)'
        ctx.beginPath()
        ctx.arc(headSize * 0.18, -headSize * 0.2, 3.2, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }
    },
  })

  // 흩날리는 물방울
  engine.addEmitter({
    duration: total - 300,
    rate: 130 * intensity,
    spawn: () => {
      if (trail.length === 0) return null
      const seg = trail[Math.floor(Math.random() * trail.length)]
      const angle = Math.random() * Math.PI * 2
      const speed = randomBetween(40, 200)
      return makeParticle({
        x: seg.x,
        y: seg.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed + 40,
        ay: 320,
        maxLife: randomBetween(0.4, 0.9),
        size: randomBetween(2.5, 6),
        sizeEnd: 1,
        colorFrom: [140, 205, 255],
        colorTo: [60, 130, 240],
        alphaFrom: 0.85,
        shape: 'droplet',
      })
    },
  })

  // 마지막 강타
  window.setTimeout(() => {
    engine.flash([120, 190, 255], 0.4, 450)
    engine.shake(18 * intensity, 550)
  }, total - 520)

  return total
}

// ───────────────────────── 풍둔·대돌파 ─────────────────────────

function playWindBreakthrough(
  engine: VfxEngine,
  nx: number,
  ny: number,
  intensity: number,
): number {
  const total = 1700

  // 방사형 돌풍 아크
  engine.addProp({
    duration: total,
    draw: (ctx, t, w, h) => {
      const cx = nx * w
      const cy = ny * h
      ctx.globalCompositeOperation = 'lighter'
      for (let ring = 0; ring < 4; ring += 1) {
        const ringT = Math.min(Math.max(t * 1.5 - ring * 0.16, 0), 1)
        if (ringT <= 0 || ringT >= 1) continue
        const radius = easeOutCubic(ringT) * Math.min(w, h) * 0.65
        ctx.strokeStyle = `rgba(190, 245, 215, ${(1 - ringT) * 0.5})`
        ctx.lineWidth = 10 * (1 - ringT) + 2
        ctx.beginPath()
        ctx.arc(cx, cy, radius, 0, Math.PI * 2)
        ctx.stroke()
      }
    },
  })

  // 바람 줄기
  engine.addEmitter({
    duration: total - 400,
    rate: 220 * intensity,
    spawn: () => {
      const { w, h } = engine.getSize()
      const cx = nx * w
      const cy = ny * h
      const angle = Math.random() * Math.PI * 2
      const speed = randomBetween(380, 760)
      return makeParticle({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        maxLife: randomBetween(0.3, 0.55),
        size: randomBetween(2, 4),
        sizeEnd: 0.6,
        colorFrom: [225, 255, 235],
        colorTo: [130, 230, 175],
        alphaFrom: 0.8,
        shape: 'spark',
        drag: 0.8,
      })
    },
  })

  // 잎사귀
  engine.addEmitter({
    duration: total - 300,
    rate: 40,
    spawn: () => {
      const { w, h } = engine.getSize()
      const cx = nx * w
      const cy = ny * h
      const angle = Math.random() * Math.PI * 2
      const speed = randomBetween(200, 420)
      return makeParticle({
        x: cx + randomBetween(-30, 30),
        y: cy + randomBetween(-30, 30),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        maxLife: randomBetween(0.6, 1.1),
        size: randomBetween(4, 8),
        sizeEnd: 3,
        rotation: Math.random() * Math.PI,
        spin: randomBetween(-9, 9),
        colorFrom: [110, 215, 130],
        colorTo: [60, 160, 90],
        alphaFrom: 0.9,
        blend: 'normal',
        shape: 'leaf',
        drag: 1.1,
      })
    },
  })

  engine.shake(12 * intensity, 600)
  engine.flash([200, 255, 225], 0.2, 350)

  return total
}

// ───────────────────────── 토둔·토류벽 ─────────────────────────

function playEarthWall(engine: VfxEngine, intensity: number): number {
  const total = 2400
  const slabs = 5

  engine.shake(15 * intensity, 700)

  engine.addProp({
    duration: total,
    draw: (ctx, t, w, h) => {
      ctx.globalCompositeOperation = 'source-over'
      const wallWidth = w / slabs

      for (let i = 0; i < slabs; i += 1) {
        const delay = i * 0.07
        const riseT = Math.min(Math.max((t - delay) / 0.28, 0), 1)
        if (riseT <= 0) continue
        const sink = t > 0.86 ? easeInCubic((t - 0.86) / 0.14) : 0
        const slabHeight = h * (0.42 + (i % 2) * 0.06)
        const top = h - slabHeight * easeOutBack(riseT) * (1 - sink)

        const x = i * wallWidth
        const gradient = ctx.createLinearGradient(x, top, x, h)
        gradient.addColorStop(0, 'rgba(168, 124, 82, 0.96)')
        gradient.addColorStop(0.5, 'rgba(128, 92, 60, 0.96)')
        gradient.addColorStop(1, 'rgba(92, 64, 42, 0.96)')
        ctx.fillStyle = gradient
        ctx.fillRect(x + 2, top, wallWidth - 4, h - top)

        // 바위 결
        ctx.strokeStyle = 'rgba(60, 42, 28, 0.6)'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(x + wallWidth * 0.25, top + 18)
        ctx.lineTo(x + wallWidth * 0.55, top + slabHeight * 0.3)
        ctx.moveTo(x + wallWidth * 0.7, top + 10)
        ctx.lineTo(x + wallWidth * 0.5, top + slabHeight * 0.45)
        ctx.stroke()

        // 상단 하이라이트
        ctx.fillStyle = 'rgba(210, 170, 120, 0.9)'
        ctx.fillRect(x + 2, top, wallWidth - 4, 7)
      }
    },
  })

  // 융기 먼지
  engine.addEmitter({
    duration: 800,
    rate: 160 * intensity,
    spawn: () => {
      const { w, h } = engine.getSize()
      return makeParticle({
        x: Math.random() * w,
        y: h - randomBetween(0, 30),
        vx: randomBetween(-60, 60),
        vy: randomBetween(-260, -90),
        ay: 220,
        maxLife: randomBetween(0.5, 1),
        size: randomBetween(8, 18),
        sizeEnd: randomBetween(20, 34),
        colorFrom: [150, 118, 86],
        colorTo: [92, 72, 52],
        alphaFrom: 0.55,
        blend: 'normal',
        shape: 'smoke',
        drag: 1.2,
      })
    },
  })

  // 튀는 돌조각
  engine.addEmitter({
    duration: 500,
    rate: 90,
    spawn: () => {
      const { w, h } = engine.getSize()
      return makeParticle({
        x: Math.random() * w,
        y: h - randomBetween(0, 40),
        vx: randomBetween(-120, 120),
        vy: randomBetween(-420, -180),
        ay: 760,
        maxLife: randomBetween(0.5, 0.9),
        size: randomBetween(3, 7),
        sizeEnd: 2,
        rotation: Math.random() * Math.PI,
        spin: randomBetween(-12, 12),
        colorFrom: [140, 105, 72],
        colorTo: [90, 66, 46],
        alphaFrom: 1,
        blend: 'normal',
        shape: 'shard',
      })
    },
  })

  return total
}

// ───────────────────────── 바꿔치기 ─────────────────────────

function playSubstitution(engine: VfxEngine, nx: number, ny: number): number {
  const total = 1600

  // 하얀 연기 펑
  engine.addEmitter({
    duration: 420,
    rate: 380,
    spawn: () => {
      const { w, h } = engine.getSize()
      const cx = nx * w
      const cy = ny * h
      const angle = Math.random() * Math.PI * 2
      const speed = randomBetween(60, 300)
      return makeParticle({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 40,
        maxLife: randomBetween(0.5, 1),
        size: randomBetween(16, 30),
        sizeEnd: randomBetween(40, 62),
        colorFrom: [240, 240, 240],
        colorTo: [180, 180, 185],
        alphaFrom: 0.85,
        blend: 'normal',
        shape: 'smoke',
        drag: 2.2,
      })
    },
  })

  // 통나무 등장
  engine.addProp({
    duration: total,
    draw: (ctx, t, w, h) => {
      const appear = Math.min(t / 0.25, 1)
      const cx = nx * w
      const baseY = ny * h
      const drop = easeOutBack(appear)
      const cy = baseY - 40 + drop * 40
      const wobble = t > 0.3 ? Math.sin((t - 0.3) * 18) * (1 - t) * 0.12 : 0
      const logW = 130
      const logH = 54

      ctx.save()
      ctx.globalAlpha = t > 0.85 ? (1 - t) / 0.15 : appear
      ctx.globalCompositeOperation = 'source-over'
      ctx.translate(cx, cy)
      ctx.rotate(-0.28 + wobble)

      // 몸통
      const bodyGradient = ctx.createLinearGradient(0, -logH / 2, 0, logH / 2)
      bodyGradient.addColorStop(0, '#a8773f')
      bodyGradient.addColorStop(0.5, '#8a5c2c')
      bodyGradient.addColorStop(1, '#6b4520')
      ctx.fillStyle = bodyGradient
      ctx.beginPath()
      ctx.roundRect(-logW / 2, -logH / 2, logW, logH, 12)
      ctx.fill()

      // 나이테 단면
      ctx.fillStyle = '#d9b078'
      ctx.beginPath()
      ctx.ellipse(logW / 2 - 4, 0, 12, logH / 2 - 4, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#a87a45'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.ellipse(logW / 2 - 4, 0, 6.5, (logH / 2 - 4) * 0.55, 0, 0, Math.PI * 2)
      ctx.stroke()

      // 나무결
      ctx.strokeStyle = 'rgba(70, 44, 18, 0.55)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(-logW / 2 + 12, -8)
      ctx.lineTo(logW / 2 - 24, -10)
      ctx.moveTo(-logW / 2 + 8, 9)
      ctx.lineTo(logW / 2 - 28, 12)
      ctx.stroke()
      ctx.restore()
    },
  })

  engine.flash([255, 255, 255], 0.28, 240)

  return total
}

// ───────────────────────── 분신술 ─────────────────────────

function playClone(engine: VfxEngine, nx: number, ny: number): number {
  const total = 1800
  const offsets = [-0.26, 0.26, -0.13, 0.13]

  // 분신 실루엣 (차크라 잔상)
  engine.addProp({
    duration: total,
    draw: (ctx, t, w, h) => {
      ctx.globalCompositeOperation = 'lighter'
      for (let i = 0; i < offsets.length; i += 1) {
        const delay = i * 0.08
        const appear = Math.min(Math.max((t - delay) / 0.2, 0), 1)
        if (appear <= 0) continue
        const fade = t > 0.75 ? (1 - t) / 0.25 : 1
        const alpha = appear * fade * 0.5
        const cx = (nx + offsets[i]) * w
        const cy = ny * h
        const scale = 0.86 + i * 0.04
        const bodyH = h * 0.34 * scale

        // 사람 실루엣 (머리 + 어깨/몸통 캡슐)
        const gradient = ctx.createLinearGradient(cx, cy - bodyH, cx, cy + bodyH * 0.4)
        gradient.addColorStop(0, `rgba(150, 210, 255, ${alpha})`)
        gradient.addColorStop(1, `rgba(70, 130, 255, 0)`)
        ctx.fillStyle = gradient

        ctx.beginPath()
        ctx.arc(cx, cy - bodyH * 0.78, bodyH * 0.2, 0, Math.PI * 2)
        ctx.fill()
        ctx.beginPath()
        ctx.roundRect(
          cx - bodyH * 0.3,
          cy - bodyH * 0.55,
          bodyH * 0.6,
          bodyH,
          bodyH * 0.24,
        )
        ctx.fill()
      }
    },
  })

  // 등장 연기
  engine.addEmitter({
    duration: 600,
    rate: 200,
    spawn: () => {
      const { w, h } = engine.getSize()
      const offset = offsets[Math.floor(Math.random() * offsets.length)]
      const cx = (nx + offset) * w
      const cy = ny * h + randomBetween(-20, 60)
      return makeParticle({
        x: cx + randomBetween(-30, 30),
        y: cy,
        vx: randomBetween(-50, 50),
        vy: randomBetween(-120, -30),
        maxLife: randomBetween(0.5, 0.9),
        size: randomBetween(12, 22),
        sizeEnd: randomBetween(30, 44),
        colorFrom: [235, 240, 245],
        colorTo: [170, 185, 200],
        alphaFrom: 0.7,
        blend: 'normal',
        shape: 'smoke',
        drag: 1.6,
      })
    },
  })

  engine.flash([190, 225, 255], 0.22, 280)

  return total
}

// ───────────────────────── 소환술 ─────────────────────────

function playSummoning(engine: VfxEngine, nx: number, intensity: number): number {
  const total = 3000
  const circleMs = 1100

  // 소환진
  engine.addProp({
    duration: circleMs + 500,
    draw: (ctx, t, w, h) => {
      const cx = nx * w
      const cy = h * 0.8
      const grow = easeOutCubic(Math.min(t * 1.4, 1))
      const fade = t > 0.82 ? (1 - t) / 0.18 : 1
      const maxRadius = Math.min(w, h) * 0.34

      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      ctx.translate(cx, cy)
      ctx.scale(1, 0.34)

      for (let ring = 0; ring < 3; ring += 1) {
        const radius = maxRadius * grow * (1 - ring * 0.26)
        ctx.strokeStyle = `rgba(255, 120, 90, ${(0.75 - ring * 0.18) * fade})`
        ctx.lineWidth = 3.5 - ring
        ctx.beginPath()
        ctx.arc(0, 0, radius, 0, Math.PI * 2)
        ctx.stroke()
      }

      // 회전 문양 (봉인 문자 느낌의 획)
      const glyphCount = 14
      const spinAngle = t * 2.4
      for (let i = 0; i < glyphCount; i += 1) {
        const angle = (i / glyphCount) * Math.PI * 2 + spinAngle
        const radius = maxRadius * grow * 0.85
        const gx = Math.cos(angle) * radius
        const gy = Math.sin(angle) * radius
        ctx.save()
        ctx.translate(gx, gy)
        ctx.rotate(angle + Math.PI / 2)
        ctx.strokeStyle = `rgba(255, 160, 120, ${0.8 * fade})`
        ctx.lineWidth = 2.4
        ctx.beginPath()
        ctx.moveTo(-6, -7)
        ctx.lineTo(6, -7)
        ctx.moveTo(0, -7)
        ctx.lineTo(0, 7)
        ctx.moveTo(-5, 3)
        ctx.lineTo(5, 7)
        ctx.stroke()
        ctx.restore()
      }
      ctx.restore()
    },
  })

  // 대량 연기 + 두꺼비 실루엣
  window.setTimeout(() => {
    engine.flash([255, 200, 150], 0.4, 400)
    engine.shake(26 * intensity, 900)

    engine.addEmitter({
      duration: 900,
      rate: 420,
      spawn: () => {
        const { w, h } = engine.getSize()
        const cx = nx * w
        return makeParticle({
          x: cx + randomBetween(-w * 0.3, w * 0.3),
          y: h * 0.82 + randomBetween(-20, 20),
          vx: randomBetween(-120, 120),
          vy: randomBetween(-380, -120),
          ay: 160,
          maxLife: randomBetween(0.8, 1.5),
          size: randomBetween(20, 38),
          sizeEnd: randomBetween(50, 80),
          colorFrom: [240, 235, 228],
          colorTo: [168, 160, 152],
          alphaFrom: 0.9,
          blend: 'normal',
          shape: 'smoke',
          drag: 1.5,
        })
      },
    })

    // 두꺼비 실루엣 상승
    engine.addProp({
      duration: total - circleMs - 100,
      draw: (ctx, t, w, h) => {
        const cx = nx * w
        const rise = easeOutBack(Math.min(t / 0.4, 1))
        const fade = t > 0.8 ? (1 - t) / 0.2 : 1
        const size = Math.min(w, h) * 0.3
        const cy = h * 0.85 - rise * size * 0.9

        ctx.save()
        ctx.globalAlpha = Math.min(t / 0.2, 1) * fade
        ctx.globalCompositeOperation = 'source-over'
        ctx.translate(cx, cy)

        // 몸통
        const body = ctx.createLinearGradient(0, -size * 0.5, 0, size * 0.5)
        body.addColorStop(0, 'rgba(196, 106, 60, 0.94)')
        body.addColorStop(1, 'rgba(140, 70, 40, 0.94)')
        ctx.fillStyle = body
        ctx.beginPath()
        ctx.ellipse(0, 0, size * 0.62, size * 0.46, 0, 0, Math.PI * 2)
        ctx.fill()

        // 배
        ctx.fillStyle = 'rgba(235, 218, 180, 0.95)'
        ctx.beginPath()
        ctx.ellipse(0, size * 0.16, size * 0.4, size * 0.26, 0, 0, Math.PI * 2)
        ctx.fill()

        // 눈두덩 + 눈
        for (const side of [-1, 1]) {
          ctx.fillStyle = 'rgba(180, 92, 50, 0.96)'
          ctx.beginPath()
          ctx.arc(side * size * 0.3, -size * 0.42, size * 0.15, 0, Math.PI * 2)
          ctx.fill()
          ctx.fillStyle = 'rgba(255, 214, 92, 0.98)'
          ctx.beginPath()
          ctx.arc(side * size * 0.3, -size * 0.44, size * 0.08, 0, Math.PI * 2)
          ctx.fill()
          ctx.fillStyle = 'rgba(20, 14, 10, 0.98)'
          ctx.beginPath()
          ctx.ellipse(side * size * 0.3, -size * 0.44, size * 0.025, size * 0.055, 0, 0, Math.PI * 2)
          ctx.fill()
        }

        // 앞다리
        ctx.strokeStyle = 'rgba(150, 76, 42, 0.95)'
        ctx.lineWidth = size * 0.09
        ctx.lineCap = 'round'
        for (const side of [-1, 1]) {
          ctx.beginPath()
          ctx.moveTo(side * size * 0.34, size * 0.1)
          ctx.lineTo(side * size * 0.48, size * 0.44)
          ctx.stroke()
        }
        ctx.restore()
      },
    })
  }, circleMs)

  return total
}

// ───────────────────────── 공용 피드백 이펙트 ─────────────────────────

/** 인 확정 시 파란 차크라 펄스 */
export function playSealConfirmPulse(
  engine: VfxEngine,
  nx: number,
  ny: number,
): void {
  engine.addProp({
    duration: 380,
    draw: (ctx, t, w, h) => {
      const cx = nx * w
      const cy = ny * h
      const radius = easeOutCubic(t) * 70 + 12
      ctx.globalCompositeOperation = 'lighter'
      ctx.strokeStyle = `rgba(120, 200, 255, ${(1 - t) * 0.85})`
      ctx.lineWidth = 3.5 * (1 - t) + 1
      ctx.beginPath()
      ctx.arc(cx, cy, radius, 0, Math.PI * 2)
      ctx.stroke()
    },
  })

  engine.addEmitter({
    duration: 200,
    rate: 120,
    spawn: () => {
      const { w, h } = engine.getSize()
      const cx = nx * w
      const cy = ny * h
      const angle = Math.random() * Math.PI * 2
      const speed = randomBetween(90, 240)
      return makeParticle({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        maxLife: 0.35,
        size: randomBetween(1.8, 3.4),
        sizeEnd: 0.6,
        colorFrom: [160, 220, 255],
        colorTo: [90, 150, 255],
        shape: 'spark',
        drag: 2,
      })
    },
  })
}

/** 술식 붕괴 (실패) 이펙트 */
export function playCastFailure(engine: VfxEngine, nx: number, ny: number): void {
  engine.flash([120, 60, 60], 0.2, 300)
  engine.shake(8, 300)
  engine.addEmitter({
    duration: 380,
    rate: 200,
    spawn: () => {
      const { w, h } = engine.getSize()
      const cx = nx * w
      const cy = ny * h
      const angle = Math.random() * Math.PI * 2
      const speed = randomBetween(40, 150)
      return makeParticle({
        x: cx + randomBetween(-30, 30),
        y: cy + randomBetween(-20, 20),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 30,
        maxLife: randomBetween(0.4, 0.8),
        size: randomBetween(8, 16),
        sizeEnd: randomBetween(20, 30),
        colorFrom: [110, 100, 110],
        colorTo: [55, 50, 58],
        alphaFrom: 0.6,
        blend: 'normal',
        shape: 'smoke',
        drag: 1.8,
      })
    },
  })
}

/** 피격 이펙트 (듀얼: 내가 맞았을 때) */
export function playHitImpact(engine: VfxEngine, strong: boolean): void {
  engine.flash([255, 60, 40], strong ? 0.4 : 0.22, strong ? 450 : 280)
  engine.shake(strong ? 24 : 12, strong ? 600 : 350)
}

/** 응집(콘덴세이션) 차크라 수렴 이펙트 */
export function playCondensation(
  engine: VfxEngine,
  nx: number,
  ny: number,
  durationMs: number,
  color: [number, number, number],
): void {
  engine.addEmitter({
    duration: durationMs,
    rate: 220,
    spawn: () => {
      const { w, h } = engine.getSize()
      const cx = nx * w
      const cy = ny * h
      const angle = Math.random() * Math.PI * 2
      const dist = randomBetween(50, 150)
      return makeParticle({
        x: cx + Math.cos(angle) * dist,
        y: cy + Math.sin(angle) * dist,
        vx: -Math.cos(angle) * dist * 3.4,
        vy: -Math.sin(angle) * dist * 3.4,
        maxLife: 0.3,
        size: randomBetween(2, 4.5),
        sizeEnd: 1,
        colorFrom: [Math.min(color[0] + 60, 255), Math.min(color[1] + 60, 255), Math.min(color[2] + 60, 255)],
        colorTo: color,
        shape: 'ember',
        drag: 1,
      })
    },
  })
}
