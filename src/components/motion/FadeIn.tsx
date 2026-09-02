'use client';

import { motion, type HTMLMotionProps } from 'framer-motion';
import { fadeVariants, pageVariants, tweenBase, tweenSlow } from '@/lib/motion';
import clsx from 'clsx';

type FadeInProps = HTMLMotionProps<'div'> & {
  /** Soft page-style enter (opacity + slight y). Default: opacity only. */
  soft?: boolean;
  delay?: number;
};

export default function FadeIn({ soft = false, delay = 0, className, children, ...rest }: FadeInProps) {
  return (
    <motion.div
      variants={soft ? pageVariants : fadeVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ ...(soft ? tweenSlow : tweenBase), delay }}
      className={clsx(className)}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
