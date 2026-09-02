'use client';

import { useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Deal, STAGE_LABELS, DealStage } from '@/types/crm';
import { useCrm } from '@/components/CrmProvider';
import { deals as dataDeals, contacts as dataContacts, companies as dataCompanies, meetings as dataMeetings } from '@/data/crmData';
import CreateModal from '@/components/CreateModal';
import LogInteractionModal from '@/components/LogInteractionModal';
import TaskActionSheet from '@/components/TaskActionSheet';
import ReorderSignalsCard from '@/components/ReorderSignalsCard';
import { Plus, ChevronRight, MessageCircle } from 'lucide-react';
import { calculateLeadScore, scoreToTier, TIER_LABELS, TIER_COLORS, TIER_BG, PRIORITY_CLASSES, PRIORITY_LABELS } from '@/utils/lead-scoring';
import { WORKFLOW_LANES, getWorkflowAction, nudgeLabel } from '@/utils/deal-workflow';
import { dealClientName } from '@/utils/dealLabel';
import { PageTransition, StaggerList, StaggerItem, ClayCharacter } from '@/components/motion';
import type { ClayKind } from '@/components/motion';

// One-line action verbs for the queue (brief item 5: "Call, DM, Send sample, Find buyer")
const ACTION_VERBS: Record<string, string> = {
  outreach: 'Send outreach',
  reply: 'Reply',
  sample: 'Send sample',
  testing: 'Confirm test',
  reschedule: 'Reschedule',
  parked: 'Revisit',
  success: 'Congratulate',
};

const PULSE_ITEMS: { key: string; label: string; clay: ClayKind }[] = [
  { key: 'call', label: 'Calls', clay: 'call' },
  { key: 'email', label: 'Emails', clay: 'message' },
  { key: 'dm', label: 'DMs', clay: 'message' },
  { key: 'meeting', label: 'Meetings', clay: 'search' },
  { key: 'sample_sent', label: 'Samples', clay: 'package' },
  { key: 'nudge', label: 'Nudges', clay: 'pause' },
];

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
  return Math.max(0, Math.round((d.getTime() - now.getTime()) / 86400000));
}

