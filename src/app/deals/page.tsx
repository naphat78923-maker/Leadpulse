'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Deal, DealWorkflowAction, PRODUCT_OPTIONS, STAGE_LABELS } from '@/types/crm';
import { useCrm } from '@/components/CrmProvider';
import { useQuerySelection } from '@/hooks/useQuerySelection';
import CreateModal from '@/components/CreateModal';
import ProspectsTab from '@/components/ProspectsTab';
import DealDetail from '@/components/DealDetail';
import DealCardPrimaryAction from '@/components/DealCardPrimaryAction';
import DealCardContent from '@/components/DealCardContent';
import CompanyLogo from '@/components/CompanyLogo';
import LaneGateModal, { LaneGatePayload } from '@/components/LaneGateModal';
import ReviewFixModal, { ReviewFixPayload } from '@/components/ReviewFixModal';
import { useToast } from '@/components/ToastProvider';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
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
import { Plus, AlertCircle, Loader2, ArrowRight, Search, X } from 'lucide-react';
import clsx from 'clsx';
import { PRIORITY_CLASSES, PRIORITY_LABELS } from '@/utils/deal-card';
import { formatBaht, sumLaneValues } from '@/utils/format';
import { calculateWeightedForecast, calculateSourcePerformance } from '@/utils/analytics-metrics';
import { WORKFLOW_LANES, WORKFLOW_BY_ID, getWorkflowAction, isOnJourneyBoard, isJourneyLane, deriveNudge, formatDerivedNudgeBadge, outboundSendCountForDeal } from '@/utils/deal-workflow';
import ExitDealModal, { ExitDealPayload } from '@/components/ExitDealModal';
import LogInteractionModal from '@/components/LogInteractionModal';
import { BoardAttentionFilter, dealNeedsReview, reviewReasons, REVIEW_LABEL, buildReviewReport, buildReviewFix, filterAndSortBoardDeals, findDealsMatchingSearch, getDoNowCounts, localDateKey } from '@/utils/deal-board';
import type { DealCardPrimaryAction as DealCardPrimaryActionSpec } from '@/utils/deal-card';
import { buildCloseUpdate } from '@/utils/deal-close';
import { buildLaneGateDecision } from '@/utils/lane-gate';
import { buildDealCardPresentation } from '@/utils/deal-card';
import { PageTransition, StaggerList, StaggerItem } from '@/components/motion';
import { Blob } from '@/components/blob';
import { LANE_BLOB_STATE } from '@/utils/lane-blob';
import { EASE_OUT, pressScale, springPress, tweenBase } from '@/lib/motion';

type ViewMode = 'prospects' | 'board' | 'parked' | 'won' | 'lost' | 'table';

const LANE_CRITERIA: Record<string, string> = {
  outreach: 'No gate',
  reply: 'Requires: last outreach logged',
  sample: 'Requires: address / send intent',
  testing: 'Requires: sample delivered + date',
  reschedule: 'Requires: follow-up date',
};

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

// Suspense boundary for useSearchParams (via useQuerySelection) — see its docs.
export default function DealsPage() {
  return (
    <Suspense>
      <DealsBoard />
    </Suspense>
  );
}

