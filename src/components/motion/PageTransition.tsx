'use client';

import { motion } from 'framer-motion';
import { pageVariants, tweenSlow } from '@/lib/motion';
import clsx from 'clsx';

/**
 * Soft route/view enter — wrap page content. Fast, no flashy exit (App Router remounts).
 */
export default function PageTransition({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      transition={tweenSlow}
      className={clsx(className)}
    >
      {children}
    </motion.div>
  );
}
