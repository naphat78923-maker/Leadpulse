'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Deal, STAGE_LABELS, Contact, Company } from '@/types/crm';
import { useCrm } from '@/components/CrmProvider';
import { deals as dataDeals } from '@/data/crmData';
import LogInteractionModal from '@/components/LogInteractionModal';
import MascotSprite from '@/components/MascotSprite';
import { Bell, ChevronRight, MessageCircle, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import { WORKFLOW_LANES, getWorkflowAction, nudgeLabel, nudgeColorClass } from '@/utils/deal-workflow';

// One-line action verbs for each workflow lane (matches Today's queue).
const ACTION_VERBS: Record<string, string> = {
  outreach: 'Send outreach',
  reply: 'Reply',
  sample: 'Send sample',
  testing: 'Confirm test',
  reschedule: 'Reschedule',
  parked: 'Revisit',
  success: 'Congratulate',
};

// Nudge stage → days (kept in sync with deal-workflow NUDGE_OPTIONS).
const NUDGE_DAYS: Record<string, number> = {
  warm: 3,
  remind: 7,
  firm: 14,
  parking: 21,
};

function daysOverdue(dateStr: string): number {
  const d = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((now.getTime() - d.getTime()) / 86400000));
}

function daysUntil(dateStr: string): number {
  const d = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - now.getTime()) / 86400000);
}

type Seg = 'overdue' | 'soon' | 'week';

