/**
 * 캔버스 파티클 VFX 엔진.
 *
 * 웹캠 위에 오버레이되는 <canvas>에 술법 이펙트를 그린다.
 * 외부 이미지 에셋 없이 전부 절차적으로 그리므로 로딩이 없고
 * 어떤 해상도에서도 선명하다.
 */

export type RGB = [number, number, number]

export type ParticleShape =
  | 'circle'
  | 'spark'
  | 'smoke'
  | 'shard'
  | 'leaf'
  | 'droplet'
  | 'ember'

export type Particle = {
  x: number
  y: number
  vx: number
  vy: number
  ax: number
  ay: number
  drag: number
  life: number
  maxLife: number
  size: number
  sizeEnd: number
  rotation: number
  spin: number
  colorFrom: RGB
  colorTo: RGB
  alphaFrom: number
  alphaTo: number
  blend: 'add' | 'normal'
  shape: ParticleShape
}

export type Emitter = {
  elapsed: number
  duration: number
  /** 초당 방출 개수 */
  rate: number
  accumulator: number
  spawn: (t: number) => Particle | Particle[] | null
  onFrame?: (t: number, dt: number) => void
}

export type Prop = {
  elapsed: number
  duration: number
  draw: (ctx: CanvasRenderingContext2D, t: number, w: number, h: number) => void
}

export type VfxEngine = {
  addParticle: (particle: Particle) => void
  addEmitter: (emitter: Omit<Emitter, 'elapsed' | 'accumulator'>) => void
  addProp: (prop: Omit<Prop, 'elapsed'>) => void
  shake: (intensity: number, durationMs: number) => void
  flash: (color: RGB, alpha: number, durationMs: number) => void
  clear: () => void
  destroy: () => void
  /** 캔버스 크기 (CSS 픽셀) */
  getSize: () => { w: number; h: number }
}

export function createVfxEngine(canvas: HTMLCanvasElement): VfxEngine {
  const ctx = canvas.getContext('2d')
  let particles: Particle[] = []
  let emitters: Emitter[] = []
  let props: Prop[] = []
  let shakeIntensity = 0
  let shakeUntil = 0
  let flashColor: RGB = [255, 255, 255]
  let flashAlpha = 0
  let flashDecay = 0
  let rafId: number | null = null
  let lastTime = performance.now()
  let destroyed = false

  const resize = () => {
    const rect = canvas.getBoundingClientRect()
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const width = Math.max(Math.round(rect.width * dpr), 1)
    const height = Math.max(Math.round(rect.height * dpr), 1)
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }
  }

  const step = (now: number) => {
    if (destroyed) return
    const dt = Math.min((now - lastTime) / 1000, 0.05)
    lastTime = now
    resize()

    if (!ctx) {
      rafId = window.requestAnimationFrame(step)
      return
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = canvas.width / dpr
    const h = canvas.height / dpr

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)

    // 화면 흔들림
    if (now < shakeUntil && shakeIntensity > 0) {
      const remain = (shakeUntil - now) / 1000
      const power = shakeIntensity * Math.min(remain * 2.5, 1)
      ctx.translate(
        (Math.random() - 0.5) * power,
        (Math.random() - 0.5) * power,
      )
    }

    // 이미터
    const nextEmitters: Emitter[] = []
    for (const emitter of emitters) {
      emitter.elapsed += dt * 1000
      const t = Math.min(emitter.elapsed / emitter.duration, 1)
      emitter.onFrame?.(t, dt)

      emitter.accumulator += emitter.rate * dt
      while (emitter.accumulator >= 1) {
        emitter.accumulator -= 1
        const spawned = emitter.spawn(t)
        if (spawned) {
          if (Array.isArray(spawned)) {
            for (const particle of spawned) particles.push(particle)
          } else {
            particles.push(spawned)
          }
        }
      }

      if (emitter.elapsed < emitter.duration) {
        nextEmitters.push(emitter)
      }
    }
    emitters = nextEmitters

    // 프롭 (커스텀 드로잉: 용, 벽, 통나무, 소환진 등)
    const nextProps: Prop[] = []
    for (const prop of props) {
      prop.elapsed += dt * 1000
      const t = Math.min(prop.elapsed / prop.duration, 1)
      prop.draw(ctx, t, w, h)
      if (prop.elapsed < prop.duration) {
        nextProps.push(prop)
      }
    }
    props = nextProps

    // 파티클
    const alive: Particle[] = []
    for (const p of particles) {
      p.life += dt
      if (p.life >= p.maxLife) continue

      const t = p.life / p.maxLife
      p.vx += p.ax * dt
      p.vy += p.ay * dt
      p.vx *= 1 - p.drag * dt
      p.vy *= 1 - p.drag * dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.rotation += p.spin * dt

      drawParticle(ctx, p, t)
      alive.push(p)
    }
    particles = alive

    // 플래시
    if (flashAlpha > 0.003) {
      ctx.globalCompositeOperation = 'source-over'
      ctx.fillStyle = `rgba(${flashColor[0]}, ${flashColor[1]}, ${flashColor[2]}, ${flashAlpha})`
      ctx.fillRect(-20, -20, w + 40, h + 40)
      flashAlpha = Math.max(0, flashAlpha - flashDecay * dt)
    }

    ctx.globalCompositeOperation = 'source-over'
    rafId = window.requestAnimationFrame(step)
  }

  rafId = window.requestAnimationFrame(step)

  return {
    addParticle: (particle) => {
      particles.push(particle)
    },
    addEmitter: (emitter) => {
      emitters.push({ ...emitter, elapsed: 0, accumulator: 0 })
    },
    addProp: (prop) => {
      props.push({ ...prop, elapsed: 0 })
    },
    shake: (intensity, durationMs) => {
      shakeIntensity = Math.max(shakeIntensity, intensity)
      shakeUntil = Math.max(shakeUntil, performance.now() + durationMs)
    },
    flash: (color, alpha, durationMs) => {
      flashColor = color
      flashAlpha = Math.max(flashAlpha, alpha)
      flashDecay = alpha / Math.max(durationMs / 1000, 0.05)
    },
    clear: () => {
      particles = []
      emitters = []
      props = []
    },
    destroy: () => {
      destroyed = true
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId)
      }
    },
    getSize: () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      return { w: canvas.width / dpr, h: canvas.height / dpr }
    },
  }
}

