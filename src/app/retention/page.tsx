'use client';

import { useState, useMemo } from 'react';
import { Company, COMPANY_STATUS_LABELS, Contact, Deal, Meeting } from '@/types/crm';
import { useCrm } from '@/components/CrmProvider';
import { companies as dataCompanies, contacts as dataContacts, deals as dataDeals, meetings as dataMeetings } from '@/data/crmData';
import CompanyDetail from '@/components/CompanyDetail';
import LogInteractionModal from '@/components/LogInteractionModal';
import { accountHealthScore, tierLabel, HealthTier } from '@/utils/accountHealth';
import { ACTIVE_REORDER_POLICY, accountTypeForPolicy } from '@/utils/reorderPolicy';
import { nextTouchDue, inRetentionSystem, rewardTrigger, pickReward, RewardOption } from '@/utils/retentionCadence';
import * as crm from '@/lib/crm';
import { Search, HeartPulse, ShieldAlert, Activity, CalendarClock, TrendingDown, Loader2, AlertTriangle, Gift, BellRing } from 'lucide-react';
import clsx from 'clsx';
import { Blob } from '@/components/blob';
import NudgeLadderRail from '@/components/NudgeLadderRail';
import { stageFromSilenceDays } from '@/utils/deal-workflow';

// ── Tier visual tokens (static strings so Tailwind scans them) ──
const TIER_STYLE: Record<HealthTier, { text: string; bg: string; ring: string; dot: string }> = {
  healthy: { text: 'text-clay-mint', bg: 'bg-clay-mint/15', ring: '#7fc9a8', dot: 'bg-clay-mint' },
  watch: { text: 'text-clay-ochre', bg: 'bg-clay-ochre/15', ring: '#eec35a', dot: 'bg-clay-ochre' },
  at_risk: { text: 'text-clay-coral', bg: 'bg-clay-coral/15', ring: '#e0766a', dot: 'bg-clay-coral' },
  dormant: { text: 'text-clay-error', bg: 'bg-clay-error/15', ring: '#d9543f', dot: 'bg-clay-error' },
};

const RING_C = 2 * Math.PI * 22; // r=22 circumference

type FilterKey = 'all' | 'due' | HealthTier;

// Company role now comes from ONE classifier: src/utils/companyRole.ts (taxonomy v1).
// The render-time regex that used to live here guessed the type from free-text
// industry/tags, had an unreachable `hotel` branch, and called manufacturers
// restaurants via its `/food/` alternative.

/** True order count: distinct orders from sales history, falling back to won deals. */
function distinctOrderCountOf(
  evts: { order_id: string | null; event_date: string; product_line?: string | null }[],
  wonDeals: unknown[]
): number {
  if (evts.length > 0) {
    const ids = new Set(
      evts.map((e) => e.order_id || `${e.event_date}:${e.product_line ?? ''}`)
    );
    return ids.size;
  }
  return wonDeals.length;
}

