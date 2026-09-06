'use client';

import { useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { Deal, Contact, Meeting } from '@/types/crm';
import { useCrm } from '@/components/CrmProvider';
import { deals as dataDeals, contacts as dataContacts, companies as dataCompanies, meetings as dataMeetings } from '@/data/crmData';
import CreateModal from '@/components/CreateModal';
import LogInteractionModal from '@/components/LogInteractionModal';
import MascotSprite from '@/components/MascotSprite';
import NudgeLadderRail from '@/components/NudgeLadderRail';
import TaskActionSheet from '@/components/TaskActionSheet';
import { Plus, ChevronRight, MessageCircle, Phone, Mail, Users, Package, Bell, Clock } from 'lucide-react';
import { WORKFLOW_BY_ID, getWorkflowAction, deriveNudge, formatDerivedNudgeBadge, nudgeColorClass, addDaysToDateKey, lastHumanTouchDateForDeal } from '@/utils/deal-workflow';
import { dealNeedsReview } from '@/utils/deal-board';
import { dealClientName } from '@/utils/dealLabel';
import { formatBaht, bangkokDateKey, formatBangkokWeekdayDate, bangkokHour } from '@/utils/format';
import * as crm from '@/lib/crm';
import { useToast } from '@/components/ToastProvider';
import clsx from 'clsx';

const ACTION_VERBS: Record<string, string> = {
  outreach: 'Send outreach',
  reply: 'Waiting on reply',
  sample: 'Send sample',
  testing: 'Confirm test',
  reschedule: 'Follow up',
  parked: 'Revisit',
  success: 'Won',
};

const PULSE_ITEMS = [
  { key: 'call', label: 'Calls', icon: <Phone className="w-3.5 h-3.5 text-clay-teal" /> },
  { key: 'email', label: 'Emails', icon: <Mail className="w-3.5 h-3.5 text-clay-pink" /> },
  { key: 'dm', label: 'DMs', icon: <MessageCircle className="w-3.5 h-3.5 text-clay-lavender" /> },
  { key: 'meeting', label: 'Meetings', icon: <Users className="w-3.5 h-3.5 text-clay-lavender" /> },
  { key: 'sample_sent', label: 'Samples', icon: <Package className="w-3.5 h-3.5 text-clay-ochre" /> },
  { key: 'nudge', label: 'Nudges', icon: <Bell className="w-3.5 h-3.5 text-clay-coral" /> },
];

function daysBetween(a: string, b: string): number {
  const msA = new Date(`${a}T12:00:00`).getTime();
  const msB = new Date(`${b}T12:00:00`).getTime();
  return Math.round((msB - msA) / 86400000);
}

function whyNowLine(deal: Deal, kind: 'overdue' | 'today' | 'attention', todayKey: string): string {
  const lane = WORKFLOW_BY_ID[getWorkflowAction(deal)];
  const nudge = deriveNudge(deal, todayKey);
  if (kind === 'overdue' && deal.followup_date) {
    const days = Math.abs(daysBetween(deal.followup_date, todayKey));
    if (nudge) return `${days}d overdue · ${formatDerivedNudgeBadge(nudge)}`;
    return `${days} day${days === 1 ? '' : 's'} overdue · ${lane?.shortLabel || 'Follow-up'}`;
  }
  if (kind === 'today') {
    if (dealNeedsReview(deal)) return 'Due today · missing lane details';
    if (deal.priority === 'high') return 'High-priority follow-up due today';
    return `Due today · ${lane?.shortLabel || 'Follow-up'}`;
  }
  if (dealNeedsReview(deal)) return 'Needs review · missing required lane details';
  return `No follow-up date · ${lane?.shortLabel || 'Set next move'}`;
}

/** Clamp hero why-now to ~2 lines; expand on demand so next_action never blows the card. */
function WhyNowCopy({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const longEnough = text.length > 90;
  return (
    <div className="text-sm text-clay-muted">
      <p className={clsx(!expanded && 'line-clamp-2')}>{text}</p>
      {longEnough && (
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="mt-1 text-[11px] font-semibold text-clay-lavender hover:text-clay-ink transition-colors"
        >
          {expanded ? 'Show less' : 'More'}
        </button>
      )}
    </div>
  );
}

function preferredChannel(deal: Deal, contacts: Contact[], meetings: Meeting[]): string | null {
  // Human channels only: LINE / IG / WhatsApp / phone — not email.
  const linked = (deal.contact_ids || [])
    .map(id => contacts.find(c => c.id === id))
    .filter((c): c is Contact => Boolean(c));
  const primary = linked[0];
  if (primary?.line) return 'LINE';
  if (primary?.phone) return 'Call';

  const touches = meetings
    .filter(m => m.deal_id === deal.id && (m.type === 'dm' || m.type === 'call' || m.type === 'meeting'))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if (touches[0]?.type === 'dm') return 'DM';
  if (touches[0]?.type === 'call') return 'Call';
  if (touches[0]?.type === 'meeting') return 'Meet';
  return null;
}

export default function TodayPage() {
  const router = useRouter();
  const { addToast } = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [logDealId, setLogDealId] = useState<string | undefined>(undefined);
  const [startOpen, setStartOpen] = useState(false);
  const [snoozing, setSnoozing] = useState(false);
  const startButtonRef = useRef<HTMLButtonElement>(null);
  const { deals: dbDeals, contacts: dbContacts, companies: dbCompanies, meetings: dbMeetings, loading, createDeal, addMeeting, refresh, logActivity } = useCrm();

  // Never paint mock CRM while loading — that caused hero flicker (April's Bakery → real deal).
  // After load, keep the offline mock fallback only when the DB truly returned empty.
  const deals = dbDeals.length > 0 ? dbDeals : loading ? [] : (dataDeals as Deal[]);
  const contacts = dbContacts.length > 0 ? dbContacts : loading ? [] : (dataContacts as Contact[]);
  const companies = dbCompanies.length > 0 ? dbCompanies : loading ? [] : (dataCompanies as any);
  const meetings = dbMeetings.length > 0 ? dbMeetings : loading ? [] : (dataMeetings as Meeting[]);

  const todayKey = bangkokDateKey();
  const headerDate = formatBangkokWeekdayDate();
  const hour = bangkokHour();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const dealFollowUps = useMemo(() => {
    const needsAttention: Deal[] = [];
    const overdue: Deal[] = [];
    const dueToday: Deal[] = [];
    const thisWeek: Deal[] = [];

    deals.forEach((deal: Deal) => {
      if (deal.stage === 'closed_won' || deal.stage === 'closed_lost') return;
      if (getWorkflowAction(deal) === 'parked') return;
      if (!deal.followup_date) {
        needsAttention.push(deal);
        return;
      }
      const diffDays = daysBetween(todayKey, deal.followup_date);
      if (diffDays < 0) overdue.push(deal);
      else if (diffDays === 0) dueToday.push(deal);
      else if (diffDays <= 7) thisWeek.push(deal);
    });

    const byDateThenId = (a: Deal, b: Deal) =>
      (a.followup_date || '').localeCompare(b.followup_date || '') || a.id.localeCompare(b.id);
    overdue.sort(byDateThenId);
    dueToday.sort(byDateThenId);
    thisWeek.sort(byDateThenId);
    needsAttention.sort((a, b) => a.id.localeCompare(b.id));

    return { needsAttention, overdue, dueToday, thisWeek };
  }, [deals, todayKey]);

  const needsReviewCount = useMemo(
    () => deals.filter((d: Deal) => d.stage !== 'closed_won' && d.stage !== 'closed_lost' && dealNeedsReview(d)).length,
    [deals]
  );
  const wonCount = useMemo(() => deals.filter((d: Deal) => d.stage === 'closed_won').length, [deals]);

  const priorityRank: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const sortedOverdue = dealFollowUps.overdue;

  const startHere = useMemo(() => {
    const pool = [
      ...sortedOverdue.map(d => ({ d, kind: 'overdue' as const, rank: 0 })),
      ...dealFollowUps.dueToday.map(d => ({ d, kind: 'today' as const, rank: 1 })),
      ...dealFollowUps.needsAttention.map(d => ({ d, kind: 'attention' as const, rank: 2 })),
    ];
    if (!pool.length) return null;
    pool.sort(
      (a, b) =>
        a.rank - b.rank ||
        (priorityRank[a.d.priority || 'medium'] ?? 1) - (priorityRank[b.d.priority || 'medium'] ?? 1) ||
        (a.d.followup_date || '').localeCompare(b.d.followup_date || '') ||
        a.d.id.localeCompare(b.d.id)
    );
    return { deal: pool[0].d, kind: pool[0].kind };
  }, [sortedOverdue, dealFollowUps.dueToday, dealFollowUps.needsAttention]);

  const upNext = useMemo(() => {
    const items: { deal: Deal; kind: 'overdue' | 'today' | 'attention' }[] = [
      ...sortedOverdue.map(d => ({ deal: d, kind: 'overdue' as const })),
      ...dealFollowUps.dueToday.map(d => ({ deal: d, kind: 'today' as const })),
      ...dealFollowUps.needsAttention.map(d => ({ deal: d, kind: 'attention' as const })),
    ];
    const heroId = startHere?.deal.id;
    return items.filter(i => i.deal.id !== heroId).slice(0, 5);
  }, [sortedOverdue, dealFollowUps.dueToday, dealFollowUps.needsAttention, startHere]);

  // Pulse: last 7 Bangkok days (secondary)
  const weekAgoKey = addDaysToDateKey(todayKey, -6);
  const weekMeetings = meetings.filter((m: Meeting) => m.date >= weekAgoKey && m.date <= todayKey);
  const pulseCounts: Record<string, number> = { call: 0, email: 0, dm: 0, meeting: 0, sample_sent: 0, nudge: 0 };
  weekMeetings.forEach((m: Meeting) => {
    if (pulseCounts[m.type] !== undefined) pulseCounts[m.type]++;
  });
  pulseCounts.sample_sent = deals.filter(
    d => (d.workflow_action === 'sample' || d.workflow_action === 'testing') && d.stage !== 'closed_won' && d.stage !== 'closed_lost'
  ).length;
  pulseCounts.nudge = deals.filter(d => {
    const n = deriveNudge(d, todayKey, {
      lastHumanTouch: lastHumanTouchDateForDeal(meetings, d.id),
    });
    return Boolean(n) && d.stage !== 'closed_won' && d.stage !== 'closed_lost';
  }).length;

  const handleCreate = async (data: any) => {
    await createDeal(data);
  };

  const snoozeToTomorrow = async (deal: Deal) => {
    if (snoozing) return;
    setSnoozing(true);
    try {
      const next = addDaysToDateKey(todayKey, 1);
      const before = { followup_date: deal.followup_date };
      await crm.updateDeal(deal.id, { followup_date: next, nudge_stage: null });
      logActivity({
        type: 'edit',
        entity: 'deal',
        entityId: deal.id,
        label: 'Snoozed to tomorrow',
        description: `${dealClientName(deal, companies, contacts)} follow-up → ${next}`,
        undoPayload: before,
      });
      addToast(`Snoozed to ${next}`);
      await refresh();
    } catch {
      addToast('Could not snooze — try again', 'error');
    } finally {
      setSnoozing(false);
    }
  };

  const heroChannel = startHere ? preferredChannel(startHere.deal, contacts, meetings) : null;
  const heroLane = startHere ? WORKFLOW_BY_ID[getWorkflowAction(startHere.deal)] : null;
  const heroNudge = startHere
    ? deriveNudge(startHere.deal, todayKey, {
        lastHumanTouch: lastHumanTouchDateForDeal(meetings, startHere.deal.id),
      })
    : null;

  return (
    <div className="p-4 md:p-6 max-w-3xl pb-20 lg:pb-6">
      {/* Header — weekday · Bangkok, big Today */}
      <div className="flex items-start justify-between mb-5 md:mb-6 gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <MascotSprite src="/assets/mascot-teardrop.png" size={46} alt="LeadPulse mascot" />
          <div className="min-w-0">
            <p className="zams-eyebrow mb-1">
              {headerDate} · Bangkok
            </p>
            <h1 className="zams-display text-3xl md:text-[34px] leading-none">Today</h1>
            <p className="text-xs md:text-sm text-clay-muted mt-1.5">
              one next move, then the queue
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setIsModalOpen(true)}
            className="sm:hidden flex items-center justify-center w-10 h-10 border border-clay-hairline text-clay-ink rounded-md active:bg-clay-surface"
            aria-label="New deal"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="hidden sm:flex items-center gap-2 px-4 py-2.5 border border-clay-hairline text-clay-ink text-sm font-medium rounded-md hover:border-clay-lavender hover:text-clay-lavender transition-colors"
          >
            <Plus className="w-4 h-4" /> New deal
          </button>
        </div>
      </div>

      {/* Whisper counters — not a competing metric strip */}
      <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1.5 px-0.5" aria-label="Today counters">
        {loading ? (
          <div className="flex items-center gap-3 animate-pulse" aria-busy="true">
            <div className="h-3 w-16 rounded bg-clay-surface" />
            <div className="h-3 w-20 rounded bg-clay-surface/80" />
            <div className="h-3 w-24 rounded bg-clay-surface/60" />
          </div>
        ) : (
          <>
            <span className="zams-mono text-[10px] uppercase tracking-[0.14px]">
              <span className="text-clay-error font-semibold">{dealFollowUps.overdue.length} overdue</span>
            </span>
            <span className="text-clay-muted-soft/60 text-[10px]" aria-hidden>·</span>
            <span className="zams-mono text-[10px] uppercase tracking-[0.14px] text-clay-ochre">
              {dealFollowUps.dueToday.length} due today
            </span>
            <span className="text-clay-muted-soft/60 text-[10px]" aria-hidden>·</span>
            <span className="zams-mono text-[10px] uppercase tracking-[0.14px] text-clay-muted">
              {needsReviewCount} needs review
            </span>
            <span className="text-clay-muted-soft/60 text-[10px]" aria-hidden>·</span>
            <span className="zams-mono text-[10px] uppercase tracking-[0.14px] text-clay-muted-soft">
              {wonCount} won
            </span>
          </>
        )}
      </div>

      {/* Hero — Do this next */}
      <div className="mb-6 rounded-2xl border border-clay-hairline bg-white dark:bg-clay-card p-5 md:p-6 relative overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.5),0_8px_24px_-12px_rgba(43,33,26,0.28)]">
        <div className="flex items-start gap-3 mb-4">
          <MascotSprite
            src={loading || startHere ? '/assets/mascots/mascot-teardrop.png' : '/assets/mascots/mascot-outreach.png'}
            size={48}
            alt={loading || startHere ? 'Planner mascot' : 'Scout mascot'}
          />
          <div className="flex-1 min-w-0">
            <p className="zams-mono text-[10px] uppercase tracking-[0.16px] text-clay-lavender font-semibold mb-1.5">
              Do this next
            </p>
            {loading ? (
              <div className="space-y-2 animate-pulse" aria-busy="true" aria-label="Loading next move">
                <div className="h-7 md:h-8 w-2/3 max-w-[240px] rounded-md bg-clay-surface" />
                <div className="h-4 w-full max-w-[320px] rounded bg-clay-surface/80" />
                <div className="h-4 w-4/5 max-w-[260px] rounded bg-clay-surface/60" />
              </div>
            ) : startHere ? (
              <>
                <h2 className="zams-display text-xl md:text-2xl leading-tight mb-1.5">
                  {dealClientName(startHere.deal, companies, contacts)}
                </h2>
                <WhyNowCopy
                  text={[
                    whyNowLine(startHere.deal, startHere.kind, todayKey),
                    startHere.deal.next_action || null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                />
              </>
            ) : (
              <>
                <h2 className="zams-display text-xl md:text-2xl leading-tight mb-1.5">All clear</h2>
                <p className="text-sm text-clay-muted">
                  {greeting}, Pat — nothing due or overdue. Time to find your next prospect.
                </p>
              </>
            )}
          </div>
        </div>

        {!loading && startHere && (
          <div className="flex flex-wrap items-center gap-1.5 mb-5">
            {heroLane && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-clay-hairline bg-clay-surface text-clay-ink">
                {heroLane.icon} {heroLane.shortLabel}
              </span>
            )}
            {heroNudge && (
              <span
                className={clsx(
                  'text-[10px] font-semibold px-2 py-0.5 rounded-full border',
                  nudgeColorClass(heroNudge.stage)
                )}
              >
                {formatDerivedNudgeBadge(heroNudge)}
              </span>
            )}
            {heroChannel && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-clay-hairline text-clay-muted">
                {heroChannel}
              </span>
            )}
            {startHere.deal.value != null && startHere.deal.value > 0 && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-clay-mint/40 bg-clay-mint/10 text-clay-teal">
                {formatBaht(startHere.deal.value)} open
              </span>
            )}
            {startHere.kind === 'overdue' && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-clay-error/10 text-clay-error border border-clay-error/20">
                Overdue
              </span>
            )}
            {startHere.kind === 'today' && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-clay-ochre/15 text-clay-ochre border border-clay-ochre/25">
                Due today
              </span>
            )}
            {heroNudge && (
              <NudgeLadderRail
                stage={heroNudge.stage}
                silenceDays={heroNudge.silenceDays}
                variant="mini"
                className="basis-full max-w-[8rem] mt-0.5"
              />
            )}
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          {loading ? (
            <div className="flex gap-2 animate-pulse w-full" aria-hidden>
              <div className="h-11 flex-1 sm:w-36 sm:flex-none rounded-lg bg-clay-surface" />
              <div className="h-11 flex-1 sm:w-28 sm:flex-none rounded-lg bg-clay-surface/70" />
            </div>
          ) : startHere ? (
            <>
              <button
                onClick={() => {
                  setLogDealId(startHere.deal.id);
                  setIsLogModalOpen(true);
                }}
                className="clay-btn-primary inline-flex items-center justify-center gap-2 w-full sm:w-auto"
              >
                <MessageCircle className="w-4 h-4" /> Log touch
              </button>
              <button
                onClick={() => router.push('/deals?deal=' + startHere.deal.id)}
                className="clay-btn-secondary inline-flex items-center justify-center gap-1.5 w-full sm:w-auto"
              >
                Open deal <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => snoozeToTomorrow(startHere.deal)}
                disabled={snoozing}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 h-11 text-sm font-medium text-clay-muted hover:text-clay-ink transition-colors w-full sm:w-auto disabled:opacity-50"
              >
                <Clock className="w-3.5 h-3.5" /> Snooze to tomorrow
              </button>
            </>
          ) : (
            <button onClick={() => router.push('/companies')} className="clay-btn-primary inline-flex items-center justify-center gap-2">
              Go prospecting <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Up next — short queue under hero */}
      <section className="mb-6">
        <div className="flex items-center gap-2.5 mb-3">
          <MascotSprite src="/assets/mascots/mascot-followup.png" size={24} alt="Follow-up mascot" />
          <div>
            <h2 className="zams-display text-lg leading-tight">Up next</h2>
            <p className="text-[11px] text-clay-muted">
              {loading
                ? 'Loading queue…'
                : upNext.length === 0
                  ? 'Queue empty after this move'
                  : `${upNext.length} waiting after you finish`}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="bg-white dark:bg-clay-card rounded-xl border border-clay-hairline divide-y divide-clay-hairline overflow-hidden animate-pulse" aria-busy="true">
            {[0, 1, 2].map(i => (
              <div key={i} className="px-4 py-3 flex items-center gap-3">
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-40 max-w-[50%] rounded bg-clay-surface" />
                  <div className="h-3 w-56 max-w-[70%] rounded bg-clay-surface/70" />
                </div>
                <div className="h-9 w-16 rounded-lg bg-clay-surface/80" />
              </div>
            ))}
          </div>
        ) : upNext.length === 0 ? (
          <div className="bg-white dark:bg-clay-card rounded-xl border border-clay-hairline p-6 flex flex-col items-center gap-2">
            <MascotSprite src="/assets/mascots/mascot-parked.png" size={36} alt="Sleepy mascot" />
            <p className="text-sm text-clay-muted">
              {startHere ? 'Just the one — then you\'re clear.' : 'Nothing waiting.'}
            </p>
            {!startHere && (
              <button
                ref={startButtonRef}
                onClick={() => setStartOpen(true)}
                className="mt-1 inline-flex items-center gap-2 px-4 py-2.5 bg-clay-ink text-clay-canvas text-sm font-medium rounded-lg active:opacity-85"
              >
                Start a task
              </button>
            )}
          </div>
        ) : (
          <div className="bg-white dark:bg-clay-card rounded-xl border border-clay-hairline divide-y divide-clay-hairline overflow-hidden">
            {upNext.map(item => {
              const days =
                item.kind === 'overdue' && item.deal.followup_date
                  ? Math.abs(daysBetween(item.deal.followup_date, todayKey))
                  : 0;
              const lane = WORKFLOW_BY_ID[getWorkflowAction(item.deal)];
              const verb = ACTION_VERBS[getWorkflowAction(item.deal)] || 'Follow up';
              const nudge = deriveNudge(item.deal, todayKey, {
                lastHumanTouch: lastHumanTouchDateForDeal(meetings, item.deal.id),
              });
              const channel = preferredChannel(item.deal, contacts, meetings);
              return (
                <div key={item.deal.id} className="px-4 py-3 flex items-center gap-3 group">
                  {item.kind === 'overdue' && (
                    <span className="w-1 self-stretch shrink-0 rounded-full bg-clay-error" aria-hidden />
                  )}
                  <button
                    onClick={() => router.push('/deals?deal=' + item.deal.id)}
                    className="flex-1 min-w-0 text-left"
                  >
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-sm font-medium text-clay-ink truncate">
                        {dealClientName(item.deal, companies, contacts)}
                      </p>
                      {item.kind === 'overdue' && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-clay-error/10 text-clay-error shrink-0">
                          {days}d late
                        </span>
                      )}
                      {item.kind === 'today' && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-clay-ochre/15 text-clay-ochre shrink-0">
                          Due today
                        </span>
                      )}
                      {nudge && (
                        <span
                          className={clsx(
                            'text-[10px] font-medium px-1.5 py-0.5 rounded border shrink-0',
                            nudgeColorClass(nudge.stage)
                          )}
                        >
                          {formatDerivedNudgeBadge(nudge)}
                        </span>
                      )}
                      {channel && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-clay-surface text-clay-muted shrink-0">
                          {channel}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-clay-muted truncate mt-0.5">
                      <span className="font-semibold text-clay-body">{verb}</span>
                      {item.deal.next_action
                        ? ` — ${item.deal.next_action}`
                        : ` · ${lane?.label?.toLowerCase() || 'next move'}`}
                    </p>
                    {nudge && (
                      <NudgeLadderRail
                        stage={nudge.stage}
                        silenceDays={nudge.silenceDays}
                        variant="mini"
                        className="mt-1.5 max-w-[7rem]"
                      />
                    )}
                  </button>
                  <button
                    onClick={() => {
                      setLogDealId(item.deal.id);
                      setIsLogModalOpen(true);
                    }}
                    className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-clay-hairline text-clay-ink text-xs font-medium hover:border-clay-lavender hover:text-clay-lavender transition-colors min-h-[44px]"
                    aria-label={`Log touch for ${dealClientName(item.deal, companies, contacts)}`}
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span className="hidden sm:inline">Log</span>
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {dealFollowUps.overdue.length + dealFollowUps.dueToday.length > 6 && (
          <button
            onClick={() => router.push('/deals')}
            className="mt-2.5 text-xs font-semibold text-clay-muted hover:text-clay-ink transition-colors flex items-center gap-1"
          >
            View all on Deals board <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}

        {!loading && deals.filter((d: Deal) => d.stage !== 'closed_won' && d.stage !== 'closed_lost').length === 0 && (
          <div className="mt-4 text-center py-10 bg-white dark:bg-clay-card rounded-xl border border-clay-hairline">
            <div className="relative mx-auto mb-4 w-28 h-28">
              <div className="absolute inset-0 rounded-full bg-clay-lavender/20" />
              <Image
                src="/assets/mascot-teardrop.png"
                alt="LeadPulse mascot holding a deal card"
                width={1024}
                height={1024}
                className="relative w-28 h-28 object-contain"
              />
            </div>
            <p className="text-sm font-medium text-clay-ink mb-1">No active deals yet</p>
            <p className="text-xs text-clay-muted mb-4">Your first deal card is waiting to be made.</p>
            <button
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-clay-ink text-clay-canvas text-sm font-medium rounded-lg active:opacity-85"
            >
              <Plus className="w-4 h-4" /> Create your first deal
            </button>
          </div>
        )}
      </section>

      {/* Pulse last 7d — secondary */}
      <div className="mb-6 rounded-xl border border-clay-hairline/80 bg-clay-surface/40 dark:bg-clay-card/40 px-4 py-2.5 flex items-center gap-3 overflow-x-auto">
        <div className="flex items-center gap-2 shrink-0">
          <MascotSprite src="/assets/mascots/mascot-reply.png" size={18} alt="Listener mascot" />
          <p className="zams-mono text-[10px] uppercase tracking-[0.16px] text-clay-muted-soft">Pulse · last 7d</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {PULSE_ITEMS.map(p => (
            <div key={p.key} className="flex items-center gap-1.5 opacity-80">
              {p.icon}
              <span className="text-sm font-semibold text-clay-ink leading-none">{pulseCounts[p.key] ?? 0}</span>
              <span className="zams-mono text-[9px] uppercase tracking-[0.1px] text-clay-muted-soft">{p.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Demoted secondary links — Buying signals + Recent activity off the fold */}
      <div className="flex flex-col sm:flex-row gap-2 mb-2">
        <Link
          href="/signals"
          className="flex-1 flex items-center justify-between gap-2 rounded-xl border border-clay-hairline bg-white dark:bg-clay-card px-4 py-3 text-sm text-clay-muted hover:text-clay-ink hover:border-clay-lavender/40 transition-colors"
        >
          <span className="flex items-center gap-2">
            <MascotSprite src="/assets/mascots/mascot-sample.png" size={20} alt="" />
            Buying signals
          </span>
          <ChevronRight className="w-4 h-4 text-clay-muted-soft" />
        </Link>
        <Link
          href="/meetings"
          className="flex-1 flex items-center justify-between gap-2 rounded-xl border border-clay-hairline bg-white dark:bg-clay-card px-4 py-3 text-sm text-clay-muted hover:text-clay-ink hover:border-clay-lavender/40 transition-colors"
        >
          <span className="flex items-center gap-2">
            <MascotSprite src="/assets/mascots/mascot-reply.png" size={20} alt="" />
            Recent activity
          </span>
          <ChevronRight className="w-4 h-4 text-clay-muted-soft" />
        </Link>
      </div>

      {/* Modals */}
      <CreateModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleCreate}
        type="deal"
        companies={companies}
        contacts={contacts}
      />
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
        contacts={contacts}
        companies={companies}
        selectedDealId={logDealId}
      />
      <TaskActionSheet
        open={startOpen}
        onClose={() => setStartOpen(false)}
        onFollowUp={() => {
          setStartOpen(false);
          startButtonRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }}
        onNewLead={() => {
          setStartOpen(false);
          setIsModalOpen(true);
        }}
        onLogTouch={() => {
          setStartOpen(false);
          setIsLogModalOpen(true);
        }}
      />
    </div>
  );
}
