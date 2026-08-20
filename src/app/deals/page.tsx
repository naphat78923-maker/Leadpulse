'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { Deal, DealWorkflowAction, STAGE_LABELS } from '@/types/crm';
import { useCrm } from '@/components/CrmProvider';
import { deals as dataDeals, contacts as dataContacts, companies as dataCompanies } from '@/data/crmData';
import CreateModal from '@/components/CreateModal';
import DealDetail from '@/components/DealDetail';
import LaneGateModal, { LaneGatePayload } from '@/components/LaneGateModal';
import MascotSprite from '@/components/MascotSprite';
import { useToast } from '@/components/ToastProvider';
import * as crm from '@/lib/crm';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  DragStartEvent,
  DragEndEvent,
} from '@dnd-kit/core';
import { Plus, TrendingUp, AlertCircle, Loader2, CalendarDays, GripVertical, ArrowRight } from 'lucide-react';
import clsx from 'clsx';
import {
  calculateLeadScore,
  scoreToTier,
  TIER_LABELS,
  TIER_COLORS,
  TIER_BG,
  PRIORITY_CLASSES,
  PRIORITY_LABELS,
} from '@/utils/lead-scoring';
import { WORKFLOW_LANES, WORKFLOW_BY_ID, LANE_MASCOT_PATHS, getWorkflowAction, nudgeLabel } from '@/utils/deal-workflow';

type ViewMode = 'board' | 'closed' | 'table';

const LANE_CRITERIA: Record<DealWorkflowAction, string> = {
  outreach: 'Optional: next action',
  reply: 'Requires: outcome',
  sample: 'Requires: sent / received',
  testing: 'Requires: testing date',
  reschedule: 'Requires: date + nudge',
  parked: 'Requires: revisit date',
  success: 'Closes deal as won',
};

function timestampedEntry(text: string) {
  const now = new Date();
  const stamp = `${now.toISOString().replace('T', ' ').substring(0, 19)} UTC`;
  return `[${stamp}] ${text}`;
}

function appendOutcome(existing: string | null, entry?: string | null) {
  if (!entry) return existing;
  return existing ? `${existing}\n---\n${entry}` : entry;
}

function dueStateFor(deal: Deal, todayStr: string): 'overdue' | 'today' | null {
  if (!deal.followup_date) return null;
  if (deal.stage === 'closed_won' || deal.stage === 'closed_lost') return null;
  if (deal.followup_date < todayStr) return 'overdue';
  if (deal.followup_date === todayStr) return 'today';
  return null;
}

