'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { Deal, DealWorkflowAction, PRODUCT_OPTIONS, STAGE_LABELS } from '@/types/crm';
import { useCrm } from '@/components/CrmProvider';
import { deals as dataDeals, contacts as dataContacts, companies as dataCompanies } from '@/data/crmData';
import CreateModal from '@/components/CreateModal';
import DealDetail from '@/components/DealDetail';
import DealCardContent from '@/components/DealCardContent';
import LaneGateModal, { LaneGatePayload } from '@/components/LaneGateModal';
import ReviewFixModal, { ReviewFixPayload } from '@/components/ReviewFixModal';
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
import { Plus, TrendingUp, AlertCircle, Loader2, CalendarDays, ArrowRight, Search, X } from 'lucide-react';
import clsx from 'clsx';
import { PRIORITY_CLASSES, PRIORITY_LABELS } from '@/utils/lead-scoring';
import { formatBaht, sumLaneValues } from '@/utils/format';
import { WORKFLOW_LANES, WORKFLOW_BY_ID, LANE_MASCOT_PATHS, getWorkflowAction, isOnJourneyBoard, isJourneyLane, deriveNudge, formatDerivedNudgeBadge, lastHumanTouchDateForDeal } from '@/utils/deal-workflow';
import ExitDealModal, { ExitDealPayload } from '@/components/ExitDealModal';
import LogInteractionModal from '@/components/LogInteractionModal';
import { BoardAttentionFilter, dealNeedsReview, reviewReasons, REVIEW_LABEL, buildReviewReport, buildReviewFix, filterAndSortBoardDeals, getDoNowCounts, localDateKey } from '@/utils/deal-board';
import { buildDealCardPresentation } from '@/utils/deal-card';

type ViewMode = 'board' | 'parked' | 'won' | 'lost' | 'table';

