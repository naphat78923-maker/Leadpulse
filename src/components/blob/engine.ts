// The engine: a pure function of time with no framework and no clock.
// Adapted from bloub (MIT, jeremy-prt) — same core guarantees:
//
//   engine.sample(t) is pure. Pause, resume, jump to an arbitrary time, and the
//   DOM-less tests all produce the same image. sample() never mutates state.
//
// State changes blend from the FROZEN composite pose (not the destination pose
// of the outgoing state), so chained changes are continuous however fast they
// come. Transitions are exponential ease-outs — no body overshoot.

import { eyePoses, liveliness, blinkScale, type HeadGaze } from './face'
import { clamp, easings, lerp, r2 } from './math'
import { blend, capsulePath, closedPath, radiusAtAngle, toPoints, type Point, type Silhouette } from './shape'
import { STATES, type BlobState, type EyeCfg, type Pose } from './states'

export interface RenderedEye {
  d: string
  matrix: string
  alpha: number
}

export interface RenderedDot {
  x: number
  y: number
  r: number
  opacity: number
}

export interface BotFrame {
  bodyPath: string
  bodyAlpha: number
  eyes: RenderedEye[]
  dots: RenderedDot[]
}

/**
 * Where the blob looks when something external drives it (the pointer).
 * yaw/pitch are ABSOLUTE directions replacing the pose's as `mix` rises — the
 * engine must do this mixing, because only it knows the pose at this instant.
 * `wander` is the share of automatic drift that remains; the two are separate
 * so the head keeps living when there is no pointer.
 */
export interface Look {
  yaw: number
  pitch: number
  mix: number
  wander: number
}

const NO_LOOK: Look = { yaw: 0, pitch: 0, mix: 0, wander: 1 }

const lerpEye = (a: EyeCfg, b: EyeCfg, t: number): EyeCfg => ({
  w: lerp(a.w, b.w, t),
  h: lerp(a.h, b.h, t),
  open: lerp(a.open, b.open, t),
  tilt: lerp(a.tilt ?? 0, b.tilt ?? 0, t),
})

const lerpGaze = (a: HeadGaze, b: HeadGaze, t: number): HeadGaze => ({
  yaw: lerp(a.yaw, b.yaw, t),
  pitch: lerp(a.pitch, b.pitch, t),
  roll: lerp(a.roll, b.roll, t),
})

interface Snapshot {
  sil: Silhouette
  offX: number
  offY: number
  gaze: HeadGaze
  split: number
  eyes: [EyeCfg, EyeCfg]
  eyeAlpha: number
  bodyAlpha: number
}

const snapOf = (p: Pose): Snapshot => ({
  sil: { ...p.sil, radii: [...p.sil.radii] },
  offX: p.offX,
  offY: p.offY,
  gaze: { ...p.gaze },
  split: p.split,
  eyes: [{ ...p.eyes[0] }, { ...p.eyes[1] }],
  eyeAlpha: p.eyeAlpha,
  bodyAlpha: p.bodyAlpha,
})

function blendSnapshot(a: Snapshot, p: Pose, t: number): Pose {
  return {
    sil: blend(a.sil, p.sil, t),
    offX: lerp(a.offX, p.offX, t),
    offY: lerp(a.offY, p.offY, t),
    gaze: lerpGaze(a.gaze, p.gaze, t),
    split: lerp(a.split, p.split, t),
    eyes: [lerpEye(a.eyes[0], p.eyes[0], t), lerpEye(a.eyes[1], p.eyes[1], t)],
    eyeAlpha: lerp(a.eyeAlpha, p.eyeAlpha, t),
    bodyAlpha: lerp(a.bodyAlpha, p.bodyAlpha, t),
    // Decor belongs to the arriving state; it fades in with the morph.
    dots: p.dots.map((d) => ({ ...d, opacity: d.opacity * t })),
  }
}

export class BlobEngine {
  private state: BlobState = 'idle'
  private stateStart = 0
  /** frozen composite pose at the moment of the last state change */
  private from: Snapshot | null = null
  private look: Look = NO_LOOK
  private blinkAt = -1
  private pts: Point[] = []

  constructor(
    /** ball radius in viewBox units; viewBox is (-R-pad)…(R+pad) square */
    readonly R = 100
  ) {}

  /** Current state id (for React to keep aria labels honest). */
  get current(): BlobState {
    return this.state
  }

