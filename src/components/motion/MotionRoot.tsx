'use client';

import { MotionConfig } from 'framer-motion';

/**
 * Global motion config — honors prefers-reduced-motion via reducedMotion="user".
 */
export default function MotionRoot({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}>
      {children}
    </MotionConfig>
  );
}
