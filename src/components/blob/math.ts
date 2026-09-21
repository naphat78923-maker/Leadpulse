// Adapted from bloub (https://github.com/jeremy-prt/bloub), MIT license, (c) jeremy-prt.
// Same math toolbox: short rounding for path strings, periodic 1D noise for gaze
// drift, deterministic PRNG for the blink calendar.

export const TAU = Math.PI * 2

export const clamp = (v: number, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v)
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** Bloub measured exponential ease-outs on the reference video — no overshoot. */
export const easings = {
  easeOutCubic: (t: number) => 1 - (1 - t) ** 3,
  easeInOutCubic: (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2),
  easeOutQuint: (t: number) => 1 - (1 - t) ** 5,
}

/** Periodic 1D noise: loops seamlessly over `period`. Used for gaze drift. */
export function loopNoise(t: number, period: number, seed = 0): number {
  const p = (t / period) * TAU
  return (
    0.55 * Math.sin(p + seed) +
    0.3 * Math.sin(2 * p + seed * 1.7 + 1.1) +
    0.15 * Math.sin(3 * p + seed * 2.3 + 2.4)
  )
}

/** Deterministic PRNG (mulberry32): same sequence on every run. */
export function createRng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Short rounding: roughly halves generated path-string weight at 60 fps. */
export const r2 = (v: number) => Math.round(v * 100) / 100
