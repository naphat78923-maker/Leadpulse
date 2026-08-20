'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import { Deal, DealWorkflowAction, STAGE_LABELS } from '@/types/crm';
import { useCrm } from '@/components/CrmProvider';
import { deals as dataDeals, contacts as dataContacts, companies as dataCompanies } from '@/data/crmData';
import CreateModal from '@/components/CreateModal';
import DealDetail from '@/components/DealDetail';
import { Plus, TrendingUp, AlertCircle, Loader2, CalendarDays } from 'lucide-react';
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
import { WORKFLOW_LANES, getWorkflowAction, nudgeLabel } from '@/utils/deal-workflow';

type ViewMode = 'board' | 'closed' | 'table';

function compactDate(date?: string | null) {
  if (!date) return null;
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

export default function DealsPage() {
  const [view, setView] = useState<ViewMode>('board');
  const [mobileLane, setMobileLane] = useState<DealWorkflowAction>('outreach');
  const [selectedDeal, setSelectedDeal] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { deals: dbDeals, contacts: dbContacts, companies: dbCompanies, loading, refresh, createDeal } = useCrm();
  const deals: Deal[] = dbDeals.length > 0 ? dbDeals : (dataDeals as Deal[]);
  const contacts = dbContacts.length > 0 ? dbContacts : (dataContacts as any);
  const companies = dbCompanies.length > 0 ? dbCompanies : (dataCompanies as any);

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
    try {
      await createDeal(data);
    } catch (err) {
      console.error('Failed to create deal:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 text-clay-ink animate-spin" />
      </div>
    );
  }

  const renderDealCard = (deal: Deal) => {
    const score = calculateLeadScore(deal);
    const tier = scoreToTier(score);
    const action = getWorkflowAction(deal);
    const nudge = nudgeLabel(deal.nudge_stage);
    const lane = WORKFLOW_LANES.find(item => item.id === action)!;

    return (
      <button
        key={deal.id}
        onClick={() => setSelectedDeal(deal.id)}
        className={clsx(
          'w-full text-left bg-white dark:bg-clay-card rounded-xl p-3 border transition-all active:scale-[0.98] active:bg-clay-surface',
          TIER_BG[tier]
        )}
      >
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className={clsx('text-[10px] font-semibold px-2 py-0.5 rounded border', TIER_COLORS[tier])}>{TIER_LABELS[tier]}</span>
          <span className="text-[10px] font-mono text-clay-muted">{score}/100</span>
        </div>
        <h3 className="text-sm font-semibold text-clay-ink truncate">{deal.client}</h3>
        <p className="text-xs text-clay-muted line-clamp-2 mt-0.5">{deal.title}</p>
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          <span className="text-[10px] font-medium text-clay-muted bg-clay-card px-1.5 py-0.5 rounded">{STAGE_LABELS[deal.stage]}</span>
          <span className={clsx('text-[10px] font-semibold px-1.5 py-0.5 rounded', PRIORITY_CLASSES[deal.priority])}>{PRIORITY_LABELS[deal.priority]}</span>
          {deal.sample_status && <span className="text-[10px] text-clay-ochre">{deal.sample_status === 'sent' ? 'Sent' : 'Received'}</span>}
          {nudge && <span className="text-[10px] text-clay-muted">{nudge}</span>}
        </div>
        {(deal.followup_date || deal.next_action) && (
          <div className="mt-2 pt-2 border-t border-clay-hairline/60">
            {deal.followup_date && <p className="text-[10px] text-clay-muted">📅 {compactDate(deal.followup_date)}</p>}
            {deal.next_action && <p className="text-[10px] text-clay-muted line-clamp-1 mt-0.5">{deal.next_action}</p>}
          </div>
        )}
        <p className="sr-only">Open {deal.client} in {lane.label}</p>
      </button>
    );
  };

  return (
    <div className="p-4 md:p-6 h-full flex flex-col pb-20 lg:pb-6">
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
          <div className="mb-3 rounded-xl border border-clay-hairline bg-clay-surface px-3 py-2 text-xs text-clay-muted flex items-start gap-2">
            <CalendarDays className="w-4 h-4 mt-0.5 text-clay-ochre shrink-0" />
            <span>Tap a deal, then choose its <strong className="text-clay-ink">Action lane</strong> in Edit. Reschedule requires a date and one nudge stage; parked deals require a revisit date.</span>
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
                      <h2 className="text-base font-semibold text-clay-ink">{lane.icon} {lane.label}</h2>
                      <p className="text-xs text-clay-muted mt-1">{lane.description}</p>
                    </div>
                    <span className="text-sm text-clay-muted bg-white/70 dark:bg-clay-card px-2 py-1 rounded-full">{laneDeals.length}</span>
                  </div>
                  <div className="space-y-2">
                    {laneDeals.map(renderDealCard)}
                    {laneDeals.length === 0 && <div className="border border-dashed border-clay-hairline rounded-xl px-3 py-8 text-center text-sm text-clay-muted-soft">No deals in this lane</div>}
                  </div>
                </section>
              );
            })()}
          </div>

          <div className="hidden md:flex gap-3 flex-1 overflow-x-auto pb-4">
            {WORKFLOW_LANES.map(lane => (
              <section key={lane.id} className={clsx('flex-1 min-w-[272px] rounded-2xl border p-3', lane.className)}>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <h2 className="text-sm font-semibold text-clay-ink">{lane.icon} {lane.shortLabel}</h2>
                    <p className="text-xs text-clay-muted mt-0.5 leading-snug">{lane.description}</p>
                  </div>
                  <span className="text-xs text-clay-muted bg-white/70 dark:bg-clay-card px-2 py-0.5 rounded-full">{dealsByAction[lane.id].length}</span>
                </div>
                <div className="space-y-2">
                  {dealsByAction[lane.id].map(renderDealCard)}
                  {dealsByAction[lane.id].length === 0 && <div className="text-center py-6 text-xs text-clay-muted-soft border-2 border-dashed border-clay-hairline rounded-lg">No deals here</div>}
                </div>
              </section>
            ))}
          </div>
        </>
      )}

      {view === 'closed' && (
        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-clay-mint/20 rounded-xl border border-clay-mint/30 p-4"><div className="flex items-center gap-2 text-clay-teal mb-1"><TrendingUp className="w-4 h-4" /><span className="text-xs font-medium">Won</span></div><p className="text-2xl font-bold text-clay-teal">{closedDeals.filter(deal => deal.stage === 'closed_won').length}</p></div>
            <div className="bg-clay-error/10 rounded-xl border border-clay-error/20 p-4"><div className="flex items-center gap-2 text-clay-error mb-1"><AlertCircle className="w-4 h-4" /><span className="text-xs font-medium">Lost</span></div><p className="text-2xl font-bold text-clay-error">{closedDeals.filter(deal => deal.stage === 'closed_lost').length}</p></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">{closedDeals.map(renderDealCard)}</div>
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
      <CreateModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSave={handleCreate} type="deal" companies={companies} contacts={contacts} />
    </div>
  );
}