const LANE_CRITERIA: Record<string, string> = {
  outreach: 'No gate',
  reply: 'Requires: last outreach logged',
  sample: 'Requires: address / send intent',
  testing: 'Requires: sample delivered + date',
  reschedule: 'Requires: follow-up date',
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

function whyNow(deal: Deal, due: 'overdue' | 'today' | null): string | null {
  if (!due) return null;
  if (dealNeedsReview(deal)) {
    return due === 'overdue' ? 'Past due and missing required lane details' : 'Due today but missing required lane details';
  }
  if (deal.priority === 'high') {
    return due === 'overdue' ? 'High-priority follow-up slipped' : 'High-priority follow-up due today';
  }
  const lane = WORKFLOW_BY_ID[getWorkflowAction(deal)];
  if (lane && lane.id !== 'outreach') {
    return `Scheduled ${lane.shortLabel.toLowerCase()} is ${due === 'overdue' ? 'overdue' : 'due today'}`;
  }
  return due === 'overdue' ? 'Follow-up is overdue' : 'Follow-up is due today';
}

export default function DealsPage() {
  const [view, setView] = useState<ViewMode>('board');
  const [mobileLane, setMobileLane] = useState<DealWorkflowAction>('outreach');
  const [selectedDeal, setSelectedDeal] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [gate, setGate] = useState<{ deal: Deal; target: DealWorkflowAction } | null>(null);
  const [reviewFix, setReviewFix] = useState<{ deal: Deal; reasons: ReturnType<typeof reviewReasons> } | null>(null);
  const [celebrate, setCelebrate] = useState<{ dealId: string; laneId: DealWorkflowAction; sprite?: string } | null>(null);
  const [pickerDeal, setPickerDeal] = useState<Deal | null>(null);
  const [attentionFilter, setAttentionFilter] = useState<BoardAttentionFilter>('overdue');
  const [searchQuery, setSearchQuery] = useState('');
  const [productFilter, setProductFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<Deal['priority'] | 'all'>('all');

  const { deals: dbDeals, contacts: dbContacts, companies: dbCompanies, meetings: dbMeetings, loading, refresh, createDeal, logActivity, addMeeting } = useCrm();
  const { addToast } = useToast();
  const deals: Deal[] = dbDeals.length > 0 ? dbDeals : (dataDeals as Deal[]);
  const contacts = dbContacts.length > 0 ? dbContacts : (dataContacts as any);
  const companies = dbCompanies.length > 0 ? dbCompanies : (dataCompanies as any);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  /* ─── Board overflow indicator ─── */
  const boardRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(true); // denser default so five journey lanes fit mid-width better
  const [boardScroll, setBoardScroll] = useState({ canScrollRight: false, canScrollLeft: false });
  const todayStr = localDateKey();

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
    const raf = requestAnimationFrame(update);
    el.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [view, compact]);

  const scrollBoard = (dir: 1 | -1) => {
    const el = boardRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' });
  };

  const actionBoardDeals = useMemo(
    () => deals.filter(deal => isOnJourneyBoard(deal)),
    [deals]
  );

  const doNowCounts = useMemo(
    () => getDoNowCounts(actionBoardDeals, todayStr),
    [actionBoardDeals, todayStr]
  );

  const visibleActionBoardDeals = useMemo(
    () => filterAndSortBoardDeals(actionBoardDeals, {
      attention: attentionFilter,
      search: searchQuery,
      product: productFilter,
      priority: priorityFilter,
      today: todayStr,
    }),
    [actionBoardDeals, attentionFilter, searchQuery, productFilter, priorityFilter, todayStr]
  );

  const reviewReport = useMemo(
    () => buildReviewReport(deals),
    [deals]
  );
  const productOptions = useMemo(
    () => Array.from(new Set([...PRODUCT_OPTIONS, ...actionBoardDeals.map(deal => deal.product)].filter(Boolean))).sort(),
    [actionBoardDeals]
  );

  const dealsByAction = useMemo(() => {
    const groups = Object.fromEntries(WORKFLOW_LANES.map(lane => [lane.id, [] as Deal[]])) as Record<string, Deal[]>;
    visibleActionBoardDeals.forEach(deal => {
      groups[getWorkflowAction(deal)].push(deal);
    });
    return groups;
  }, [visibleActionBoardDeals]);

  // folk-style "total deal value per stage": sum of non-null deal.value per lane.
  const laneValues = useMemo(() => sumLaneValues(WORKFLOW_LANES, dealsByAction), [dealsByAction]);

  const openPipelineValue = useMemo(
    () => WORKFLOW_LANES.reduce((acc, lane) => acc + laneValues[lane.id], 0),
    [laneValues]
  );

  const parkedDeals = useMemo(
    () => deals.filter(deal => getWorkflowAction(deal) === 'parked' && deal.stage !== 'closed_won' && deal.stage !== 'closed_lost'),
    [deals]
  );
  const wonDeals = useMemo(() => deals.filter(deal => deal.stage === 'closed_won'), [deals]);
  const lostDeals = useMemo(() => deals.filter(deal => deal.stage === 'closed_lost'), [deals]);

  const [exitModal, setExitModal] = useState<{ deal: Deal; kind: 'won' | 'lost' | 'park' } | null>(null);
  const [logDealId, setLogDealId] = useState<string | null>(null);

  const stats = useMemo(() => {
    return {
      active: actionBoardDeals.length,
      parked: parkedDeals.length,
      dueToday: doNowCounts.today,
      won: wonDeals.length,
    };
  }, [actionBoardDeals, parkedDeals, wonDeals, doNowCounts.today]);

  const activeDeal = selectedDeal ? deals.find(deal => deal.id === selectedDeal) : null;

  const filtersActive = attentionFilter !== 'all' || searchQuery.trim() !== '' || productFilter !== 'all' || priorityFilter !== 'all';
  const clearDoNowFilters = () => {
    setAttentionFilter('all');
    setSearchQuery('');
    setProductFilter('all');
    setPriorityFilter('all');
  };

  const focusAttention = (filter: BoardAttentionFilter) => {
    setView('board');
    setAttentionFilter(filter);
  };

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
    if (!isJourneyLane(over as DealWorkflowAction)) return; // exits are never drag targets
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
    if (target === 'testing' || target === 'reschedule') updates.followup_date = payload.followup_date || null;
    if (target === 'testing' && payload.sample_status) updates.sample_status = payload.sample_status;
    if (target !== 'sample' && target !== 'testing') {
      /* keep existing sample_status on other lanes */
    } else if (target === 'sample') {
      updates.sample_status = payload.sample_status || null;
    }
    updates.nudge_stage = null; // nudges are derived — never stored from drag
    if (target === 'outreach' && payload.next_action) updates.next_action = payload.next_action;
    if (target === 'reply') {
      if (payload.reply_outcome) {
        const detail = payload.reply_summary ? `: ${payload.reply_summary}` : '';
        updates.last_outcome = appendOutcome(deal.last_outcome, timestampedEntry(`💬 Client replied — ${payload.reply_outcome}${detail}`));
      } else if (payload.outreach_logged) {
        updates.last_outcome = appendOutcome(deal.last_outcome, timestampedEntry('✅ Outreach logged — waiting on reply'));
      }
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
        return { ...base, type: payload.channel, description: `${chLabel} outreach — ${deal.client}`, summary: payload.next_action || null, outcome: null, followup_date: null, contact_ids: payload.contact_ids || deal.contact_ids || [] };
      }
      if (target === 'reply' && payload.channel && payload.reply_outcome) {
        const chLabel = payload.channel === 'dm' ? 'DM' : payload.channel === 'email' ? 'Email' : 'Call';
        return { ...base, type: payload.channel, description: `${chLabel} reply from ${deal.client}`, summary: payload.reply_summary || null, outcome: payload.reply_outcome, followup_date: null, contact_ids: payload.contact_ids || deal.contact_ids || [] };
      }
      if (target === 'sample' && payload.sample_status) {
        return { ...base, type: 'sample_sent', description: `Sample ${payload.sample_status} — ${deal.client}`, summary: null, outcome: null, followup_date: null, contact_ids: payload.contact_ids || deal.contact_ids || [] };
      }
      return null;
    })();
    if (meetingToLog) {
      await addMeeting(meetingToLog as any);
    }
    setGate(null);
    setCelebrate({ dealId: deal.id, laneId: target, sprite: LANE_MASCOT_PATHS[target] });
    setTimeout(() => setCelebrate(null), 900);
    addToast(`${lane.icon} Moved to ${lane.shortLabel}`);
    await refresh();
  };

  const handleReviewFixConfirm = async (payload: ReviewFixPayload) => {
    if (!reviewFix) return;
    const { deal, reasons } = reviewFix;
    const updates = buildReviewFix(reasons, payload);
    if (Object.keys(updates).length === 0) {
      setReviewFix(null);
      return;
    }
    const before: Partial<Deal> = {
      sample_status: deal.sample_status || null,
      followup_date: deal.followup_date,
      nudge_stage: deal.nudge_stage || null,
      last_outcome: deal.last_outcome,
      next_action: deal.next_action,
    };
    const label = WORKFLOW_BY_ID[getWorkflowAction(deal)].shortLabel;
    await crm.updateDeal(deal.id, updates);
    logActivity({
      type: 'edit',
      entity: 'deal',
      entityId: deal.id,
      label: `🔧 Data hygiene fix · ${label}`,
      description: `Completed missing fields for ${deal.client} (${reasons.map(r => REVIEW_LABEL[r]).join(', ')})`,
      undoPayload: before,
    });
    setReviewFix(null);
    addToast(`✓ ${deal.client} review flag cleared`);
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
    const action = getWorkflowAction(deal);
    const derived = deriveNudge(deal, todayStr, {
      lastHumanTouch: lastHumanTouchDateForDeal(dbMeetings || [], deal.id),
    });
    const nudge = derived ? formatDerivedNudgeBadge(derived) : null;
    const nudgeStage = derived?.stage ?? null;
    const lane = WORKFLOW_BY_ID[action];
    const due = dueStateFor(deal, todayStr);
    const reason = whyNow(deal, due);
    const reasons = reviewReasons(deal);
    const isCompact = !!opts?.compact;
    const presentation = buildDealCardPresentation(deal, contacts, companies, due);

    return (
      <button
        key={deal.id}
        onClick={() => setSelectedDeal(deal.id)}
        className={clsx(
          'w-full text-left bg-white dark:bg-clay-card rounded-xl border transition-all active:scale-[0.98] active:bg-clay-surface',
          isCompact ? 'p-2.5' : 'p-3',
          'border-clay-hairline',
          due === 'overdue' && 'border-l-2 border-l-clay-error',
          due === 'today' && 'border-l-2 border-l-clay-ochre'
        )}
      >
        <DealCardContent
          deal={deal}
          presentation={presentation}
          whyNow={reason}
          reviewLabels={reasons.map(item => REVIEW_LABEL[item])}
          nudge={nudge}
          nudgeStage={nudgeStage}
          silenceDays={derived?.silenceDays ?? null}
          compact={isCompact}
          showGrip={opts?.grip}
        />
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
          <p className="text-xs md:text-sm text-clay-muted mt-1">Journey only — Won / Lost / Park are exits, not columns. Nudges derive from follow-up + silence.</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="clay-btn-primary shrink-0"
        >
          <Plus className="w-4 h-4" /> <span className="hidden sm:inline">New deal</span>
        </button>
      </div>



      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <button onClick={() => setView('board')} className="bg-white dark:bg-clay-card border border-clay-hairline rounded-xl p-3 text-left active:scale-[0.98]"><p className="zams-eyebrow">Active</p><p className="text-xl font-semibold text-clay-ink">{stats.active}</p></button>
        <button onClick={() => focusAttention('today')} className="bg-clay-ochre/10 border border-clay-ochre/20 rounded-xl p-3 text-left active:scale-[0.98] transition-transform"><p className="zams-eyebrow text-clay-ochre">Due today</p><p className="text-xl font-semibold text-clay-ochre">{stats.dueToday}</p></button>
        <button onClick={() => setView('parked')} className="bg-clay-card border border-clay-hairline rounded-xl p-3 text-left active:scale-[0.98]"><p className="zams-eyebrow">Parked</p><p className="text-xl font-semibold text-clay-ink">{stats.parked}</p></button>
        <button onClick={() => setView('won')} className="bg-clay-mint/20 border border-clay-mint/30 rounded-xl p-3 text-left active:scale-[0.98]"><p className="zams-eyebrow text-clay-teal">Won</p><p className="text-xl font-semibold text-clay-teal">{stats.won}</p></button>
      </div>

      <div className="flex bg-clay-card rounded-lg p-0.5 mb-4 overflow-x-auto">
        <button onClick={() => setView('board')} className={clsx('flex-1 px-3 py-2 text-xs font-medium rounded-md whitespace-nowrap', view === 'board' ? 'bg-clay-ink text-clay-canvas' : 'text-clay-muted')}>Journey</button>
        <button onClick={() => setView('parked')} className={clsx('flex-1 px-3 py-2 text-xs font-medium rounded-md whitespace-nowrap', view === 'parked' ? 'bg-clay-ink text-clay-canvas' : 'text-clay-muted')}>Parked</button>
        <button onClick={() => setView('won')} className={clsx('flex-1 px-3 py-2 text-xs font-medium rounded-md whitespace-nowrap', view === 'won' ? 'bg-clay-ink text-clay-canvas' : 'text-clay-muted')}>Won</button>
        <button onClick={() => setView('lost')} className={clsx('flex-1 px-3 py-2 text-xs font-medium rounded-md whitespace-nowrap', view === 'lost' ? 'bg-clay-ink text-clay-canvas' : 'text-clay-muted')}>Lost</button>
        <button onClick={() => setView('table')} className={clsx('flex-1 px-3 py-2 text-xs font-medium rounded-md whitespace-nowrap', view === 'table' ? 'bg-clay-ink text-clay-canvas' : 'text-clay-muted')}>Table</button>
      </div>

      {view === 'board' && (
        <>
          <section className="mb-3 rounded-xl border border-clay-hairline bg-white dark:bg-clay-card px-3 py-2.5 md:px-4" aria-label="Do now filters">
            <div className="flex items-center justify-between gap-3 mb-2.5">
              <div className="flex items-baseline gap-2 min-w-0">
                <p className="zams-eyebrow">Do now</p>
                <p className="text-xs text-clay-muted truncate">Showing {visibleActionBoardDeals.length} of {actionBoardDeals.length}</p>
              </div>
              {filtersActive && (
                <button
                  onClick={clearDoNowFilters}
                  className="inline-flex items-center gap-1.5 min-h-[44px] rounded-lg border border-clay-hairline px-2.5 text-xs font-medium text-clay-muted active:bg-clay-surface"
                >
                  <X className="w-3.5 h-3.5" /> Clear
                </button>
              )}
            </div>

            <div className="-mx-3 px-3 md:mx-0 md:px-0 flex gap-2 overflow-x-auto pb-2" role="group" aria-label="Attention filter">
              {([
                ['all', 'All', doNowCounts.all],
                ['overdue', 'Overdue', doNowCounts.overdue],
                ['today', 'Due today', doNowCounts.today],
                ['needs-review', 'Needs review', doNowCounts.needsReview],
              ] as Array<[BoardAttentionFilter, string, number]>).map(([value, label, count]) => (
                <button
                  key={value}
                  onClick={() => setAttentionFilter(value)}
                  aria-pressed={attentionFilter === value}
                  className={clsx(
                    'shrink-0 min-h-[44px] rounded-xl border px-3 text-sm font-medium transition-colors',
                    attentionFilter === value
                      ? value === 'overdue'
                        ? 'border-clay-error bg-clay-error/10 text-clay-error'
                        : value === 'today'
                          ? 'border-clay-ochre bg-clay-ochre/10 text-clay-ochre'
                          : 'border-clay-lavender bg-clay-lavender/20 text-clay-ink'
                      : 'border-clay-hairline bg-clay-card text-clay-muted'
                  )}
                >
                  {label} <span className="ml-1 font-mono text-[11px] opacity-75">{count}</span>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-[minmax(240px,1fr)_180px_150px] gap-2 mt-1">
              <label className="relative col-span-2 md:col-span-1">
                <span className="sr-only">Search by client or deal name</span>
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-clay-muted pointer-events-none" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={event => setSearchQuery(event.target.value)}
                  placeholder="Search client or deal"
                  className="w-full min-h-[44px] rounded-lg border border-clay-hairline bg-white dark:bg-clay-card pl-9 pr-3 text-base md:text-sm text-clay-ink placeholder:text-clay-muted-soft focus:outline-none focus:ring-2 focus:ring-clay-lavender"
                />
              </label>

              <label>
                <span className="sr-only">Filter by product</span>
                <select
                  value={productFilter}
                  onChange={event => setProductFilter(event.target.value)}
                  className="w-full min-h-[44px] rounded-lg border border-clay-hairline bg-white dark:bg-clay-card px-3 text-base md:text-sm text-clay-ink focus:outline-none focus:ring-2 focus:ring-clay-lavender"
                >
                  <option value="all">All products</option>
                  {productOptions.map(product => <option key={product} value={product}>{product}</option>)}
                </select>
              </label>

              <label>
                <span className="sr-only">Filter by priority</span>
                <select
                  value={priorityFilter}
                  onChange={event => setPriorityFilter(event.target.value as Deal['priority'] | 'all')}
                  className="w-full min-h-[44px] rounded-lg border border-clay-hairline bg-white dark:bg-clay-card px-3 text-base md:text-sm text-clay-ink focus:outline-none focus:ring-2 focus:ring-clay-lavender"
                >
                  <option value="all">All priorities</option>
                  <option value="high">High priority</option>
                  <option value="medium">Medium priority</option>
                  <option value="low">Low priority</option>
                </select>
              </label>
            </div>
          </section>

          <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-clay-ochre/30 bg-clay-ochre/5 px-4 py-3">
            <div className="flex items-center gap-2 min-w-0">
              <TrendingUp className="w-4 h-4 text-clay-ochre shrink-0" />
              <span className="text-sm font-medium text-clay-ink truncate">Open pipeline</span>
            </div>
            <span className="zams-mono text-base font-bold text-clay-ochre shrink-0">{formatBaht(openPipelineValue)}</span>
          </div>

          {attentionFilter === 'needs-review' && (
            <section className="mb-3 rounded-xl border border-clay-lavender/30 bg-clay-lavender/5 p-3 md:p-4" aria-label="Data hygiene review queue">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <p className="zams-eyebrow mb-0.5">Data hygiene · dry run</p>
                  <p className="text-sm font-semibold text-clay-ink">{reviewReport.length} deal{reviewReport.length === 1 ? '' : 's'} need review</p>
                </div>
                <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-medium text-clay-muted bg-clay-card border border-clay-hairline px-2 py-1 rounded-full">
                  <AlertCircle className="w-3 h-3" /> Read-only · no changes made
                </span>
              </div>
              <p className="text-[11px] text-clay-muted mb-3">These deals violate a lane requirement (existing or imported). Review the reason and suggested fix — nothing is edited until you open a deal and save it yourself.</p>
              <ul className="space-y-2">
                {reviewReport.map(item => (
                  <li key={item.deal.id} className="rounded-lg border border-clay-hairline bg-white dark:bg-clay-card p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-clay-ink truncate">{item.deal.client}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[10px] font-medium text-clay-lavender bg-clay-lavender/15 px-1.5 py-0.5 rounded">{WORKFLOW_BY_ID[item.lane].shortLabel}</span>
                        <button
                          onClick={() => setReviewFix({ deal: item.deal, reasons: item.reasons })}
                          className="text-[10px] font-semibold text-clay-canvas bg-clay-lavender px-2 py-0.5 rounded active:opacity-85"
                        >
                          Fix
                        </button>
                      </div>
                    </div>
                    <ul className="mt-1.5 space-y-0.5">
                      {item.labels.map(label => (
                        <li key={label} className="text-[11px] text-clay-body flex items-start gap-1.5">
                          <span className="text-clay-lavender mt-0.5">•</span>
                          <span>{label}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="text-[11px] text-clay-muted mt-1.5 leading-relaxed">Fix: {item.fix}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="mb-3 rounded-xl border border-clay-hairline bg-clay-surface px-3 py-2 flex items-center justify-between gap-3">
            <div className="flex items-start gap-2 text-xs text-clay-muted min-w-0">
              <CalendarDays className="w-4 h-4 mt-0.5 text-clay-lavender shrink-0" />
              <span>Drag along the journey only. Won / Lost / Park are exits from the card menu — never columns.</span>
            </div>
            <button
              onClick={() => setCompact(!compact)}
              className={clsx(
                'shrink-0 zams-mono text-[10px] uppercase tracking-[0.16px] min-h-[44px] px-2.5 py-1.5 rounded-lg border transition-colors',
                compact ? 'border-clay-lavender bg-clay-lavender/20 text-clay-lavender' : 'border-clay-hairline text-clay-muted hover:border-clay-muted-soft'
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
          {actionBoardDeals.length > 0 && visibleActionBoardDeals.length === 0 && (
            <div className="mb-4 rounded-xl border border-clay-hairline bg-white dark:bg-clay-card px-5 py-6 flex flex-col sm:flex-row items-center justify-center gap-3 text-center sm:text-left">
              <div className="flex-1">
                <p className="text-sm font-medium text-clay-ink">No deals match this Do now view</p>
                <p className="text-xs text-clay-muted mt-1">Clear a filter or search for another client.</p>
              </div>
              <button onClick={clearDoNowFilters} className="min-h-[44px] rounded-lg bg-clay-ink px-4 text-sm font-medium text-clay-canvas active:opacity-85">
                Show all deals
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
                  <span className={clsx('text-xs', mobileLane === lane.id ? 'text-clay-canvas/70' : 'text-clay-muted')}>{dealsByAction[lane.id].length} · {formatBaht(laneValues[lane.id])}</span>
                </button>
              ))}
            </div>
            {(() => {
              const lane = WORKFLOW_LANES.find(item => item.id === mobileLane)!;
              const laneDeals = dealsByAction[mobileLane];
              return (
                <section data-lane-id={lane.id} className={clsx('rounded-2xl border p-3', lane.className)}>
                  <div data-lane-header className="mb-2 space-y-1">
                    <div data-lane-title className="flex min-w-0 items-center gap-2">
                      <MascotSprite src={LANE_MASCOT_PATHS[lane.id]} size={32} alt={lane.label} />
                      <h2 className="min-w-0 flex-1 text-base font-semibold text-clay-ink">{lane.label}</h2>
                    </div>
                    <p className="line-clamp-1 min-h-[1.25rem] text-[11px] text-clay-muted">{lane.description}</p>
                    <div className="flex justify-end">
                      <span data-lane-stats className="whitespace-nowrap text-sm text-clay-muted bg-white/70 dark:bg-clay-card px-2 py-1 rounded-full">{laneDeals.length} · {formatBaht(laneValues[lane.id])}</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {laneDeals.map(d => (
                      <div key={d.id} className="flex flex-wrap items-stretch gap-1.5">
                        <div className="flex-1 min-w-[min(100%,12rem)]">{renderDealCard(d, { compact })}</div>
                        <button
                          onClick={() => setPickerDeal(d)}
                          className="w-11 shrink-0 flex flex-col items-center justify-center gap-0.5 rounded-xl border border-clay-hairline bg-white dark:bg-clay-card text-clay-ink active:bg-clay-lavender/20"
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
              <div ref={boardRef} className="flex gap-2.5 items-stretch overflow-x-auto pb-3 pl-0.5 pr-8 scroll-smooth snap-x snap-mandatory [scrollbar-gutter:stable]">
                {WORKFLOW_LANES.map(lane => (
                  <DroppableLane key={lane.id} laneId={lane.id} className={lane.className}>
                    <div data-lane-header className="mb-2 shrink-0 space-y-1">
                      <div data-lane-title className="flex min-w-0 items-center gap-2">
                        <MascotSprite src={LANE_MASCOT_PATHS[lane.id]} size={32} alt={lane.shortLabel} />
                        <h2 className="min-w-0 flex-1 text-sm font-semibold text-clay-ink">{lane.shortLabel}</h2>
                      </div>
                      <p className="line-clamp-1 min-h-[1.25rem] text-[11px] leading-snug text-clay-muted">{lane.description}</p>
                      <div className="flex min-w-0 items-center justify-between gap-2">
                        <p className="zams-mono min-w-0 truncate text-[9px] uppercase tracking-[0.14px] text-clay-muted-soft">{LANE_CRITERIA[lane.id]}</p>
                        <span data-lane-stats className="shrink-0 whitespace-nowrap text-xs text-clay-muted bg-white/70 dark:bg-clay-card px-2 py-0.5 rounded-full">{dealsByAction[lane.id].length} · {formatBaht(laneValues[lane.id])}</span>
                      </div>
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
                        <div className="text-center py-6 text-xs text-clay-muted-soft border-2 border-dashed border-clay-hairline rounded-lg">Drop here</div>
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

              {/* Overflow indicators: wider fades + scroll arrows so mid-width clipping is obvious */}
              {boardScroll.canScrollRight && (
                <>
                  <div className="absolute right-0 top-0 bottom-3 w-24 bg-gradient-to-l from-clay-canvas via-clay-canvas/85 to-transparent pointer-events-none rounded-r-xl" />
                  <button
                    onClick={() => scrollBoard(1)}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-clay-ink text-clay-canvas border border-clay-ink shadow-md flex items-center justify-center hover:opacity-90 transition-opacity"
                    aria-label="Scroll to more lanes"
                  >
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </>
              )}
              {boardScroll.canScrollLeft && (
                <>
                  <div className="absolute left-0 top-0 bottom-3 w-16 bg-gradient-to-r from-clay-canvas via-clay-canvas/80 to-transparent pointer-events-none rounded-l-xl" />
                  <button
                    onClick={() => scrollBoard(-1)}
                    className="absolute left-1.5 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-clay-ink text-clay-canvas border border-clay-ink shadow-md flex items-center justify-center hover:opacity-90 transition-opacity"
                    aria-label="Scroll back"
                  >
                    <ArrowRight className="w-4 h-4 rotate-180" />
                  </button>
                </>
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

      {view === 'parked' && (
        <div className="flex-1 overflow-y-auto">
          <p className="text-sm text-clay-muted mb-3">Parked queue — revisit dates, not a journey column.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {parkedDeals.length === 0 ? (
              <div className="col-span-full rounded-xl border border-dashed border-clay-hairline p-8 text-center text-sm text-clay-muted">Nothing parked.</div>
            ) : parkedDeals.map(d => renderDealCard(d))}
          </div>
        </div>
      )}

      {view === 'won' && (
        <div className="flex-1 overflow-y-auto">
          <p className="text-sm text-clay-muted mb-3">Won filter — marked via exit, never by dragging to a column.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {wonDeals.length === 0 ? (
              <div className="col-span-full rounded-xl border border-dashed border-clay-hairline p-8 text-center text-sm text-clay-muted">No won deals yet.</div>
            ) : wonDeals.map(d => renderDealCard(d))}
          </div>
        </div>
      )}

      {view === 'lost' && (
        <div className="flex-1 overflow-y-auto">
          <p className="text-sm text-clay-muted mb-3">Lost filter — reason captured on exit.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {lostDeals.length === 0 ? (
              <div className="col-span-full rounded-xl border border-dashed border-clay-hairline p-8 text-center text-sm text-clay-muted">No lost deals.</div>
            ) : lostDeals.map(d => renderDealCard(d))}
          </div>
        </div>
      )}

      {view === 'table' && (
        <div className="flex-1 overflow-auto bg-white dark:bg-clay-card rounded-xl border border-clay-hairline">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-clay-hairline text-left text-clay-muted text-xs uppercase tracking-wide"><th className="px-3 py-3 font-medium">Client</th><th className="px-3 py-3 font-medium">Action</th><th className="hidden sm:table-cell px-3 py-3 font-medium">Stage</th><th className="hidden sm:table-cell px-3 py-3 font-medium">Follow-up</th><th className="px-3 py-3 font-medium">Priority</th></tr></thead>
            <tbody>
              {deals.map(deal => {
                const lane = WORKFLOW_BY_ID[getWorkflowAction(deal)];
                const derived = deriveNudge(deal, todayStr, {
      lastHumanTouch: lastHumanTouchDateForDeal(dbMeetings || [], deal.id),
    });
                return <tr key={deal.id} onClick={() => setSelectedDeal(deal.id)} className="border-b border-clay-hairline active:bg-clay-surface cursor-pointer transition-colors"><td className="px-3 py-3"><p className="font-medium text-clay-ink">{deal.client}</p><p className="text-[10px] text-clay-muted truncate max-w-40">{deal.title}</p></td><td className="px-3 py-3"><span className="text-xs text-clay-body whitespace-nowrap">{lane.icon} {lane.shortLabel}</span>{derived && <p className="text-[10px] text-clay-muted mt-0.5">{formatDerivedNudgeBadge(derived)}</p>}</td><td className="hidden sm:table-cell px-3 py-3"><span className="text-[10px] font-medium bg-clay-card px-1.5 py-0.5 rounded text-clay-muted">{STAGE_LABELS[deal.stage]}</span></td><td className="hidden sm:table-cell px-3 py-3 text-xs text-clay-muted">{compactDate(deal.followup_date) || '—'}</td><td className="px-3 py-3"><span className={clsx('text-[10px] font-semibold px-2 py-0.5 rounded', PRIORITY_CLASSES[deal.priority])}>{PRIORITY_LABELS[deal.priority]}</span></td></tr>;
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
          contacts={contacts}
          companies={companies}
          onCancel={() => setGate(null)}
          onConfirm={handleGateConfirm}
        />
      )}

      {reviewFix && (
        <ReviewFixModal
          deal={reviewFix.deal}
          reasons={reviewFix.reasons}
          onCancel={() => setReviewFix(null)}
          onConfirm={handleReviewFixConfirm}
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
          onExit={(kind) => {
            const d = pickerDeal;
            setPickerDeal(null);
            setExitModal({ deal: d, kind });
          }}
          onClose={() => setPickerDeal(null)}
        />
      )}

      {exitModal && (
        <ExitDealModal
          deal={exitModal.deal}
          kind={exitModal.kind}
          onCancel={() => setExitModal(null)}
          onConfirm={async (payload: ExitDealPayload) => {
            const d = exitModal.deal;
            const before: Partial<Deal> = {
              stage: d.stage,
              workflow_action: getWorkflowAction(d),
              followup_date: d.followup_date,
              value: d.value,
              last_outcome: d.last_outcome,
              close_date: d.close_date || null,
              won_note: d.won_note || null,
              lost_reason: d.lost_reason || null,
              park_reason: d.park_reason || null,
            };
            if (payload.kind === 'won') {
              await crm.updateDeal(d.id, {
                stage: 'closed_won',
                workflow_action: 'success',
                followup_date: null,
                close_date: payload.close_date || null,
                won_note: payload.won_note || null,
                value: payload.value != null ? payload.value : d.value,
                nudge_stage: null,
              });
              if (d.company_id) {
                try {
                  await crm.createAccountEvent({
                    company_id: d.company_id,
                    event_date: payload.close_date || todayStr,
                    amount: Number(payload.value ?? d.value) > 0 ? Number(payload.value ?? d.value) : 0,
                    product_line: d.product || null,
                    order_id: `deal_${d.id}`,
                  });
                } catch (e) {
                  console.error(e);
                }
              }
              logActivity({ type: 'edit', entity: 'deal', entityId: d.id, label: '🎉 Marked won', description: `${d.client} closed as won`, undoPayload: before });
              addToast('Deal marked won');
            } else if (payload.kind === 'lost') {
              await crm.updateDeal(d.id, {
                stage: 'closed_lost',
                workflow_action: 'parked',
                followup_date: null,
                lost_reason: payload.lost_reason || null,
                nudge_stage: null,
              });
              logActivity({ type: 'edit', entity: 'deal', entityId: d.id, label: '📉 Marked lost', description: `${d.client} closed as lost`, undoPayload: before });
              addToast('Deal marked lost');
            } else {
              await crm.updateDeal(d.id, {
                workflow_action: 'parked',
                followup_date: payload.followup_date || null,
                park_reason: payload.park_reason || null,
                nudge_stage: null,
              });
              logActivity({ type: 'edit', entity: 'deal', entityId: d.id, label: '⏸ Parked', description: `${d.client} parked`, undoPayload: before });
              addToast('Deal parked');
            }
            setExitModal(null);
            await refresh();
          }}
        />
      )}

      {logDealId && (
        <LogInteractionModal
          isOpen={!!logDealId}
          onClose={() => setLogDealId(null)}
          onSave={async (meeting) => { await addMeeting(meeting); setLogDealId(null); await refresh(); }}
          deals={deals}
          contacts={contacts}
          companies={companies}
          selectedDealId={logDealId}
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
      data-lane-id={laneId}
      className={clsx(
        'flex-1 min-w-[11.5rem] max-w-[18rem] snap-start rounded-2xl border p-2.5 flex flex-col transition-colors',
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
  deal, currentLane, counts, onPick, onExit, onClose,
}: {
  deal: Deal;
  currentLane: DealWorkflowAction;
  counts: Record<string, Deal[]>;
  onPick: (target: DealWorkflowAction) => void;
  onExit: (kind: 'won' | 'lost' | 'park') => void;
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
          <p className="zams-mono text-[9px] uppercase tracking-[0.14px] text-clay-muted px-1">Journey</p>
          {WORKFLOW_LANES.map(lane => (
            <button
              key={lane.id}
              onClick={() => onPick(lane.id)}
              className={clsx(
                'w-full flex items-center gap-3 px-3 py-3 rounded-lg border text-left transition-colors',
                currentLane === lane.id
                  ? 'border-clay-lavender bg-clay-lavender/20'
                  : 'border-clay-hairline bg-white dark:bg-clay-card active:bg-clay-surface'
              )}
            >
              <span className="text-lg shrink-0">{lane.icon}</span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium text-clay-ink truncate">{lane.label}</span>
                <span className="block zams-mono text-[9px] uppercase tracking-[0.14px] text-clay-muted-soft mt-0.5">{LANE_CRITERIA[lane.id]}</span>
              </span>
              <span className="text-xs text-clay-muted-soft shrink-0">{counts[lane.id]?.length ?? 0}</span>
            </button>
          ))}
          <p className="zams-mono text-[9px] uppercase tracking-[0.14px] text-clay-muted px-1 pt-2">Exits (not columns)</p>
          {([
            ['won', '🎉 Mark won'],
            ['lost', '📉 Mark lost'],
            ['park', '⏸ Park'],
          ] as const).map(([kind, label]) => (
            <button
              key={kind}
              onClick={() => onExit(kind)}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-lg border border-clay-hairline bg-white dark:bg-clay-card text-left active:bg-clay-surface"
            >
              <span className="text-sm font-medium text-clay-ink">{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
