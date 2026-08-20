'use client';

import { useState, useMemo } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Meeting, MEETING_TYPE_LABELS, Company, Contact, Deal } from '@/types/crm';
import { useCrm, ActivityEntry } from '@/components/CrmProvider';
import { WORKFLOW_LANES, getWorkflowAction } from '@/utils/deal-workflow';
import LogInteractionModal from '@/components/LogInteractionModal';
import CompanyDetail from '@/components/CompanyDetail';
import ContactDetail from '@/components/ContactDetail';
import {
  Search, Plus, Mail, Phone, Users, FileText, Package, Bell,
  Building2, Loader2, Snowflake, UserX, AlarmClock, Hourglass, Zap,
} from 'lucide-react';
import clsx from 'clsx';

type TimelineItem =
  | { kind: 'meeting'; key: string; ts: number; meeting: Meeting }
  | { kind: 'event'; key: string; ts: number; event: ActivityEntry };

const ENTITY_ICONS: Record<string, string> = {
  deal: '💼',
  contact: '👤',
  company: '🏢',
  meeting: '📅',
};

const ACTION_COLORS: Record<string, string> = {
  quick_action: 'text-clay-ochre',
  edit: 'text-zams-deep',
  create: 'text-clay-teal',
  delete: 'text-clay-error',
};

const meetingIcon = (type: Meeting['type']) => {
  switch (type) {
    case 'meeting': return <Users className="w-4 h-4" />;
    case 'email': return <Mail className="w-4 h-4" />;
    case 'call': return <Phone className="w-4 h-4" />;
    case 'sample_sent': return <Package className="w-4 h-4" />;
    case 'nudge': return <Bell className="w-4 h-4" />;
    default: return <FileText className="w-4 h-4" />;
  }
};

const meetingIconColor = (type: Meeting['type']) => {
  switch (type) {
    case 'meeting': return 'bg-clay-lavender/20 text-clay-lavender';
    case 'email': return 'bg-clay-pink/20 text-clay-pink';
    case 'call': return 'bg-clay-mint/20 text-clay-teal';
    case 'sample_sent': return 'bg-clay-ochre/20 text-clay-ochre';
    case 'nudge': return 'bg-clay-coral/20 text-clay-coral';
    default: return 'bg-clay-card text-clay-muted';
  }
};

const dayMs = 86400000;
const toTs = (date: string) => new Date(`${date}T12:00:00`).getTime();
const daysSince = (ts: number) => Math.floor((Date.now() - ts) / dayMs);

