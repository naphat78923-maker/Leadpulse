// Eyes-on-a-sphere face model, adapted from bloub (MIT, jeremy-prt).
//
// The eyes are painted on a sphere, not laid flat: each eye gets the sphere's
// tangent frame, projected orthographically. Depth compression and leaning fall
// out for free — that is what gives the body its volume. Blinking is a VERTICAL
// squash in screen space, composed after the tangent matrix.

import { clamp, createRng, loopNoise } from './math'

type Vec3 = [number, number, number]

/** Half eye separation on the sphere, degrees (total ~32°). */
export const EYE_SPLIT = 16
/** Rest eye size, in ball-radius units. Slightly rounder than bloub's Grok measures. */
export const EYE_W = 0.17
export const EYE_H = 0.36

/** Rest head orientation: our butter pat faces mostly forward, bloub's Grok looks up-right. */
export const REST_GAZE: HeadGaze = { yaw: 10, pitch: 7, roll: -2 }

export interface EyePose {
  x: number
  y: number
  /** tangent 2x2 matrix: [a b c d] as in SVG matrix(a,b,c,d,e,f) */
  a: number
  b: number
  c: number
  d: number
  /** normal's z component: > 0 = face visible */
  depth: number
}

export interface HeadGaze {
  /** yaw, degrees, positive = looking right */
  yaw: number
  /** pitch, degrees, positive = looking up */
  pitch: number
  /** roll, degrees, head tilt */
  roll: number
}

const deg = (d: number) => (d * Math.PI) / 180

/** Rotate two vectors of an orthonormal frame within their common plane. */
function spin(u: Vec3, v: Vec3, angle: number): [Vec3, Vec3] {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return [
    [u[0] * c + v[0] * s, u[1] * c + v[1] * s, u[2] * c + v[2] * s],
    [v[0] * c - u[0] * s, v[1] * c - u[1] * s, v[2] * c - u[2] * s],
  ]
}

/**
 * Head frame, then both eyes. Screen space: x right, y down, z toward viewer.
 * Index 0 is the inner eye, index 1 the outer eye.
 */
export function eyePoses(gaze: HeadGaze, scale: number, split = EYE_SPLIT): [EyePose, EyePose] {
  let f: Vec3 = [0, 0, 1]
  let right: Vec3 = [1, 0, 0]
  let down: Vec3 = [0, 1, 0]

  ;[f, right] = spin(f, right, deg(gaze.yaw))
  ;[down, f] = spin(down, f, deg(gaze.pitch))
  ;[right, down] = spin(right, down, deg(gaze.roll))

  const build = (side: number): EyePose => {
    const [ef, er] = spin(f, right, deg(split * side))
    return { x: ef[0] * scale, y: ef[1] * scale, a: er[0], b: er[1], c: down[0], d: down[1], depth: ef[2] }
  }

  return [build(-1), build(1)]
}

/** Ambient life: slow gaze drift, saccades, blinks. Pure function of time. */
export interface Liveliness {
  dYaw: number
  dPitch: number
  dRoll: number
  /** 1 = open, 0 = closed (vertical screen-space squash) */
  lid: number
  driftX: number
  driftY: number
  breath: number
}

const BLINK_RNG = createRng(0x5eed)
/** Pre-drawn blink calendar: deterministic and stateless. */
const BLINKS: number[] = (() => {
  const out: number[] = []
  let t = 1.4
  while (t < 900) {
    out.push(t)
    t += 1.9 + BLINK_RNG() * 2.7
    if (BLINK_RNG() < 0.18) {
      out.push(t)
      t += 0.24
    }
  }
  return out
})()

const BLINK_DUR = 0.18

function blinkLid(t: number): number {
  for (let i = 0; i < BLINKS.length; i++) {
    const start = BLINKS[i]!
    if (t < start) break
    const k = (t - start) / BLINK_DUR
    if (k >= 0 && k <= 1) {
      return k < 0.45 ? 1 - k / 0.45 : (k - 0.45) / 0.55
    }
  }
  return 1
}

export interface LivelinessOptions {
  wander?: number
  blink?: boolean
  float?: boolean
}

export function liveliness(t: number, opt: LivelinessOptions = {}): Liveliness {
  const { wander = 1, blink = true, float = true } = opt
  // Mutually prime periods: the drift never visibly repeats.
  return {
    dYaw: (loopNoise(t, 11.3, 0.4) * 5.5 + loopNoise(t, 3.7, 2.1) * 1.6) * wander,
    dPitch: (loopNoise(t, 9.1, 1.3) * 4.2 + loopNoise(t, 4.3, 0.7) * 1.3) * wander,
    dRoll: loopNoise(t, 13.7, 3.2) * 2.2 * wander,
    lid: blink ? blinkLid(t) : 1,
    driftX: float ? loopNoise(t, 7.9, 1.9) * 0.006 : 0,
    driftY: float ? loopNoise(t, 5.3, 0.3) * 0.007 : 0,
    breath: float ? 1 + Math.sin((t / 3.4) * Math.PI * 2) * 0.005 : 1,
  }
}

/** Blink = vertical screen-space squash around the eye center. */
export function blinkScale(lid: number): number {
  return 0.06 + 0.94 * clamp(lid)
}
