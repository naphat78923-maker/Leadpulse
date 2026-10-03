import { describe, expect, it } from 'vitest'
import { BlobEngine } from './engine'
import { STATE_IDS, STATES } from './states'

describe('BlobEngine', () => {
  it('sample(t) is a pure function of time — same input, same frame', () => {
    const a = new BlobEngine()
    const b = new BlobEngine()
    expect(a.sample(1.234)).toEqual(b.sample(1.234))
    expect(a.sample(1.234)).toEqual(a.sample(1.234))
  })

  it('renders a body path and two eyes at rest', () => {
    const frame = new BlobEngine().sample(3)
    expect(frame.bodyPath).toMatch(/^M.+Z$/)
    expect(frame.eyes).toHaveLength(2)
    expect(frame.eyes[0]!.d).toContain('A') // capsule arcs
    expect(frame.eyes[0]!.matrix).toMatch(/^matrix\(/)
  })

  it('switches state and blends (frame differs across the morph)', () => {
    const e = new BlobEngine()
    e.setState('alert', 10)
    const early = e.sample(10.05)
    const late = e.sample(10.5)
    expect(early.bodyPath).not.toBe(late.bodyPath)
    expect(e.current).toBe('alert')
  })

  it('chained state changes stay continuous (no throw, valid paths)', () => {
    const e = new BlobEngine()
    for (const id of STATE_IDS) {
      e.setState(id, 5)
      const f = e.sample(5.01) // land inside the fade every time
      expect(f.bodyPath).toMatch(/^M/)
      expect(f.bodyAlpha).toBeGreaterThan(0)
    }
  })

  it('sleep produces rising z dots; joy produces sparkle dots; idle none', () => {
    const sleep = new BlobEngine()
    sleep.setState('sleep', 0)
    const sf = sleep.sample(2) // after the morph
    expect(sf.dots.length).toBeGreaterThan(0)

    const joy = new BlobEngine()
    joy.setState('joy', 0)
    expect(joy.sample(2).dots.length).toBeGreaterThan(0)

    expect(new BlobEngine().sample(2).dots).toHaveLength(0)
  })

  it('every catalog state renders a finite frame', () => {
    const e = new BlobEngine()
    for (const id of STATE_IDS) {
      e.setState(id, 0)
      const f = e.sample(STATES[id].morph + 0.5)
      expect(f.bodyPath).not.toContain('NaN')
      for (const eye of f.eyes) {
        expect(eye.matrix).not.toContain('NaN')
      }
    }
  })

  it('refuses non-finite look targets', () => {
    const e = new BlobEngine()
    e.setLook({ yaw: Number.NaN, pitch: 0, mix: 1, wander: 0 })
    expect(e.sample(1).bodyPath).not.toContain('NaN')
  })

  it('grading shows three dots that take turns', () => {
    const e = new BlobEngine()
    e.setState('grading', 0)
    const a = e.sample(2)
    const b = e.sample(2.4)
    expect(a.dots).toHaveLength(3)
    expect(a.dots.map(d => d.y)).not.toEqual(b.dots.map(d => d.y))
  })

  it('land squashes on impact and settles back to the resting shape', () => {
    const e = new BlobEngine()
    e.setState('land', 0)
    const impact = STATES.land.pose(0)
    const settled = STATES.land.pose(3)
    const rest = STATES.idle.pose(0)
    expect(impact.sil).not.toEqual(rest.sil)
    expect(Math.abs(settled.offY)).toBeLessThan(0.001)
    expect(settled.eyes[0].tilt).toBeCloseTo(0, 3)
    expect(e.sample(0.3).bodyPath).not.toBe(e.sample(3).bodyPath)
  })

  it('drowsy keeps the lids under half open and never fully shut; watch opens them wide', () => {
    for (const t of [0, 1, 2, 3, 3.9, 4.1]) {
      const open = STATES.drowsy.pose(t).eyes[0].open
      expect(open).toBeLessThan(0.5)
      expect(open).toBeGreaterThan(0.05)
    }
    expect(STATES.watch.pose(0).eyes[0].w).toBeGreaterThan(STATES.idle.pose(0).eyes[0].w)
    expect(STATES.watch.pose(0).dots).toHaveLength(0)
  })
})
