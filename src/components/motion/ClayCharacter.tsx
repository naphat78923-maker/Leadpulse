'use client';

import dynamic from 'next/dynamic';
import Image from 'next/image';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { LottieHandle } from 'lottie-react';
import { motion } from 'framer-motion';
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

/** Below this rendered size, skip Lottie mount — WebP poster only. */
const MIN_LOTTIE_PX = 24;
const ENTER_EASE = [0.22, 1, 0.36, 1] as const;
const PRESS_OUT_S = 0.09;
const PRESS_IN_S = 0.14;

/** Live prefers-reduced-motion via matchMedia (not mount-only). */
function usePrefersReducedMotion() {
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduce(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  return reduce;
}

export type ClayCharacterProps = {
  kind: ClayKind;
  /** Display size in px (posters are 512² WebP; Lottie is 768²). */
  size?: number;
  className?: string;
  /** Force pressed (scale + WebP poster) visual — e.g. controlled press state. */
  pressed?: boolean;
  /** Skip enter animation when already in view. */
  instant?: boolean;
  /** Decorative shelf frame like MascotSprite (default true for ≥28px). */
  framed?: boolean;
  alt?: string;
};

/**
 * Animation Bot clay character — Lottie idle when motion OK + size ≥24px
 * (fetched by URL), WebP poster for reduced-motion / tiny / press crossfade.
 * Enter 220ms ease [0.22,1,0.36,1] opacity+scale 0.94→1;
 * press: pause + lottie opacity→0 in 90ms, scale 0.96 (≥32) / 0.975 (<32);
 * release 140ms + play.
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
  const reduce = usePrefersReducedMotion();
  const lottieRef = useRef<LottieHandle>(null);
  const [holding, setHolding] = useState(false);
  const [entered, setEntered] = useState(instant || false);
  const isPressed = pressed || holding;

  const mountLottie = !reduce && size >= MIN_LOTTIE_PX;
  const showFrame = framed ?? size >= 28;
  const pressScale = size >= 32 ? 0.96 : 0.975;
  const blend = showFrame
    ? 'mix-blend-multiply dark:mix-blend-normal dark:brightness-95'
    : undefined;

  const endPress = useCallback(() => {
    setHolding((was) => {
      if (was) lottieRef.current?.play();
      return false;
    });
  }, []);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLSpanElement>) => {
      if (reduce || e.button !== 0) return;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      setHolding(true);
      lottieRef.current?.pause();
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

  // Controlled `pressed` prop: pause/play Lottie to match.
  useEffect(() => {
    if (!mountLottie) return;
    if (pressed) lottieRef.current?.pause();
    else if (!holding) lottieRef.current?.play();
  }, [pressed, holding, mountLottie]);

  // Enter once (220ms), then press 90ms down / 140ms up — transform+opacity only.
  const motionTransition = reduce
    ? { duration: 0.01 }
    : isPressed
      ? { duration: PRESS_OUT_S, ease: 'easeOut' as const }
      : entered
        ? { duration: PRESS_IN_S, ease: 'easeOut' as const }
        : { duration: 0.22, ease: ENTER_EASE };

  return (
    <motion.span
      className={clsx(
        'inline-flex shrink-0 items-center justify-center select-none touch-manipulation',
        showFrame &&
          'overflow-hidden rounded-lg border border-clay-hairline/70 bg-[#f3efe7] dark:bg-[#2b2721] dark:border-clay-hairline/50 shadow-[0_4px_10px_-3px_rgba(0,0,0,0.28)] dark:shadow-[0_5px_12px_-4px_rgba(0,0,0,0.6)]',
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
        scale: isPressed && !reduce ? pressScale : 1,
      }}
      transition={{
        opacity: motionTransition,
        scale: motionTransition,
      }}
      onAnimationComplete={() => setEntered(true)}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={endPress}
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
            mountLottie && 'absolute inset-0'
          )}
          draggable={false}
        />
        {mountLottie && (
          <Lottie
            key={kind}
            lottieRef={lottieRef}
            src={LOTTIE_URL[kind]}
            loop
            autoplay
            className={clsx('absolute inset-0 w-full h-full', blend)}
            style={{
              width: '100%',
              height: '100%',
              opacity: isPressed ? 0 : 1,
              transition: reduce
                ? 'none'
                : `opacity ${isPressed ? PRESS_OUT_S : PRESS_IN_S}s ease-out`,
              willChange: 'opacity',
              pointerEvents: 'none',
            }}
            rendererSettings={{ preserveAspectRatio: 'xMidYMid slice' }}
          />
        )}
      </span>
    </motion.span>
  );
}
