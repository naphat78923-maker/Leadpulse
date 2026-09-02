'use client';

import Image from 'next/image';
import { motion, useReducedMotion } from 'framer-motion';
import clsx from 'clsx';

export type ClayKind = 'call' | 'message' | 'package' | 'search' | 'pause' | 'success';

const SRC: Record<ClayKind, string> = {
  call: '/assets/clay/call.webp',
  message: '/assets/clay/message.webp',
  package: '/assets/clay/package.webp',
  search: '/assets/clay/search.webp',
  pause: '/assets/clay/pause.webp',
  success: '/assets/clay/success.webp',
};

const ALT: Record<ClayKind, string> = {
  call: 'Clay character on a call',
  message: 'Clay character with a message',
  package: 'Clay character with a package',
  search: 'Clay character searching',
  pause: 'Clay character resting',
  success: 'Clay character celebrating',
};

export type ClayCharacterProps = {
  kind: ClayKind;
  /** Display size in px (assets are 512² WebP). */
  size?: number;
  className?: string;
  /** Force pressed (scale 0.96) visual — e.g. controlled press state. */
  pressed?: boolean;
  /** Skip enter animation when already in view. */
  instant?: boolean;
  /** Decorative shelf frame like MascotSprite (default true for ≥28px). */
  framed?: boolean;
  alt?: string;
};

/**
 * Animation Bot clay character — enter + press from motion kit, idle CSS loops
 * gated by prefers-reduced-motion / useReducedMotion().
 */
export default function ClayCharacter({
  kind,
  size = 40,
  className,
  pressed = false,
  instant = false,
  framed,
  alt,
}: ClayCharacterProps) {
  const reduce = useReducedMotion();
  const showFrame = framed ?? size >= 28;

  return (
    <motion.span
      className={clsx(
        'inline-flex shrink-0 items-center justify-center select-none',
        showFrame &&
          'overflow-hidden rounded-lg border border-clay-hairline/70 bg-[#f3efe7] dark:bg-[#2b2721] dark:border-clay-hairline/50 shadow-[0_4px_10px_-3px_rgba(0,0,0,0.28)] dark:shadow-[0_5px_12px_-4px_rgba(0,0,0,0.6)]',
        className
      )}
      style={{ width: size, height: size }}
      initial={instant || reduce ? false : { opacity: 0, y: 12, scale: 0.96 }}
      animate={
        pressed
          ? { opacity: 1, y: 0, scale: 0.96 }
          : { opacity: 1, y: 0, scale: 1 }
      }
      transition={
        reduce
          ? { duration: 0.01 }
          : pressed
            ? { duration: 0.15, ease: [0.4, 0, 0.2, 1] }
            : { duration: 0.22, ease: [0.22, 1, 0.36, 1] }
      }
      whileTap={
        reduce || pressed
          ? undefined
          : { scale: 0.96, transition: { duration: 0.15, ease: [0.4, 0, 0.2, 1] } }
      }
    >
      <span
        className={clsx(
          'block w-full h-full will-change-transform',
          !reduce && `clay-idle clay-idle-${kind}`
        )}
      >
        <Image
          src={SRC[kind]}
          alt={alt ?? ALT[kind]}
          width={512}
          height={512}
          className={clsx(
            'w-full h-full object-cover',
            showFrame && 'mix-blend-multiply dark:mix-blend-normal dark:brightness-95'
          )}
          draggable={false}
        />
      </span>
    </motion.span>
  );
}
