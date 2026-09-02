'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { overlayVariants, panelVariants, tweenBase, tweenSlow } from '@/lib/motion';
import clsx from 'clsx';

interface ModalShellProps {
  open: boolean;
  onClose?: () => void;
  /** Extra classes on the fixed backdrop flex container. */
  className?: string;
  /** Panel surface classes (bg, rounding, max-width, scroll). */
  panelClassName?: string;
  /** z-index utility, default z-50. */
  zClassName?: string;
  children: React.ReactNode;
  /** When true, backdrop click does nothing (e.g. while saving). */
  lockDismiss?: boolean;
}

/**
 * Shared modal overlay + panel with enter/exit. Parent should keep this mounted
 * (pass open) so AnimatePresence can play exit — or wrap with AnimatePresence yourself.
 */
export default function ModalShell({
  open,
  onClose,
  className,
  panelClassName,
  zClassName = 'z-50',
  children,
  lockDismiss,
}: ModalShellProps) {
  return (
    <AnimatePresence>
      {open && (
        <div
          className={clsx(
            'fixed inset-0 flex items-end md:items-center justify-center p-0 md:p-4',
            zClassName,
            className
          )}
        >
          <motion.div
            key="overlay"
            className="absolute inset-0 bg-black/50"
            variants={overlayVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={tweenBase}
            onClick={lockDismiss ? undefined : onClose}
            aria-hidden
          />
          <motion.div
            key="panel"
            role="dialog"
            aria-modal="true"
            className={clsx('relative w-full', panelClassName)}
            variants={panelVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={tweenSlow}
            onClick={(e) => e.stopPropagation()}
          >
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
