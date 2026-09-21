// Radial-profile silhouettes, adapted from bloub (MIT, jeremy-prt).
//
// Every silhouette is sampled at the SAME angles, so any two shapes correspond
// point-to-point and a transition reduces to a linear interpolation of radii —
// no path-morphing library. The butter body is a superellipse r(theta) profile.

import { TAU, lerp, r2 } from './math'

export const PROFILE_SAMPLES = 64

export interface Point {
  x: number
  y: number
}

/** A silhouette = a radial profile r(theta) plus a pose. */
export interface Silhouette {
  radii: number[]
  /** profile rotation, radians */
  rot: number
  /** center offset, in ball-radius units */
  cx: number
  cy: number
  /** squash & stretch, applied in screen space (after rotation) */
  sx: number
  sy: number
}

const ANGLES = Array.from({ length: PROFILE_SAMPLES }, (_, i) => (i / PROFILE_SAMPLES) * TAU)
const COS = ANGLES.map(Math.cos)
const SIN = ANGLES.map(Math.sin)

export function circle(radius: number, pose: Partial<Silhouette> = {}): Silhouette {
  return { radii: new Array(PROFILE_SAMPLES).fill(radius), rot: 0, cx: 0, cy: 0, sx: 1, sy: 1, ...pose }
}

/**
 * The butter pat: a superellipse |x/a|^n + |y/b|^n = 1 expressed as r(theta).
 * n=4 gives the rounded-slab body; b<a makes it sit slightly wide, like a pat
 * of butter at rest.
 */
export function superellipseProfile(a = 1, b = 0.94, n = 4): number[] {
  return ANGLES.map((theta) => {
    const c = Math.abs(Math.cos(theta)) / a
    const s = Math.abs(Math.sin(theta)) / b
    return 1 / Math.pow(c ** n + s ** n, 1 / n)
  })
}

export function silhouetteFromProfile(radii: number[], pose: Partial<Silhouette> = {}): Silhouette {
  return { radii: [...radii], rot: 0, cx: 0, cy: 0, sx: 1, sy: 1, ...pose }
}

/** Interpolate two silhouettes. `out` is reused to avoid allocating at 60 fps. */
export function blend(a: Silhouette, b: Silhouette, t: number, out?: Silhouette): Silhouette {
  const dst = out ?? { radii: new Array<number>(PROFILE_SAMPLES), rot: 0, cx: 0, cy: 0, sx: 1, sy: 1 }
  for (let i = 0; i < PROFILE_SAMPLES; i++) {
    dst.radii[i] = lerp(a.radii[i] ?? 1, b.radii[i] ?? 1, t)
  }
  // Shortest-path rotation: avoids a full turn between e.g. +170° and -170°.
  let dRot = b.rot - a.rot
  while (dRot > Math.PI) dRot -= TAU
  while (dRot < -Math.PI) dRot += TAU
  dst.rot = a.rot + dRot * t
  dst.cx = lerp(a.cx, b.cx, t)
  dst.cy = lerp(a.cy, b.cy, t)
  dst.sx = lerp(a.sx, b.sx, t)
  dst.sy = lerp(a.sy, b.sy, t)
  return dst
}

/** Project a silhouette to screen points. `scale` = ball radius in viewBox units. */
export function toPoints(s: Silhouette, scale: number, out: Point[] = []): Point[] {
  const cr = Math.cos(s.rot)
  const sr = Math.sin(s.rot)
  for (let i = 0; i < PROFILE_SAMPLES; i++) {
    const r = s.radii[i] ?? 1
    const x = r * (COS[i] ?? 0)
    const y = r * (SIN[i] ?? 0)
    const rx = x * cr - y * sr
    const ry = x * sr + y * cr
    const p = out[i] ?? { x: 0, y: 0 }
    p.x = (rx * s.sx + s.cx) * scale
    p.y = (ry * s.sy + s.cy) * scale
    out[i] = p
  }
  out.length = PROFILE_SAMPLES
  return out
}

/** Radius of the profile in a given direction (linear interpolation between samples). */
export function radiusAtAngle(radii: number[], theta: number): number {
  let a = theta % TAU
  if (a < 0) a += TAU
  const f = (a / TAU) * PROFILE_SAMPLES
  const i0 = Math.floor(f) % PROFILE_SAMPLES
  const i1 = (i0 + 1) % PROFILE_SAMPLES
  return lerp(radii[i0] ?? 1, radii[i1] ?? 1, f - Math.floor(f))
}

/** Closed polyline -> Catmull-Rom cubics. 64 points is smooth at 600 px display size. */
export function closedPath(pts: Point[], tension = 1 / 6): string {
  const n = pts.length
  if (n < 3) return ''
  const first = pts[0]!
  let d = `M${r2(first.x)} ${r2(first.y)}`
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n]!
    const p1 = pts[i]!
    const p2 = pts[(i + 1) % n]!
    const p3 = pts[(i + 2) % n]!
    const c1x = p1.x + (p2.x - p0.x) * tension
    const c1y = p1.y + (p2.y - p0.y) * tension
    const c2x = p2.x - (p3.x - p1.x) * tension
    const c2y = p2.y - (p3.y - p1.y) * tension
    d += `C${r2(c1x)} ${r2(c1y)} ${r2(c2x)} ${r2(c2y)} ${r2(p2.x)} ${r2(p2.y)}`
  }
  return `${d}Z`
}

/** Capsule (stadium) centered on the origin: the exact shape of the blob's eyes. */
export function capsulePath(w: number, h: number): string {
  const hw = Math.max(w, 0.01) / 2
  const hh = Math.max(h, 0.01) / 2
  const r = Math.min(hw, hh)
  return (
    `M${r2(-hw)} ${r2(-hh + r)}` +
    `A${r2(r)} ${r2(r)} 0 0 1 ${r2(-hw + r)} ${r2(-hh)}` +
    `L${r2(hw - r)} ${r2(-hh)}` +
    `A${r2(r)} ${r2(r)} 0 0 1 ${r2(hw)} ${r2(-hh + r)}` +
    `L${r2(hw)} ${r2(hh - r)}` +
    `A${r2(r)} ${r2(r)} 0 0 1 ${r2(hw - r)} ${r2(hh)}` +
    `L${r2(-hw + r)} ${r2(hh)}` +
    `A${r2(r)} ${r2(r)} 0 0 1 ${r2(-hw)} ${r2(hh - r)}Z`
  )
}