export default function RetentionPage() {
  const { companies: dbCompanies, contacts: dbContacts, deals: dbDeals, meetings: dbMeetings, accountEvents, loading, refresh, addMeeting } = useCrm();

  const companies: Company[] = dbCompanies.length > 0 ? dbCompanies : (dataCompanies as any);
  const contacts: Contact[] = dbContacts.length > 0 ? dbContacts : (dataContacts as any);
  const deals: Deal[] = dbDeals.length > 0 ? dbDeals : (dataDeals as any);
  const meetings: Meeting[] = dbMeetings.length > 0 ? dbMeetings : (dataMeetings as any);

  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [logCompanyId, setLogCompanyId] = useState<string | null>(null);
  const [logDealId, setLogDealId] = useState<string | undefined>(undefined);
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [reward, setReward] = useState<{ companyName: string; option: RewardOption | null } | null>(null);

  // ── Compute health per company ──
  const scored = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return companies.map((c) => {
      const coMeetings = meetings.filter((m) => m.company_id === c.id);
      const coDeals = deals.filter((d) => d.company_id === c.id);
      const wonDeals = coDeals.filter((d) => d.stage === 'closed_won');
      // Real sales history for this company (account_events; empty until the
      // table is provisioned + backfilled — then it drives R/F/M honestly).
      const evts = accountEvents.filter((e) => e.company_id === c.id);

      const lastOrderDate = evts.length ? evts.map((e) => e.event_date).sort().slice(-1)[0] : null;

      const res = accountHealthScore({
        companyId: c.id,
        companyName: c.name,
        createdAt: c.created_at?.slice(0, 10) || today,
        meetings: coMeetings.map((m) => ({ date: m.date, outcome: m.outcome })),
        deals: coDeals.map((d) => ({ stage: d.stage, last_outcome: d.last_outcome, value: d.value })),
        events: evts.map((e) => ({ date: e.event_date, amount: e.amount, product_line: e.product_line ?? undefined, order_id: e.order_id ?? undefined })),
        lastOrderDate,
        accountType: accountTypeForPolicy(c, ACTIVE_REORDER_POLICY),
        today,
      });

      const hasSignal =
        coMeetings.length > 0 ||
        wonDeals.length > 0 ||
        c.status === 'active_customer' ||
        c.status === 'inactive';

      // RETENTION SYSTEM = WON CUSTOMERS ONLY (Pat scope rule).
      const inRetention = inRetentionSystem(c.status);

      const lastTouch = [
        ...(coMeetings.length ? [coMeetings.map((m) => m.date).sort().slice(-1)[0]] : []),
        ...(c.last_human_touch ? [c.last_human_touch.slice(0, 10)] : []),
      ].sort().slice(-1)[0] || null;
      const daysSilent = lastTouch
        ? Math.max(0, Math.round((new Date(today + 'T00:00:00').getTime() - new Date(lastTouch + 'T00:00:00').getTime()) / 86400000))
        : null;

      // Cadence: derived next human-touch due date (read-only, no DB column).
      const touch = nextTouchDue({
        tier: res.tier,
        accountType: accountTypeForPolicy(c, ACTIVE_REORDER_POLICY),
        lastTouch,
        lastContactDate: c.last_contact_date?.slice(0, 10) || null,
        createdAt: c.created_at?.slice(0, 10) || null,
        persistedNextDue: c.next_touch_due?.slice(0, 10) || null,
        today,
      });

      // Why-flagged chips from the weakest sub-scores.
      const reasons: string[] = [];
      if (res.R < 0.5 && lastTouch) reasons.push(`Silent ${daysSilent}d`);
      if (res.F <= 0.3 && wonDeals.length === 0) reasons.push('No reorder yet');
      else if (res.F < 1 && wonDeals.length >= 1) reasons.push('Reorder cadence slipping');
      if (res.O < 0.5) reasons.push('No positive outcome logged');
      if (res.missing.includes('monetary (no account_events yet)')) reasons.push('Revenue not logged');

      const lifetimeNet = evts.reduce((s, e) => s + (e.amount || 0), 0);

      return {
        company: c, res, hasSignal, inRetention, lastTouch, daysSilent, reasons, wonDeals,
        orderCount: distinctOrderCountOf(evts, wonDeals),
        lifetimeNet,
        touch,
      };
    });
  }, [companies, deals, meetings, accountEvents]);

  const monitored = scored.filter((s) => s.hasSignal && s.inRetention);

  const counts = useMemo(() => {
    const by: Record<HealthTier, number> = { healthy: 0, watch: 0, at_risk: 0, dormant: 0 };
    monitored.forEach((s) => { by[s.res.tier] += 1; });
    return by;
  }, [monitored]);

  const needsAction = counts.watch + counts.at_risk + counts.dormant;

  const dueAccounts = useMemo(
    () => monitored.filter((s) => s.touch.daysUntil <= 0).sort((a, b) => a.touch.daysUntil - b.touch.daysUntil),
    [monitored]
  );
  const dueCount = dueAccounts.length;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return monitored
      .filter((s) => (filter === 'all' ? true : filter === 'due' ? s.touch.daysUntil <= 0 : s.res.tier === filter))
      .filter((s) => (q ? s.company.name.toLowerCase().includes(q) : true))
      .sort((a, b) => {
        // Action-needed first: dormant > at_risk > watch > healthy, then lower score.
        const order: Record<HealthTier, number> = { dormant: 0, at_risk: 1, watch: 2, healthy: 3 };
        if (order[a.res.tier] !== order[b.res.tier]) return order[a.res.tier] - order[b.res.tier];
        return a.res.score - b.res.score;
      });
  }, [monitored, filter, search]);

  const selectedCompany = selectedCompanyId ? companies.find((c) => c.id === selectedCompanyId) || null : null;
  const companyContacts = useMemo(
    () => (selectedCompany ? contacts.filter((c) => c.company_id === selectedCompany.id) : []),
    [contacts, selectedCompany]
  );
  const logCompany = logCompanyId ? companies.find((c) => c.id === logCompanyId) || null : null;
  const logCompanyDeals = logCompanyId ? deals.filter((d) => d.company_id === logCompanyId && d.stage !== 'closed_won' && d.stage !== 'closed_lost') : [];

  const openWinBack = (companyId: string) => {
    setLogCompanyId(companyId);
    const open = deals.find((d) => d.company_id === companyId && d.stage !== 'closed_won' && d.stage !== 'closed_lost');
    setLogDealId(open?.id);
    setIsLogOpen(true);
  };

  const handleLogSave = async (m: any) => {
    await addMeeting(m);
    // Intermittent reward draw: only on a win-back touch for a slipping account
    // (or a milestone) and only for active_customer (retention scope).
    const sc = monitored.find((s) => s.company.id === logCompanyId);
    if (!sc || !inRetentionSystem(sc.company.status)) return;
    const isWinBack = sc.res.tier === 'watch' || sc.res.tier === 'at_risk' || sc.res.tier === 'dormant';
    const trigger = rewardTrigger({ tier: sc.res.tier, isWinBackTouch: isWinBack, orderCount: sc.orderCount });
    if (!trigger) return;
    const option = pickReward();
    setReward({ companyName: sc.company.name, option });

    // Persist touch cadence: last_human_touch = today, recompute next due.
    const today = new Date().toISOString().slice(0, 10);
    const next = nextTouchDue({
      tier: sc.res.tier,
      accountType: accountTypeForPolicy(sc.company, ACTIVE_REORDER_POLICY),
      lastTouch: today,
      today,
    });
    await crm.updateCompany(sc.company.id, {
      last_human_touch: today,
      next_touch_due: next.due,
    } as any).catch((err: any) => console.error('Failed to persist touch dates:', err));

    // Log the granted reward as an auditable meeting (only when one is drawn).
    // The primary interaction is already durable, so an auxiliary reward-log
    // failure must not reject the modal save and invite a duplicate interaction.
    if (option) {
      try {
        await addMeeting({
          description: `Surprise reward (${trigger}): ${option.label}`,
          type: 'reward',
          date: today,
          company_id: sc.company.id,
          contact_ids: [],
          deal_id: logDealId || null,
          product: 'Butter',
          summary: option.note,
          outcome: 'positive',
          followup_date: null,
        });
      } catch (rewardErr) {
        console.error('Primary interaction saved, but reward audit logging failed:', rewardErr);
      }
    }
    await refresh();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 text-clay-ink animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl pb-20 lg:pb-6">
      {/* Header */}
      <div className="mb-5 md:mb-6 flex items-center gap-3">
        <Blob state="thinking" size={44} aria-label="Retention guardian mascot" />
        <div>
          <h1 className="text-xl md:text-2xl font-semibold text-clay-ink tracking-tight flex items-center gap-2">
            <HeartPulse className="w-6 h-6 text-clay-coral" /> Retention
          </h1>
          <p className="text-sm text-clay-muted mt-0.5">Account-Watch — who's slipping away before they're gone</p>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Kpi
          icon={<ShieldAlert className="w-4 h-4" />}
          label="Needs Action"
          value={String(needsAction)}
          sub={`${counts.at_risk} at-risk · ${counts.dormant} dormant`}
          tone="coral"
        />
        <Kpi
          icon={<TrendingDown className="w-4 h-4" />}
          label="Watch"
          value={String(counts.watch)}
          sub="monitor closely"
          tone="ochre"
        />
        <Kpi
          icon={<HeartPulse className="w-4 h-4" />}
          label="Healthy"
          value={String(counts.healthy)}
          sub="reordering well"
          tone="mint"
        />
        <Kpi
          icon={<Activity className="w-4 h-4" />}
          label="Monitored"
          value={String(monitored.length)}
          sub={`of ${companies.length} accounts`}
          tone="lavender"
        />
      </div>

      {/* Filter pills + search */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <FilterPill active={filter === 'all'} onClick={() => setFilter('all')} label="All" count={monitored.length} />
        <FilterPill active={filter === 'due'} onClick={() => setFilter('due')} label="Due" count={dueCount} tone="error" />
        <FilterPill active={filter === 'healthy'} onClick={() => setFilter('healthy')} label="Healthy" count={counts.healthy} tone="mint" />
        <FilterPill active={filter === 'watch'} onClick={() => setFilter('watch')} label="Watch" count={counts.watch} tone="ochre" />
        <FilterPill active={filter === 'at_risk'} onClick={() => setFilter('at_risk')} label="At-risk" count={counts.at_risk} tone="coral" />
        <FilterPill active={filter === 'dormant'} onClick={() => setFilter('dormant')} label="Dormant" count={counts.dormant} tone="error" />
      </div>
      <div className="relative mb-4">
        <Search className="w-4 h-4 text-clay-muted absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          placeholder="Search accounts..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-3 bg-white dark:bg-clay-card border border-clay-hairline rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-clay-ink"
        />
      </div>

      {/* Due for touch queue (pinned) */}
      {dueAccounts.length > 0 && filter !== 'due' && (
        <div className="mb-4 bg-clay-error/5 border border-clay-error/20 rounded-xl p-3.5">
          <div className="flex items-center gap-2 mb-2">
            <BellRing className="w-4 h-4 text-clay-error" />
            <h2 className="text-sm font-semibold text-clay-ink">Due for touch ({dueCount})</h2>
            <span className="text-[11px] text-clay-muted-soft">human touch keeps them</span>
          </div>
          <div className="space-y-2">
            {dueAccounts.slice(0, 5).map(({ company, res, touch }) => {
              const t = TIER_STYLE[res.tier];
              return (
                <div key={company.id} className="flex items-center gap-3 bg-white dark:bg-clay-card border border-clay-hairline rounded-lg px-3 py-2">
                  <span className={clsx('w-2 h-2 rounded-full shrink-0', t.dot)} />
                  <button onClick={() => setSelectedCompanyId(company.id)} className="flex-1 min-w-0 text-left active:opacity-70">
                    <p className="text-sm font-medium text-clay-ink truncate">{company.name}</p>
                    <p className="text-[10px] text-clay-muted">overdue {Math.abs(touch.daysUntil)}d · {tierLabel(res.tier)}</p>
                    {Math.abs(touch.daysUntil) >= 3 && (
                      <NudgeLadderRail
                        stage={stageFromSilenceDays(Math.abs(touch.daysUntil))}
                        variant="mini"
                        className="mt-1 max-w-[6.5rem]"
                      />
                    )}
                  </button>
                  <button
                    onClick={() => openWinBack(company.id)}
                    className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-clay-ink text-clay-canvas text-xs font-medium active:opacity-85 min-h-[36px]"
                  >
                    <HeartPulse className="w-3.5 h-3.5" /> Touch
                  </button>
                </div>
              );
            })}
            {dueAccounts.length > 5 && (
              <button onClick={() => setFilter('due')} className="text-[11px] text-clay-lavender font-medium px-1">+ {dueAccounts.length - 5} more</button>
            )}
          </div>
        </div>
      )}
      {visible.length === 0 ? (
        <div className="bg-clay-card border border-clay-hairline rounded-xl p-8 text-center">
          <p className="text-sm text-clay-muted">No accounts match this filter.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map(({ company, res, lastTouch, daysSilent, reasons, touch, lifetimeNet, orderCount }) => {
            const t = TIER_STYLE[res.tier];
            return (
              <div key={company.id} className="bg-white dark:bg-clay-card border border-clay-hairline rounded-xl p-3.5 clay-card">
                <div className="flex items-center gap-3">
                  {/* Health ring */}
                  <div className="relative shrink-0" style={{ width: 52, height: 52 }}>
                    <svg viewBox="0 0 52 52" className="w-[52px] h-[52px] -rotate-90">
                      <circle cx="26" cy="26" r="22" fill="none" stroke="currentColor" strokeOpacity="0.14" strokeWidth="5" className="text-clay-muted" />
                      <circle
                        cx="26" cy="26" r="22" fill="none" stroke={t.ring} strokeWidth="5" strokeLinecap="round"
                        strokeDasharray={RING_C} strokeDashoffset={RING_C * (1 - res.score / 100)}
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-sm font-bold text-clay-ink leading-none">{res.score}</span>
                    </div>
                  </div>

                  {/* Identity + status */}
                  <button
                    onClick={() => setSelectedCompanyId(company.id)}
                    className="flex-1 min-w-0 text-left active:opacity-70"
                  >
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold text-clay-ink truncate">{company.name}</h4>
                      <span className={clsx('text-[10px] font-medium px-1.5 py-0.5 rounded', t.bg, t.text)}>{tierLabel(res.tier)}</span>
                    </div>
                    <p className="text-[11px] text-clay-muted mt-0.5 flex items-center gap-1.5 flex-wrap">
                      <span className={clsx('w-1.5 h-1.5 rounded-full', t.dot)} />
                      {COMPANY_STATUS_LABELS[company.status]}
                      {lastTouch ? (
                        <span className="flex items-center gap-1 ml-1"><CalendarClock className="w-3 h-3" /> last touch {lastTouch}{daysSilent ? ` · ${daysSilent}d quiet` : ''}</span>
                      ) : (
                        <span> · no touch logged</span>
                      )}
                      <span className={clsx(
                        'ml-1 px-1.5 py-0.5 rounded text-[10px] font-medium',
                        touch.daysUntil <= 0 ? 'bg-clay-error/10 text-clay-error' : touch.daysUntil <= 7 ? 'bg-clay-ochre/15 text-clay-ochre' : 'bg-clay-surface text-clay-muted-soft'
                      )}>
                        {touch.daysUntil <= 0 ? `touch overdue ${Math.abs(touch.daysUntil)}d` : touch.daysUntil === 0 ? 'touch due today' : `touch in ${touch.daysUntil}d`}
                      </span>
                    </p>
                    {typeof daysSilent === 'number' && daysSilent >= 3 && (
                      <NudgeLadderRail
                        stage={stageFromSilenceDays(daysSilent)}
                        variant="mini"
                        className="mt-1.5 max-w-[7rem]"
                      />
                    )}
                  </button>

                  {/* Win-back action */}
                  <button
                    onClick={() => openWinBack(company.id)}
                    className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-clay-ink text-clay-canvas text-xs font-medium active:opacity-85 min-h-[40px]"
                  >
                    <HeartPulse className="w-4 h-4" /> Log touch
                  </button>
                </div>

                {/* R/F/O + reasons */}
                <div className="mt-3 flex items-center gap-3">
                  <SubScore label="R" value={res.R} />
                  <SubScore label="F" value={res.F} />
                  {res.weightsUsed === 'full' && <SubScore label="M" value={res.M} />}
                  <SubScore label="O" value={res.O} />
                  {lifetimeNet > 0 && (
                    <span className="text-[10px] text-clay-muted-soft tabular-nums">
                      ฿{Math.round(lifetimeNet).toLocaleString()} · {orderCount} orders
                    </span>
                  )}
                  {res.weightsUsed === 'interim' && (
                    <span className="text-[10px] text-clay-muted-soft flex items-center gap-1" title="M (revenue) unlocks when sales history is imported">
                      <AlertTriangle className="w-3 h-3" /> M pending
                    </span>
                  )}
                </div>
                {reasons.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {reasons.map((r, i) => (
                      <span key={i} className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-clay-surface text-clay-muted-soft">{r}</span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {selectedCompany && (
        <CompanyDetail
          company={selectedCompany}
          onClose={() => setSelectedCompanyId(null)}
          onSaved={refresh}
          contacts={contacts}
          companyContacts={companyContacts}
        />
      )}

      <LogInteractionModal
        isOpen={isLogOpen}
        onClose={() => { setIsLogOpen(false); setLogCompanyId(null); setLogDealId(undefined); }}
        onSave={handleLogSave}
        deals={deals}
        contacts={contacts}
        companies={companies}
        selectedDealId={logDealId}
        initialCompanyId={logCompany?.id}
      />

      {reward && (
        <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-[60] p-0 md:p-4" onClick={() => setReward(null)}>
          <div
            className="bg-white dark:bg-clay-card w-full md:max-w-sm md:rounded-2xl rounded-t-2xl p-6 max-h-[80vh] overflow-y-auto clay-card-land"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-full bg-clay-ochre/15 flex items-center justify-center mb-3">
                <Gift className="w-7 h-7 text-clay-ochre" />
              </div>
              <h2 className="text-lg font-semibold text-clay-ink">Surprise reward</h2>
              <p className="text-xs text-clay-muted mt-1">for {reward.companyName}</p>
            </div>

            {reward.option ? (
              <div className="mt-4 bg-clay-surface rounded-xl p-4 text-center">
                <p className="text-sm font-semibold text-clay-ink">{reward.option.label}</p>
                <p className="text-[11px] text-clay-muted mt-1.5">{reward.option.note}</p>
                {reward.option.personal && (
                  <span className="inline-block mt-2 text-[10px] font-medium px-2 py-0.5 rounded bg-clay-lavender/15 text-clay-lavender">personal touch</span>
                )}
              </div>
            ) : (
              <div className="mt-4 bg-clay-surface rounded-xl p-4 text-center">
                <p className="text-sm text-clay-body">No reward this time — but they'll remember the call.</p>
                <p className="text-[11px] text-clay-muted mt-1.5">The unpredictability is the point. The next one might land.</p>
              </div>
            )}

            <button
              onClick={() => setReward(null)}
              className="mt-4 w-full flex items-center justify-center px-4 py-3 bg-clay-ink text-clay-canvas text-sm font-medium rounded-lg active:opacity-85 min-h-[48px]"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ icon, label, value, sub, tone }: { icon: React.ReactNode; label: string; value: string; sub: string; tone: 'coral' | 'ochre' | 'mint' | 'lavender' }) {
  const tones: Record<string, string> = {
    coral: 'text-clay-coral',
    ochre: 'text-clay-ochre',
    mint: 'text-clay-mint',
    lavender: 'text-clay-lavender',
  };
  return (
    <div className="bg-clay-card border border-clay-hairline rounded-xl p-4 clay-card">
      <div className={clsx('flex items-center gap-1.5 mb-2', tones[tone])}>{icon}<span className="text-xs font-medium">{label}</span></div>
      <p className="text-xl font-bold text-clay-ink tracking-tight">{value}</p>
      <p className="text-[11px] text-clay-muted-soft mt-0.5">{sub}</p>
    </div>
  );
}

function FilterPill({ active, onClick, label, count, tone }: { active: boolean; onClick: () => void; label: string; count: number; tone?: 'mint' | 'ochre' | 'coral' | 'error' }) {
  const dot: Record<string, string> = {
    mint: 'bg-clay-mint', ochre: 'bg-clay-ochre', coral: 'bg-clay-coral', error: 'bg-clay-error',
  };
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium border transition-colors min-h-[40px]',
        active ? 'bg-clay-ink text-clay-canvas border-clay-ink' : 'bg-clay-card text-clay-muted border-clay-hairline active:bg-clay-surface'
      )}
    >
      {tone && <span className={clsx('w-1.5 h-1.5 rounded-full', dot[tone])} />}
      {label}
      <span className={clsx('text-[10px]', active ? 'text-clay-canvas/70' : 'text-clay-muted-soft')}>{count}</span>
    </button>
  );
}

function SubScore({ label, value }: { label: string; value: number }) {
  const pct = Math.round(value * 100);
  const color = value >= 0.75 ? 'text-clay-mint' : value >= 0.5 ? 'text-clay-ochre' : value >= 0.25 ? 'text-clay-coral' : 'text-clay-error';
  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] font-semibold text-clay-muted-soft">{label}</span>
      <span className={clsx('text-xs font-bold tabular-nums', color)}>{pct}</span>
    </div>
  );
}
