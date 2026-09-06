'use client';

import { forwardRef } from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { pressScale, springPress } from '@/lib/motion';
import clsx from 'clsx';

type PressableProps = HTMLMotionProps<'button'> & {
  /** Disable press scale (still forwards button props). */
  noPress?: boolean;
};

/**
 * Button with tactile active:scale spring. Respects reduced motion via MotionConfig.
 */
const Pressable = forwardRef<HTMLButtonElement, PressableProps>(
  function Pressable({ className, noPress, children, disabled, ...rest }, ref) {
    return (
      <motion.button
        ref={ref}
        type="button"
        disabled={disabled}
        whileTap={noPress || disabled ? undefined : { scale: pressScale }}
        transition={springPress}
        className={clsx('touch-manipulation', className)}
        {...rest}
      >
        {children}
      </motion.button>
    );
  }
);

export default Pressable;