export default function NudgesPage() {
  const router = useRouter();
  const [seg, setSeg] = useState<Seg>('overdue');
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [logDealId, setLogDealId] = useState<string | undefined>(undefined);
  const { deals: dbDeals, loading, addMeeting } = useCrm();

  const deals = dbDeals.length > 0 ? dbDeals : (dataDeals as Deal[]);
  const today = new Date();

  const buckets = useMemo(() => {
    const overdue: Deal[] = [];
    const soon: Deal[] = [];   // due today + next 2 days
    const week: Deal[] = [];   // 3–7 days out

    const todayMid = new Date();
    todayMid.setHours(0, 0, 0, 0);
    const todayMs = todayMid.getTime();

    deals.forEach((deal: Deal) => {
      if (deal.stage === 'closed_won' || deal.stage === 'closed_lost') return;
      if (!deal.followup_date) return; // Needs-attention lives on Today, not here
      // Date-only diff so the windows don't drift with time-of-day.
      const diffDays = Math.round((new Date(deal.followup_date + 'T00:00:00').getTime() - todayMs) / 86400000);
      if (diffDays < 0) overdue.push(deal);             // past = overdue
      else if (diffDays <= 2) soon.push(deal);          // today (0) + 1–2 days = due soon
      else if (diffDays <= 7) week.push(deal);          // 3–7 days = this week
    });
    const byDate = (a: Deal, b: Deal) => (a.followup_date || '').localeCompare(b.followup_date || '');
    overdue.sort(byDate);
    soon.sort(byDate);
    week.sort(byDate);
    return { overdue, soon, week };
  }, [deals, today]);

  const segCounts = { overdue: buckets.overdue.length, soon: buckets.soon.length, week: buckets.week.length };
  const list = buckets[seg];

  const handleLog = (deal: Deal) => {
    setLogDealId(deal.id);
    setIsLogModalOpen(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-clay-ink animate-spin mx-auto mb-3" />
          <p className="text-sm text-clay-muted">Loading nudges...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 h-full overflow-y-auto max-w-3xl">
      {/* Header */}
      <div className="mb-5 md:mb-6 flex items-center gap-3">
        <MascotSprite src="/assets/mascots/mascot-followup.png" size={44} alt="Nudge reviewer mascot" />
        <div>
          <h1 className="text-xl md:text-2xl font-semibold text-clay-ink tracking-tight flex items-center gap-2">
            <Bell className="w-6 h-6 text-clay-lavender" /> Nudges
          </h1>
          <p className="text-sm text-clay-muted mt-0.5">Follow-ups that need your attention</p>
        </div>
      </div>

      {/* At-a-glance — day & week commitments before picking a segment */}
      <div className="mb-4 grid grid-cols-3 gap-2">
        <button
          onClick={() => setSeg('overdue')}
          className={clsx(
            'rounded-xl border px-3 py-3 text-left transition-colors min-h-[64px] flex flex-col justify-center',
            seg === 'overdue' ? 'bg-clay-error/10 border-clay-error/30' : 'bg-white dark:bg-clay-card border-clay-hairline'
          )}
        >
          <span className="text-lg font-semibold leading-none text-clay-error">{segCounts.overdue}</span>
          <span className="text-[11px] text-clay-muted mt-1">Overdue</span>
        </button>
        <button
          onClick={() => setSeg('soon')}
          className={clsx(
            'rounded-xl border px-3 py-3 text-left transition-colors min-h-[64px] flex flex-col justify-center',
            seg === 'soon' ? 'bg-clay-ochre/10 border-clay-ochre/30' : 'bg-white dark:bg-clay-card border-clay-hairline'
          )}
        >
          <span className="text-lg font-semibold leading-none text-clay-ochre">{segCounts.soon}</span>
          <span className="text-[11px] text-clay-muted mt-1">Due in 2 days</span>
        </button>
        <button
          onClick={() => setSeg('week')}
          className={clsx(
            'rounded-xl border px-3 py-3 text-left transition-colors min-h-[64px] flex flex-col justify-center',
            seg === 'week' ? 'bg-clay-lavender/10 border-clay-lavender/40' : 'bg-white dark:bg-clay-card border-clay-hairline'
          )}
        >
          <span className="text-lg font-semibold leading-none text-clay-lavender">{segCounts.week}</span>
          <span className="text-[11px] text-clay-muted mt-1">This week</span>
        </button>
      </div>

      {/* Segment tabs — mobile-first: one list at a time */}
      <div className="-mx-4 px-4 flex gap-2 overflow-x-auto pb-3 snap-x md:mx-0 md:px-0 md:flex-wrap">
        {([
          { key: 'overdue', label: 'Overdue', count: segCounts.overdue, tone: 'error' },
          { key: 'soon', label: 'Due soon', count: segCounts.soon, value: segCounts.soon },
          { key: 'week', label: 'This week', count: segCounts.week },
        ] as const).map(s => (
          <button
            key={s.key}
            onClick={() => setSeg(s.key)}
            className={clsx(
              'snap-start shrink-0 flex items-center gap-1.5 rounded-xl border px-3.5 py-2.5 text-sm font-medium min-h-[44px] transition-colors',
              seg === s.key
                ? 'bg-clay-ink text-clay-canvas border-clay-ink'
                : 'bg-white dark:bg-clay-card text-clay-ink border-clay-hairline'
            )}
          >
            <span>{s.label}</span>
            <span className={clsx('text-xs', seg === s.key ? 'text-clay-canvas/70' : 'text-clay-muted')}>{s.count}</span>
          </button>
        ))}
      </div>

      {/* List */}
      {list.length === 0 ? (
        <div className="mt-4 bg-white dark:bg-clay-card rounded-xl border border-clay-hairline p-8 flex flex-col items-center gap-3">
          <MascotSprite src="/assets/mascots/mascot-parked.png" size={44} alt="Sleepy mascot" />
          <p className="text-sm text-clay-muted">
            {seg === 'overdue' ? 'Nothing overdue. Clean desk.' : seg === 'soon' ? 'No follow-ups due in the next 2 days.' : 'Nothing due in the next 7 days.'}
          </p>
        </div>
      ) : (
        <div className="mt-2 bg-white dark:bg-clay-card rounded-xl border border-clay-hairline divide-y divide-clay-hairline overflow-hidden">
          {list.map(deal => {
            const overdue = seg === 'overdue' && deal.followup_date ? daysOverdue(deal.followup_date) : 0;
            const lane = WORKFLOW_LANES.find(l => l.id === getWorkflowAction(deal))!;
            const verb = ACTION_VERBS[getWorkflowAction(deal)] || 'Follow up';
            const nudgeChip = deal.nudge_stage ? nudgeLabel(deal.nudge_stage) : null;
            return (
              <div key={deal.id} className="px-4 py-3 flex items-center gap-3 group">
                {/* Left-edge urgency marker — the clay stamp, not a red box */}
                {seg === 'overdue' && (
                  <span className="w-1 self-stretch shrink-0 rounded-full bg-clay-error" aria-hidden />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-sm font-medium text-clay-ink truncate">{deal.client}</p>
                    {seg === 'overdue' && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-clay-error/10 text-clay-error shrink-0">
                        {overdue}d late
                      </span>
                    )}
                    {seg === 'soon' && deal.followup_date && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-clay-ochre/15 text-clay-ochre shrink-0">
                        {daysUntil(deal.followup_date) === 0 ? 'Due today' : `in ${daysUntil(deal.followup_date)}d`}
                      </span>
                    )}
                    {nudgeChip && (
                      <span className={clsx('text-[10px] font-medium px-1.5 py-0.5 rounded border shrink-0', nudgeColorClass(deal.nudge_stage))}>
                        {nudgeChip}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-clay-muted truncate mt-0.5">
                    <span className="font-semibold text-clay-body">{verb}</span>
                    {deal.next_action ? ` — ${deal.next_action}` : ` · ${lane.label.toLowerCase()}`}
                  </p>
                </div>
                <button
                  onClick={() => handleLog(deal)}
                  className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-clay-hairline text-clay-ink text-xs font-medium hover:border-clay-lavender hover:text-clay-lavender transition-colors min-h-[44px]"
                  aria-label={`Log follow-up for ${deal.client}`}
                >
                  <MessageCircle className="w-4 h-4" />
                  <span className="hidden sm:inline">Log</span>
                </button>
                <button
                  onClick={() => router.push('/deals?deal=' + deal.id)}
                  className="shrink-0 w-9 h-9 rounded-lg bg-clay-lavender text-white flex items-center justify-center hover:opacity-85 transition-opacity"
                  aria-label={`Open ${deal.client}`}
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Nudge-stage legend — explains the modeled nudge field */}
      <div className="mt-5 rounded-xl border border-clay-hairline bg-clay-surface px-4 py-3">
        <p className="text-[11px] font-medium text-clay-muted-soft uppercase tracking-wide mb-2">Nudge levels</p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(NUDGE_DAYS).map(([stage, days]) => (
            <span key={stage} className={clsx('text-[11px] font-medium px-2 py-1 rounded-full border', nudgeColorClass(stage as any))}>
              {nudgeLabel(stage as any)} · {days}d
            </span>
          ))}
        </div>
      </div>

      <LogInteractionModal
        isOpen={isLogModalOpen}
        onClose={() => { setIsLogModalOpen(false); setLogDealId(undefined); }}
        onSave={async (meeting) => { await addMeeting(meeting); }}
        deals={deals}
        contacts={[] as Contact[]}
        companies={[] as Company[]}
        selectedDealId={logDealId}
      />
    </div>
  );
}