export default function TodayPage() {
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [logDealId, setLogDealId] = useState<string | undefined>(undefined);
  const [startOpen, setStartOpen] = useState(false);
  const startButtonRef = useRef<HTMLButtonElement>(null);
  const { deals: dbDeals, contacts: dbContacts, companies: dbCompanies, meetings: dbMeetings, loading, createDeal, addMeeting } = useCrm();

  const deals = dbDeals.length > 0 ? dbDeals : (dataDeals as Deal[]);
  const contacts = dbContacts.length > 0 ? dbContacts : (dataContacts as any);
  const companies = dbCompanies.length > 0 ? dbCompanies : (dataCompanies as any);
  const meetings = dbMeetings.length > 0 ? dbMeetings : (dataMeetings as any);

  const today = new Date();
  const hour = today.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const dealFollowUps = useMemo(() => {
    const needsAttention: Deal[] = [];
    const overdue: Deal[] = [];
    const dueToday: Deal[] = [];
    const thisWeek: Deal[] = [];

    const todayMid = new Date();
    todayMid.setHours(0, 0, 0, 0);
    const todayMs = todayMid.getTime();

    deals.forEach((deal: Deal) => {
      if (deal.stage === 'closed_won' || deal.stage === 'closed_lost') return;
      if (!deal.followup_date) {
        needsAttention.push(deal);
        return;
      }
      // Date-only diff so the week window doesn't drift with time-of-day.
      const d = new Date(deal.followup_date + 'T00:00:00');
      const diffDays = Math.round((d.getTime() - todayMs) / 86400000);
      if (diffDays < 0) overdue.push(deal);
      else if (diffDays === 0) dueToday.push(deal);
      else if (diffDays <= 7) thisWeek.push(deal);
    });

    // Soonest first within each bucket.
    const byDate = (a: Deal, b: Deal) => (a.followup_date || '').localeCompare(b.followup_date || '');
    dueToday.sort(byDate);
    thisWeek.sort(byDate);

    return { needsAttention, overdue, dueToday, thisWeek };
  }, [deals]);

  const stats = {
    activeDeals: deals.filter((d: Deal) => d.stage !== 'closed_won' && d.stage !== 'closed_lost').length,
    wonDeals: deals.filter((d: Deal) => d.stage === 'closed_won').length,
    contacts: contacts.filter((c: any) => c.status !== 'not_interested' && c.status !== 'parked').length,
    companies: companies.filter((c: any) => c.status !== 'lost').length,
    needAction: dealFollowUps.overdue.length + dealFollowUps.needsAttention.length,
  };

  // ── Today's plan + pulse ──
  const priorityRank: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const sortedOverdue = useMemo(
    () => [...dealFollowUps.overdue].sort((a, b) => (a.followup_date || '').localeCompare(b.followup_date || '')),
    [dealFollowUps.overdue]
  );
  const startHere = useMemo(() => {
    const pool = [
      ...sortedOverdue.map(d => ({ d, rank: 0 })),
      ...dealFollowUps.dueToday.map(d => ({ d, rank: 1 })),
    ];
    if (!pool.length) return null;
    pool.sort((a, b) => a.rank - b.rank || (priorityRank[a.d.priority || 'medium'] ?? 1) - (priorityRank[b.d.priority || 'medium'] ?? 1));
    return pool[0].d;
  }, [sortedOverdue, dealFollowUps.dueToday]);

  const actionQueue = useMemo(() => {
    const items: { deal: Deal; kind: 'overdue' | 'today' | 'attention' }[] = [
      ...sortedOverdue.map(d => ({ deal: d, kind: 'overdue' as const })),
      ...dealFollowUps.dueToday.map(d => ({ deal: d, kind: 'today' as const })),
      ...dealFollowUps.needsAttention.map(d => ({ deal: d, kind: 'attention' as const })),
    ];
    return items.slice(0, 12);
  }, [sortedOverdue, dealFollowUps.dueToday, dealFollowUps.needsAttention]);

  const todayLocal = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const todayMeetings = meetings.filter((m: any) => m.date === todayLocal);
  // Pulse counts: calls/emails/dms/meetings/notes come from today's meeting logs.
  // Samples + Nudges are now workflow-lane STATE (not meeting types), so derive them
  // from deals: a deal at sample/testing lane = sample in flight; a deal with a nudge_stage = nudged.
  const todayCounts: Record<string, number> = { call: 0, email: 0, dm: 0, meeting: 0, sample_sent: 0, nudge: 0, note: 0 };
  todayMeetings.forEach((m: any) => { if (todayCounts[m.type] !== undefined) todayCounts[m.type]++; });
  todayCounts.sample_sent = deals.filter(d => (d.workflow_action === 'sample' || d.workflow_action === 'testing') && d.stage !== 'closed_won' && d.stage !== 'closed_lost').length;
  todayCounts.nudge = deals.filter(d => d.nudge_stage && d.stage !== 'closed_won' && d.stage !== 'closed_lost').length;

  const handleCreate = async (data: any) => {
    // Let errors bubble to the modal so failures are visible.
    await createDeal(data);
  };

  return (
    <PageTransition className="p-4 md:p-6 max-w-6xl pb-20 lg:pb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 md:mb-6">
        <div className="flex items-center gap-3">
          <ClayCharacter kind="call" size={48} alt="LeadPulse clay character" />
          <div>
            <p className="zams-eyebrow mb-0.5">
              {today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
            <h1 className="zams-display text-2xl md:text-[28px] leading-none">
              {greeting}, Pat
            </h1>
            <p className="text-xs md:text-sm text-clay-muted mt-1">
              {dealFollowUps.dueToday.length + dealFollowUps.overdue.length === 0 ? (
                'All clear — a clean day ahead.'
              ) : (
                <>
                  You have{' '}
                  {dealFollowUps.dueToday.length > 0 && (
                    <span className="text-clay-ochre font-semibold">
                      {dealFollowUps.dueToday.length} deal{dealFollowUps.dueToday.length === 1 ? '' : 's'} due today
                    </span>
                  )}
                  {dealFollowUps.dueToday.length > 0 && dealFollowUps.overdue.length > 0 && ' and '}
                  {dealFollowUps.overdue.length > 0 && (
                    <span className="text-clay-error font-semibold">
                      {dealFollowUps.overdue.length} overdue
                    </span>
                  )}
                  .
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
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
          <button
            onClick={() => setIsLogModalOpen(true)}
            className="clay-btn-primary motion-press"
          >
            <MessageCircle className="w-4 h-4" /> <span className="hidden sm:inline">Log interaction</span>
          </button>
        </div>
      </div>

      {/* Mini stats — quiet, one strip */}
      <div className="mb-4 rounded-xl border border-clay-hairline bg-white dark:bg-clay-card px-4 py-2 flex items-center overflow-x-auto">
        {([
          { label: 'Active', value: stats.activeDeals, to: '/deals' },
          { label: 'Won', value: stats.wonDeals, to: '/deals', clay: 'success' as const },
          { label: 'Contacts', value: stats.contacts, to: '/contacts' },
          { label: 'Companies', value: stats.companies, to: '/companies', clay: 'search' as const },
        ] as const).map((s, i) => (
          <button
            key={s.label}
            onClick={() => router.push(s.to)}
            className={`flex items-center gap-1.5 px-4 shrink-0 text-left active:bg-clay-surface ${i > 0 ? 'border-l border-clay-hairline' : ''}`}
          >
            {'clay' in s && s.clay ? <ClayCharacter kind={s.clay} size={18} framed instant alt="" /> : null}
            <span className="text-sm font-semibold text-clay-ink leading-none">{s.value}</span>
            <span className="zams-mono text-[9px] uppercase tracking-[0.14px] text-clay-muted">{s.label}</span>
          </button>
        ))}
      </div>

      {/* Today's plan — the hero */}
      <div className="mb-4 rounded-2xl border border-clay-hairline bg-white dark:bg-clay-card p-5 md:p-6 flex flex-col md:flex-row md:items-center gap-4 md:gap-5 relative overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.5),0_6px_20px_-12px_rgba(43,33,26,0.25)]">
        {startHere ? (
          <ClayCharacter kind="call" size={56} alt="Planner clay character" />
        ) : (
          <ClayCharacter kind="success" size={56} alt="All clear clay character" />
        )}
        <div className="flex-1 min-w-0">
          <p className="zams-eyebrow mb-1">Today's plan</p>
          {startHere ? (
            <>
              <h2 className="zams-display text-xl md:text-2xl leading-tight mb-1">
                Start with <span className="text-clay-lavender">{dealClientName(startHere, companies, contacts)}</span>
              </h2>
              <p className="text-sm text-clay-muted truncate">
                {dealFollowUps.overdue.some(d => d.id === startHere.id) && startHere.followup_date ? (
                  <><span className="text-clay-error font-semibold">{daysOverdue(startHere.followup_date)} days overdue</span> · {startHere.next_action || 'No next action set'}</>
                ) : (
                  <>Due today · {startHere.next_action || 'No next action set'}</>
                )}
              </p>
            </>
          ) : (
            <>
              <h2 className="zams-display text-xl md:text-2xl leading-tight mb-1">All clear</h2>
              <p className="text-sm text-clay-muted">Nothing due or overdue. Time to find your next prospect.</p>
            </>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {startHere ? (
            <>
              <button
                onClick={() => { setLogDealId(startHere.id); setIsLogModalOpen(true); }}
                className="flex items-center gap-2 px-4 py-2.5 border border-clay-hairline text-clay-ink text-sm font-medium rounded-md hover:border-clay-lavender hover:text-clay-lavender transition-colors"
              >
                <MessageCircle className="w-4 h-4" /> Log touch
              </button>
              <button onClick={() => router.push('/deals?deal=' + startHere.id)} className="clay-btn-primary">
                Open lead <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <button onClick={() => router.push('/companies')} className="clay-btn-primary">
              Go prospecting <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Due today / this week — the day's commitments at a glance */}
      <section className="mb-6">
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Due today */}
          <div className="rounded-2xl border border-clay-ochre/30 bg-clay-ochre/5 p-4">
            <button
              onClick={() => router.push('/deals')}
              className="w-full flex items-center gap-2 mb-3 text-left group"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-clay-ochre" aria-hidden />
              <h2 className="zams-display text-base leading-tight group-hover:text-clay-ochre transition-colors">Due today</h2>
              <span className="ml-auto text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-clay-ochre/15 text-clay-ochre">
                {dealFollowUps.dueToday.length}
              </span>
            </button>
            {dealFollowUps.dueToday.length === 0 ? (
              <p className="text-xs text-clay-muted flex items-center gap-1.5">
                <ClayCharacter kind="pause" size={18} framed={false} instant alt="" />
                Nothing scheduled for today.
              </p>
            ) : (
              <>
                <ul className="space-y-1.5">
                  {dealFollowUps.dueToday.slice(0, 4).map(d => {
                    const verb = ACTION_VERBS[getWorkflowAction(d)] || 'Follow up';
                    return (
                      <li key={d.id}>
                        <button
                          onClick={() => router.push('/deals?deal=' + d.id)}
                          className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg bg-white dark:bg-clay-card border border-clay-hairline hover:border-clay-ochre/40 transition-colors min-h-[44px]"
                        >
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-clay-ochre/15 text-clay-ochre shrink-0">Today</span>
                          <span className="flex-1 min-w-0">
                            <span className="block text-sm font-medium text-clay-ink truncate">{dealClientName(d, companies, contacts)}</span>
                            <span className="block text-xs text-clay-muted truncate">{verb}{d.next_action ? ` — ${d.next_action}` : ''}</span>
                          </span>
                          <ChevronRight className="w-4 h-4 text-clay-muted-soft shrink-0" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {dealFollowUps.dueToday.length > 4 && (
                  <button
                    onClick={() => router.push('/deals')}
                    className="mt-2 w-full text-[11px] font-semibold text-clay-ochre hover:text-clay-ink transition-colors flex items-center justify-center gap-1"
                  >
                    View all {dealFollowUps.dueToday.length} <ChevronRight className="w-3 h-3" />
                  </button>
                )}
              </>
            )}
          </div>

          {/* This week */}
          <div className="rounded-2xl border border-clay-lavender/30 bg-clay-lavender/5 p-4">
            <button
              onClick={() => router.push('/deals')}
              className="w-full flex items-center gap-2 mb-3 text-left group"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-clay-lavender" aria-hidden />
              <h2 className="zams-display text-base leading-tight group-hover:text-clay-lavender transition-colors">This week</h2>
              <span className="ml-auto text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-clay-lavender/20 text-clay-lavender">
                {dealFollowUps.thisWeek.length}
              </span>
            </button>
            {dealFollowUps.thisWeek.length === 0 ? (
              <p className="text-xs text-clay-muted flex items-center gap-1.5">
                <ClayCharacter kind="pause" size={18} framed={false} instant alt="" />
                Light week ahead.
              </p>
            ) : (
              <>
                <ul className="space-y-1.5">
                  {dealFollowUps.thisWeek.slice(0, 4).map(d => {
                    const verb = ACTION_VERBS[getWorkflowAction(d)] || 'Follow up';
                    const inDays = d.followup_date ? daysUntil(d.followup_date) : 0;
                    return (
                      <li key={d.id}>
                        <button
                          onClick={() => router.push('/deals?deal=' + d.id)}
                          className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg bg-white dark:bg-clay-card border border-clay-hairline hover:border-clay-lavender/40 transition-colors min-h-[44px]"
                        >
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-clay-lavender/20 text-clay-lavender shrink-0">
                            {inDays === 1 ? 'Tomorrow' : `in ${inDays}d`}
                          </span>
                          <span className="flex-1 min-w-0">
                            <span className="block text-sm font-medium text-clay-ink truncate">{dealClientName(d, companies, contacts)}</span>
                            <span className="block text-xs text-clay-muted truncate">{verb}{d.next_action ? ` — ${d.next_action}` : ''}</span>
                          </span>
                          <ChevronRight className="w-4 h-4 text-clay-muted-soft shrink-0" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {dealFollowUps.thisWeek.length > 4 && (
                  <button
                    onClick={() => router.push('/deals')}
                    className="mt-2 w-full text-[11px] font-semibold text-clay-lavender hover:text-clay-ink transition-colors flex items-center justify-center gap-1"
                  >
                    View all {dealFollowUps.thisWeek.length} <ChevronRight className="w-3 h-3" />
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </section>
      <div className="mb-6 rounded-xl border border-clay-hairline bg-white dark:bg-clay-card px-4 py-2.5 flex items-center gap-3 overflow-x-auto">
        <div className="flex items-center gap-2 shrink-0">
          <ClayCharacter kind="message" size={22} framed alt="Pulse messenger" />
          <p className="zams-mono text-[10px] uppercase tracking-[0.16px] text-clay-muted-soft">Today's pulse</p>
        </div>
        <StaggerList stagger={0.035} className="flex items-center gap-3 shrink-0">
          {PULSE_ITEMS.map(p => (
            <StaggerItem key={p.key} className="flex items-center gap-1.5">
              <ClayCharacter kind={p.clay} size={20} framed={false} instant alt={p.label} />
              <span className="text-sm font-semibold text-clay-ink leading-none">{todayCounts[p.key] ?? 0}</span>
              <span className="zams-mono text-[9px] uppercase tracking-[0.1px] text-clay-muted-soft">{p.label}</span>
            </StaggerItem>
          ))}
        </StaggerList>
        <span className="text-[11px] text-clay-muted-soft ml-auto shrink-0 flex items-center gap-1.5">
          {todayMeetings.length === 0 && <ClayCharacter kind="pause" size={18} framed alt="Resting — no touches yet" />}
          {todayMeetings.length === 0 ? 'No touches yet today' : `${todayMeetings.length} ${todayMeetings.length === 1 ? 'touch' : 'touches'} today`}
        </span>
      </div>

      {/* Action queue — top 3 overdue first, one-line verbs, chips */}
      <section className="mb-6">
        <div className="flex items-center gap-2.5 mb-3">
          <ClayCharacter kind="call" size={44} alt="Follow-up clay character" />
          <div>
            <h2 className="zams-display text-lg md:text-xl leading-tight">Action queue</h2>
            <p className="text-xs text-clay-muted">
              {dealFollowUps.overdue.length === 0 ? 'Nothing waiting' : `${dealFollowUps.overdue.length} ${dealFollowUps.overdue.length === 1 ? 'item' : 'items'} waiting`}
            </p>
          </div>
        </div>

        {actionQueue.length === 0 ? (
          <div className="bg-white dark:bg-clay-card rounded-xl border border-clay-hairline p-8 flex flex-col items-center gap-3">
            <ClayCharacter kind="success" size={56} framed alt="All clear — nothing waiting" />
            <p className="text-sm text-clay-muted mb-2">Everything is moving. Nothing waiting.</p>
            <button
              ref={startButtonRef}
              onClick={() => setStartOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-clay-ink text-clay-canvas text-sm font-medium rounded-lg active:opacity-85"
            >
              Start a task
            </button>
          </div>
        ) : (
          <>
            <StaggerList className="bg-white dark:bg-clay-card rounded-xl border border-clay-hairline divide-y divide-clay-hairline overflow-hidden">
              {actionQueue.slice(0, 4).map(item => {
                const days = item.kind === 'overdue' && item.deal.followup_date ? daysOverdue(item.deal.followup_date) : 0;
                const lane = WORKFLOW_LANES.find(l => l.id === getWorkflowAction(item.deal))!;
                const verb = ACTION_VERBS[getWorkflowAction(item.deal)] || 'Follow up';
                const nudgeChip = item.deal.nudge_stage ? nudgeLabel(item.deal.nudge_stage) : null;
                return (
                  <StaggerItem key={item.deal.id} className="px-4 py-3 flex items-center gap-3 group">
                    {/* Left-edge urgency marker */}
                    {item.kind === 'overdue' && (
                      <span className="w-1 self-stretch shrink-0 rounded-full bg-clay-error" aria-hidden />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium text-clay-ink truncate">{dealClientName(item.deal, companies, contacts)}</p>
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
                        {nudgeChip && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-clay-lavender/20 text-clay-lavender shrink-0">
                            {nudgeChip}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-clay-muted truncate mt-0.5">
                        <span className="font-semibold text-clay-body">{verb}</span>
                        {item.deal.next_action ? ` — ${item.deal.next_action}` : ` · ${lane.label.toLowerCase()}`}
                      </p>
                    </div>
                    <button
                      onClick={() => { setLogDealId(item.deal.id); setIsLogModalOpen(true); }}
                      className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-clay-hairline text-clay-ink text-xs font-medium hover:border-clay-lavender hover:text-clay-lavender transition-colors min-h-[44px] motion-press"
                      aria-label={`Log follow-up for ${dealClientName(item.deal, companies, contacts)}`}
                    >
                      <MessageCircle className="w-4 h-4" />
                      <span className="hidden sm:inline">Log follow-up</span>
                    </button>
                    <button
                      onClick={() => router.push('/deals?deal=' + item.deal.id)}
                      className="shrink-0 w-9 h-9 rounded-lg bg-clay-lavender text-white flex items-center justify-center hover:bg-[#6a4bc8] transition-colors motion-press"
                      aria-label={`Open ${dealClientName(item.deal, companies, contacts)}`}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </StaggerItem>
                );
              })}
            </StaggerList>

            {dealFollowUps.overdue.length > 3 && (
              <button
                onClick={() => router.push('/deals')}
                className="mt-2.5 text-xs font-semibold text-clay-muted hover:text-clay-ink transition-colors flex items-center gap-1"
              >
                View all {dealFollowUps.overdue.length} overdue <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </>
        )}

        {deals.filter((d: Deal) => d.stage !== 'closed_won' && d.stage !== 'closed_lost').length === 0 && (
          <div className="mt-4 text-center py-10 bg-white dark:bg-clay-card rounded-xl border border-clay-hairline">
            <div className="relative mx-auto mb-4 w-28 h-28 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-clay-lavender/20" />
              <ClayCharacter kind="search" size={96} framed className="relative" alt="Search for your next prospect" />
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

      {/* Buying signals — historical reorder overdue, collapsed, max 5.
          Quiet layer: never adds rows to the Action queue above. */}
      <ReorderSignalsCard />

      {/* Recent Activity */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="zams-display text-lg md:text-xl">Recent Activity</h2>
          <button onClick={() => router.push('/meetings')} className="text-xs text-clay-muted">
            View all
          </button>
        </div>
        <div className="bg-white dark:bg-clay-card rounded-xl border border-clay-hairline overflow-hidden">
          {(meetings as any[]).slice(0, 5).map((meeting: any, i: number) => (
            <button
              key={meeting.id}
              onClick={() => router.push('/meetings')}
              className={`w-full text-left flex items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t border-clay-hairline' : ''} active:bg-clay-surface`}
            >
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-medium flex-shrink-0 ${
                  meeting.type === 'meeting'
                    ? 'bg-clay-lavender/20 text-clay-lavender'
                    : meeting.type === 'email'
                    ? 'bg-clay-pink/20 text-clay-pink'
                    : meeting.type === 'call'
                    ? 'bg-clay-mint/20 text-clay-teal'
                    : meeting.type === 'sample_sent'
                    ? 'bg-clay-ochre/20 text-clay-ochre'
                    : 'bg-clay-card text-clay-muted'
                }`}
              >
                {meeting.type === 'meeting'
                  ? 'M'
                  : meeting.type === 'email'
                  ? 'E'
                  : meeting.type === 'call'
                  ? 'C'
                  : meeting.type === 'dm'
                  ? 'D'
                  : meeting.type === 'sample_sent'
                  ? 'S'
                  : 'N'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-clay-ink truncate">
                  {meeting.description}
                </p>
                <p className="text-xs text-clay-muted">{meeting.date}</p>
              </div>
            </button>
          ))}
        </div>
      </section>

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
        onClose={() => { setIsLogModalOpen(false); setLogDealId(undefined); }}
        onSave={async (meeting) => {
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
    </PageTransition>
  );
}