export default function ActivityPage() {
  const router = useRouter();
  const { meetings, contacts, companies, deals, activities, loading, addMeeting, undoActivity, refresh } = useCrm();

  const [tab, setTab] = useState<'timeline' | 'radar'>('timeline');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [range, setRange] = useState<'all' | 'today' | '7d' | '30d'>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  const [selectedContact, setSelectedContact] = useState<string | null>(null);

  const contactName = (id?: string) => contacts.find(c => c.id === id)?.name;
  const companyFor = (id?: string | null) => (id ? companies.find((c: Company) => c.id === id) : null);
  const dealFor = (id?: string | null) => (id ? deals.find((d: Deal) => d.id === id) : null);

  /* ─── Pulse: 7-day touchpoint stats ─── */
  const pulse = useMemo(() => {
    const start = Date.now() - 7 * dayMs;
    const inWeek = meetings.filter(m => toTs(m.date) >= start);
    const byType: Record<string, number> = { call: 0, email: 0, meeting: 0, sample_sent: 0, nudge: 0, note: 0 };
    const outcomes: Record<string, number> = { positive: 0, neutral: 0, negative: 0, no_response: 0 };
    inWeek.forEach(m => {
      if (byType[m.type] !== undefined) byType[m.type]++;
      if (m.outcome) outcomes[m.outcome] = (outcomes[m.outcome] || 0) + 1;
    });
    const days: { label: string; count: number; isToday: boolean }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      days.push({
        label: d.toLocaleDateString('en-US', { weekday: 'short' }),
        count: inWeek.filter(m => m.date === key).length,
        isToday: i === 0,
      });
    }
    return { byType, outcomes, days, total: inWeek.length, outcomeTotal: Object.values(outcomes).reduce((a, b) => a + b, 0) };
  }, [meetings]);

  const typeStats = [
    { key: 'call', label: 'Calls', icon: <Phone className="w-3.5 h-3.5" />, cls: 'bg-clay-mint/20 text-clay-teal' },
    { key: 'email', label: 'Emails', icon: <Mail className="w-3.5 h-3.5" />, cls: 'bg-clay-pink/20 text-clay-pink' },
    { key: 'meeting', label: 'Meetings', icon: <Users className="w-3.5 h-3.5" />, cls: 'bg-clay-lavender/20 text-clay-lavender' },
    { key: 'sample_sent', label: 'Samples', icon: <Package className="w-3.5 h-3.5" />, cls: 'bg-clay-ochre/20 text-clay-ochre' },
    { key: 'nudge', label: 'Nudges', icon: <Bell className="w-3.5 h-3.5" />, cls: 'bg-clay-coral/20 text-clay-coral' },
    { key: 'note', label: 'Notes', icon: <FileText className="w-3.5 h-3.5" />, cls: 'bg-clay-card text-clay-muted' },
  ];

  const outcomeStats = [
    { key: 'positive', label: 'Positive', cls: 'bg-clay-success/10 text-clay-success border-clay-success/20' },
    { key: 'neutral', label: 'Neutral', cls: 'bg-clay-card text-clay-body border-clay-hairline' },
    { key: 'negative', label: 'Negative', cls: 'bg-clay-error/10 text-clay-error border-clay-error/20' },
    { key: 'no_response', label: 'No reply', cls: 'bg-clay-ochre/10 text-clay-ochre border-clay-ochre/20' },
  ];

  const maxDayCount = Math.max(...pulse.days.map(d => d.count), 1);

  /* ─── Radar: coverage gaps ───
     Touch detection is multi-source: the deals board (updated_at), system
     events, logged meetings, and explicit contact dates all count as activity.
     This keeps the radar consistent with what the Deals section shows. */
  const radar = useMemo(() => {
    // ── Deal last touch: board edits + system events + meetings on the deal ──
    const eventTsByDeal: Record<string, number> = {};
    activities.forEach(a => {
      if (a.entity === 'deal' && a.entityId && a.applied !== false) {
        if (!eventTsByDeal[a.entityId] || a.timestamp > eventTsByDeal[a.entityId]) {
          eventTsByDeal[a.entityId] = a.timestamp;
        }
      }
    });

    const dealLastTouch: Record<string, number> = {};
    deals.forEach(d => {
      // NOTE: deal.updated_at is NOT used: the action-board migration bulk-updated
      // every row, so it cannot distinguish real edits from the import. Real touch
      // = logged meetings + persisted system events.
      let ts = eventTsByDeal[d.id] || 0;
      meetings.forEach(m => {
        if (m.deal_id === d.id) {
          const mts = toTs(m.date);
          if (mts > ts) ts = mts;
        }
      });
      dealLastTouch[d.id] = ts;
    });

    // ── Company last touch: any signal that the account was worked ──
    const companyLastTouch: Record<string, number> = {};
    meetings.forEach(m => {
      const ts = toTs(m.date);
      const touch = (cid?: string | null) => {
        if (cid && (!companyLastTouch[cid] || ts > companyLastTouch[cid])) companyLastTouch[cid] = ts;
      };
      touch(m.company_id);
      (m.contact_ids || []).forEach(cid => {
        const c = contacts.find(x => x.id === cid);
        touch(c?.company_id);
      });
    });
    companies.forEach(c => {
      let ts = companyLastTouch[c.id] || 0;
      const consider = (t?: number) => { if (t && t > ts) ts = t; };
      consider(c.last_contact_date ? toTs(c.last_contact_date) : undefined);
      // company.updated_at excluded: bulk-import polluted, same reason as deals.
      contacts.filter(x => x.company_id === c.id).forEach(x => {
        consider(x.last_contacted_date ? toTs(x.last_contacted_date) : undefined);
      });
      deals.filter(d => d.company_id === c.id).forEach(d => consider(dealLastTouch[d.id]));
      companyLastTouch[c.id] = ts;
    });

    const coldAccounts = companies
      .filter(c => c.status === 'prospect' || c.status === 'active_customer')
      .map(c => ({ company: c, lastTouch: companyLastTouch[c.id] || 0 }))
      .filter(x => x.lastTouch === 0 || daysSince(x.lastTouch) > 14)
      .sort((a, b) => a.lastTouch - b.lastTouch)
      .slice(0, 6);

    const touchedContactIds = new Set<string>();
    meetings.forEach(m => (m.contact_ids || []).forEach(cid => touchedContactIds.add(cid)));
    deals.forEach(d => (d.contact_ids || []).forEach(cid => touchedContactIds.add(cid)));

    const neverContacted = contacts
      .filter(c => !touchedContactIds.has(c.id) && !c.last_contacted_date)
      .slice(0, 6);

    const todayStr = new Date().toISOString().split('T')[0];
    const openLoops: { kind: 'deal' | 'meeting'; name: string; date: string; dealId?: string }[] = [
      ...deals
        .filter(d => d.stage !== 'closed_won' && d.stage !== 'closed_lost' && d.followup_date && d.followup_date < todayStr)
        .map(d => ({ kind: 'deal' as const, name: d.client, date: d.followup_date!, dealId: d.id })),
      ...meetings
        .filter(m => {
          if (!m.followup_date || m.followup_date >= todayStr) return false;
          // Stale-loop guard: ignore if a newer interaction exists on the same deal/company.
          const newer = meetings.some(x => {
            if (x.id === m.id) return false;
            if (m.deal_id ? x.deal_id === m.deal_id : x.company_id === m.company_id) {
              return x.date > m.followup_date!;
            }
            return false;
          });
          return !newer;
        })
        .map(m => ({ kind: 'meeting' as const, name: m.description, date: m.followup_date! })),
    ].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6);

    const stuckDeals = deals
      .filter(d => d.stage !== 'closed_won' && d.stage !== 'closed_lost')
      .map(d => ({ deal: d, lastTouch: dealLastTouch[d.id] || 0 }))
      .filter(x => x.lastTouch === 0 || daysSince(x.lastTouch) > 14)
      .sort((a, b) => a.lastTouch - b.lastTouch)
      .slice(0, 6);

    const total = coldAccounts.length + neverContacted.length + openLoops.length + stuckDeals.length;
    return { coldAccounts, neverContacted, openLoops, stuckDeals, total };
  }, [meetings, contacts, companies, deals, activities]);

  /* ─── Timeline items ─── */
  const items: TimelineItem[] = useMemo(() => {
    const mItems: TimelineItem[] = meetings.map(m => ({
      kind: 'meeting',
      key: `m-${m.id}`,
      ts: toTs(m.date),
      meeting: m,
    }));
    const eItems: TimelineItem[] = activities.map(a => ({
      kind: 'event',
      key: `e-${a.id}`,
      ts: a.timestamp,
      event: a,
    }));
    return [...mItems, ...eItems].sort((a, b) => b.ts - a.ts);
  }, [meetings, activities]);

  const filtered = useMemo(() => {
    const now = Date.now();
    const q = search.toLowerCase();

    return items.filter(item => {
      if (item.kind === 'event') {
        if (typeFilter !== 'all' && typeFilter !== 'system') return false;
        if (range === 'today' && item.ts < new Date().setHours(0, 0, 0, 0)) return false;
        if (range === '7d' && item.ts < now - 7 * dayMs) return false;
        if (range === '30d' && item.ts < now - 30 * dayMs) return false;
        if (q) {
          const hay = `${item.event.label} ${item.event.description || ''}`.toLowerCase();
          return hay.includes(q);
        }
        return true;
      }
      const m = item.meeting;
      if (typeFilter === 'system') return false;
      if (typeFilter !== 'all' && m.type !== typeFilter) return false;
      if (range === 'today' && toTs(m.date) < new Date().setHours(0, 0, 0, 0)) return false;
      if (range === '7d' && item.ts < now - 7 * dayMs) return false;
      if (range === '30d' && item.ts < now - 30 * dayMs) return false;
      if (q) {
        const contactNames = (m.contact_ids || []).map(contactName).filter(Boolean).join(' ');
        const companyName = companyFor(m.company_id)?.name || '';
        const hay = `${m.description} ${m.summary || ''} ${contactNames} ${companyName}`.toLowerCase();
        return hay.includes(q);
      }
      return true;
    });
  }, [items, search, typeFilter, range]);

  const grouped = useMemo(() => {
    const groups: Record<string, TimelineItem[]> = {};
    filtered.forEach(item => {
      const date = new Date(item.ts);
      const key = date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });
    return groups;
  }, [filtered]);

  const activeCompany = selectedCompany ? companies.find((c: Company) => c.id === selectedCompany) : null;
  const activeContact = selectedContact ? contacts.find(c => c.id === selectedContact) : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 text-clay-ink animate-spin" />
      </div>
    );
  }

  const fmtTime = (ts: number) => new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

  return (
    <div className="p-4 md:p-6 max-w-6xl pb-20 lg:pb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="zams-eyebrow mb-1">
            Activity · {items.length} events{radar.total > 0 ? ` · ${radar.total} need attention` : ''}
          </p>
          <h1 className="zams-display text-2xl md:text-[28px] leading-none">Activity</h1>
        </div>
        <button onClick={() => setIsModalOpen(true)} className="zams-btn-primary">
          <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Log interaction</span>
        </button>
      </div>

      {/* Pulse bar */}
      <div className="bg-white dark:bg-clay-card border border-clay-hairline rounded-lg p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <p className="zams-eyebrow">Pulse · Last 7 days</p>
          <span className="zams-mono text-[10px] uppercase tracking-[0.18px] text-zams-violet">{pulse.total} touchpoints</span>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-4">
          {typeStats.map(s => (
            <div key={s.key} className="flex items-center gap-2 bg-clay-surface/60 dark:bg-clay-card rounded px-2.5 py-2">
              <span className={clsx('w-6 h-6 rounded flex items-center justify-center shrink-0', s.cls)}>{s.icon}</span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-clay-ink leading-none">{pulse.byType[s.key] || 0}</p>
                <p className="zams-mono text-[9px] uppercase tracking-[0.14px] text-clay-muted truncate">{s.label}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {outcomeStats.map(o => (
            <span key={o.key} className={clsx('inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded-full border', o.cls)}>
              {pulse.outcomes[o.key] || 0}
              {pulse.outcomeTotal > 0 && (
                <span className="opacity-60">
                  ({Math.round(((pulse.outcomes[o.key] || 0) / pulse.outcomeTotal) * 100)}%)
                </span>
              )}
              {o.label}
            </span>
          ))}
        </div>
        <div className="flex items-end gap-2 h-14">
          {pulse.days.map(d => (
            <div key={d.label} className="flex-1 flex flex-col items-center gap-1 min-w-0">
              <span className="text-[10px] font-bold text-clay-ink">{d.count}</span>
              <div
                className={clsx('w-full max-w-[36px] rounded-t transition-all', d.isToday ? 'bg-zams-violet' : 'bg-zams-powder')}
                style={{ height: `${Math.max(4, (d.count / maxDayCount) * 36)}px` }}
                title={`${d.label}: ${d.count}`}
              />
              <span className={clsx('zams-mono text-[9px] uppercase tracking-[0.14px]', d.isToday ? 'text-zams-violet font-medium' : 'text-clay-muted-soft')}>
                {d.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-clay-card rounded-lg p-0.5 mb-4 w-fit">
        <button
          onClick={() => setTab('timeline')}
          className={clsx('px-4 py-2 text-xs font-medium rounded-md transition-colors', tab === 'timeline' ? 'bg-clay-ink text-clay-canvas' : 'text-clay-muted')}
        >
          Timeline
        </button>
        <button
          onClick={() => setTab('radar')}
          className={clsx('px-4 py-2 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5', tab === 'radar' ? 'bg-clay-ink text-clay-canvas' : 'text-clay-muted')}
        >
          Radar
          {radar.total > 0 && (
            <span className={clsx('text-[10px] font-bold px-1.5 py-0.5 rounded-full', tab === 'radar' ? 'bg-zams-violet text-white' : 'bg-clay-ochre/20 text-clay-ochre')}>
              {radar.total}
            </span>
          )}
        </button>
      </div>

      {/* ─── Timeline tab ─── */}
      {tab === 'timeline' && (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-5">
            <div className="flex-1 min-w-[180px] relative">
              <Search className="w-4 h-4 text-clay-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search people, companies, deals..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-3 bg-white dark:bg-clay-card border border-clay-hairline rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-zams-violet/40"
              />
            </div>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="bg-white dark:bg-clay-card border border-clay-hairline rounded-lg px-2.5 py-3 text-sm text-clay-ink focus:outline-none focus:ring-2 focus:ring-zams-violet/40"
            >
              <option value="all">All types</option>
              <option value="call">Calls</option>
              <option value="email">Emails</option>
              <option value="meeting">Meetings</option>
              <option value="sample_sent">Samples</option>
              <option value="nudge">Nudges</option>
              <option value="note">Notes</option>
              <option value="system">System actions</option>
            </select>
            <select
              value={range}
              onChange={(e) => setRange(e.target.value as any)}
              className="bg-white dark:bg-clay-card border border-clay-hairline rounded-lg px-2.5 py-3 text-sm text-clay-ink focus:outline-none focus:ring-2 focus:ring-zams-violet/40"
            >
              <option value="all">All time</option>
              <option value="today">Today</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
            </select>
          </div>

          {filtered.length === 0 && (
            <div className="text-center py-12 bg-white dark:bg-clay-card rounded-lg border border-clay-hairline">
              <Image
                src="/assets/mascot-teardrop.png"
                alt="LeadPulse mascot"
                width={1024}
                height={1024}
                className="w-24 h-24 object-contain mx-auto mb-3"
              />
              <p className="text-sm font-medium text-clay-ink mb-1">Nothing here yet</p>
              <p className="text-xs text-clay-muted mb-4">Log an interaction or widen the filters.</p>
              <button
                onClick={() => { setSearch(''); setTypeFilter('all'); setRange('all'); }}
                className="zams-btn-outline"
              >
                Clear filters
              </button>
            </div>
          )}

          {filtered.length > 0 && (
            <div className="space-y-6">
              {Object.entries(grouped).map(([date, dayItems]) => (
                <div key={date}>
                  <div className="flex items-center gap-2 mb-3">
                    <h2 className="zams-mono text-[11px] uppercase tracking-[0.22px] text-zams-fog">{date}</h2>
                    <span className="h-px flex-1 bg-clay-hairline" />
                    <span className="zams-mono text-[10px] text-clay-muted-soft">{dayItems.length}</span>
                  </div>
                  <div className="space-y-2">
                    {dayItems.map(item =>
                      item.kind === 'event' ? (
                        <EventCard
                          key={item.key}
                          event={item.event}
                          time={fmtTime(item.ts)}
                          onUndo={undoActivity}
                        />
                      ) : (
                        <MeetingCard
                          key={item.key}
                          meeting={item.meeting}
                          time={fmtTime(item.ts)}
                          contactName={contactName}
                          company={companyFor(item.meeting.company_id) ?? null}
                          deal={dealFor(item.meeting.deal_id) ?? null}
                          onOpenCompany={(id: string) => setSelectedCompany(id)}
                          onOpenDeal={(id: string) => router.push(`/deals?deal=${id}`)}
                        />
                      )
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ─── Radar tab ─── */}
      {tab === 'radar' && (
        <div className="grid md:grid-cols-2 gap-4">
          {/* Cold accounts */}
          <RadarCard
            eyebrow="Cold accounts"
            icon={<Snowflake className="w-4 h-4" />}
            accent="text-clay-coral"
            count={radar.coldAccounts.length}
            hint="No touch in 14+ days"
          >
            {radar.coldAccounts.length === 0 ? (
              <p className="text-xs text-clay-muted py-3 text-center">Every account is warm. 🔥</p>
            ) : (
              radar.coldAccounts.map(({ company, lastTouch }) => (
                <button
                  key={company.id}
                  onClick={() => setSelectedCompany(company.id)}
                  className="w-full flex items-center justify-between gap-2 text-left px-2.5 py-2 rounded hover:bg-clay-surface transition-colors"
                >
                  <span className="text-xs font-medium text-clay-ink truncate flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-clay-muted-soft shrink-0" />
                    {company.name}
                  </span>
                  <span className="text-[10px] font-semibold text-clay-coral bg-clay-coral/10 px-1.5 py-0.5 rounded shrink-0">
                    {lastTouch === 0 ? 'Never' : `${daysSince(lastTouch)}d`}
                  </span>
                </button>
              ))
            )}
          </RadarCard>

          {/* Never contacted */}
          <RadarCard
            eyebrow="Never contacted"
            icon={<UserX className="w-4 h-4" />}
            accent="text-zams-deep"
            count={radar.neverContacted.length}
            hint="No logged interaction"
          >
            {radar.neverContacted.length === 0 ? (
              <p className="text-xs text-clay-muted py-3 text-center">Everyone has been touched.</p>
            ) : (
              radar.neverContacted.map(c => (
                <button
                  key={c.id}
                  onClick={() => setSelectedContact(c.id)}
                  className="w-full flex items-center justify-between gap-2 text-left px-2.5 py-2 rounded hover:bg-clay-surface transition-colors"
                >
                  <span className="text-xs font-medium text-clay-ink truncate flex items-center gap-1.5">
                    👤 {c.name}
                  </span>
                  <span className="text-[10px] text-clay-muted-soft truncate shrink-0 max-w-[45%]">
                    {companyFor(c.company_id)?.name || '—'}
                  </span>
                </button>
              ))
            )}
          </RadarCard>

          {/* Open loops */}
          <RadarCard
            eyebrow="Open loops"
            icon={<AlarmClock className="w-4 h-4" />}
            accent="text-clay-ochre"
            count={radar.openLoops.length}
            hint="Follow-ups past due"
          >
            {radar.openLoops.length === 0 ? (
              <p className="text-xs text-clay-muted py-3 text-center">No overdue follow-ups.</p>
            ) : (
              radar.openLoops.map((loop, i) => (
                <button
                  key={`${loop.kind}-${i}`}
                  onClick={() => loop.dealId && router.push(`/deals?deal=${loop.dealId}`)}
                  className="w-full flex items-center justify-between gap-2 text-left px-2.5 py-2 rounded hover:bg-clay-surface transition-colors"
                >
                  <span className="text-xs font-medium text-clay-ink truncate">
                    {loop.kind === 'deal' ? '💼 ' : '📅 '}{loop.name}
                  </span>
                  <span className="text-[10px] font-semibold text-clay-ochre bg-clay-ochre/10 px-1.5 py-0.5 rounded shrink-0">
                    {loop.date}
                  </span>
                </button>
              ))
            )}
          </RadarCard>

          {/* Stuck deals */}
          <RadarCard
            eyebrow="Stuck deals"
            icon={<Hourglass className="w-4 h-4" />}
            accent="text-zams-violet"
            count={radar.stuckDeals.length}
            hint="No movement in 14+ days"
          >
            {radar.stuckDeals.length === 0 ? (
              <p className="text-xs text-clay-muted py-3 text-center">Every deal is moving. 🎉</p>
            ) : (
              radar.stuckDeals.map(({ deal, lastTouch }) => {
                const lane = WORKFLOW_LANES.find(l => l.id === getWorkflowAction(deal));
                return (
                  <button
                    key={deal.id}
                    onClick={() => router.push(`/deals?deal=${deal.id}`)}
                    className="w-full flex items-center justify-between gap-2 text-left px-2.5 py-2 rounded hover:bg-clay-surface transition-colors"
                  >
                    <span className="text-xs font-medium text-clay-ink truncate">
                      {lane?.icon} {deal.client}
                      <span className="text-clay-muted-soft"> · {lane?.shortLabel}</span>
                    </span>
                    <span className="text-[10px] font-semibold text-zams-violet bg-zams-powder/60 px-1.5 py-0.5 rounded shrink-0">
                      {lastTouch === 0 ? 'Never' : `${daysSince(lastTouch)}d`}
                    </span>
                  </button>
                );
              })
            )}
          </RadarCard>
        </div>
      )}

      {/* Log interaction modal */}
      <LogInteractionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={async (meeting) => { await addMeeting(meeting); }}
        deals={deals}
        contacts={contacts}
        companies={companies}
      />

      {activeCompany && (
        <CompanyDetail
          company={activeCompany}
          onClose={() => setSelectedCompany(null)}
          onSaved={refresh}
          contacts={contacts}
          companyContacts={contacts.filter((c: Contact) => c.company_id === activeCompany.id)}
        />
      )}

      {activeContact && (
        <ContactDetail
          contact={activeContact}
          onClose={() => setSelectedContact(null)}
          onSaved={refresh}
          companies={companies}
        />
      )}
    </div>
  );
}

/* ─── Radar card shell ─── */
function RadarCard({
  eyebrow, icon, accent, count, hint, children,
}: {
  eyebrow: string;
  icon: React.ReactNode;
  accent: string;
  count: number;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white dark:bg-clay-card border border-clay-hairline rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-clay-hairline bg-clay-surface/50 dark:bg-clay-card">
        <div className="flex items-center gap-2">
          <span className={accent}>{icon}</span>
          <span className="zams-mono text-[11px] uppercase tracking-[0.22px] text-clay-ink">{eyebrow}</span>
        </div>
        <span className={clsx('text-sm font-bold', accent)}>{count}</span>
      </div>
      <p className="zams-mono text-[9px] uppercase tracking-[0.16px] text-zams-fog px-4 pt-2">{hint}</p>
      <div className="p-2 pb-3">
        {children}
      </div>
    </div>
  );
}

/* ─── Interaction card (from the meetings log) ─── */
function MeetingCard({
  meeting, time, contactName, company, deal, onOpenCompany, onOpenDeal,
}: {
  meeting: Meeting;
  time: string;
  contactName: (id?: string) => string | undefined;
  company: Company | null;
  deal: Deal | null;
  onOpenCompany: (id: string) => void;
  onOpenDeal: (id: string) => void;
}) {
  const names = (meeting.contact_ids || []).map(contactName).filter(Boolean) as string[];
  return (
    <div className="bg-white dark:bg-clay-card border border-clay-hairline rounded-lg p-3 hover:border-zams-violet/30 transition-colors">
      <div className="flex items-start gap-3">
        <div className={clsx('w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0', meetingIconColor(meeting.type))}>
          {meetingIcon(meeting.type)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-medium text-clay-ink truncate">{meeting.description}</h4>
            <span className="text-[10px] text-clay-muted-soft whitespace-nowrap">{time}</span>
          </div>
          {meeting.summary && (
            <p className="text-xs text-clay-muted line-clamp-2 mt-0.5">{meeting.summary}</p>
          )}
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <span className="text-[10px] font-medium text-clay-muted bg-clay-card px-1.5 py-0.5 rounded">
              {MEETING_TYPE_LABELS[meeting.type]}
            </span>
            {names.slice(0, 2).map(n => (
              <span key={n} className="text-[10px] font-medium text-clay-body bg-clay-surface px-1.5 py-0.5 rounded">👤 {n}</span>
            ))}
            {names.length > 2 && (
              <span className="text-[10px] text-clay-muted-soft">+{names.length - 2}</span>
            )}
            {company && (
              <button
                onClick={() => onOpenCompany(company.id)}
                className="inline-flex items-center gap-1 text-[10px] font-medium text-zams-deep bg-zams-powder/50 border border-zams-mist px-1.5 py-0.5 rounded hover:bg-zams-powder transition-colors max-w-[180px]"
              >
                <Building2 className="w-3 h-3 shrink-0" />
                <span className="truncate">{company.name}</span>
              </button>
            )}
            {deal && (
              <button
                onClick={() => onOpenDeal(deal.id)}
                className="inline-flex items-center gap-1 text-[10px] font-medium text-clay-ink bg-clay-card border border-clay-hairline px-1.5 py-0.5 rounded hover:border-zams-violet/40 transition-colors max-w-[180px]"
              >
                <span>💼</span>
                <span className="truncate">{deal.client}</span>
              </button>
            )}
            {meeting.outcome && (
              <span className={clsx('text-[10px] font-medium px-1.5 py-0.5 rounded',
                meeting.outcome === 'positive' ? 'bg-clay-success/10 text-clay-success' :
                meeting.outcome === 'negative' ? 'bg-clay-error/10 text-clay-error' :
                meeting.outcome === 'no_response' ? 'bg-clay-ochre/10 text-clay-ochre' :
                'bg-clay-card text-clay-muted'
              )}>
                {meeting.outcome.replace('_', ' ')}
              </span>
            )}
            {meeting.followup_date && (
              <span className="text-[10px] text-clay-muted">→ {meeting.followup_date}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── System action card (durable audit trail) ─── */
function EventCard({
  event, time, onUndo,
}: {
  event: ActivityEntry;
  time: string;
  onUndo: (id: string) => Promise<boolean>;
}) {
  const [undoing, setUndoing] = useState(false);
  return (
    <div className={clsx(
      'bg-white dark:bg-clay-card border rounded-lg p-3 transition-colors',
      event.applied === false ? 'border-clay-hairline opacity-60' : 'border-clay-hairline'
    )}>
      <div className="flex items-start gap-3">
        <div className="text-lg flex-shrink-0 leading-none mt-0.5">{ENTITY_ICONS[event.entity] || '📌'}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className={clsx('text-sm font-medium truncate', ACTION_COLORS[event.type] || 'text-clay-ink')}>
              {event.label}
            </p>
            <span className="flex items-center gap-1.5 shrink-0">
              <span className="zams-pill">System</span>
              <span className="text-[10px] text-clay-muted-soft">{time}</span>
            </span>
          </div>
          {event.description && (
            <p className="text-xs text-clay-muted mt-0.5">{event.description}</p>
          )}
          {event.undoPayload && event.applied !== false && (
            <div className="mt-2">
              <button
                onClick={async () => {
                  setUndoing(true);
                  const ok = await onUndo(event.id);
                  setUndoing(false);
                  if (!ok) alert('Could not undo this action');
                }}
                className="text-xs font-medium text-clay-ochre hover:underline"
              >
                {undoing ? 'Undoing…' : 'Undo'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
