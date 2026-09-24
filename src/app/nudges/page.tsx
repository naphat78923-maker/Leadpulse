'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Deal, Contact, Company } from '@/types/crm';
import { useCrm } from '@/components/CrmProvider';
import LogInteractionModal from '@/components/LogInteractionModal';
import ExitDealModal, { ExitDealPayload } from '@/components/ExitDealModal';
import { Blob } from '@/components/blob';
import NudgeLadderRail from '@/components/NudgeLadderRail';
import { Bell, ChevronRight, MessageCircle, Loader2, PauseCircle, Clock } from 'lucide-react';
import clsx from 'clsx';
import {
  WORKFLOW_BY_ID,
  getWorkflowAction,
  deriveNudge,
  formatDerivedNudgeBadge,
  nudgeColorClass,
  addDaysToDateKey,
  DERIVED_NUDGE_OPTIONS,
  outboundSendCountForDeal,
  SEND_LADDER_RUNGS,
  NUDGE_SEND_LIMIT,
} from '@/utils/deal-workflow';
import { localDateKey } from '@/utils/deal-board';
import * as crm from '@/lib/crm';
import { useToast } from '@/components/ToastProvider';

/**
 * Day-diff helpers pinned to the BUSINESS calendar (Asia/Bangkok), not the
 * device: a phone in another timezone must not disagree with the board about
 * whether a follow-up is 2 or 3 days overdue. Date maths runs on UTC-parsed
 * keys so DST never enters.
 */
function keyToUtc(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  return Date.UTC(y, (m ?? 1) - 1, d ?? 1);
}

function daysBetweenKeys(fromKey: string, toKey: string): number {
  return Math.round((keyToUtc(toKey) - keyToUtc(fromKey)) / 86400000);
}

function daysOverdue(dateStr: string, todayKey: string = localDateKey()): number {
  return Math.max(0, daysBetweenKeys(dateStr, todayKey));
}

function daysUntil(dateStr: string, todayKey: string = localDateKey()): number {
  return daysBetweenKeys(todayKey, dateStr);
}


type Seg = 'overdue' | 'soon' | 'week';

