'use client';

import dynamic from 'next/dynamic';
import Image from 'next/image';
import { motion, useReducedMotion } from 'framer-motion';
import clsx from 'clsx';

const Lottie = dynamic(
  () => import('lottie-react').then((m) => m.Lottie),
  { ssr: false }
);

export type ClayKind = 'call' | 'message' | 'package' | 'search' | 'pause' | 'success';

const POSTER: Record<ClayKind, string> = {
  call: '/assets/clay/call.webp',
  message: '/assets/clay/message.webp',
  package: '/assets/clay/package.webp',
  search: '/assets/clay/search.webp',
  pause: '/assets/clay/pause.webp',
  success: '/assets/clay/success.webp',
};

const LOTTIE_URL: Record<ClayKind, string> = {
  call: '/assets/clay/lottie/call.json',
  message: '/assets/clay/lottie/message.json',
  package: '/assets/clay/lottie/package.json',
  search: '/assets/clay/lottie/search.json',
  pause: '/assets/clay/lottie/pause.json',
  success: '/assets/clay/lottie/success.json',
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
  /** Display size in px (posters are 512² WebP; Lottie is 768²). */
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
 * Animation Bot clay character — Lottie idle when motion OK (fetched by URL,
 * not bundled), WebP poster for reduced-motion / loading / whileTap base.
 * Enter 220ms ease [0.22,1,0.36,1]; press scale 0.96 / 150ms.
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
  // Poster when reduced-motion or controlled press; Lottie idle otherwise.
  const showLottie = !reduce && !pressed;
  const showFrame = framed ?? size >= 28;
  const blend = showFrame
    ? 'mix-blend-multiply dark:mix-blend-normal dark:brightness-95'
    : undefined;

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
      <span className="relative block w-full h-full overflow-hidden">
        <Image
          src={POSTER[kind]}
          alt={alt ?? ALT[kind]}
          width={512}
          height={512}
          className={clsx(
            'w-full h-full object-cover',
            blend,
            showLottie && 'absolute inset-0'
          )}
          draggable={false}
        />
        {showLottie && (
          <Lottie
            key={kind}
            src={LOTTIE_URL[kind]}
            loop
            autoplay
            className={clsx('absolute inset-0 w-full h-full', blend)}
            style={{ width: '100%', height: '100%' }}
            rendererSettings={{ preserveAspectRatio: 'xMidYMid slice' }}
          />
        )}
      </span>
    </motion.span>
  );
}