function compactDate(date?: string | null) {
  if (!date) return null;
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

export default function DealsPage() {
  const [view, setView] = useState<ViewMode>('board');
  const [mobileLane, setMobileLane] = useState<DealWorkflowAction>('outreach');
  const [selectedDeal, setSelectedDeal] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [gate, setGate] = useState<{ deal: Deal; target: DealWorkflowAction } | null>(null);
  const [celebrate, setCelebrate] = useState<{ dealId: string; laneId: DealWorkflowAction; sprite?: string } | null>(null);
  const [pickerDeal, setPickerDeal] = useState<Deal | null>(null);

  const { deals: dbDeals, contacts: dbContacts, companies: dbCompanies, loading, refresh, createDeal, logActivity } = useCrm();
  const { addToast } = useToast();
  const deals: Deal[] = dbDeals.length > 0 ? dbDeals : (dataDeals as Deal[]);
  const contacts = dbContacts.length > 0 ? dbContacts : (dataContacts as any);
  const companies = dbCompanies.length > 0 ? dbCompanies : (dataCompanies as any);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  /* ─── Board overflow indicator ─── */
  const boardRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  const [boardScroll, setBoardScroll] = useState({ canScrollRight: false, canScrollLeft: false });
  const todayStr = new Date().toISOString().split('T')[0];

  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const update = () => {
      setBoardScroll({
        canScrollRight: el.scrollLeft + el.clientWidth < el.scrollWidth - 8,
        canScrollLeft: el.scrollLeft > 8,
      });
    };
    update();
    el.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [view]);

  const scrollBoard = (dir: 1 | -1) => {
    const el = boardRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' });
  };

  const scoredDeals = useMemo(
    () => deals.map(deal => ({ deal, score: calculateLeadScore(deal), tier: scoreToTier(calculateLeadScore(deal)) })),
    [deals]
  );

  const actionBoardDeals = useMemo(
    () => deals.filter(deal => deal.stage !== 'closed_lost'),
    [deals]
  );

  const dealsByAction = useMemo(() => {
    const groups = Object.fromEntries(WORKFLOW_LANES.map(lane => [lane.id, [] as Deal[]])) as Record<string, Deal[]>;
    actionBoardDeals.forEach(deal => {
      groups[getWorkflowAction(deal)].push(deal);
    });
    return groups;
  }, [actionBoardDeals]);

  const closedDeals = useMemo(
    () => deals.filter(deal => deal.stage === 'closed_won' || deal.stage === 'closed_lost'),
    [deals]
  );

  const stats = useMemo(() => {
    const active = deals.filter(deal => !['closed_won', 'closed_lost'].includes(deal.stage));
    const parked = actionBoardDeals.filter(deal => getWorkflowAction(deal) === 'parked');
    const dueToday = active.filter(deal => deal.followup_date === new Date().toISOString().slice(0, 10));
    return { active: active.length, parked: parked.length, dueToday: dueToday.length, won: deals.filter(deal => deal.stage === 'closed_won').length };
  }, [actionBoardDeals, deals]);

  const activeDeal = selectedDeal ? deals.find(deal => deal.id === selectedDeal) : null;

  const handleCreate = async (data: any) => {
    // Let errors bubble to the modal so failures are visible.
    await createDeal(data);
  };

  /* ─── Drag & drop lane moves with per-lane gatekeeping ─── */
  const handleDragStart = (event: DragStartEvent) => setActiveDragId(event.active.id as string);

  const handleDragEnd = (event: DragEndEvent) => {
    const id = event.active.id as string;
    setActiveDragId(null);
    const over = event.over?.id as string | undefined;
    if (!over) return;
    const deal = deals.find(d => d.id === id);
    if (!deal) return;
    const current = getWorkflowAction(deal);
    if (over === current) return;
    setGate({ deal, target: over as DealWorkflowAction });
  };

  const handleGateConfirm = async (payload: LaneGatePayload) => {
    if (!gate) return;
    const { deal, target } = gate;
    const lane = WORKFLOW_BY_ID[target];
    const before: Partial<Deal> = {
      workflow_action: getWorkflowAction(deal),
      sample_status: deal.sample_status || null,
      nudge_stage: deal.nudge_stage || null,
      followup_date: deal.followup_date,
      stage: deal.stage,
      next_action: deal.next_action,
      last_outcome: deal.last_outcome,
    };
    const updates: Partial<Deal> = { workflow_action: target };
    if (target === 'sample') updates.sample_status = payload.sample_status || null;
    if (target === 'testing' || target === 'parked' || target === 'reschedule') updates.followup_date = payload.followup_date || null;
    if (target === 'reschedule') updates.nudge_stage = payload.nudge_stage || null;
    if (target !== 'sample') updates.sample_status = null;
    if (target !== 'reschedule') updates.nudge_stage = null;
    if (target === 'outreach' && payload.next_action) updates.next_action = payload.next_action;
    if (target === 'reply') {
      const detail = payload.reply_summary ? `: ${payload.reply_summary}` : '';
      updates.last_outcome = appendOutcome(deal.last_outcome, timestampedEntry(`💬 Client replied — ${payload.reply_outcome}${detail}`));
    }
    if (target === 'success') {
      updates.stage = 'closed_won';
      updates.followup_date = null;
    }
    await crm.updateDeal(deal.id, updates);
    logActivity({
      type: 'edit',
      entity: 'deal',
      entityId: deal.id,
      label: `${lane.icon} ${lane.label}`,
      description: `${deal.client} moved to the ${lane.shortLabel} lane`,
      undoPayload: before,
    });

    // Feed the pulse: interaction-type lane moves also create an interaction row
    // so calls, emails, DMs, and samples from the board count on the Activity pulse.
    const meetingToLog = (() => {
      const base = {
        date: new Date().toISOString().split('T')[0],
        company_id: deal.company_id,
        contact_ids: deal.contact_ids || [],
        deal_id: deal.id,
        product: deal.product,
      };
      if (target === 'outreach' && payload.channel) {
        const chLabel = payload.channel === 'dm' ? 'DM' : payload.channel === 'email' ? 'Email' : 'Call';
        return { ...base, type: payload.channel, description: `${chLabel} outreach — ${deal.client}`, summary: payload.next_action || null, outcome: null, followup_date: null };
      }
      if (target === 'reply' && payload.channel && payload.reply_outcome) {
        const chLabel = payload.channel === 'dm' ? 'DM' : payload.channel === 'email' ? 'Email' : 'Call';
        return { ...base, type: payload.channel, description: `${chLabel} reply from ${deal.client}`, summary: payload.reply_summary || null, outcome: payload.reply_outcome, followup_date: null };
      }
      if (target === 'sample' && payload.sample_status) {
        return { ...base, type: 'sample_sent', description: `Sample ${payload.sample_status} — ${deal.client}`, summary: null, outcome: null, followup_date: null };
      }
      return null;
    })();
    if (meetingToLog) {
      await crm.createMeeting(meetingToLog as any);
    }
    setGate(null);
    const celebrationSprite = target === 'success'
      ? (Math.random() < 0.5 ? '/assets/mascots/mascot-won-trophy.png' : '/assets/mascots/mascot-won-confetti.png')
      : LANE_MASCOT_PATHS[target];
    setCelebrate({ dealId: deal.id, laneId: target, sprite: celebrationSprite });
    setTimeout(() => setCelebrate(null), 900);
    addToast(target === 'success' ? '🎉 Deal closed as won!' : `${lane.icon} Moved to ${lane.shortLabel}`);
    await refresh();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 text-clay-ink animate-spin" />
      </div>
    );
  }

  const renderDealCard = (deal: Deal, opts?: { grip?: boolean; compact?: boolean }) => {
    const score = calculateLeadScore(deal);
    const tier = scoreToTier(score);
    const action = getWorkflowAction(deal);
    const nudge = nudgeLabel(deal.nudge_stage);
    const lane = WORKFLOW_LANES.find(item => item.id === action)!;
    const due = dueStateFor(deal, todayStr);
    const isCompact = !!opts?.compact;

    return (
      <button
        key={deal.id}
        onClick={() => setSelectedDeal(deal.id)}
        className={clsx(
          'w-full text-left bg-white dark:bg-clay-card rounded-xl border transition-all active:scale-[0.98] active:bg-clay-surface',
          isCompact ? 'p-2.5' : 'p-3',
          TIER_BG[tier]
        )}
      >
        <div className={clsx('flex items-center justify-between gap-2', !isCompact && 'mb-2')}>
          <span className={clsx('text-[10px] font-semibold px-2 py-0.5 rounded border', TIER_COLORS[tier])}>{TIER_LABELS[tier]}</span>
          <span className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono text-clay-muted">{score}/100</span>
            {opts?.grip && <GripVertical className="w-3.5 h-3.5 text-clay-muted-soft" />}
          </span>
        </div>

        <div className="flex items-start justify-between gap-1.5">
          <h3 className={clsx(
            'text-sm font-semibold text-clay-ink leading-snug',
            isCompact ? 'truncate' : 'line-clamp-2'
          )}>
            {deal.client}
          </h3>
          {due && (
            <span
              className={clsx(
                'inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap shrink-0 mt-0.5',
                due === 'overdue' ? 'bg-clay-error/10 text-clay-error' : 'bg-clay-ochre/10 text-clay-ochre'
              )}
            >
              <span className={clsx('w-1.5 h-1.5 rounded-full animate-pulse-dot', due === 'overdue' ? 'bg-clay-error' : 'bg-clay-ochre')} />
              {due === 'overdue' ? 'Overdue' : 'Due today'}
            </span>
          )}
        </div>

        {!isCompact && (
          <>
            <p className="text-xs text-clay-muted line-clamp-2 mt-0.5">{deal.title}</p>
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <span className="text-[10px] font-medium text-clay-muted bg-clay-card px-1.5 py-0.5 rounded">{STAGE_LABELS[deal.stage]}</span>
              <span className={clsx('text-[10px] font-semibold px-1.5 py-0.5 rounded', PRIORITY_CLASSES[deal.priority])}>{PRIORITY_LABELS[deal.priority]}</span>
              {deal.sample_status && <span className="text-[10px] text-clay-ochre">{deal.sample_status === 'sent' ? 'Sent' : 'Received'}</span>}
              {nudge && <span className="text-[10px] text-clay-muted">{nudge}</span>}
            </div>
            {(deal.followup_date || deal.next_action) && (
              <div className="mt-2 pt-2 border-t border-clay-hairline/60">
                {deal.followup_date && (
                  <p className={clsx(
                    'text-[10px]',
                    due === 'overdue' ? 'text-clay-error font-semibold' : due === 'today' ? 'text-clay-ochre font-semibold' : 'text-clay-muted'
                  )}>
                    📅 {compactDate(deal.followup_date)}
                  </p>
                )}
                {deal.next_action && <p className="text-[10px] text-clay-muted line-clamp-1 mt-0.5">{deal.next_action}</p>}
              </div>
            )}
          </>
        )}
        <p className="sr-only">Open {deal.client} in {lane.label}</p>
      </button>
    );
  };

  return (
    <div className="p-4 md:px-4 md:py-6 pb-20 lg:pb-6 min-h-full">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <p className="zams-eyebrow mb-1">Pipeline · Action board</p>
          <h1 className="zams-display text-2xl md:text-[28px] leading-tight">Deal Action Board</h1>
          <p className="text-xs md:text-sm text-clay-muted mt-1">Organise clients by the next customer action — pipeline stage stays on each deal.</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="zams-btn-primary shrink-0"
        >
          <Plus className="w-4 h-4" /> <span className="hidden sm:inline">New deal</span>
        </button>
      </div>

      {/* Brand banner */}
      <div className="relative mb-4 rounded-lg border border-clay-hairline bg-white dark:bg-clay-card overflow-hidden">
        <div className="flex items-center gap-4 p-4 md:p-5">
          <div className="flex-1 min-w-0">
            <p className="zams-eyebrow mb-1.5">Win · Lost · Follow up</p>
            <p className="zams-display text-lg md:text-xl leading-tight">One deal, one next action.</p>
            <p className="text-xs text-clay-muted mt-1">Sort every deal by what to do next — outreach, follow-up, reschedule, or parked.</p>
          </div>
          <Image
            src="/assets/deal-lanes-hero.png"
            alt="Clay characters pushing deals through the WIN, LOST, and FOLLOW UP lanes"
            width={1344}
            height={768}
            className="hidden sm:block w-40 md:w-56 h-auto rounded border border-clay-hairline shrink-0"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <div className="bg-white dark:bg-clay-card border border-clay-hairline rounded-xl p-3"><p className="text-xs text-clay-muted">Active</p><p className="text-xl font-semibold text-clay-ink">{stats.active}</p></div>
        <div className="bg-clay-ochre/10 border border-clay-ochre/20 rounded-xl p-3"><p className="text-xs text-clay-ochre">Due today</p><p className="text-xl font-semibold text-clay-ochre">{stats.dueToday}</p></div>
        <div className="bg-clay-card border border-clay-hairline rounded-xl p-3"><p className="text-xs text-clay-muted">Parked</p><p className="text-xl font-semibold text-clay-ink">{stats.parked}</p></div>
        <div className="bg-clay-mint/20 border border-clay-mint/30 rounded-xl p-3"><p className="text-xs text-clay-teal">Won</p><p className="text-xl font-semibold text-clay-teal">{stats.won}</p></div>
      </div>

      <div className="flex bg-clay-card rounded-lg p-0.5 mb-4">
        <button onClick={() => setView('board')} className={clsx('flex-1 px-3 py-2 text-xs font-medium rounded-md', view === 'board' ? 'bg-clay-ink text-clay-canvas' : 'text-clay-muted')}>Action board</button>
        <button onClick={() => setView('closed')} className={clsx('flex-1 px-3 py-2 text-xs font-medium rounded-md', view === 'closed' ? 'bg-clay-ink text-clay-canvas' : 'text-clay-muted')}>Closed</button>
        <button onClick={() => setView('table')} className={clsx('flex-1 px-3 py-2 text-xs font-medium rounded-md', view === 'table' ? 'bg-clay-ink text-clay-canvas' : 'text-clay-muted')}>Table</button>
      </div>

      {view === 'board' && (
        <>
          <div className="mb-3 rounded-xl border border-clay-hairline bg-clay-surface px-3 py-2 flex items-center justify-between gap-3">
            <div className="flex items-start gap-2 text-xs text-clay-muted min-w-0">
              <CalendarDays className="w-4 h-4 mt-0.5 text-zams-violet shrink-0" />
              <span>Drag a deal card into another lane. Each lane <strong className="text-clay-ink">gates the info it needs</strong> (dates, sample status, nudge level) before the move saves.</span>
            </div>
            <button
              onClick={() => setCompact(!compact)}
              className={clsx(
                'shrink-0 zams-mono text-[10px] uppercase tracking-[0.16px] px-2.5 py-1.5 rounded-lg border transition-colors',
                compact ? 'border-zams-violet bg-zams-powder/50 text-zams-deep' : 'border-clay-hairline text-clay-muted hover:border-zams-mist'
              )}
            >
              {compact ? 'Full cards' : 'Compact'}
            </button>
          </div>

          {actionBoardDeals.length === 0 && (
            <div className="mb-4 rounded-xl border border-clay-hairline bg-white dark:bg-clay-card px-6 py-8 flex flex-col sm:flex-row items-center justify-center gap-5 text-center sm:text-left">
              <Image
                src="/assets/mascot-teardrop.png"
                alt="LeadPulse mascot holding a deal card"
                width={1024}
                height={1024}
                className="w-20 h-20 sm:w-24 sm:h-24 object-contain"
              />
              <div>
                <p className="text-sm font-medium text-clay-ink mb-1">No deals on the board yet</p>
                <p className="text-xs text-clay-muted">Create a deal and it will land in the outreach lane, ready for its first action.</p>
              </div>
              <button
                onClick={() => setIsModalOpen(true)}
                className="shrink-0 inline-flex items-center gap-2 px-4 py-2 bg-clay-ink text-clay-canvas text-sm font-medium rounded-lg active:opacity-85"
              >
                <Plus className="w-4 h-4" /> New deal
              </button>
            </div>
          )}
          {/* Phone: one readable lane at a time. Desktop: full board. */}
          <div className="md:hidden">
            <div className="-mx-4 px-4 flex gap-2 overflow-x-auto pb-3 snap-x">
              {WORKFLOW_LANES.map(lane => (
                <button
                  key={lane.id}
                  onClick={() => setMobileLane(lane.id)}
                  className={clsx(
                    'snap-start shrink-0 flex items-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-medium min-h-[44px]',
                    mobileLane === lane.id ? 'bg-clay-ink text-clay-canvas border-clay-ink' : 'bg-white dark:bg-clay-card text-clay-ink border-clay-hairline'
                  )}
                >
                  <span>{lane.icon}</span>
                  <span>{lane.shortLabel}</span>
                  <span className={clsx('text-xs', mobileLane === lane.id ? 'text-clay-canvas/70' : 'text-clay-muted')}>{dealsByAction[lane.id].length}</span>
                </button>
              ))}
            </div>
            {(() => {
              const lane = WORKFLOW_LANES.find(item => item.id === mobileLane)!;
              const laneDeals = dealsByAction[mobileLane];
              return (
                <section className={clsx('rounded-2xl border p-3', lane.className)}>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <h2 className="text-base font-semibold text-clay-ink flex items-center gap-2">
                        <MascotSprite src={LANE_MASCOT_PATHS[lane.id]} size={38} alt={lane.label} />
                        {lane.label}
                      </h2>
                      <p className="text-xs text-clay-muted mt-1">{lane.description}</p>
                    </div>
                    <span className="text-sm text-clay-muted bg-white/70 dark:bg-clay-card px-2 py-1 rounded-full">{laneDeals.length}</span>
                  </div>
                  <div className="space-y-2">
                    {laneDeals.map(d => (
                      <div key={d.id} className="flex items-stretch gap-1.5">
                        <div className="flex-1 min-w-0">{renderDealCard(d, { compact })}</div>
                        <button
                          onClick={() => setPickerDeal(d)}
                          className="w-11 shrink-0 flex flex-col items-center justify-center gap-0.5 rounded-xl border border-zams-mist bg-white dark:bg-clay-card text-zams-deep active:bg-zams-powder/60"
                          aria-label={`Move ${d.client} to another lane`}
                        >
                          <ArrowRight className="w-4 h-4" />
                          <span className="zams-mono text-[8px] uppercase tracking-[0.12px]">Move</span>
                        </button>
                      </div>
                    ))}
                    {laneDeals.length === 0 && <div className="border border-dashed border-clay-hairline rounded-xl px-3 py-8 text-center text-sm text-clay-muted-soft">No deals in this lane</div>}
                  </div>
                </section>
              );
            })()}
          </div>

          <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <div className="hidden md:block relative">
              <div ref={boardRef} className="flex gap-3 items-stretch overflow-x-auto pb-3 pr-1">
                {WORKFLOW_LANES.map(lane => (
                  <DroppableLane key={lane.id} laneId={lane.id} className={lane.className}>
                    <div className="flex items-start justify-between gap-2 mb-3 shrink-0">
                      <div>
                        <h2 className="text-sm font-semibold text-clay-ink flex items-center gap-2">
                          <MascotSprite src={LANE_MASCOT_PATHS[lane.id]} size={38} alt={lane.shortLabel} />
                          {lane.shortLabel}
                        </h2>
                        <p className="text-xs text-clay-muted mt-0.5 leading-snug">{lane.description}</p>
                        <p className="zams-mono text-[9px] uppercase tracking-[0.14px] text-zams-fog mt-1">{LANE_CRITERIA[lane.id]}</p>
                      </div>
                      <span className="text-xs text-clay-muted bg-white/70 dark:bg-clay-card px-2 py-0.5 rounded-full shrink-0">{dealsByAction[lane.id].length}</span>
                    </div>
                    <div className="space-y-2 flex-1 pr-0.5">
                      {dealsByAction[lane.id].map(deal => (
                        <DraggableCard
                          key={deal.id}
                          deal={deal}
                          landing={celebrate?.dealId === deal.id && celebrate?.laneId === lane.id}
                          onClick={() => setSelectedDeal(deal.id)}
                        >
                          {renderDealCard(deal, { grip: true, compact })}
                        </DraggableCard>
                      ))}
                      {dealsByAction[lane.id].length === 0 && (
                        lane.id === 'parked' ? (
                          <div className="text-center py-6 rounded-lg border-2 border-dashed border-clay-hairline flex flex-col items-center gap-2 opacity-90">
                            <MascotSprite src={LANE_MASCOT_PATHS.parked} size={44} alt="Sleepy parked mascot" />
                            <p className="text-xs text-clay-muted-soft">Nothing parked — everything is moving.</p>
                          </div>
                        ) : (
                          <div className="text-center py-6 text-xs text-clay-muted-soft border-2 border-dashed border-clay-hairline rounded-lg">Drop here</div>
                        )
                      )}
                      {celebrate && celebrate.laneId === lane.id && (
                        <div className="flex justify-center">
                          <MascotSprite
                            src={celebrate.sprite || LANE_MASCOT_PATHS[lane.id]}
                            size={40}
                            alt="Mascot celebrating"
                            className="mascot-pop"
                          />
                        </div>
                      )}
                    </div>
                  </DroppableLane>
                ))}
              </div>

              {/* Overflow indicators: fade + scroll arrows */}
              {boardScroll.canScrollRight && (
                <>
                  <div className="absolute right-0 top-0 bottom-3 w-14 bg-gradient-to-l from-clay-canvas to-transparent pointer-events-none rounded-r-xl" />
                  <button
                    onClick={() => scrollBoard(1)}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-white dark:bg-clay-card border border-clay-hairline shadow-sm flex items-center justify-center text-clay-ink hover:border-zams-violet hover:text-zams-violet transition-colors"
                    aria-label="Scroll to more lanes"
                  >
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </>
              )}
              {boardScroll.canScrollLeft && (
                <button
                  onClick={() => scrollBoard(-1)}
                  className="absolute left-1.5 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-white dark:bg-clay-card border border-clay-hairline shadow-sm flex items-center justify-center text-clay-ink hover:border-zams-violet hover:text-zams-violet transition-colors"
                  aria-label="Scroll back"
                >
                  <ArrowRight className="w-4 h-4 rotate-180" />
                </button>
              )}
            </div>
            <DragOverlay>
              {activeDragId ? (
                <div className="relative w-[272px] rotate-2">
                  {renderDealCard(deals.find(d => d.id === activeDragId)!)}
                  <MascotSprite
                    src={LANE_MASCOT_PATHS[getWorkflowAction(deals.find(d => d.id === activeDragId)!)]}
                    size={44}
                    alt="Mascot carrying the deal card"
                    className="mascot-ride absolute -top-7 -right-4"
                  />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </>
      )}

      {view === 'closed' && (
        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-clay-mint/20 rounded-xl border border-clay-mint/30 p-4"><div className="flex items-center gap-2 text-clay-teal mb-1"><TrendingUp className="w-4 h-4" /><span className="text-xs font-medium">Won</span></div><p className="text-2xl font-bold text-clay-teal">{closedDeals.filter(deal => deal.stage === 'closed_won').length}</p></div>
            <div className="bg-clay-error/10 rounded-xl border border-clay-error/20 p-4"><div className="flex items-center gap-2 text-clay-error mb-1"><AlertCircle className="w-4 h-4" /><span className="text-xs font-medium">Lost</span></div><p className="text-2xl font-bold text-clay-error">{closedDeals.filter(deal => deal.stage === 'closed_lost').length}</p></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">{closedDeals.map(d => renderDealCard(d))}</div>
        </div>
      )}

      {view === 'table' && (
        <div className="flex-1 overflow-auto bg-white dark:bg-clay-card rounded-xl border border-clay-hairline">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-clay-hairline text-left text-clay-muted text-xs uppercase tracking-wide"><th className="px-3 py-3 font-medium">Client</th><th className="px-3 py-3 font-medium">Action</th><th className="hidden sm:table-cell px-3 py-3 font-medium">Stage</th><th className="hidden sm:table-cell px-3 py-3 font-medium">Follow-up</th><th className="px-3 py-3 font-medium">Priority</th></tr></thead>
            <tbody>
              {deals.map(deal => {
                const lane = WORKFLOW_LANES.find(item => item.id === getWorkflowAction(deal))!;
                return <tr key={deal.id} onClick={() => setSelectedDeal(deal.id)} className="border-b border-clay-hairline active:bg-clay-surface cursor-pointer transition-colors"><td className="px-3 py-3"><p className="font-medium text-clay-ink">{deal.client}</p><p className="text-[10px] text-clay-muted truncate max-w-40">{deal.title}</p></td><td className="px-3 py-3"><span className="text-xs text-clay-body whitespace-nowrap">{lane.icon} {lane.shortLabel}</span>{deal.nudge_stage && <p className="text-[10px] text-clay-muted mt-0.5">{nudgeLabel(deal.nudge_stage)}</p>}</td><td className="hidden sm:table-cell px-3 py-3"><span className="text-[10px] font-medium bg-clay-card px-1.5 py-0.5 rounded text-clay-muted">{STAGE_LABELS[deal.stage]}</span></td><td className="hidden sm:table-cell px-3 py-3 text-xs text-clay-muted">{compactDate(deal.followup_date) || '—'}</td><td className="px-3 py-3"><span className={clsx('text-[10px] font-semibold px-2 py-0.5 rounded', PRIORITY_CLASSES[deal.priority])}>{PRIORITY_LABELS[deal.priority]}</span></td></tr>;
              })}
            </tbody>
          </table>
        </div>
      )}

      {activeDeal && <DealDetail deal={activeDeal} onClose={() => setSelectedDeal(null)} onSaved={refresh} />}

      {gate && (
        <LaneGateModal
          deal={gate.deal}
          targetLane={gate.target}
          onCancel={() => setGate(null)}
          onConfirm={handleGateConfirm}
        />
      )}

      {pickerDeal && (
        <LanePickerSheet
          deal={pickerDeal}
          currentLane={getWorkflowAction(pickerDeal)}
          counts={dealsByAction}
          onPick={(target) => {
            setPickerDeal(null);
            setGate({ deal: pickerDeal, target });
          }}
          onClose={() => setPickerDeal(null)}
        />
      )}

      <CreateModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSave={handleCreate} type="deal" companies={companies} contacts={contacts} />
    </div>
  );
}

/* ─── Drag & drop primitives ─── */

function DraggableCard({
  deal, onClick, landing, children,
}: {
  deal: Deal;
  onClick: () => void;
  landing?: boolean;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: deal.id });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={onClick}
      className={clsx(
        'touch-none cursor-grab active:cursor-grabbing transition-opacity',
        landing && 'clay-card-land',
        isDragging && 'opacity-40'
      )}
    >
      {children}
    </div>
  );
}

