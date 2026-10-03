'use client'

// <Blob> — the LeadPulse butter-pat mascot.
// Thin React shell over the clock-free BlobEngine (adapted from bloub, MIT).
//
// Eyes are HOLES punched in a <mask> (bloub's signature trick): the page shows
// through them, and they self-clip against the body silhouette for free.
// Frames are written straight to the DOM via refs — no React re-render at 60fps.

import { useEffect, useId, useRef } from 'react'
import { BlobEngine } from './engine'
import type { BlobState } from './states'

export interface BlobProps {
  state?: BlobState
  /** pixel size of the square canvas */
  size?: number
  /** eyes follow the pointer */
  follow?: boolean
  /** render exactly this engine time and skip the animation loop (tests, SSR-ish) */
  frozenAt?: number
  className?: string
  'aria-label'?: string
}

const R = 100
const PAD = 24 // room for hop, sparkles and z's above the body

export default function Blob({
  state = 'idle',
  size = 64,
  follow = false,
  frozenAt,
  className,
  'aria-label': ariaLabel = 'LeadPulse mascot',
}: BlobProps) {
  const engineRef = useRef<BlobEngine | null>(null)
  const bodyRef = useRef<SVGPathElement | null>(null)
  const eyeRefs = useRef<(SVGPathElement | null)[]>([])
  const dotsRef = useRef<SVGGElement | null>(null)
  const rootRef = useRef<SVGSVGElement | null>(null)
  const stateRef = useRef<BlobState>(state)
  const lookRef = useRef({ yaw: 0, pitch: 0, mix: 0 })
  // read inside the pointer handler, so switching follow on mid-life (a drag starting)
  // never restarts the animation loop or its clock
  const followRef = useRef(follow)
  const maskId = `blob-mask-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`

  // initialize the engine exactly once, without touching refs during render
  if (engineRef.current == null) {
    engineRef.current = new BlobEngine(R)
  }

  // paint one engine frame straight into the DOM
  const paint = (now: number) => {
    const engine = engineRef.current!
    engine.setState(stateRef.current, now)
    engine.setLook({ ...lookRef.current, wander: 1 - lookRef.current.mix })
    const frame = engine.sample(now)

    bodyRef.current?.setAttribute('d', frame.bodyPath)
    bodyRef.current?.setAttribute('opacity', String(frame.bodyAlpha))

    for (let i = 0; i < 2; i++) {
      const el = eyeRefs.current[i]
      const eye = frame.eyes[i]
      if (!el) continue
      if (!eye) {
        el.setAttribute('opacity', '0')
        continue
      }
      el.setAttribute('d', eye.d)
      el.setAttribute('transform', eye.matrix)
      el.setAttribute('opacity', String(eye.alpha))
    }

    const g = dotsRef.current
    if (g) {
      while (g.children.length > frame.dots.length) g.removeChild(g.lastChild!)
      while (g.children.length < frame.dots.length) {
        g.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'circle'))
      }
      frame.dots.forEach((d, i) => {
        const c = g.children[i] as SVGCircleElement
        c.setAttribute('cx', String(d.x))
        c.setAttribute('cy', String(d.y))
        c.setAttribute('r', String(d.r))
        c.setAttribute('opacity', String(d.opacity))
      })
    }
  }

  // keep the latest requested state without re-running effects
  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    followRef.current = follow
    if (!follow) lookRef.current = { ...lookRef.current, mix: 0 }
  }, [follow])

  useEffect(() => {
    if (frozenAt !== undefined) {
      paint(frozenAt)
      return
    }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      paint(1.0) // one settled frame, no loop
      return
    }

    let raf = 0
    const t0 = performance.now()
    const tick = () => {
      paint((performance.now() - t0) / 1000)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    let decayTimer: ReturnType<typeof setTimeout> | null = null
    const onMove: ((e: PointerEvent) => void) | null = (e: PointerEvent) => {
        if (!followRef.current) return
        const el = rootRef.current
        if (!el) return
        const box = el.getBoundingClientRect()
        if (box.width === 0) return
        const dx = e.clientX - (box.left + box.width / 2)
        const dy = e.clientY - (box.top + box.height / 2)
        const dist = Math.hypot(dx, dy)
        // gaze saturates ~2.5 body widths away; 26° max yaw like the reference
        const k = Math.min(1, dist / (box.width * 2.5))
        lookRef.current = {
          yaw: Math.atan2(dx, Math.max(60, box.width)) * (180 / Math.PI) * 0.9 * k,
          pitch: -Math.atan2(dy, Math.max(60, box.width)) * (180 / Math.PI) * 0.7 * k,
          mix: 0.85,
        }
        if (decayTimer) clearTimeout(decayTimer)
        decayTimer = setTimeout(() => {
          lookRef.current = { ...lookRef.current, mix: 0 }
        }, 1800)
    }
    window.addEventListener('pointermove', onMove, { passive: true })

    return () => {
      cancelAnimationFrame(raf)
      if (onMove) window.removeEventListener('pointermove', onMove)
      if (decayTimer) clearTimeout(decayTimer)
    }
  }, [frozenAt])

  const box = `${-R - PAD} ${-R - PAD} ${(R + PAD) * 2} ${(R + PAD) * 2}`

  return (
    <svg
      ref={rootRef}
      viewBox={box}
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={ariaLabel}
      style={{ overflow: 'visible', display: 'block' }}
    >
      <defs>
        <mask id={maskId}>
          <rect x={-R - PAD} y={-R - PAD} width={(R + PAD) * 2} height={(R + PAD) * 2} fill="white" />
          {/* eye holes: black cuts the body out of the white mask */}
          <path ref={(el) => { eyeRefs.current[0] = el }} fill="black" />
          <path ref={(el) => { eyeRefs.current[1] = el }} fill="black" />
        </mask>
      </defs>
      <path ref={bodyRef} className="blob-body" mask={`url(#${maskId})`} />
      <g ref={dotsRef} className="blob-dots" />
    </svg>
  )
}
