import clsx from 'clsx';
import { TIER_COLORS, TIER_LABELS, type LeadSignal } from '@/utils/lead-scoring';

/**
 * Compact deterministic lead-tier chip for Companies/Contacts list rows.
 * Purely derived from CRM fields via calculateLeadScore — no model call, so it
 * renders identically on Vercel, a phone, or the Mac. Null signal (no open
 * active deal) renders nothing rather than a misleading "Cold" badge.
 */
export default function LayaLeadTierBadge({ signal }: { signal: LeadSignal | null }) {
  if (!signal) return null;
  return (
    <span
      title={`Laya lead scoring · hottest open deal: ${signal.deal.title} · ${signal.score}/100`}
      className={clsx(
        'inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded border',
        TIER_COLORS[signal.tier],
      )}
    >
      {TIER_LABELS[signal.tier]}
    </span>
  );
}