function drawParticle(
  ctx: CanvasRenderingContext2D,
  p: Particle,
  t: number,
): void {
  const size = p.size + (p.sizeEnd - p.size) * t
  const alpha = p.alphaFrom + (p.alphaTo - p.alphaFrom) * t
  if (alpha <= 0.004 || size <= 0.05) return

  const r = Math.round(p.colorFrom[0] + (p.colorTo[0] - p.colorFrom[0]) * t)
  const g = Math.round(p.colorFrom[1] + (p.colorTo[1] - p.colorFrom[1]) * t)
  const b = Math.round(p.colorFrom[2] + (p.colorTo[2] - p.colorFrom[2]) * t)

  ctx.globalCompositeOperation = p.blend === 'add' ? 'lighter' : 'source-over'

  switch (p.shape) {
    case 'circle': {
      const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, size)
      gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha})`)
      gradient.addColorStop(0.55, `rgba(${r}, ${g}, ${b}, ${alpha * 0.5})`)
      gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`)
      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.arc(p.x, p.y, size, 0, Math.PI * 2)
      ctx.fill()
      break
    }
    case 'ember': {
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`
      ctx.beginPath()
      ctx.arc(p.x, p.y, size * 0.5, 0, Math.PI * 2)
      ctx.fill()
      break
    }
    case 'spark': {
      const speed = Math.hypot(p.vx, p.vy)
      const lengthScale = Math.min(speed * 0.045, size * 4)
      const nx = speed > 0.001 ? p.vx / speed : 1
      const ny = speed > 0.001 ? p.vy / speed : 0
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`
      ctx.lineWidth = Math.max(size * 0.4, 0.6)
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(p.x - nx * lengthScale, p.y - ny * lengthScale)
      ctx.lineTo(p.x, p.y)
      ctx.stroke()
      break
    }
    case 'smoke': {
      const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, size)
      gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha * 0.85})`)
      gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`)
      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.arc(p.x, p.y, size, 0, Math.PI * 2)
      ctx.fill()
      break
    }
    case 'shard': {
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rotation)
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`
      ctx.beginPath()
      ctx.moveTo(-size * 0.6, size * 0.5)
      ctx.lineTo(0, -size * 0.7)
      ctx.lineTo(size * 0.6, size * 0.35)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
      break
    }
    case 'leaf': {
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rotation)
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`
      ctx.beginPath()
      ctx.ellipse(0, 0, size, size * 0.42, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
      break
    }
    case 'droplet': {
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(Math.atan2(p.vy, p.vx))
      const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, size)
      gradient.addColorStop(0, `rgba(${Math.min(r + 70, 255)}, ${Math.min(g + 70, 255)}, 255, ${alpha})`)
      gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`)
      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.ellipse(0, 0, size * 1.4, size * 0.75, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
      break
    }
  }
}

// ───────────────────────── 공용 헬퍼 ─────────────────────────

export function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

export function makeParticle(overrides: Partial<Particle>): Particle {
  return {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    ax: 0,
    ay: 0,
    drag: 0,
    life: 0,
    maxLife: 1,
    size: 6,
    sizeEnd: 2,
    rotation: 0,
    spin: 0,
    colorFrom: [255, 255, 255],
    colorTo: [255, 255, 255],
    alphaFrom: 1,
    alphaTo: 0,
    blend: 'add',
    shape: 'circle',
    ...overrides,
  }
}

export function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3
}

export function easeInCubic(t: number): number {
  return t ** 3
}

export function easeOutBack(t: number): number {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2
}
