'use client';

import { useState, useMemo } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
} from '@dnd-kit/core';
import { Deal, STAGE_LABELS, STAGE_ORDER } from '@/types/crm';
import { useCrm } from '@/components/CrmProvider';
import CreateModal from '@/components/CreateModal';
import { Plus, AlertCircle, Clock, TrendingUp, Loader2 } from 'lucide-react';
import clsx from 'clsx';

type ViewMode = 'board' | 'closed' | 'table';

export default function PipelinePage() {
  const [view, setView] = useState<ViewMode>('board');
  const [selectedDeal, setSelectedDeal] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { deals: dbDeals, contacts: dbContacts, companies: dbCompanies, loading, error, createDeal } = useCrm();
  const deals: Deal[] = dbDeals;
  const contacts = dbContacts;
  const companies = dbCompanies;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const groupedDeals = useMemo(() => {
    const groups: Record<string, Deal[]> = {};
    STAGE_ORDER.forEach(s => { groups[s] = []; });
    deals.forEach(d => {
      if (!groups[d.stage]) groups[d.stage] = [];
      groups[d.stage].push(d);
    });
    return groups;
  }, [deals]);

  const closedDeals = useMemo(() => deals.filter(d => d.stage === 'closed_won' || d.stage === 'closed_lost'), [deals]);

  const stats = useMemo(() => {
    const active = deals.filter(d => d.stage !== 'closed_won' && d.stage !== 'closed_lost');
    const won = deals.filter(d => d.stage === 'closed_won');
    return { active: active.length, won: won.length };
  }, [deals]);

  const handleCreate = async (data: any) => {
    // Let errors bubble to the modal so failures are visible.
    await createDeal(data);
  };

  const handleDragStart = (event: DragStartEvent) => setActiveId(event.active.id as string);
  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
  };

  const activeDeal = selectedDeal ? deals.find(d => d.id === selectedDeal) : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-clay-ink animate-spin mx-auto mb-3" />
          <p className="text-sm text-clay-muted">Loading deals...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4 md:mb-6">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold text-clay-ink tracking-tight">Deal Pipeline</h1>
          <p className="text-sm text-clay-muted mt-0.5">{stats.active} active • {stats.won} won</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden md:flex bg-clay-card rounded-lg p-0.5">
            <button onClick={() => setView('board')} className={clsx('px-3 py-1.5 text-xs font-medium rounded-md transition-colors', view === 'board' ? 'bg-clay-ink text-clay-canvas' : 'text-clay-muted')}>Board</button>
            <button onClick={() => setView('closed')} className={clsx('px-3 py-1.5 text-xs font-medium rounded-md transition-colors', view === 'closed' ? 'bg-clay-ink text-clay-canvas' : 'text-clay-muted')}>Closed</button>
            <button onClick={() => setView('table')} className={clsx('px-3 py-1.5 text-xs font-medium rounded-md transition-colors', view === 'table' ? 'bg-clay-ink text-clay-canvas' : 'text-clay-muted')}>Table</button>
          </div>
          <button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2 px-3 md:px-4 py-2 bg-clay-ink text-clay-canvas text-sm font-medium rounded-lg hover:opacity-85">
            <Plus className="w-4 h-4" /> <span className="hidden sm:inline">New Deal</span>
          </button>
        </div>
      </div>

      {/* Mobile View Tabs */}
      <div className="md:hidden flex bg-clay-card rounded-lg p-0.5 mb-4">
        <button onClick={() => setView('board')} className={clsx('flex-1 px-3 py-2 text-xs font-medium rounded-md transition-colors', view === 'board' ? 'bg-clay-ink text-clay-canvas' : 'text-clay-muted')}>Board</button>
        <button onClick={() => setView('closed')} className={clsx('flex-1 px-3 py-2 text-xs font-medium rounded-md transition-colors', view === 'closed' ? 'bg-clay-ink text-clay-canvas' : 'text-clay-muted')}>Closed</button>
        <button onClick={() => setView('table')} className={clsx('flex-1 px-3 py-2 text-xs font-medium rounded-md transition-colors', view === 'table' ? 'bg-clay-ink text-clay-canvas' : 'text-clay-muted')}>Table</button>
      </div>

      {view === 'board' && (
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="flex gap-3 flex-1 overflow-x-auto pb-4">
            {STAGE_ORDER.map(stage => (
              <div key={stage} className="flex-1 min-w-[280px] max-w-[320px]">
                <div className="bg-clay-surface rounded-xl p-3 h-full">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-clay-ink">{STAGE_LABELS[stage]}</h3>
                      <span className="text-xs text-clay-muted bg-clay-card px-2 py-0.5 rounded-full">{groupedDeals[stage].length}</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {groupedDeals[stage].map(deal => (
                      <DealCard key={deal.id} deal={deal} onClick={() => setSelectedDeal(deal.id)} />
                    ))}
                    {groupedDeals[stage].length === 0 && (
                      <div className="text-center py-6 text-xs text-clay-muted-soft border-2 border-dashed border-clay-hairline rounded-lg">Drop here</div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <DragOverlay>
            {activeId ? <DealCard deal={deals.find(d => d.id === activeId)!} isDragOverlay /> : null}
          </DragOverlay>
        </DndContext>
      )}

      {view === 'closed' && (
        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-clay-mint/20 rounded-xl border border-clay-mint/30 p-4">
              <div className="flex items-center gap-2 text-clay-teal mb-1"><TrendingUp className="w-4 h-4" /><span className="text-xs font-medium">Won</span></div>
              <p className="text-2xl font-bold text-clay-teal">{closedDeals.filter(d => d.stage === 'closed_won').length}</p>
            </div>
            <div className="bg-clay-error/10 rounded-xl border border-clay-error/20 p-4">
              <div className="flex items-center gap-2 text-clay-error mb-1"><AlertCircle className="w-4 h-4" /><span className="text-xs font-medium">Lost</span></div>
              <p className="text-2xl font-bold text-clay-error">{closedDeals.filter(d => d.stage === 'closed_lost').length}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {closedDeals.map(deal => <DealCard key={deal.id} deal={deal} onClick={() => setSelectedDeal(deal.id)} />)}
          </div>
        </div>
      )}

      {view === 'table' && (
        <div className="flex-1 overflow-auto bg-white dark:bg-clay-card rounded-xl border border-clay-hairline">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-clay-hairline text-left text-clay-muted text-xs">
                <th className="px-3 md:px-4 py-3 font-medium">Deal</th>
                <th className="px-3 md:px-4 py-3 font-medium">Stage</th>
                <th className="hidden sm:table-cell px-3 md:px-4 py-3 font-medium">Product</th>
                <th className="px-3 md:px-4 py-3 font-medium">Client</th>
                <th className="hidden md:table-cell px-3 md:px-4 py-3 font-medium">Priority</th>
              </tr>
            </thead>
            <tbody>
              {deals.map(deal => (
                <tr key={deal.id} onClick={() => setSelectedDeal(deal.id)} className="border-b border-clay-hairline hover:bg-clay-surface cursor-pointer transition-colors">
                  <td className="px-3 md:px-4 py-3 font-medium text-clay-ink">{deal.title}</td>
                  <td className="px-3 md:px-4 py-3"><span className="text-[10px] font-medium bg-clay-card px-1.5 py-0.5 rounded">{STAGE_LABELS[deal.stage]}</span></td>
                  <td className="hidden sm:table-cell px-3 md:px-4 py-3 text-clay-body">{deal.product}</td>
                  <td className="px-3 md:px-4 py-3 text-clay-body">{deal.client}</td>
                  <td className="hidden md:table-cell px-3 md:px-4 py-3"><span className={clsx('text-[10px] font-medium px-1.5 py-0.5 rounded', deal.priority === 'high' ? 'bg-clay-error/10 text-clay-error' : deal.priority === 'medium' ? 'bg-clay-ochre/10 text-clay-ochre' : 'bg-clay-card text-clay-muted')}>{deal.priority}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail Panel */}
      {activeDeal && (
        <div className="fixed inset-0 md:inset-y-0 md:right-0 md:w-96 bg-black/50 md:bg-transparent flex items-end md:items-stretch justify-center md:justify-end z-50" onClick={() => setSelectedDeal(null)}>
          <div className="bg-white dark:bg-clay-card w-full md:w-96 p-6 overflow-y-auto shadow-xl rounded-t-2xl md:rounded-none" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-clay-ink">{activeDeal.title}</h2>
              <button onClick={() => setSelectedDeal(null)} className="text-clay-muted hover:text-clay-ink p-2 -mr-2 text-lg">✕</button>
            </div>
            <div className="space-y-4 text-sm">
              <div className="text-clay-body"><span className="text-clay-muted">Stage:</span> <span className="px-2 py-0.5 bg-clay-card rounded text-xs">{STAGE_LABELS[activeDeal.stage]}</span></div>
              <div className="text-clay-body"><span className="text-clay-muted">Client:</span> {activeDeal.client}</div>
              <div className="text-clay-body"><span className="text-clay-muted">Product:</span> {activeDeal.product}</div>
              <div className="text-clay-body"><span className="text-clay-muted">Priority:</span> <span className={clsx('px-2 py-0.5 rounded text-[10px]', activeDeal.priority === 'high' ? 'bg-clay-error/10 text-clay-error' : 'bg-clay-card text-clay-muted')}>{activeDeal.priority}</span></div>
              {activeDeal.next_action && <div className="text-clay-body"><span className="text-clay-muted">Next Action:</span> {activeDeal.next_action}</div>}
              {activeDeal.last_outcome && <div className="bg-clay-surface rounded-lg p-3 text-clay-body text-xs leading-relaxed">{activeDeal.last_outcome}</div>}
            </div>
          </div>
        </div>
      )}

      <CreateModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleCreate}
        type="deal"
        companies={companies}
        contacts={contacts}
      />
    </div>
  );
}

function DealCard({ deal, onClick, isDragOverlay }: { deal: Deal; onClick?: () => void; isDragOverlay?: boolean }) {
  const isOverdue = deal.followup_date && new Date(deal.followup_date) < new Date() && deal.stage !== 'closed_won' && deal.stage !== 'closed_lost';
  const isDueToday = deal.followup_date && new Date(deal.followup_date).toDateString() === new Date().toDateString();

  return (
    <div
      onClick={onClick}
      className={clsx(
        'bg-white dark:bg-clay-card rounded-lg border p-3 clay-card cursor-pointer transition-all',
        isDragOverlay ? 'shadow-2xl rotate-3 scale-105' : '',
        isOverdue ? 'border-clay-error bg-red-50/30 dark:bg-red-900/10' :
        isDueToday ? 'border-clay-ochre bg-orange-50/30 dark:bg-orange-900/10' :
        'border-clay-hairline'
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        {isOverdue && <AlertCircle className="w-3.5 h-3.5 text-clay-error flex-shrink-0" />}
        {isDueToday && <Clock className="w-3.5 h-3.5 text-clay-ochre flex-shrink-0" />}
        <h4 className="text-sm font-medium text-clay-ink truncate">{deal.client}</h4>
      </div>
      {deal.next_action && <p className="text-xs text-clay-muted line-clamp-2 mb-2">{deal.next_action}</p>}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[10px] font-medium text-clay-muted bg-clay-card px-1.5 py-0.5 rounded">{deal.product}</span>
        {deal.priority === 'high' && <span className="text-[10px] font-medium text-clay-error bg-clay-error/10 px-1.5 py-0.5 rounded">High</span>}
        {deal.nudge_count > 0 && <span className="text-[10px] font-medium text-clay-lavender bg-clay-lavender/20 px-1.5 py-0.5 rounded">{deal.nudge_count}n</span>}
      </div>
    </div>
  );
}