function DealsBoard() {
  const [view, setView] = useState<ViewMode>('board');
  const [mobileLane, setMobileLane] = useState<DealWorkflowAction>('outreach');
  const [selectedDeal, setSelectedDeal] = useQuerySelection('deal');
  const [isModalOpen, setIsModalOpen] = useState(false);
  // Set by a prospect's "Start a deal"; kept in state so the form sees a stable object.
  const [dealPrefill, setDealPrefill] = useState<{ company_id: string } | undefined>();
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [gate, setGate] = useState<{ deal: Deal; target: DealWorkflowAction } | null>(null);
  const [reviewFix, setReviewFix] = useState<{ deal: Deal; reasons: ReturnType<typeof reviewReasons> } | null>(null);
  const [celebrate, setCelebrate] = useState<{ dealId: string; laneId: DealWorkflowAction } | null>(null);
  const [pickerDeal, setPickerDeal] = useState<Deal | null>(null);
  const [attentionFilter, setAttentionFilter] = useState<BoardAttentionFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [productFilter, setProductFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<Deal['priority'] | 'all'>('all');

  const { deals: dbDeals, contacts: dbContacts, companies: dbCompanies, meetings: dbMeetings, loading, refresh, createDeal, logActivity, addMeeting } = useCrm();
  const { addToast } = useToast();
  const reduceMotion = usePrefersReducedMotion();
  const deals: Deal[] = dbDeals;
  const contacts = dbContacts;
  const companies = dbCompanies;

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

  // Salvaged from the deprecated /analytics page — the two honest numbers it
  // had: probability-weighted open forecast, and win rate per lead source
  // (resolved outcomes only).
  const weightedForecast = useMemo(() => calculateWeightedForecast(deals), [deals]);
  const sourceRows = useMemo(() => calculateSourcePerformance(deals, companies), [deals, companies]);

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

  // A deal filtered out must not read as missing: search across every deal, keeping the query.
  const searchEscapeMatches = useMemo(
    () => findDealsMatchingSearch(deals, searchQuery, todayStr),
    [deals, searchQuery, todayStr]
  );
  const tableDeals = searchQuery.trim() ? searchEscapeMatches : deals;

  // Escape hatch: keep the query, drop the board filters, and list every deal (parked/won too).
  const searchAllDeals = () => {
    setAttentionFilter('all');
    setProductFilter('all');
    setPriorityFilter('all');
    setView('table');
  };

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

  // The card's one contextual action. It opens the right form — nothing is sent from here,
  // and "Set next action" opens the deal instead of inventing a step.
  const handleCardPrimaryAction = (deal: Deal, action: DealCardPrimaryActionSpec) => {
    if (action.opensLogForm) {
      setLogDealId(deal.id);
      return;
    }
    setSelectedDeal(deal.id);
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

    // One pure decision, shared with the event rules: "no response" is a wait, not a reply, and
    // the interaction is dated on the business calendar.
    const { updates, meeting } = buildLaneGateDecision(
      deal,
      {
        target,
        channel: payload.channel ?? null,
        reply_outcome: payload.reply_outcome ?? null,
        reply_summary: payload.reply_summary ?? null,
        next_action: payload.next_action ?? null,
        sample_status: payload.sample_status ?? null,
        followup_date: payload.followup_date ?? null,
        contact_ids: payload.contact_ids,
      },
      { dateKey: todayStr }
    );

    try {
      // Version-checked like the other write paths: two concurrent moves cannot silently
      // overwrite one another.
      await crm.updateDealIfUnchanged(deal.id, deal.updated_at, updates);
    } catch (err) {
      setGate(null);
      const message = err instanceof Error ? err.message : 'This deal changed before the move was saved';
      addToast(message, 'error');
      await refresh();
      return;
    }

    logActivity({
      type: 'edit',
      entity: 'deal',
      entityId: deal.id,
      label: `${lane.icon} ${lane.label}`,
      description: `${deal.client} moved to the ${lane.shortLabel} lane`,
      undoPayload: before,
    });

    // Interaction-type lane moves also create an interaction row so the Activity pulse stays true.
    if (meeting) {
      await addMeeting(meeting as any);
    }
    setGate(null);
    setCelebrate({ dealId: deal.id, laneId: target });
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

  const renderDealCard = (deal: Deal, opts?: { grip?: boolean; compact?: boolean; dragging?: boolean }) => {
    const action = getWorkflowAction(deal);
    const derived = deriveNudge(deal, todayStr, {
      sendCount: outboundSendCountForDeal(dbMeetings || [], deal.id),
    });
    const nudge = derived ? formatDerivedNudgeBadge(derived) : null;
    const nudgeStage = derived?.stage ?? null;
    const lane = WORKFLOW_BY_ID[action];
    const due = dueStateFor(deal, todayStr);
    const reason = whyNow(deal, due);
    const reasons = reviewReasons(deal);
    const isCompact = !!opts?.compact;
    const presentation = buildDealCardPresentation(deal, contacts, companies, due);
    const skipMotion = reduceMotion || !!opts?.dragging;

    return (
      <div key={deal.id} className="space-y-1.5" data-deal-card>
        <motion.button
          type="button"
          onClick={() => setSelectedDeal(deal.id)}
          whileTap={skipMotion ? undefined : { scale: pressScale }}
          transition={springPress}
          className={clsx(
            'w-full text-left bg-white dark:bg-clay-card rounded-lg border border-clay-hairline touch-manipulation transition-[border-color,box-shadow] hover:border-clay-muted/40 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-clay-teal',
            isCompact ? 'p-3' : 'p-3.5',
          )}
        >
          <DealCardContent
            deal={deal}
            presentation={presentation}
            whyNow={reason}
            reviewLabels={reasons.map(item => REVIEW_LABEL[item])}
            nudge={nudge}
            nudgeStage={nudgeStage}
            compact={isCompact}
            showGrip={opts?.grip}
          />
          <p className="sr-only">Open {deal.client} in {lane.label}</p>
        </motion.button>
        {/* Sibling of the card button, never nested: one contextual action that opens the form. */}
        <DealCardPrimaryAction deal={deal} onSelect={handleCardPrimaryAction} />
      </div>
    );
  };

  return (
    <PageTransition className="p-4 md:px-4 md:py-6 pb-20 lg:pb-6 min-h-full">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <p className="zams-eyebrow mb-1">Deals / VG Saveur</p>
          <h1 className="zams-display text-2xl md:text-[28px] leading-tight">Pipeline</h1>
          <p className="mt-1 text-xs text-clay-muted">
            <strong className="font-semibold text-clay-ink">{stats.active}</strong> active
            <span className="mx-2">·</span>
            <button onClick={() => focusAttention('today')} className="font-semibold text-clay-warning-strong underline-offset-2 hover:underline">{stats.dueToday} due today</button>
            <span className="mx-2">·</span>
            <strong className="font-semibold text-clay-ink">{stats.won}</strong> won
          </p>
        </div>
        <button onClick={() => setIsModalOpen(true)} className="clay-btn-primary shrink-0 motion-press">
          <Plus className="w-4 h-4" /> <span className="hidden sm:inline">New deal</span>
        </button>
      </div>



      <nav className="mb-3 flex gap-1 overflow-x-auto no-scrollbar border-b border-clay-hairline" aria-label="Deal views">
        {([
          ['prospects', 'Prospects', null],
          ['board', 'Journey', stats.active],
          ['parked', 'Parked', stats.parked],
          ['won', 'Won', stats.won],
          ['lost', 'Lost', lostDeals.length],
          ['table', 'Table', deals.length],
        ] as const).map(([mode, label, count]) => (
          <button
            key={mode}
            onClick={() => setView(mode)}
            aria-current={view === mode ? 'page' : undefined}
            className={clsx('shrink-0 border-b-2 px-3 py-2 text-xs font-medium transition-colors', view === mode ? 'border-clay-ink text-clay-ink' : 'border-transparent text-clay-muted hover:text-clay-ink')}
          >
            {label}{count !== null && <span className="ml-1 font-normal text-clay-muted">{count}</span>}
          </button>
        ))}
      </nav>

      {view === 'prospects' && (
        <ProspectsTab
          onStartDeal={(companyId) => {
            setDealPrefill({ company_id: companyId });
            setIsModalOpen(true);
          }}
        />
      )}

      {view === 'board' && (
        <>
          {/* One toolbar: search, quick filters, product and priority, then a live count. */}
          <section className="mb-2 flex flex-wrap items-center gap-2" aria-label="Do now filters">
            <label className="relative w-full sm:w-60">
              <span className="sr-only">Search by client or deal name</span>
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-clay-muted" />
              <input
                type="search"
                value={searchQuery}
                onChange={event => setSearchQuery(event.target.value)}
                placeholder="Search deals"
                className="h-9 w-full rounded-lg border border-clay-hairline bg-white pl-8 pr-3 text-base text-clay-ink placeholder:text-clay-muted focus:outline-none focus:ring-2 focus:ring-clay-lavender/40 dark:bg-clay-card md:text-sm"
              />
            </label>

            <div className="-mx-4 flex gap-1.5 overflow-x-auto no-scrollbar px-4 sm:mx-0 sm:px-0" role="group" aria-label="Attention filter">
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
                    'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm transition-colors',
                    attentionFilter === value
                      ? 'border-clay-lavender/60 bg-clay-lavender/20 text-clay-ink'
                      : 'border-clay-hairline text-clay-body hover:border-clay-ink/30 hover:text-clay-ink',
                  )}
                >
                  {label}
                  <span className={clsx('text-xs', value === 'overdue' && count > 0 ? 'font-semibold text-clay-error' : 'text-clay-muted')}>{count}</span>
                </button>
              ))}
            </div>

            <label>
              <span className="sr-only">Filter by product</span>
              <select
                value={productFilter}
                onChange={event => setProductFilter(event.target.value)}
                className="h-9 rounded-lg border border-clay-hairline bg-white px-2.5 text-base text-clay-body focus:outline-none focus:ring-2 focus:ring-clay-lavender/40 dark:bg-clay-card md:text-sm"
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
                className="h-9 rounded-lg border border-clay-hairline bg-white px-2.5 text-base text-clay-body focus:outline-none focus:ring-2 focus:ring-clay-lavender/40 dark:bg-clay-card md:text-sm"
              >
                <option value="all">Any priority</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </label>

            {filtersActive && (
              <button
                onClick={clearDoNowFilters}
                className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-sm text-clay-muted hover:bg-clay-surface hover:text-clay-ink"
              >
                <X className="h-3.5 w-3.5" /> Clear
              </button>
            )}
          </section>

          {/* One quiet line: what the board holds, how it works, and card density. */}
          <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-clay-muted">
            <span>{visibleActionBoardDeals.length} of {actionBoardDeals.length} deals</span>
            <details className="open:basis-full" aria-label="Pipeline insights">
              <summary className="cursor-pointer list-none marker:hidden hover:text-clay-ink">
                Open pipeline <span className="font-semibold text-clay-ink">{formatBaht(openPipelineValue)}</span> <span aria-hidden="true">⌄</span>
              </summary>
              <div className="mt-2 space-y-1">
                <p>Weighted forecast · <span className="font-semibold text-clay-ink">{formatBaht(weightedForecast)}</span></p>
                {sourceRows.length > 0 && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {sourceRows.map(s => (
                      <span key={s.source}><span className="font-medium text-clay-body">{s.source}</span> {s.won}/{s.total} won · {s.rate.toFixed(0)}%</span>
                    ))}
                  </div>
                )}
              </div>
            </details>
            <details className="open:basis-full">
              <summary className="cursor-pointer list-none marker:hidden hover:text-clay-ink">How this board works <span aria-hidden="true">⌄</span></summary>
              <p className="mt-1 max-w-xl leading-relaxed">Drag along the five journey stages. Waiting on reply requires logged outreach; Sample requires an address and send intent; Testing needs delivery and a date; Follow-up needs a date. Won / Lost / Park are exits, never columns. Four outbound nudges maximum, then park.</p>
            </details>
            <button onClick={() => setCompact(!compact)} className="ml-auto rounded-md px-2 py-1 hover:bg-clay-surface hover:text-clay-ink">
              {compact ? 'Show more detail' : 'Compact cards'}
            </button>
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

          {actionBoardDeals.length === 0 && (
            <div className="mb-4 rounded-xl border border-clay-hairline bg-white dark:bg-clay-card px-6 py-8 flex flex-col sm:flex-row items-center justify-center gap-5 text-center sm:text-left">
              <Blob state="sleep" size={72} aria-label="No deals on the board yet" />
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
            <div className="mb-4 rounded-xl border border-clay-hairline bg-white dark:bg-clay-card px-5 py-6 flex flex-col sm:flex-row items-center justify-center gap-4 text-center sm:text-left">
              <Blob state="sleep" size={48} aria-label="No deals match filters" />
              <div className="flex-1">
                {searchQuery.trim() ? (
                  searchEscapeMatches.length > 0 ? (
                    <>
                      <p className="text-sm font-medium text-clay-ink">
                        {searchEscapeMatches.length === 1 ? '1 deal matches' : `${searchEscapeMatches.length} deals match`} “{searchQuery.trim()}” outside these filters
                      </p>
                      <p className="text-xs text-clay-muted mt-1">
                        Showing {visibleActionBoardDeals.length} of {actionBoardDeals.length} on this board — the match is filtered out, not missing.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-clay-ink">No deal matches “{searchQuery.trim()}”</p>
                      <p className="text-xs text-clay-muted mt-1">Searched every deal, not just this board view.</p>
                    </>
                  )
                ) : (
                  <>
                    <p className="text-sm font-medium text-clay-ink">No deals match this Do now view</p>
                    <p className="text-xs text-clay-muted mt-1">Clear a filter or search for another client.</p>
                  </>
                )}
              </div>
              <div className="flex shrink-0 flex-col gap-2">
                {searchQuery.trim() !== '' && searchEscapeMatches.length > 0 && (
                  <button
                    onClick={searchAllDeals}
                    data-search-all-deals
                    className="min-h-[44px] rounded-lg bg-clay-ink px-4 text-sm font-medium text-clay-canvas active:opacity-85"
                  >
                    Search all deals
                  </button>
                )}
                <button onClick={clearDoNowFilters} className="min-h-[44px] rounded-lg border border-clay-hairline px-4 text-sm font-medium text-clay-body active:opacity-85">
                  Show all deals
                </button>
              </div>
            </div>
          )}
          {/* Phone: one readable lane at a time. Desktop: full board. */}
          <div className="md:hidden">
            <div className="-mx-4 px-4 flex gap-2 overflow-x-auto no-scrollbar pb-3 snap-x">
              {WORKFLOW_LANES.map(lane => (
                <button
                  key={lane.id}
                  onClick={() => setMobileLane(lane.id)}
                  className={clsx(
                    'snap-start shrink-0 flex items-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-medium min-h-[44px]',
                    mobileLane === lane.id ? 'bg-clay-ink text-clay-canvas border-clay-ink' : 'bg-white dark:bg-clay-card text-clay-ink border-clay-hairline'
                  )}
                >
                  <Blob state={LANE_BLOB_STATE[lane.id]} size={18} aria-label="" />
                  <span>{lane.shortLabel}</span>
                  <span className={clsx('text-xs', mobileLane === lane.id ? 'text-clay-canvas/70' : 'text-clay-muted')}>{dealsByAction[lane.id].length} · {formatBaht(laneValues[lane.id])}</span>
                </button>
              ))}
            </div>
            {(() => {
              const lane = WORKFLOW_LANES.find(item => item.id === mobileLane)!;
              const laneDeals = dealsByAction[mobileLane];
              return (
                <section data-lane-id={lane.id} className="rounded-xl border border-clay-hairline bg-clay-surface p-3">
                  <div data-lane-header className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-clay-teal" aria-hidden="true" />
                    <h2 data-lane-title className="min-w-0 flex-1 text-base font-semibold text-clay-ink">{lane.shortLabel}</h2>
                    <span data-lane-stats className="whitespace-nowrap text-xs text-clay-muted">{laneDeals.length} · {formatBaht(laneValues[lane.id])}</span>
                  </div>
                  <StaggerList stagger={0.04} className="space-y-2">
                    {laneDeals.map(d => (
                      <StaggerItem key={d.id} className="flex flex-wrap items-stretch gap-1.5">
                        <div className="flex-1 min-w-[min(100%,12rem)]">{renderDealCard(d, { compact })}</div>
                        <button
                          onClick={() => setPickerDeal(d)}
                          className="w-11 shrink-0 flex flex-col items-center justify-center gap-0.5 rounded-xl border border-clay-hairline bg-white dark:bg-clay-card text-clay-ink active:bg-clay-lavender/20"
                          aria-label={`Move ${d.client} to another lane`}
                        >
                          <ArrowRight className="w-4 h-4" />
                          <span className="zams-mono text-[8px] uppercase tracking-[0.12px]">Move</span>
                        </button>
                      </StaggerItem>
                    ))}
                    {laneDeals.length === 0 && (
                      <div className="border border-dashed border-clay-hairline rounded-xl px-3 py-8 text-center text-sm text-clay-muted-soft flex flex-col items-center gap-2">
                        <Blob state={LANE_BLOB_STATE[lane.id]} size={40} aria-label="" />
                        <span>No deals in this lane</span>
                      </div>
                    )}
                  </StaggerList>
                </section>
              );
            })()}
          </div>

          <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <div className="hidden md:block relative">
              <div ref={boardRef} className="flex gap-2.5 items-stretch overflow-x-auto pb-3 pl-0.5 pr-8 scroll-smooth snap-x snap-mandatory [scrollbar-gutter:stable]">
                {WORKFLOW_LANES.map(lane => (
                  <DroppableLane key={lane.id} laneId={lane.id} reduceMotion={reduceMotion}>
                    <div data-lane-header className="mb-3 shrink-0 flex flex-wrap items-center gap-1.5">
                      <span className="h-2 w-2 shrink-0 rounded-full bg-clay-teal" aria-hidden="true" />
                      <h2 data-lane-title title={LANE_CRITERIA[lane.id]} className="min-w-0 flex-1 text-[13px] font-semibold text-clay-ink">{lane.shortLabel}</h2>
                      <span data-lane-stats className="shrink-0 whitespace-nowrap text-[11px] text-clay-muted">{dealsByAction[lane.id].length} · {formatBaht(laneValues[lane.id])}</span>
                    </div>
                    <StaggerList stagger={0.04} className="space-y-2 flex-1 pr-0.5">
                      {dealsByAction[lane.id].map(deal => (
                        <StaggerItem key={deal.id}>
                          <DraggableCard
                            deal={deal}
                            landing={celebrate?.dealId === deal.id && celebrate?.laneId === lane.id}
                            reduceMotion={reduceMotion}
                            onClick={() => setSelectedDeal(deal.id)}
                          >
                            {renderDealCard(deal, { grip: true, compact, dragging: activeDragId === deal.id })}
                          </DraggableCard>
                        </StaggerItem>
                      ))}
                      {dealsByAction[lane.id].length === 0 && (
                        lane.id === 'parked' ? (
                          <div className="text-center py-6 rounded-lg border-2 border-dashed border-clay-hairline flex flex-col items-center gap-2 opacity-90">
                            <Blob state="sleep" size={44} aria-label="Nothing parked" />
                            <p className="text-xs text-clay-muted-soft">Nothing parked — everything is moving.</p>
                          </div>
                        ) : (
                          <div className="text-center py-6 text-xs text-clay-muted-soft border-2 border-dashed border-clay-hairline rounded-lg flex flex-col items-center gap-2">
                            <Blob state={LANE_BLOB_STATE[lane.id]} size={36} aria-label="" />
                            <span>Drop here</span>
                          </div>
                        )
                      )}
                      {celebrate && celebrate.laneId === lane.id && (
                        <motion.div
                          className="flex justify-center"
                          initial={reduceMotion ? false : { opacity: 0, scale: 0.88, y: 6 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          transition={{ duration: 0.24, ease: EASE_OUT }}
                        >
                          <Blob
                            state={lane.id === 'success' ? 'joy' : LANE_BLOB_STATE[lane.id]}
                            size={40}
                            aria-label="Celebrating lane move"
                          />
                        </motion.div>
                      )}
                    </StaggerList>
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
                  {renderDealCard(deals.find(d => d.id === activeDragId)!, { dragging: true })}
                  <motion.div
                    className="absolute -top-7 -right-4"
                    initial={reduceMotion ? false : { opacity: 0, scale: 0.85, y: 4 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ duration: 0.22, ease: EASE_OUT }}
                  >
                    <Blob
                      state={LANE_BLOB_STATE[getWorkflowAction(deals.find(d => d.id === activeDragId)!)]}
                      size={40}
                      aria-label="Carrying deal to a new lane"
                    />
                  </motion.div>
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
          {searchQuery.trim() !== '' && (
            <p data-table-search-note className="border-b border-clay-hairline px-3 py-2 text-[11px] text-clay-muted">
              Searching every deal for “{searchQuery.trim()}” — {tableDeals.length} matching, {deals.length} in total.
            </p>
          )}
          <table className="w-full text-sm">
            <thead><tr className="border-b border-clay-hairline text-left text-clay-muted text-xs uppercase tracking-wide"><th className="px-3 py-3 font-medium">Client</th><th className="px-3 py-3 font-medium">Action</th><th className="hidden sm:table-cell px-3 py-3 font-medium">Stage</th><th className="hidden sm:table-cell px-3 py-3 font-medium">Follow-up</th><th className="px-3 py-3 font-medium">Priority</th></tr></thead>
            <tbody>
              {tableDeals.map(deal => {
                const lane = WORKFLOW_BY_ID[getWorkflowAction(deal)];
                const identity = buildDealCardPresentation(deal, contacts, companies, dueStateFor(deal, todayStr));
                const derived = deriveNudge(deal, todayStr, {
                  sendCount: outboundSendCountForDeal(dbMeetings || [], deal.id),
                });
                return <tr key={deal.id} onClick={() => setSelectedDeal(deal.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedDeal(deal.id); } }} tabIndex={0} className="border-b border-clay-hairline active:bg-clay-surface cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-clay-teal"><td className="px-3 py-3"><div className="flex min-w-0 items-center gap-2.5"><CompanyLogo src={identity.companyLogoUrl} name={identity.companyName} id={deal.company_id} size={28} /><div className="min-w-0"><p className="font-medium text-clay-ink">{identity.companyName}</p><p className="text-[10px] text-clay-muted truncate max-w-40">{deal.title}</p></div></div></td><td className="px-3 py-3"><span className="text-xs text-clay-body whitespace-nowrap">{lane.icon} {lane.shortLabel}</span>{derived && <p className="text-[10px] text-clay-muted mt-0.5">{formatDerivedNudgeBadge(derived)}</p>}</td><td className="hidden sm:table-cell px-3 py-3"><span className="text-[10px] font-medium bg-clay-card px-1.5 py-0.5 rounded text-clay-muted">{STAGE_LABELS[deal.stage]}</span></td><td className="hidden sm:table-cell px-3 py-3 text-xs text-clay-muted">{compactDate(deal.followup_date) || '—'}</td><td className="px-3 py-3"><span className={clsx('text-[10px] font-semibold px-2 py-0.5 rounded', PRIORITY_CLASSES[deal.priority])}>{PRIORITY_LABELS[deal.priority]}</span></td></tr>;
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
              next_action: d.next_action,
              sample_status: d.sample_status || null,
              nudge_stage: d.nudge_stage || null,
              last_outcome: d.last_outcome,
              close_date: d.close_date || null,
              won_note: d.won_note || null,
              lost_reason: d.lost_reason || null,
              park_reason: d.park_reason || null,
            };
            if (payload.kind === 'won') {
              const close = buildCloseUpdate(d, {
                kind: 'won',
                close_date: payload.close_date,
                won_note: payload.won_note,
                value: payload.value,
                action: payload.action ?? null,
              });
              if (close.error) {
                addToast(close.error, 'error');
                return;
              }
              try {
                await crm.closeDealWithOrderIfUnchanged({
                  dealId: d.id,
                  expectedUpdatedAt: d.updated_at,
                  updates: close.updates,
                  order: d.company_id && close.recordOrderAmount != null
                    ? {
                        companyId: d.company_id,
                        eventDate: payload.close_date || todayStr,
                        amount: close.recordOrderAmount,
                        productLine: d.product || null,
                      }
                    : null,
                });
              } catch (error) {
                if (error instanceof crm.OrderRecordPendingError) {
                  logActivity({ type: 'edit', entity: 'deal', entityId: d.id, label: '🎉 Marked won', description: `${d.client} marked won; order record pending retry`, undoPayload: before });
                  addToast('Deal marked won; order record needs retry.', 'error', {
                    label: 'Retry',
                    onClick: () => {
                      void crm.recordOrderForClosedDeal(d.id, error.order)
                        .then(() => addToast('Order record saved'))
                        .catch(() => addToast('Order record still needs retry.', 'error'));
                    },
                  });
                  setExitModal(null);
                  await refresh();
                  return;
                }
                throw error;
              }
              logActivity({ type: 'edit', entity: 'deal', entityId: d.id, label: '🎉 Marked won', description: `${d.client} marked won`, undoPayload: before });
              addToast('Deal marked won');
            } else if (payload.kind === 'lost') {
              const close = buildCloseUpdate(d, { kind: 'lost', lost_reason: payload.lost_reason });
              await crm.updateDealIfUnchanged(d.id, d.updated_at, close.updates);
              logActivity({ type: 'edit', entity: 'deal', entityId: d.id, label: '📉 Marked lost', description: `${d.client} marked lost`, undoPayload: before });
              addToast('Deal marked lost');
            } else {
              const close = buildCloseUpdate(d, {
                kind: 'park',
                park_reason: payload.park_reason,
                followup_date: payload.followup_date,
              });
              await crm.updateDealIfUnchanged(d.id, d.updated_at, close.updates);
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

      <CreateModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setDealPrefill(undefined); }}
        onSave={handleCreate}
        type="deal"
        companies={companies}
        contacts={contacts}
        initialValues={dealPrefill}
      />
    </PageTransition>
  );
}

/* ─── Drag & drop primitives ─── */

function DraggableCard({
  deal, onClick, landing, reduceMotion, children,
}: {
  deal: Deal;
  onClick: () => void;
  landing?: boolean;
  reduceMotion?: boolean;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: deal.id });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  const settling = Boolean(landing) && !reduceMotion && !isDragging;
  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={onClick}
      initial={false}
      animate={
        isDragging
          ? { opacity: 0.4, scale: 1, y: 0 }
          : settling
            ? { opacity: 1, scale: [0.97, 1], y: [6, 0] }
            : { opacity: 1, scale: 1, y: 0 }
      }
      transition={
        settling
          ? { duration: 0.24, ease: EASE_OUT }
          : { duration: 0.15, ease: EASE_OUT }
      }
      className="touch-none cursor-grab active:cursor-grabbing"
    >
      {children}
    </motion.div>
  );
}

function DroppableLane({
  laneId, className, children, reduceMotion,
}: {
  laneId: string;
  className?: string;
  children: React.ReactNode;
  reduceMotion?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: laneId });
  // Border/bg via className so lane theme restores on drag-out; FM owns the pulse (supersedes CSS .lane-drop-over).
  return (
    <motion.section
      ref={setNodeRef}
      data-lane-id={laneId}
      className={clsx(
        'flex-1 min-w-[12rem] max-w-[18rem] snap-start rounded-xl border border-clay-hairline bg-clay-surface/70 p-2.5 flex flex-col transition-colors 2xl:min-w-[150px]',
        className,
        isOver && 'border-[#7451f2] bg-[rgba(116,81,242,0.04)]'
      )}
      initial={false}
      animate={
        isOver && !reduceMotion
          ? {
              boxShadow: [
                '0 0 0 0 rgba(116, 81, 242, 0)',
                '0 0 0 4px rgba(116, 81, 242, 0.16)',
                '0 0 0 0 rgba(116, 81, 242, 0)',
              ],
            }
          : { boxShadow: '0 0 0 0 rgba(116, 81, 242, 0)' }
      }
      transition={
        isOver && !reduceMotion
          ? { duration: 0.9, repeat: Infinity, ease: 'easeInOut' }
          : tweenBase
      }
    >
      {children}
    </motion.section>
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
