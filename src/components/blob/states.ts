// LeadPulse blob states — original poses built on bloub's engine techniques (MIT).
//
// A state is a pure pose(local) function: same input time, same frame. The engine
// blends between states; ambient life (drift, blink, breath) is layered on by the
// engine, not declared here.

import { EYE_H, EYE_SPLIT, EYE_W, REST_GAZE, type HeadGaze } from './face'
import { clamp, easings } from './math'
import { silhouetteFromProfile, superellipseProfile, type Silhouette } from './shape'

export interface EyeCfg {
  /** local width (short capsule axis), ball-radius units */
  w: number
  /** local height (long capsule axis) */
  h: number
  /** 1 = open, 0 = closed */
  open: number
  /** per-eye tilt in degrees, applied AFTER the sphere tangent frame. Mirrored
   *  tilts are what make joy vs worry readable — head roll tilts both eyes the
   *  same way and can't do that. */
  tilt?: number
}

export interface DotSpec {
  x: number
  y: number
  r: number
  opacity: number
}

export interface Pose {
  sil: Silhouette
  /** global offset of body AND eyes */
  offX: number
  offY: number
  gaze: HeadGaze
  /** half eye separation on the sphere, degrees */
  split: number
  /** [inner eye, outer eye] */
  eyes: [EyeCfg, EyeCfg]
  eyeAlpha: number
  bodyAlpha: number
  dots: DotSpec[]
}

const pair = (w: number, h: number, tilt = 0, open = 1): [EyeCfg, EyeCfg] => [
  { w, h, tilt, open },
  { w, h, tilt: -tilt, open },
]

/** The butter pat at rest. */
const BODY = superellipseProfile(1, 0.94, 4)

function base(over: Partial<Pose> = {}): Pose {
  return {
    sil: silhouetteFromProfile(BODY),
    offX: 0,
    offY: 0,
    gaze: { ...REST_GAZE },
    split: EYE_SPLIT,
    eyes: pair(EYE_W, EYE_H),
    eyeAlpha: 1,
    bodyAlpha: 1,
    dots: [],
    ...over,
  }
}

export type BlobState = 'idle' | 'thinking' | 'nudge' | 'alert' | 'sleep' | 'joy'

export interface StateDef {
  id: BlobState
  /** entry morph duration, seconds */
  morph: number
  /** true = the entry is masked by a blink, like the reference video */
  blinkIn: boolean
  pose(local: number): Pose
}

const TAU = Math.PI * 2

export const STATES: Record<BlobState, StateDef> = {
  // Resting pat. All motion comes from ambient life (gaze drift, blink, breath).
  idle: {
    id: 'idle',
    morph: 0.4,
    blinkIn: true,
    pose: () => base(),
  },

  // Missing details / draft: slow head sway, one eye squinted.
  thinking: {
    id: 'thinking',
    morph: 0.45,
    blinkIn: true,
    pose: (t) =>
      base({
        gaze: { yaw: 14 + Math.sin(t * 1.1) * 4, pitch: 4, roll: -8 + Math.sin(t * 0.9) * 5 },
        eyes: [
          { w: EYE_W, h: EYE_H, tilt: -14, open: 0.5 },
          { w: EYE_W * 1.06, h: EYE_H, tilt: 0, open: 1 },
        ],
      }),
  },

  // Going quiet: small hopeful hop, looking to the side (at the "Log" button).
  nudge: {
    id: 'nudge',
    morph: 0.35,
    blinkIn: true,
    pose: (t) => {
      const hop = Math.abs(Math.sin(t * 2.2))
      return base({
        offY: -hop * 0.05,
        sil: silhouetteFromProfile(BODY, { sy: 1 - hop * 0.04, sx: 1 + hop * 0.03 }),
        gaze: { yaw: 26, pitch: 8, roll: -4 },
        eyes: pair(EYE_W * 1.08, EYE_H * 1.05),
      })
    },
  },

  // Overdue: stares straight at you, wide eyes, body pulses.
  alert: {
    id: 'alert',
    morph: 0.3,
    blinkIn: false,
    pose: (t) => {
      const pulse = 1 + Math.sin(t * 5.2) * 0.025
      return base({
        sil: silhouetteFromProfile(BODY, { sx: pulse, sy: pulse }),
        offY: -0.02,
        gaze: { yaw: 2, pitch: 3, roll: 0 },
        split: EYE_SPLIT + 1.5,
        eyes: pair(EYE_W * 1.45, EYE_H * 1.18),
      })
    },
  },

  // Parked / snoozed: melts flat, lids down, slow deep breath, rising z's.
  sleep: {
    id: 'sleep',
    morph: 0.6,
    blinkIn: false,
    pose: (t) => {
      const breathe = Math.sin(t * 1.4)
      const dots: DotSpec[] = []
      for (let i = 0; i < 3; i++) {
        const phase = ((t * 0.45 + i / 3) % 1 + 1) % 1
        dots.push({
          x: 0.55 + phase * 0.28,
          y: -0.55 - phase * 0.4,
          r: 0.05 + (1 - phase) * 0.035,
          opacity: phase < 0.15 ? phase / 0.15 : 1 - easings.easeOutCubic(clamp((phase - 0.55) / 0.45)),
        })
      }
      return base({
        sil: silhouetteFromProfile(BODY, { sy: 0.86 + breathe * 0.012, sx: 1.07, cy: 0.08 }),
        gaze: { yaw: 6, pitch: -10, roll: -3 },
        eyes: pair(EYE_W * 1.1, EYE_H, 0, 0.06),
        dots,
      })
    },
  },

  // Closed won: squash-and-stretch bounce, happy arc eyes, sparkle burst.
  joy: {
    id: 'joy',
    morph: 0.25,
    blinkIn: true,
    pose: (t) => {
      const cyc = (t % 1.1) / 1.1
      const air = Math.sin(cyc * Math.PI) // 0→1→0 parabola-ish
      const squash = cyc < 0.18 ? 1 - Math.sin((cyc / 0.18) * Math.PI) * 0.1 : 1
      const dots: DotSpec[] = []
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + 0.4
        const phase = ((t * 0.8 + i * 0.13) % 1 + 1) % 1
        dots.push({
          x: Math.cos(a) * (0.75 + phase * 0.45),
          y: Math.sin(a) * (0.75 + phase * 0.45) - 0.1,
          r: 0.045 * (1 - phase * 0.6),
          opacity: 1 - easings.easeOutQuint(phase),
        })
      }
      return base({
        offY: -air * 0.09,
        sil: silhouetteFromProfile(BODY, { sy: squash + air * 0.07, sx: (1 / (squash + air * 0.07)) * 1.0 }),
        gaze: { yaw: 6, pitch: 12, roll: Math.sin(t * 2.2) * 3 },
        // squinted arcs: tops converging — the mirrored tilt carries the smile
        eyes: pair(0.26, 0.15, 16),
        dots,
      })
    },
  },
}

export const STATE_IDS = Object.keys(STATES) as BlobState[]
