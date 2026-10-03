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

export type BlobState = 'idle' | 'thinking' | 'nudge' | 'alert' | 'sleep' | 'joy' | 'grading' | 'watch' | 'land' | 'drowsy'

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

  // Laya is reading a reply: the thinking sway, plus three dots that take turns rising.
  grading: {
    id: 'grading',
    morph: 0.4,
    blinkIn: true,
    pose: (t) => {
      const dots: DotSpec[] = []
      for (let i = 0; i < 3; i++) {
        // each dot peaks a third of a beat after the one before
        const lift = Math.max(0, Math.sin(t * 4.2 - i * 0.9))
        dots.push({ x: 0.5 + i * 0.2, y: -0.92 - lift * 0.14, r: 0.055, opacity: 0.45 + lift * 0.55 })
      }
      return base({
        gaze: { yaw: 16 + Math.sin(t * 1.3) * 5, pitch: 12, roll: -6 + Math.sin(t * 1.0) * 4 },
        eyes: [
          { w: EYE_W, h: EYE_H, tilt: -10, open: 0.6 },
          { w: EYE_W * 1.06, h: EYE_H, tilt: 0, open: 1 },
        ],
        dots,
      })
    },
  },

  // A card is being dragged: sits up, eyes wide. The gaze is left neutral on purpose —
  // the component's pointer-follow supplies where it looks.
  watch: {
    id: 'watch',
    morph: 0.22,
    blinkIn: false,
    pose: (t) => {
      const lean = Math.sin(t * 2.4) * 0.012
      return base({
        offY: -0.04,
        sil: silhouetteFromProfile(BODY, { sy: 1.04 + lean, sx: 0.98 - lean }),
        gaze: { yaw: 0, pitch: 4, roll: 0 },
        split: EYE_SPLIT + 1,
        eyes: pair(EYE_W * 1.3, EYE_H * 1.14),
      })
    },
  },

  // A card just landed in this lane: one squash, then a bounce that dies away. A
  // one-shot — the caller switches back to the lane's own state after about a second.
  land: {
    id: 'land',
    morph: 0.12,
    blinkIn: false,
    pose: (t) => {
      const decay = Math.exp(-t * 4.2)
      const wave = Math.cos(t * 15) * decay // starts fully squashed, rings down
      const hop = Math.max(0, -wave)
      return base({
        offY: -hop * 0.1,
        sil: silhouetteFromProfile(BODY, { sy: 1 - wave * 0.16, sx: 1 + wave * 0.13 }),
        gaze: { yaw: 4, pitch: 10, roll: 0 },
        // pleased squint while it bounces, relaxing as it settles
        eyes: pair(EYE_W * (1 + decay * 0.25), EYE_H * (1 - decay * 0.45), 14 * decay),
      })
    },
  },

  // The grader has stopped: lids half down, head sinking, then a small start awake.
  drowsy: {
    id: 'drowsy',
    morph: 0.6,
    blinkIn: false,
    pose: (t) => {
      const cyc = (t % 4.2) / 4.2
      // sink for most of the cycle, jerk back up in the last tenth
      const sink = cyc < 0.9 ? easings.easeOutCubic(cyc / 0.9) : 1 - (cyc - 0.9) / 0.1
      return base({
        sil: silhouetteFromProfile(BODY, { sy: 0.95 - sink * 0.04, sx: 1.03, cy: 0.04 }),
        gaze: { yaw: 8, pitch: -4 - sink * 12, roll: -3 - sink * 6 },
        eyes: pair(EYE_W * 1.08, EYE_H, 0, 0.42 - sink * 0.3),
      })
    },
  },
}

export const STATE_IDS = Object.keys(STATES) as BlobState[]
