'use client';

import { useMemo, useState } from 'react';
import { MessageCircle, Plus } from 'lucide-react';
import { Blob } from '@/components/blob';
import { useCrm } from '@/components/CrmProvider';
import CreateModal from '@/components/CreateModal';
import LogInteractionModal from '@/components/LogInteractionModal';
import ThisWeekQueue from '@/components/ThisWeekQueue';
import { PageTransition } from '@/components/motion';
import { useReorderSignals } from '@/hooks/useReorderSignals';
import {
  buildFollowupActions,
  deriveRetentionDueSignals,
  existingRetentionReferenceDate,
} from '@/utils/followup-policy';
import { buildThisWeekQueue } from '@/utils/this-week-queue';
import { useBusinessDateKey } from '@/utils/useBusinessDateKey';
import { formatBangkokWeekdayDate } from '@/utils/format';

export default function TodayPage() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [logDealId, setLogDealId] = useState<string | undefined>();
  const [logCompanyId, setLogCompanyId] = useState<string | undefined>();
  const {
    deals,
    contacts,
    companies,
    meetings,
    accountEvents,
    accountEventsUnavailable,
    loading,
    error,
    createDeal,
    addMeeting,
    refresh,
  } = useCrm();

  const todayKey = useBusinessDateKey();
  const headerDate = formatBangkokWeekdayDate();
  // Preserve /retention's UTC health/cadence input; its mixed date boundary is pinned in tests.
  const retentionCalculationDate = existingRetentionReferenceDate();
  const retentionSignals = useMemo(() => deriveRetentionDueSignals({
    today: todayKey,
    retentionCalculationDate,
    companies,
    deals,
    meetings,
    accountEvents,
    accountEventsUnavailable,
  }), [
    todayKey,
    retentionCalculationDate,
    companies,
    deals,
    meetings,
    accountEvents,
    accountEventsUnavailable,
  ]);
  const actions = useMemo(() => buildFollowupActions({
    today: todayKey,
    deals,
    companies,
    contacts,
    retentionDue: retentionSignals,
  }), [todayKey, deals, companies, contacts, retentionSignals]);

  // CRM-linked reorder signals only; unlinked historical buyers stay on /signals.
  const { signals } = useReorderSignals();
  const queue = useMemo(() => buildThisWeekQueue({
    candidates: actions,
    retentionDue: retentionSignals,
    signals,
    today: todayKey,
  }), [actions, retentionSignals, signals, todayKey]);

  const handleCreate = async (data: Parameters<typeof createDeal>[0]) => {
    await createDeal(data);
  };

  const openDealLog = (dealId: string) => {
    setLogDealId(dealId);
    setIsLogOpen(true);
  };

  const openCompanyLog = (companyId: string) => {
    setLogCompanyId(companyId);
    setIsLogOpen(true);
  };

  return (
    <PageTransition className="p-4 md:p-6 max-w-6xl pb-20 lg:pb-6">
      <div className="mb-5 md:mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <Blob state="idle" size={48} follow aria-label="Butter mascot" />
          <div className="min-w-0">
            <p className="zams-eyebrow mb-1">{headerDate} · Bangkok</p>
            <h1 className="zams-display text-3xl md:text-[34px] leading-none">This week</h1>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            className="inline-flex min-h-11 items-center gap-2 rounded-md border border-clay-hairline px-3 sm:px-4 text-sm font-medium text-clay-ink hover:border-clay-lavender hover:text-clay-lavender transition-colors"
          >
            <Plus className="h-4 w-4" />
            New deal
          </button>
          <button
            type="button"
            onClick={() => setIsLogOpen(true)}
            className="clay-btn-primary motion-press min-h-11"
          >
            <MessageCircle className="h-4 w-4" />
            <span>Log interaction</span>
          </button>
        </div>
      </div>

      <ThisWeekQueue
        queue={queue}
        today={todayKey}
        loading={loading}
        sourceError={Boolean(error)}
        accountEventsUnavailable={accountEventsUnavailable}
        onRetry={() => { void refresh(); }}
        onLogDeal={openDealLog}
        onLogCompany={openCompanyLog}
      />

      <CreateModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSave={handleCreate}
        type="deal"
        companies={companies}
        contacts={contacts}
      />
      <LogInteractionModal
        isOpen={isLogOpen}
        onClose={() => {
          setIsLogOpen(false);
          setLogDealId(undefined);
          setLogCompanyId(undefined);
        }}
        onSave={async (meeting) => {
          await addMeeting(meeting);
        }}
        deals={deals}
        contacts={contacts}
        companies={companies}
        selectedDealId={logDealId}
        initialCompanyId={logCompanyId}
      />
    </PageTransition>
  );
}
