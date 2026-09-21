'use client';

import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import clsx from 'clsx';
import { Blob } from '@/components/blob';
import { overlayVariants, panelVariants, pressScale, springPress, tweenBase, tweenSlow } from '@/lib/motion';

interface TaskActionSheetProps {
  open: boolean;
  onClose: () => void;
  onFollowUp: () => void;
  onNewLead: () => void;
  onLogTouch: () => void;
}

const actions = [
  {
    id: 'follow_up',
    title: 'Follow up with someone',
    description: 'See who needs a touch today.',
    blobState: 'nudge' as const,
    accent: 'bg-clay-mint/12',
    accentBorder: 'border-clay-mint/25',
  },
  {
    id: 'new_lead',
    title: 'Add a new lead',
    description: 'Capture a company or contact before you forget.',
    blobState: 'joy' as const,
    accent: 'bg-clay-lavender/12',
    accentBorder: 'border-clay-lavender/25',
  },
  {
    id: 'log_touch',
    title: 'Log a touch',
    description: 'Save a call, email, DM, or meeting.',
    blobState: 'thinking' as const,
    accent: 'bg-clay-ochre/12',
    accentBorder: 'border-clay-ochre/25',
  },
] as const;

export default function TaskActionSheet({
  open,
  onClose,
  onFollowUp,
  onNewLead,
  onLogTouch,
}: TaskActionSheetProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement as HTMLElement;
      const previouslyFocused = triggerRef.current;
      return () => {
        previouslyFocused?.focus?.();
      };
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open && dialogRef.current) {
      const firstButton = dialogRef.current.querySelector<HTMLElement>('button:not([aria-disabled="true"])');
      firstButton?.focus();
    }
  }, [open]);

  const handleAction = (id: typeof actions[number]['id']) => {
    if (id === 'follow_up') onFollowUp();
    if (id === 'new_lead') onNewLead();
    if (id === 'log_touch') onLogTouch();
  };

  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end md:items-center justify-center pointer-events-auto"
          aria-hidden={!open}
        >
          <motion.div
            className="absolute inset-0 bg-black/50"
            variants={overlayVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={tweenBase}
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Choose your next sales action"
            className="relative w-full md:max-w-[520px] bg-white dark:bg-clay-card rounded-t-2xl md:rounded-2xl shadow-xl"
            variants={panelVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={tweenSlow}
          >
            <div className="p-6 md:p-8 pb-8 md:pb-10">
              <button
                onClick={onClose}
                className="absolute top-4 right-4 p-2 text-clay-muted active:opacity-70 rounded-lg motion-press"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>

              <p className="font-mono text-[10px] font-semibold tracking-[0.12em] text-clay-muted uppercase mb-3">
                Start here
              </p>
              <h2 className="font-display text-[32px] leading-[1.15] tracking-[-0.025em] text-clay-ink mb-2">
                What do you want to do?
              </h2>
              <p className="text-sm text-clay-body mb-7">
                Choose one task and LeadPulse will take you straight there.
              </p>

              <div className="space-y-3">
                {actions.map((action) => (
                  <motion.button
                    key={action.id}
                    type="button"
                    onClick={() => handleAction(action.id)}
                    whileTap={{ scale: pressScale }}
                    transition={springPress}
                    className={clsx(
                      'w-full flex items-center gap-4 p-4 rounded-[18px] border text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-clay-ink',
                      action.accentBorder,
                      'bg-white dark:bg-clay-card'
                    )}
                    aria-label={`${action.title}. ${action.description}`}
                  >
                    <span className={clsx('flex-1 min-w-0')}>
                      <span className="block text-[16px] font-bold leading-[1.25] text-clay-ink">
                        {action.title}
                      </span>
                      <span className="block text-[14px] leading-[1.35] text-clay-body mt-1">
                        {action.description}
                      </span>
                    </span>
                    <span
                      className={clsx(
                        'shrink-0 w-[92px] h-[92px] rounded-xl flex items-center justify-center',
                        action.accent
                      )}
                    >
                      <Blob
                        state={action.blobState}
                        size={80}
                        aria-label=""
                      />
                    </span>
                  </motion.button>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