function DroppableLane({
  laneId, className, children,
}: {
  laneId: string;
  className?: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: laneId });
  return (
    <section
      ref={setNodeRef}
      className={clsx(
        'flex-1 min-w-[200px] 2xl:min-w-[150px] rounded-2xl border p-3 flex flex-col transition-colors',
        className,
        isOver && 'lane-drop-over'
      )}
    >
      {children}
    </section>
  );
}

/* ─── Mobile lane picker: tap Move, choose the lane, then the gate opens ─── */
function LanePickerSheet({
  deal, currentLane, counts, onPick, onClose,
}: {
  deal: Deal;
  currentLane: DealWorkflowAction;
  counts: Record<string, Deal[]>;
  onPick: (target: DealWorkflowAction) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[65] md:hidden flex items-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-clay-card w-full rounded-t-2xl animate-slide-up max-h-[80vh] overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-clay-card border-b border-clay-hairline px-5 py-4 z-10 flex items-start justify-between gap-3">
          <div>
            <p className="zams-eyebrow mb-0.5">Move deal</p>
            <h2 className="text-sm font-semibold text-clay-ink truncate">{deal.client}</h2>
          </div>
          <button onClick={onClose} className="p-2 text-clay-muted active:bg-clay-surface rounded-lg shrink-0">
            <ArrowRight className="w-5 h-5 -rotate-90" />
          </button>
        </div>
        <div className="p-3 space-y-1.5">
          {WORKFLOW_LANES.map(lane => (
            <button
              key={lane.id}
              onClick={() => onPick(lane.id)}
              className={clsx(
                'w-full flex items-center gap-3 px-3 py-3 rounded-lg border text-left transition-colors',
                currentLane === lane.id
                  ? 'border-zams-violet bg-zams-powder/40'
                  : 'border-clay-hairline bg-white dark:bg-clay-card active:bg-clay-surface'
              )}
            >
              <span className="text-lg shrink-0">{lane.icon}</span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium text-clay-ink truncate">{lane.label}</span>
                <span className="block zams-mono text-[9px] uppercase tracking-[0.14px] text-zams-fog mt-0.5">{LANE_CRITERIA[lane.id]}</span>
              </span>
              <span className="text-xs text-clay-muted-soft shrink-0">{counts[lane.id]?.length ?? 0}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
