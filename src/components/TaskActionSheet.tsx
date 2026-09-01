'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import clsx from 'clsx';
import MascotSprite from './MascotSprite';

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
    mascot: '/assets/mascots/mascot-followup.png',
    accent: 'bg-clay-mint/12',
    accentBorder: 'border-clay-mint/25',
  },
  {
    id: 'new_lead',
    title: 'Add a new lead',
    description: 'Capture a company or contact before you forget.',
    mascot: '/assets/mascots/mascot-outreach.png',
    accent: 'bg-clay-lavender/12',
    accentBorder: 'border-clay-lavender/25',
  },
  {
    id: 'log_touch',
    title: 'Log a touch',
    description: 'Save a call, email, DM, or meeting.',
    mascot: '/assets/mascots/mascot-reply.png',
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
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(open);
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const id = window.requestAnimationFrame(() => setVisible(true));
      triggerRef.current = document.activeElement as HTMLElement;
      const previouslyFocused = triggerRef.current;
      return () => {
        window.cancelAnimationFrame(id);
        previouslyFocused?.focus?.();
      };
    }
    setVisible(false);
    const timeout = window.setTimeout(() => setMounted(false), 220);
    return () => window.clearTimeout(timeout);
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

  if (!mounted) return null;

  const handleAction = (id: typeof actions[number]['id']) => {
    if (id === 'follow_up') onFollowUp();
    if (id === 'new_lead') onNewLead();
    if (id === 'log_touch') onLogTouch();
  };

  return (
    <div
      className={clsx(
        'fixed inset-0 z-50 flex items-end md:items-center justify-center',
        visible ? 'pointer-events-auto' : 'pointer-events-none'
      )}
      aria-hidden={!open}
    >
      <div
        className={clsx(
          'absolute inset-0 bg-black/50 transition-opacity duration-160',
          visible ? 'opacity-100' : 'opacity-0'
        )}
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Choose your next sales action"
        className={clsx(
          'relative w-full md:max-w-[520px] bg-white dark:bg-clay-card rounded-t-2xl md:rounded-2xl shadow-xl transition-all duration-200 ease-out',
          visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        )}
      >
        <div className="p-6 md:p-8 pb-8 md:pb-10">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-clay-muted active:opacity-70 rounded-lg"
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
              <button
                key={action.id}
                type="button"
                onClick={() => handleAction(action.id)}
                className={clsx(
                  'w-full flex items-center gap-4 p-4 rounded-[18px] border text-left transition-transform active:scale-[0.985] focus:outline-none focus-visible:ring-2 focus-visible:ring-clay-ink',
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
                  <MascotSprite
                    src={action.mascot}
                    size={92}
                    alt=""
                  />
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
