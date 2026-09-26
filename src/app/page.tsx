'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, MessageCircle, Plus } from 'lucide-react';
import { Blob } from '@/components/blob';
import { useCrm } from '@/components/CrmProvider';
import CreateModal from '@/components/CreateModal';
import LogInteractionModal from '@/components/LogInteractionModal';
import TodayFollowupQueue from '@/components/TodayFollowupQueue';
import { PageTransition } from '@/components/motion';
import type { CustomerEvidenceFolder } from '@/utils/customer-evidence';
import { buildCustomerEvidenceFolder, CUSTOMER_EVIDENCE_MAX_INPUT_BYTES } from '@/utils/customer-evidence';
import {
  buildFollowupActions,
  deriveRetentionDueSignals,
  existingRetentionReferenceDate,
} from '@/utils/followup-policy';
import { useBusinessDateKey } from '@/utils/useBusinessDateKey';
import { formatBangkokWeekdayDate } from '@/utils/format';

export default function TodayPage() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [logDealId, setLogDealId] = useState<string | undefined>();
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

  const inspectEvidence = (dealId: string): CustomerEvidenceFolder => {
    const deal = deals.find((item) => item.id === dealId) ?? null;
    const primarySources = loading ? 'loading' : error ? 'unavailable' : 'loaded';
    const accountEventSource = loading
      ? 'loading'
      : error || accountEventsUnavailable
        ? 'unavailable'
        : 'loaded';

    return buildCustomerEvidenceFolder({
      entityId: dealId,
      deal,
      meetings,
      accountEvents,
      sourceAvailability: {
        deal: primarySources,
        meetings: primarySources,
        accountEvents: accountEventSource,
      },
      maxInputBytes: CUSTOMER_EVIDENCE_MAX_INPUT_BYTES,
    });
  };

  const handleCreate = async (data: Parameters<typeof createDeal>[0]) => {
    await createDeal(data);
  };

  const openDealLog = (dealId: string) => {
    setLogDealId(dealId);
    setIsLogOpen(true);
  };

  return (
    <PageTransition className="p-4 md:p-6 max-w-6xl pb-20 lg:pb-6">
      <div className="mb-5 md:mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <Blob state="idle" size={48} follow aria-label="Butter mascot" />
          <div className="min-w-0">
            <p className="zams-eyebrow mb-1">{headerDate} · Bangkok</p>
            <h1 className="zams-display text-3xl md:text-[34px] leading-none">Today</h1>
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

      <p className="mb-4 max-w-3xl text-sm leading-relaxed text-clay-muted">
        Saved deal schedules and the existing active-customer retention policy, together. Review each source; nothing is rescheduled automatically.
      </p>

      <TodayFollowupQueue
        candidates={actions}
        today={todayKey}
        loading={loading}
        sourceError={Boolean(error)}
        accountEventsUnavailable={accountEventsUnavailable}
        signalsEnabled={false}
        onRetry={() => { void refresh(); }}
        onLogDeal={openDealLog}
        onInspectEvidence={inspectEvidence}
      />

      <div className="mb-2 flex flex-col gap-2 sm:flex-row">
        <Link
          href="/signals"
          className="flex-1 flex items-center justify-between gap-2 rounded-xl border border-clay-hairline bg-white dark:bg-clay-card px-4 py-3 text-sm text-clay-muted hover:text-clay-ink hover:border-clay-lavender/40 transition-colors"
        >
          Buying signals <ChevronRight className="h-4 w-4 text-clay-muted-soft" />
        </Link>
        <Link
          href="/meetings"
          className="flex-1 flex items-center justify-between gap-2 rounded-xl border border-clay-hairline bg-white dark:bg-clay-card px-4 py-3 text-sm text-clay-muted hover:text-clay-ink hover:border-clay-lavender/40 transition-colors"
        >
          Recent activity <ChevronRight className="h-4 w-4 text-clay-muted-soft" />
        </Link>
      </div>

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
        }}
        onSave={async (meeting) => {
          await addMeeting(meeting);
        }}
        deals={deals}
        contacts={contacts}
        companies={companies}
        selectedDealId={logDealId}
      />
    </PageTransition>
  );
}