export default function NudgesPage() {
  const router = useRouter();
  const { addToast } = useToast();
  const [seg, setSeg] = useState<Seg>('overdue');
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [logDealId, setLogDealId] = useState<string | undefined>(undefined);
  const [parkDeal, setParkDeal] = useState<Deal | null>(null);
  const { deals: dbDeals, meetings: dbMeetings, loading, addMeeting, refresh, logActivity } = useCrm();

  const deals = dbDeals;
  const meetings = dbMeetings || [];
  const today = localDateKey();

  const buckets = useMemo(() => {
    const overdue: Deal[] = [];
    const soon: Deal[] = [];
    const week: Deal[] = [];

    const todayMs = new Date(today + 'T00:00:00').getTime();

    deals.forEach((deal: Deal) => {
      if (deal.stage === 'closed_won' || deal.stage === 'closed_lost') return;
      if (getWorkflowAction(deal) === 'parked') return;
      if (!deal.followup_date) return;
      const diffDays = Math.round((new Date(deal.followup_date + 'T00:00:00').getTime() - todayMs) / 86400000);
      if (diffDays < 0) overdue.push(deal);
      else if (diffDays <= 2) soon.push(deal);
      else if (diffDays <= 7) week.push(deal);
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

  const snooze = async (deal: Deal, days: number | 'date', customDate?: string) => {
    const next =
      days === 'date' && customDate
        ? customDate
        : addDaysToDateKey(today, typeof days === 'number' ? days : 3);
    const before = { followup_date: deal.followup_date };
    await crm.updateDeal(deal.id, { followup_date: next, nudge_stage: null });
    logActivity({
      type: 'edit',
      entity: 'deal',
      entityId: deal.id,
      label: `⏰ Snoozed`,
      description: `${deal.client} follow-up → ${next}`,
      undoPayload: before,
    });
    addToast(`Snoozed to ${next}`);
    await refresh();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-clay-ink animate-spin mx-auto mb-3" />
          <div className="flex items-center gap-2">
            <Blob state="thinking" size={28} aria-label="" />
            <span className="text-sm text-clay-muted">Loading nudges…</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 h-full overflow-y-auto max-w-3xl">
      <div className="mb-5 md:mb-6 flex items-center gap-3">
        <Blob state="nudge" size={44} aria-label="Nudge reviewer mascot" />
        <div>
          <h1 className="text-xl md:text-2xl font-semibold text-clay-ink tracking-tight flex items-center gap-2">
            <Bell className="w-6 h-6 text-clay-lavender" /> Nudges
          </h1>
          <p className="text-sm text-clay-muted mt-0.5">Due deals + derived badges — not stage config</p>
        </div>
      </div>

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

      {list.length === 0 ? (
        <div className="mt-4 bg-white dark:bg-clay-card rounded-xl border border-clay-hairline p-8 flex flex-col items-center gap-3">
          <Blob state="sleep" size={44} aria-label="Sleepy mascot" />
          <p className="text-sm text-clay-muted">
            {seg === 'overdue' ? 'Nothing overdue. Clean desk.' : seg === 'soon' ? 'No follow-ups due in the next 2 days.' : 'Nothing due in the next 7 days.'}
          </p>
        </div>
      ) : (
        <div className="mt-2 bg-white dark:bg-clay-card rounded-xl border border-clay-hairline divide-y divide-clay-hairline overflow-hidden">
          {list.map(deal => {
            const overdue = seg === 'overdue' && deal.followup_date ? daysOverdue(deal.followup_date) : 0;
            const lane = WORKFLOW_BY_ID[getWorkflowAction(deal)];
            const derived = deriveNudge(deal, today, {
              sendCount: outboundSendCountForDeal(meetings, deal.id),
            });
            return (
              <div key={deal.id} className="px-4 py-3 space-y-2">
                <div className="flex items-center gap-3">
                  {seg === 'overdue' && <span className="w-1 self-stretch shrink-0 rounded-full bg-clay-error" aria-hidden />}
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
                      {derived && (
                        <span className={clsx('text-[10px] font-medium px-1.5 py-0.5 rounded border shrink-0', nudgeColorClass(derived.stage))}>
                          {formatDerivedNudgeBadge(derived)}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-clay-muted truncate mt-0.5">
                      <span className="font-semibold text-clay-body">{lane.shortLabel}</span>
                      {deal.next_action ? ` — ${deal.next_action}` : ''}
                    </p>
                  </div>
                  <button
                    onClick={() => router.push('/deals?deal=' + deal.id)}
                    className="shrink-0 w-9 h-9 rounded-lg bg-clay-lavender text-white flex items-center justify-center hover:opacity-85 transition-opacity"
                    aria-label={`Open ${deal.client}`}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
                {derived && (
                  <div className="pl-0 sm:pl-2 pr-1">
                    <NudgeLadderRail
                      stage={derived.stage}
                      rungs={SEND_LADDER_RUNGS}
                      variant="full"
                    />
                  </div>
                )}
                <div className="flex flex-wrap gap-1.5 pl-0 sm:pl-2">
                  <button
                    onClick={() => handleLog(deal)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-clay-hairline text-clay-ink text-[11px] font-medium min-h-[36px]"
                  >
                    <MessageCircle className="w-3.5 h-3.5" /> Log touch
                  </button>
                  <button
                    onClick={() => snooze(deal, 3)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-clay-hairline text-clay-muted text-[11px] font-medium min-h-[36px]"
                  >
                    <Clock className="w-3.5 h-3.5" /> +3d
                  </button>
                  <button
                    onClick={() => snooze(deal, 7)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-clay-hairline text-clay-muted text-[11px] font-medium min-h-[36px]"
                  >
                    <Clock className="w-3.5 h-3.5" /> +7d
                  </button>
                  <button
                    onClick={() => setParkDeal(deal)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-clay-hairline text-clay-muted text-[11px] font-medium min-h-[36px]"
                  >
                    <PauseCircle className="w-3.5 h-3.5" /> Park
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Read-only ladder — derived from outbound sends, stops at 4 → park */}
      <div className="mt-5 rounded-xl border border-clay-hairline bg-clay-surface px-4 py-3 space-y-3">
        <p className="text-[11px] font-medium text-clay-muted-soft uppercase tracking-wide">Nudge ladder · sends to the client (stops at {NUDGE_SEND_LIMIT} → park)</p>
        <NudgeLadderRail stage="remind" rungs={SEND_LADDER_RUNGS} variant="full" />
        <div className="flex flex-wrap gap-2">
          {DERIVED_NUDGE_OPTIONS.map(opt => (
            <span key={opt.value} className={clsx('text-[11px] font-medium px-2 py-1 rounded-full border', nudgeColorClass(opt.value))}>
              {opt.minSends} send{opt.minSends > 1 ? 's' : ''} {opt.label} {opt.code}
            </span>
          ))}
        </div>
      </div>

      <LogInteractionModal
        isOpen={isLogModalOpen}
        onClose={() => {
          setIsLogModalOpen(false);
          setLogDealId(undefined);
        }}
        onSave={async meeting => {
          await addMeeting(meeting);
        }}
        deals={deals}
        contacts={[] as Contact[]}
        companies={[] as Company[]}
        selectedDealId={logDealId}
      />

      {parkDeal && (
        <ExitDealModal
          deal={parkDeal}
          kind="park"
          onCancel={() => setParkDeal(null)}
          onConfirm={async (payload: ExitDealPayload) => {
            const before = { workflow_action: getWorkflowAction(parkDeal), followup_date: parkDeal.followup_date, park_reason: parkDeal.park_reason };
            await crm.updateDeal(parkDeal.id, {
              workflow_action: 'parked',
              followup_date: payload.followup_date || null,
              park_reason: payload.park_reason || null,
              nudge_stage: null,
            });
            logActivity({
              type: 'edit',
              entity: 'deal',
              entityId: parkDeal.id,
              label: '⏸ Parked',
              description: `${parkDeal.client} parked from nudges`,
              undoPayload: before,
            });
            setParkDeal(null);
            addToast('Deal parked');
            await refresh();
          }}
        />
      )}
    </div>
  );
}
