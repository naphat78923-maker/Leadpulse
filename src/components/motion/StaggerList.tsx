'use client';

import { motion, type HTMLMotionProps } from 'framer-motion';
import { staggerContainerVariants, staggerItemVariants } from '@/lib/motion';
import clsx from 'clsx';

type StaggerListProps = HTMLMotionProps<'div'>;

export function StaggerList({ className, children, ...rest }: StaggerListProps) {
  return (
    <motion.div
      variants={staggerContainerVariants}
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
