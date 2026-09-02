/**
 * LeadPulse motion tokens — subtle, fast (150–280ms), no bounce spam.
 * MotionConfig reducedMotion="user" (via MotionRoot) respects prefers-reduced-motion.
 */
import type { Transition, Variants } from 'framer-motion';

export const DURATION = {
  fast: 0.15,
  base: 0.2,
  slow: 0.28,
} as const;

export const EASE_OUT = [0.22, 1, 0.36, 1] as const;
export const EASE_IN_OUT = [0.4, 0, 0.2, 1] as const;

export const springPress = {
  type: 'spring' as const,
  stiffness: 520,
  damping: 32,
  mass: 0.6,
};

export const tweenFast: Transition = {
  duration: DURATION.fast,
  ease: EASE_OUT,
};

export const tweenBase: Transition = {
  duration: DURATION.base,
  ease: EASE_OUT,
};

export const tweenSlow: Transition = {
  duration: DURATION.slow,
  ease: EASE_OUT,
};

export const fadeVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

export const pageVariants: Variants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
};

export const staggerContainerVariants: Variants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.02,
    },
  },
};

export const staggerItemVariants: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: {
    opacity: 1,
    y: 0,
    transition: tweenBase,
  },
};

export const overlayVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

/** Bottom-sheet on mobile, centered panel on md+ — soft lift, no bounce. */
export const panelVariants: Variants = {
  initial: { opacity: 0, y: 16, scale: 0.985 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: tweenSlow,
  },
  exit: {
    opacity: 0,
    y: 10,
    scale: 0.985,
    transition: tweenFast,
  },
};

export const sheetVariants: Variants = {
  initial: { opacity: 0, y: '100%' },
  animate: {
    opacity: 1,
    y: 0,
    transition: tweenSlow,
  },
  exit: {
    opacity: 0,
    y: '40%',
    transition: tweenFast,
  },
};

export const drawerVariants: Variants = {
  initial: { x: '-100%' },
  animate: {
    x: 0,
    transition: tweenBase,
  },
  exit: {
    x: '-100%',
    transition: tweenFast,
  },
};

export const toastVariants: Variants = {
  initial: { opacity: 0, y: 12, scale: 0.98 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: tweenBase,
  },
  exit: {
    opacity: 0,
    y: 8,
    scale: 0.98,
    transition: tweenFast,
  },
};

export const pressScale = 0.97;
