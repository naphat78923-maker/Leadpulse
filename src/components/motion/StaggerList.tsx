'use client';

import { motion, type HTMLMotionProps } from 'framer-motion';
import { staggerContainerVariants, staggerItemVariants } from '@/lib/motion';
import clsx from 'clsx';

type StaggerListProps = HTMLMotionProps<'div'> & {
  /** Stagger between children in seconds (default 0.05). Pulse row uses 0.035. */
  stagger?: number;
};

export function StaggerList({
  className,
  children,
  stagger,
  ...rest
}: StaggerListProps) {
  const variants =
    stagger == null
      ? staggerContainerVariants
      : {
          initial: {},
          animate: {
            transition: {
              staggerChildren: stagger,
              delayChildren: 0.02,
            },
          },
        };

  return (
    <motion.div
      variants={variants}
      initial="initial"
      animate="animate"
      className={clsx(className)}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

type StaggerItemProps = HTMLMotionProps<'div'>;

export function StaggerItem({ className, children, ...rest }: StaggerItemProps) {
  return (
    <motion.div variants={staggerItemVariants} className={clsx(className)} {...rest}>
      {children}
    </motion.div>
  );
}
