'use client';

import { useState, useMemo } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Meeting, MEETING_TYPE_LABELS, Company, Contact, Deal } from '@/types/crm';
import { useCrm, ActivityEntry } from '@/components/CrmProvider';
import LogInteractionModal from '@/components/LogInteractionModal';
import CompanyDetail from '@/components/CompanyDetail';
import {
  Search, Plus, Mail, Phone, Users, FileText, Package, Bell,
  Building2, ChevronRight, Loader2,
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

export default function ActivityPage() {
  const router = useRouter();
  const { meetings, contacts, companies, deals, activities, loading, addMeeting, undoActivity, refresh } = useCrm();

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [range, setRange] = useState<'all' | 'today' | '7d' | '30d'>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);

  const contactName = (id?: string) => contacts.find(c => c.id === id)?.name;
  const companyFor = (id?: string | null) => (id ? companies.find((c: Company) => c.id === id) : null);
  const dealFor = (id?: string | null) => (id ? deals.find((d: Deal) => d.id === id) : null);

  const items: TimelineItem[] = useMemo(() => {
    const mItems: TimelineItem[] = meetings.map(m => ({
      kind: 'meeting',
      key: `m-${m.id}`,
      ts: new Date(`${m.date}T12:00:00`).getTime(),
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
    const dayMs = 86400000;
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
      if (range === 'today' && new Date(`${m.date}T12:00:00`).getTime() < new Date().setHours(0, 0, 0, 0)) return false;
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
          <p className="zams-eyebrow mb-1">Activity · {filtered.length} of {items.length} events</p>
          <h1 className="zams-display text-2xl md:text-[28px] leading-none">Activity</h1>
        </div>
        <button onClick={() => setIsModalOpen(true)} className="zams-btn-primary">
          <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Log interaction</span>
        </button>
      </div>

      {/* Filters */}
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

      {/* Empty state */}
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

      {/* Timeline */}
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
