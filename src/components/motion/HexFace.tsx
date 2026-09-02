'use client';

import {
  useCallback,
  useState,
  type PointerEvent as ReactPointerEvent,
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

/** Solid clay accents per kind — chunky face fills (not muted mixes). */
export const HEX_KIND_ACCENT: Record<ClayKind, string> = {
  call: 'var(--color-clay-teal)',
  message: 'var(--color-clay-pink)',
  package: 'var(--color-clay-peach)',
  search: 'var(--color-clay-lavender)',
  pause: 'var(--color-clay-ochre)',
  success: 'var(--color-clay-mint)',
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

/** Soft hex silhouette — strokeLinejoin round fattens into a chunky blob. */
const HEX_POINTS = '50,10 86,30 86,70 50,90 14,70 14,30';

/**
 * Soft rounded-hex + slanted pill eyes (Coding-bot style).
 * Idle: Y bob + blink. Press freezes idle + slight scale.
 * prefers-reduced-motion → static. Pure SVG + framer-motion — no Lottie.
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
  const isPressed = pressed || holding;
  const freeze = reduce || isPressed;
  const fill = HEX_KIND_ACCENT[kind];
  const eyes = EYE_POSE[kind];
  const decorative = alt === "";
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

  return (
    <motion.span
      role={decorative ? undefined : "img"}
      aria-label={label}
      aria-hidden={decorative ? true : undefined}
      data-kind={kind}
      data-hex-face=""
      className={clsx(
        'inline-flex shrink-0 items-center justify-center select-none touch-manipulation',
        className
      )}
      style={{
        width: size,
        height: size,
        willChange: 'transform',
      }}
      initial={instant || reduce ? false : { opacity: 0, scale: 0.94 }}
      animate={{
        opacity: 1,
        scale: isPressed && !reduce ? tapScale : 1,
      }}
      transition={
        reduce
          ? { duration: 0.01 }
          : isPressed
            ? springPress
            : { duration: 0.22, ease: ENTER_EASE }
      }
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={endPress}
    >
      <motion.span
        className="relative block h-full w-full"
        animate={freeze ? { y: 0 } : { y: [0, -2.2, 0] }}
        transition={
          freeze
            ? { duration: 0.12 }
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
          <polygon
            points={HEX_POINTS}
            fill={fill}
            stroke={fill}
            strokeWidth={14}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {/* Soft highlight blob */}
          <ellipse
            cx={42}
            cy={34}
            rx={16}
            ry={10}
            fill="rgba(255,255,255,0.18)"
          />
          <motion.g
            style={{ transformOrigin: `${50 + eyes.ox}px ${52 + eyes.oy}px` }}
            animate={freeze ? { scaleY: 1 } : { scaleY: [1, 1, 1, 0.14, 1] }}
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
        </svg>
      </motion.span>
    </motion.span>
  );
}