  setState(id: BlobState, now: number) {
    if (id === this.state) return
    // Freeze the composite pose so the new blend starts from what is on screen.
    this.from = snapOf(this.composite(now))
    this.state = id
    this.stateStart = now
    if (STATES[id].blinkIn) this.blinkAt = now
  }

  /** Refuses non-finite targets: a NaN set once would never rest again. */
  setLook(look: Partial<Look>) {
    const next = { ...this.look, ...look }
    if (!Number.isFinite(next.yaw) || !Number.isFinite(next.pitch)) return
    this.look = next
  }

  /** The pose after state blending, before ambient life. */
  private composite(now: number): Pose {
    const def = STATES[this.state]
    const local = Math.max(0, now - this.stateStart)
    const pose = def.pose(local)
    if (!this.from) return pose
    const k = clamp(local / def.morph)
    if (k >= 1) return pose
    return blendSnapshot(this.from, pose, easings.easeOutCubic(k))
  }

  sample(now: number): BotFrame {
    const R = this.R
    const pose = this.composite(now)
    const life = liveliness(now)

    // --- gaze ---
    // Absolute look mixed by `mix`; drift layered AFTER the mix, scaled by
    // `wander`, so pointer control never fights ambient life.
    const gaze: HeadGaze = {
      yaw: lerp(pose.gaze.yaw, this.look.yaw, this.look.mix) + life.dYaw * this.look.wander,
      pitch: lerp(pose.gaze.pitch, this.look.pitch, this.look.mix) + life.dPitch * this.look.wander,
      roll: pose.gaze.roll + life.dRoll,
    }

    // Blink on top of the calendar: a state change with blinkIn hides its entry.
    const forced = clamp((now - this.blinkAt) / 0.2)
    const forcedLid = forced < 1 ? Math.abs(forced * 2 - 1) : 1
    const lid = Math.min(life.lid, forcedLid)

    const offX = pose.offX + life.driftX
    const offY = pose.offY + life.driftY

    // --- body ---
    const sil: Silhouette = {
      ...pose.sil,
      cx: pose.sil.cx + offX,
      cy: pose.sil.cy + offY,
      sy: pose.sil.sy * life.breath,
    }
    const bodyPath = closedPath(toPoints(sil, R, this.pts))

    // --- eyes ---
    // Eyes live on a unit sphere; on a non-circular silhouette they are pulled
    // back to the real radius in their direction so they never spill past the
    // edge (where the mask would clip them anyway — they are holes, see Blob).
    const bodyRadius = (x: number, y: number) => radiusAtAngle(pose.sil.radii, Math.atan2(y, x) - pose.sil.rot)

    const eyes: RenderedEye[] = []
    if (pose.eyeAlpha > 0.01) {
      const poses = eyePoses(gaze, R, pose.split)
      for (let i = 0; i < 2; i++) {
        const e = poses[i]!
        if (e.depth <= 0.02) continue
        const cfg = pose.eyes[i]!
        const fit = bodyRadius(e.x, e.y)
        // Per-eye tilt: compose the tangent frame with a rotation in the eye's
        // own plane (Basis × Rot) — this is what enables mirrored tilts.
        const phi = ((cfg.tilt ?? 0) * Math.PI) / 180
        const cp = Math.cos(phi)
        const sp = Math.sin(phi)
        const ax = e.a * cp + e.c * sp
        const ay = e.b * cp + e.d * sp
        const cx2 = -e.a * sp + e.c * cp
        const cy2 = -e.b * sp + e.d * cp
        // Blink applies LAST: a vertical squash in screen space, not along the
        // capsule's tilted axis.
        const k = blinkScale(Math.min(lid, cfg.open))
        eyes.push({
          d: capsulePath(cfg.w * R, cfg.h * R),
          matrix: `matrix(${r2(ax)},${r2(ay * k)},${r2(cx2)},${r2(cy2 * k)},${r2(e.x * fit + offX * R)},${r2(e.y * fit + offY * R)})`,
          alpha: pose.eyeAlpha * clamp(e.depth / 0.12),
        })
      }
    }

    const dots: RenderedDot[] = pose.dots
      .filter((p) => p.opacity > 0.01 && p.r > 0.0005)
      .map((p) => ({ x: (p.x + offX) * R, y: (p.y + offY) * R, r: p.r * R, opacity: p.opacity }))

    return { bodyPath, bodyAlpha: pose.bodyAlpha, eyes, dots }
  }
}
