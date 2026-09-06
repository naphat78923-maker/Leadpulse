'use client';

import {
  useCallback,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { pressScale, springPress } from '@/lib/motion';
import type { ClayKind } from './ClayCharacter';

export type HexFaceProps = {
  kind: ClayKind;
  /** Display size in px — heroes ~44–56+, pulse/chips ~18–22. */
  size?: number;
  className?: string;
  /** Force pressed (freeze idle + press scale). */
  pressed?: boolean;
  /** Skip enter animation. */
  instant?: boolean;
  /**
   * Accepted for ClayCharacter drop-in compatibility.
   * Hex faces are self-framed (no clay shelf).
   */
  framed?: boolean;
  alt?: string;
};

/** Soft chunky silhouette family — fat round stroke, distinct per kind. */
export type HexFaceShape =
  | 'hex'
  | 'squircle'
  | 'rounded-rect'
  | 'circle'
  | 'diamond'
  | 'pentagon';

/** Solid clay accents per kind — chunky face fills (not muted mixes). */
export const HEX_KIND_ACCENT: Record<ClayKind, string> = {
  call: 'var(--color-clay-teal)',
  message: 'var(--color-clay-pink)',
  package: 'var(--color-clay-peach)',
  search: 'var(--color-clay-lavender)',
  pause: 'var(--color-clay-ochre)',
  success: 'var(--color-clay-mint)',
};

/** Kind → soft shape (silhouette only; color/eyes/motion stay kind-driven). */
export const HEX_KIND_SHAPE: Record<ClayKind, HexFaceShape> = {
  call: 'hex',
  message: 'squircle',
  package: 'rounded-rect',
  search: 'circle',
  pause: 'diamond',
  success: 'pentagon',
};

const ALT: Record<ClayKind, string> = {
  call: 'Hex face on a call',
  message: 'Hex face with a message',
  package: 'Hex face with a package',
  search: 'Hex face searching',
  pause: 'Hex face resting',
  success: 'Hex face celebrating',
};

/** Eye cluster offset + tilt — slight personality per kind. */
const EYE_POSE: Record<
  ClayKind,
  { ox: number; oy: number; rot: number; gap: number }
> = {
  call: { ox: -4, oy: 6, rot: -12, gap: 11 },
  message: { ox: -5, oy: 7, rot: -16, gap: 10.5 },
  package: { ox: -3, oy: 5, rot: -8, gap: 11 },
  search: { ox: -2, oy: 4, rot: -18, gap: 12 },
  pause: { ox: -4, oy: 8, rot: -6, gap: 10 },
  success: { ox: -3, oy: 5, rot: -14, gap: 11.5 },
};

const ENTER_EASE = [0.22, 1, 0.36, 1] as const;

/** Soft spring for hover lift / tilt / scale. */
const springHover = {
  type: 'spring' as const,
  stiffness: 380,
  damping: 22,
  mass: 0.55,
};

const springEyeLook = {
  type: 'spring' as const,
  stiffness: 420,
  damping: 28,
  mass: 0.4,
};

const HOVER_SCALE = 1.07;
const HOVER_LIFT = -3;
const HOVER_TILT = 5;
/** Max eye look in SVG user units toward pointer. */
const EYE_LOOK_MAX = 2.6;
/** Fixed look-up when hovered but no move yet. */
const EYE_LOOK_UP = -2.2;

/** Soft hex — strokeLinejoin round fattens into a chunky blob. */
const HEX_POINTS = '50,10 86,30 86,70 50,90 14,70 14,30';
/** Soft rounded square / squircle blob. */
const SQUIRCLE_POINTS = '24,24 76,24 76,76 24,76';
/** Box-y rounded rectangle (slightly wider). */
const ROUNDED_RECT_POINTS = '16,28 84,28 84,72 16,72';
/** Soft diamond (rhombus). */
const DIAMOND_POINTS = '50,12 88,50 50,88 12,50';
/**
 * Soft rounded pentagon (point-up, regular-ish).
 * Readable at ~18px with fat round stroke.
 */
const PENTAGON_POINTS = '50,12 86,38 72,81 28,81 14,38';

const STROKE = {
  strokeWidth: 14,
  strokeLinejoin: 'round' as const,
  strokeLinecap: 'round' as const,
};

function KindSilhouette({
  shape,
  fill,
}: {
  shape: HexFaceShape;
  fill: string;
}): ReactNode {
  if (shape === 'circle') {
    return (
      <circle
        cx={50}
        cy={50}
        r={34}
        fill={fill}
        stroke={fill}
        strokeWidth={STROKE.strokeWidth}
        strokeLinecap={STROKE.strokeLinecap}
      />
    );
  }

  const points =
    shape === 'hex'
      ? HEX_POINTS
      : shape === 'squircle'
        ? SQUIRCLE_POINTS
        : shape === 'rounded-rect'
          ? ROUNDED_RECT_POINTS
          : shape === 'diamond'
            ? DIAMOND_POINTS
            : PENTAGON_POINTS;

  return (
    <polygon
      points={points}
      fill={fill}
      stroke={fill}
      strokeWidth={STROKE.strokeWidth}
      strokeLinejoin={STROKE.strokeLinejoin}
      strokeLinecap={STROKE.strokeLinecap}
    />
  );
}

/**
 * Soft kind-shaped face + slanted pill eyes (Coding-bot style).
 * Idle: Y bob + blink. Hover (pointer): scale/lift/tilt + snappier bob + eye look.
 * Press freezes idle + slight scale (wins over hover). prefers-reduced-motion → static.
 * Pure SVG + framer-motion — no Lottie.
 */
export default function HexFace({
  kind,
  size = 40,
  className,
  pressed = false,
  instant = false,
  framed: _framed,
  alt,
}: HexFaceProps) {
  const reduce = usePrefersReducedMotion();
  const [holding, setHolding] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [eyeLook, setEyeLook] = useState({ x: 0, y: 0 });
  const isPressed = pressed || holding;
  /** Hover motion only when not reduced and not pressed. */
  const hoverActive = hovered && !isPressed && !reduce;
  const freeze = reduce || isPressed;
  const fill = HEX_KIND_ACCENT[kind];
  const shape = HEX_KIND_SHAPE[kind];
  const eyes = EYE_POSE[kind];
  const decorative = alt === '';
  const label = decorative ? undefined : (alt ?? ALT[kind]);
  const tapScale = size >= 32 ? pressScale : 0.975;

  const endPress = useCallback(() => setHolding(false), []);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLSpanElement>) => {
      if (reduce || e.button !== 0) return;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      setHolding(true);
    },
    [reduce]
  );

  const onPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLSpanElement>) => {
      if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      endPress();
    },
    [endPress]
  );

  const onPointerEnter = useCallback(() => {
    if (reduce) return;
    setHovered(true);
    // Default look-up until pointer move refines direction.
    setEyeLook({ x: 0, y: EYE_LOOK_UP });
  }, [reduce]);

  const onPointerLeave = useCallback(() => {
    setHovered(false);
    setEyeLook({ x: 0, y: 0 });
  }, []);

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLSpanElement>) => {
      if (reduce || isPressed || !hovered) return;
      const rect = e.currentTarget.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      const nx = (e.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
      const ny = (e.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
      const clamp = (v: number) => Math.max(-1, Math.min(1, v));
      setEyeLook({
        x: clamp(nx) * EYE_LOOK_MAX,
        y: clamp(ny) * EYE_LOOK_MAX,
      });
    },
    [reduce, isPressed, hovered]
  );

  const outerScale = reduce
    ? 1
    : isPressed
      ? tapScale
      : hoverActive
        ? HOVER_SCALE
        : 1;
  const outerY = hoverActive ? HOVER_LIFT : 0;
  const outerRotate = hoverActive ? HOVER_TILT : 0;

  return (
    <motion.span
      role={decorative ? undefined : 'img'}
      aria-label={label}
      aria-hidden={decorative ? true : undefined}
      data-kind={kind}
      data-shape={shape}
      data-hex-face=""
      data-hovered={hoverActive ? '' : undefined}
      className={clsx(
        'inline-flex shrink-0 items-center justify-center select-none touch-manipulation',
        className
      )}
      style={{
        width: size,
        height: size,
        willChange: 'transform',
        // Soft shadow via filter — no layout; only when hover-active.
        filter: hoverActive
          ? 'drop-shadow(0 3px 5px rgba(28, 25, 23, 0.14))'
          : 'drop-shadow(0 0 0 rgba(0,0,0,0))',
      }}
      initial={instant || reduce ? false : { opacity: 0, scale: 0.94 }}
      animate={{
        opacity: 1,
        scale: outerScale,
        y: outerY,
        rotate: outerRotate,
      }}
      transition={
        reduce
          ? { duration: 0.01 }
          : isPressed
            ? springPress
            : hoverActive || hovered
              ? springHover
              : { duration: 0.22, ease: ENTER_EASE }
      }
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={endPress}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onPointerMove={onPointerMove}
    >
      <motion.span
        className="relative block h-full w-full"
        animate={
          freeze
            ? { y: 0 }
            : hoverActive
              ? { y: [0, -3.4, 0] }
              : { y: [0, -2.2, 0] }
        }
        transition={
          freeze
            ? { duration: 0.12 }
            : hoverActive
              ? { duration: 1.65, repeat: Infinity, ease: 'easeInOut' }
              : { duration: 2.8, repeat: Infinity, ease: 'easeInOut' }
        }
      >
        <svg
          viewBox="0 0 100 100"
          width="100%"
          height="100%"
          aria-hidden="true"
          className="overflow-visible"
        >
          <KindSilhouette shape={shape} fill={fill} />
          {/* Soft highlight blob */}
          <ellipse
            cx={42}
            cy={34}
            rx={16}
            ry={10}
            fill="rgba(255,255,255,0.18)"
          />
          {/* Eye look (hover) — separate from blink so springs/keyframes don't fight. */}
          <motion.g
            animate={
              freeze || !hoverActive
                ? { x: 0, y: 0 }
                : { x: eyeLook.x, y: eyeLook.y }
            }
            transition={springEyeLook}
          >
            <motion.g
              style={{
                transformOrigin: `${50 + eyes.ox}px ${52 + eyes.oy}px`,
              }}
              animate={
                freeze ? { scaleY: 1 } : { scaleY: [1, 1, 1, 0.14, 1] }
              }
              transition={
                freeze
                  ? { duration: 0.08 }
                  : {
                      duration: 3.4,
                      times: [0, 0.78, 0.86, 0.9, 1],
                      repeat: Infinity,
                      ease: 'easeInOut',
                    }
              }
            >
              <g
                transform={`translate(${eyes.ox} ${eyes.oy}) rotate(${eyes.rot} 50 52)`}
              >
                <ellipse
                  cx={50 - eyes.gap / 2}
                  cy={52}
                  rx={5.2}
                  ry={7.4}
                  fill="#fff"
                />
                <ellipse
                  cx={50 + eyes.gap / 2}
                  cy={52}
                  rx={5.2}
                  ry={7.4}
                  fill="#fff"
                />
              </g>
            </motion.g>
          </motion.g>
        </svg>
      </motion.span>
    </motion.span>
  );
}
