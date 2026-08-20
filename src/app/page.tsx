'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Deal, STAGE_LABELS, DealStage } from '@/types/crm';
import { useCrm } from '@/components/CrmProvider';
import { deals as dataDeals, contacts as dataContacts, companies as dataCompanies, meetings as dataMeetings } from '@/data/crmData';
import CreateModal from '@/components/CreateModal';
import LogInteractionModal from '@/components/LogInteractionModal';
import MascotSprite from '@/components/MascotSprite';
import { Plus, TrendingUp, AlertCircle, ChevronRight, Loader2, MessageCircle, Phone, Mail, Users, Package, Bell } from 'lucide-react';
import { calculateLeadScore, scoreToTier, TIER_LABELS, TIER_COLORS, TIER_BG, PRIORITY_CLASSES, PRIORITY_LABELS } from '@/utils/lead-scoring';

const PULSE_ITEMS = [
  { key: 'call', label: 'Calls', icon: <Phone className="w-3.5 h-3.5 text-clay-teal" /> },
  { key: 'email', label: 'Emails', icon: <Mail className="w-3.5 h-3.5 text-clay-pink" /> },
  { key: 'dm', label: 'DMs', icon: <MessageCircle className="w-3.5 h-3.5 text-zams-violet" /> },
  { key: 'meeting', label: 'Meetings', icon: <Users className="w-3.5 h-3.5 text-clay-lavender" /> },
  { key: 'sample_sent', label: 'Samples', icon: <Package className="w-3.5 h-3.5 text-clay-ochre" /> },
  { key: 'nudge', label: 'Nudges', icon: <Bell className="w-3.5 h-3.5 text-clay-coral" /> },
];

function daysOverdue(dateStr: string): number {
  const d = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((now.getTime() - d.getTime()) / 86400000));
}

export default function TodayPage() {
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const { deals: dbDeals, contacts: dbContacts, companies: dbCompanies, meetings: dbMeetings, loading, createDeal, addMeeting } = useCrm();

  const deals = dbDeals.length > 0 ? dbDeals : (dataDeals as Deal[]);
  const contacts = dbContacts.length > 0 ? dbContacts : (dataContacts as any);
  const companies = dbCompanies.length > 0 ? dbCompanies : (dataCompanies as any);
  const meetings = dbMeetings.length > 0 ? dbMeetings : (dataMeetings as any);

  const today = new Date();

  const dealFollowUps = useMemo(() => {
    const needsAttention: Deal[] = [];
    const overdue: Deal[] = [];
    const dueToday: Deal[] = [];
    const thisWeek: Deal[] = [];

    deals.forEach((deal: Deal) => {
      if (deal.stage === 'closed_won' || deal.stage === 'closed_lost') return;
      if (!deal.followup_date) {
        needsAttention.push(deal);
      } else {
        const date = new Date(deal.followup_date);
        const todayStr = today.toISOString().split('T')[0];
        const dateStr = date.toISOString().split('T')[0];
        if (dateStr === todayStr) dueToday.push(deal);
        else if (date < today) overdue.push(deal);
        else if (date.getTime() - today.getTime() <= 7 * 86400000) thisWeek.push(deal);
      }
    });

    return { needsAttention, overdue, dueToday, thisWeek };
  }, [deals]);

  const stats = {
    activeDeals: deals.filter((d: Deal) => d.stage !== 'closed_won' && d.stage !== 'closed_lost').length,
    wonDeals: deals.filter((d: Deal) => d.stage === 'closed_won').length,
    contacts: contacts.filter((c: any) => c.status !== 'not_interested' && c.status !== 'parked').length,
    companies: companies.filter((c: any) => c.status !== 'lost').length,
    needAction: dealFollowUps.overdue.length + dealFollowUps.needsAttention.length,
  };

  // ── Today's plan + pulse ──
  const priorityRank: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const sortedOverdue = useMemo(
    () => [...dealFollowUps.overdue].sort((a, b) => (a.followup_date || '').localeCompare(b.followup_date || '')),
    [dealFollowUps.overdue]
  );
  const startHere = useMemo(() => {
    const pool = [
      ...sortedOverdue.map(d => ({ d, rank: 0 })),
      ...dealFollowUps.dueToday.map(d => ({ d, rank: 1 })),
    ];
    if (!pool.length) return null;
    pool.sort((a, b) => a.rank - b.rank || (priorityRank[a.d.priority || 'medium'] ?? 1) - (priorityRank[b.d.priority || 'medium'] ?? 1));
    return pool[0].d;
  }, [sortedOverdue, dealFollowUps.dueToday]);

  const todayLocal = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const todayMeetings = meetings.filter((m: any) => m.date === todayLocal);
  const todayCounts: Record<string, number> = { call: 0, email: 0, dm: 0, meeting: 0, sample_sent: 0, nudge: 0, note: 0 };
  todayMeetings.forEach((m: any) => { if (todayCounts[m.type] !== undefined) todayCounts[m.type]++; });

  const handleCreate = async (data: any) => {
    // Let errors bubble to the modal so failures are visible.
    await createDeal(data);
  };

  // ── Deal row: clickable to open deal detail via deep link ──
  const DealRow = ({ deal, colorClass }: { deal: Deal; colorClass?: string }) => {
    const score = calculateLeadScore(deal);
    const tier = scoreToTier(score);
    return (
      <button
        key={deal.id}
        onClick={() => router.push('/deals?deal=' + deal.id)}
        className="w-full text-left bg-white dark:bg-clay-card border border-clay-hairline rounded-lg p-3 active:bg-clay-surface transition-colors"
      >
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <h4 className="text-sm font-medium text-clay-ink truncate">{deal.client}</h4>
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${TIER_COLORS[tier]}`}>
                {TIER_LABELS[tier]}
              </span>
            </div>
            <p className="text-xs text-clay-muted line-clamp-1">{deal.next_action || deal.title}</p>
          </div>
          <ChevronRight className="w-4 h-4 text-clay-muted-soft flex-shrink-0" />
        </div>
      </button>
    );
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl pb-20 lg:pb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 md:mb-6">
        <div className="flex items-center gap-3">
          <div className="relative w-11 h-11 md:w-12 md:h-12 shrink-0">
            <div className="absolute inset-0 rounded-full bg-clay-lavender/20" />
            <Image
              src="/assets/mascot-teardrop.png"
              alt="LeadPulse mascot"
              width={1024}
              height={1024}
              className="relative w-11 h-11 md:w-12 md:h-12 object-contain"
            />
          </div>
          <div>
            <p className="zams-eyebrow mb-0.5">
              {today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
            <h1 className="zams-display text-2xl md:text-[28px] leading-none">Today</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsLogModalOpen(true)}
            className="hidden sm:flex items-center gap-2 px-4 py-2.5 border border-zams-mist text-clay-ink text-sm font-medium rounded-md hover:border-zams-violet hover:text-zams-violet transition-colors"
          >
            <MessageCircle className="w-4 h-4" /> Log interaction
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="zams-btn-primary"
          >
            <Plus className="w-4 h-4" /> <span className="hidden sm:inline">New deal</span>
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 md:gap-3 mb-4 md:mb-6">
        <button
          onClick={() => router.push('/deals')}
          className="bg-white dark:bg-clay-card rounded-lg border border-clay-hairline p-3 md:p-4 text-left hover:border-zams-violet/40 transition-colors active:bg-clay-surface"
        >
          <p className="text-lg md:text-2xl font-bold text-clay-ink leading-none">{stats.activeDeals}</p>
          <p className="zams-mono text-[10px] uppercase tracking-[0.18px] text-clay-muted mt-1.5">Active</p>
        </button>
        <button
          onClick={() => router.push('/deals')}
          className="bg-clay-mint/20 rounded-lg border border-clay-mint/30 p-3 md:p-4 text-left hover:bg-clay-mint/30 transition-colors"
        >
          <p className="text-lg md:text-2xl font-bold text-clay-teal leading-none">{stats.wonDeals}</p>
          <p className="zams-mono text-[10px] uppercase tracking-[0.18px] text-clay-muted mt-1.5">Won</p>
        </button>
        <button
          onClick={() => router.push('/contacts')}
          className="bg-white dark:bg-clay-card rounded-lg border border-clay-hairline p-3 md:p-4 text-left hover:border-zams-violet/40 transition-colors active:bg-clay-surface"
        >
          <p className="text-lg md:text-2xl font-bold text-clay-ink leading-none">{stats.contacts}</p>
          <p className="zams-mono text-[10px] uppercase tracking-[0.18px] text-clay-muted mt-1.5">Contacts</p>
        </button>
        <button
          onClick={() => router.push('/companies')}
          className="bg-white dark:bg-clay-card rounded-lg border border-clay-hairline p-3 md:p-4 text-left hover:border-zams-violet/40 transition-colors active:bg-clay-surface"
        >
          <p className="text-lg md:text-2xl font-bold text-clay-ink leading-none">{stats.companies}</p>
          <p className="zams-mono text-[10px] uppercase tracking-[0.18px] text-clay-muted mt-1.5">Companies</p>
        </button>
        <button
          onClick={() => router.push('/deals')}
          className="col-span-2 md:col-span-1 bg-clay-pink/10 rounded-lg border border-clay-pink/20 p-3 md:p-4 text-left hover:bg-clay-pink/20 transition-colors"
        >
          <p className="text-lg md:text-2xl font-bold text-clay-pink leading-none">{stats.needAction}</p>
          <p className="zams-mono text-[10px] uppercase tracking-[0.18px] text-clay-muted mt-1.5">Need action</p>
        </button>
      </div>

      {/* Today's plan */}
      <div className="mb-4 rounded-xl border border-zams-mist bg-white dark:bg-clay-card p-4 flex flex-col md:flex-row md:items-center gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <MascotSprite src="/assets/mascots/mascot-outreach.png" size={38} alt="LeadPulse mascot" />
          <div className="min-w-0">
            <p className="zams-eyebrow mb-0.5">Today's plan</p>
            <p className="text-sm text-clay-ink truncate">
              {startHere ? (
                <>
                  Start with <strong>{startHere.client}</strong>
                  {dealFollowUps.overdue.some(d => d.id === startHere.id) && startHere.followup_date
                    ? <> — <span className="text-clay-error font-semibold">{daysOverdue(startHere.followup_date)}d overdue</span></>
                    : <> — <span className="text-clay-ochre font-semibold">due today</span></>}
                </>
              ) : (
                'All clear — nothing due or overdue today.'
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <span className="zams-mono text-[10px] uppercase tracking-[0.14px] px-2 py-1 rounded-full bg-clay-ochre/10 text-clay-ochre border border-clay-ochre/20">
            Due today {dealFollowUps.dueToday.length}
          </span>
          <span className="zams-mono text-[10px] uppercase tracking-[0.14px] px-2 py-1 rounded-full bg-clay-error/10 text-clay-error border border-clay-error/20">
            Overdue {dealFollowUps.overdue.length}
          </span>
          <span className="zams-mono text-[10px] uppercase tracking-[0.14px] px-2 py-1 rounded-full bg-zams-powder/50 text-zams-deep border border-zams-mist">
            Need action {dealFollowUps.needsAttention.length}
          </span>
          {startHere && (
            <button onClick={() => router.push('/deals?deal=' + startHere.id)} className="zams-btn-primary text-xs px-3 py-2">
              Open <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Today's pulse */}
      <div className="mb-6 rounded-xl border border-clay-hairline bg-white dark:bg-clay-card px-4 py-2.5 flex items-center gap-3 overflow-x-auto">
        <p className="zams-mono text-[10px] uppercase tracking-[0.16px] text-zams-fog shrink-0">Today's pulse</p>
        <div className="flex items-center gap-3 shrink-0">
          {PULSE_ITEMS.map(p => (
            <div key={p.key} className="flex items-center gap-1.5">
              {p.icon}
              <span className="text-sm font-semibold text-clay-ink leading-none">{todayCounts[p.key] ?? 0}</span>
              <span className="zams-mono text-[9px] uppercase tracking-[0.1px] text-zams-fog">{p.label}</span>
            </div>
          ))}
        </div>
        <span className="text-[11px] text-clay-muted-soft ml-auto shrink-0">
          {todayMeetings.length === 0 ? 'No touches yet today' : `${todayMeetings.length} ${todayMeetings.length === 1 ? 'touch' : 'touches'} today`}
        </span>
      </div>

      {/* Follow-ups */}
      <section className="mb-6">
        <h2 className="zams-display text-lg md:text-xl mb-3">Follow-ups</h2>

        {dealFollowUps.needsAttention.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-1.5 h-1.5 rounded-full bg-clay-error animate-pulse" />
              <span className="text-xs font-medium text-clay-muted">
                Needs Attention ({dealFollowUps.needsAttention.length})
              </span>
            </div>
            <div className="space-y-2">
              {dealFollowUps.needsAttention.slice(0, 4).map((deal: Deal) => (
                <DealRow key={deal.id} deal={deal} />
              ))}
            </div>
          </div>
        )}

        {dealFollowUps.overdue.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-1.5 h-1.5 rounded-full bg-clay-error" />
              <span className="text-xs font-medium text-clay-muted">
                Overdue ({dealFollowUps.overdue.length})
              </span>
            </div>
            <div className="space-y-2">
              {sortedOverdue.slice(0, 4).map((deal: Deal) => {
                const days = daysOverdue(deal.followup_date || '');
                return (
                  <button
                    key={deal.id}
                    onClick={() => router.push('/deals?deal=' + deal.id)}
                    className="w-full text-left bg-red-50/30 dark:bg-red-900/10 border border-clay-error rounded-lg p-3 active:bg-red-50/50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <h4 className="text-sm font-medium text-clay-ink truncate">{deal.client}</h4>
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${days > 7 ? 'bg-clay-error/15 text-clay-error' : 'bg-clay-ochre/15 text-clay-ochre'}`}>
                            ⚡ {days}d late
                          </span>
                        </div>
                        <p className="text-xs text-clay-muted line-clamp-1">{deal.next_action || deal.title}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-clay-muted-soft flex-shrink-0" />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {dealFollowUps.dueToday.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-1.5 h-1.5 rounded-full bg-clay-ochre" />
              <span className="text-xs font-medium text-clay-muted">
                Due Today ({dealFollowUps.dueToday.length})
              </span>
            </div>
            <div className="space-y-2">
              {dealFollowUps.dueToday.map((deal: Deal) => (
                <button
                  key={deal.id}
                  onClick={() => router.push('/deals?deal=' + deal.id)}
                  className="w-full text-left bg-orange-50/30 dark:bg-orange-900/10 border border-clay-ochre rounded-lg p-3 active:bg-orange-50/50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h4 className="text-sm font-medium text-clay-ink truncate">{deal.client}</h4>
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-clay-ochre/15 text-clay-ochre">Due today</span>
                      </div>
                      <p className="text-xs text-clay-muted line-clamp-1">{deal.next_action || deal.title}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-clay-muted-soft flex-shrink-0" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {dealFollowUps.thisWeek.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-1.5 h-1.5 rounded-full bg-clay-mint" />
              <span className="text-xs font-medium text-clay-muted">
                This Week ({dealFollowUps.thisWeek.length})
              </span>
            </div>
            <div className="space-y-2">
              {dealFollowUps.thisWeek.slice(0, 4).map((deal: Deal) => (
                <DealRow key={deal.id} deal={deal} />
              ))}
            </div>
          </div>
        )}

        {deals.filter((d: Deal) => d.stage !== 'closed_won' && d.stage !== 'closed_lost').length === 0 && (
          <div className="text-center py-10 bg-white dark:bg-clay-card rounded-xl border border-clay-hairline">
            <div className="relative mx-auto mb-4 w-28 h-28">
              <div className="absolute inset-0 rounded-full bg-clay-lavender/20" />
              <Image
                src="/assets/mascot-teardrop.png"
                alt="LeadPulse mascot holding a deal card"
                width={1024}
                height={1024}
                className="relative w-28 h-28 object-contain"
              />
            </div>
            <p className="text-sm font-medium text-clay-ink mb-1">No active deals yet</p>
            <p className="text-xs text-clay-muted mb-4">Your first deal card is waiting to be made.</p>
            <button
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-clay-ink text-clay-canvas text-sm font-medium rounded-lg active:opacity-85"
            >
              <Plus className="w-4 h-4" /> Create your first deal
            </button>
          </div>
        )}
      </section>

      {/* Recent Activity */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="zams-display text-lg md:text-xl">Recent Activity</h2>
          <button onClick={() => router.push('/meetings')} className="text-xs text-clay-muted">
            View all
          </button>
        </div>
        <div className="bg-white dark:bg-clay-card rounded-xl border border-clay-hairline overflow-hidden">
          {(meetings as any[]).slice(0, 5).map((meeting: any, i: number) => (
            <button
              key={meeting.id}
              onClick={() => router.push('/meetings')}
              className={`w-full text-left flex items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t border-clay-hairline' : ''} active:bg-clay-surface`}
            >
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-medium flex-shrink-0 ${
                  meeting.type === 'meeting'
                    ? 'bg-clay-lavender/20 text-clay-lavender'
                    : meeting.type === 'email'
                    ? 'bg-clay-pink/20 text-clay-pink'
                    : meeting.type === 'call'
                    ? 'bg-clay-mint/20 text-clay-teal'
                    : meeting.type === 'sample_sent'
                    ? 'bg-clay-ochre/20 text-clay-ochre'
                    : 'bg-clay-card text-clay-muted'
                }`}
              >
                {meeting.type === 'meeting'
                  ? 'M'
                  : meeting.type === 'email'
                  ? 'E'
                  : meeting.type === 'call'
                  ? 'C'
                  : meeting.type === 'dm'
                  ? 'D'
                  : meeting.type === 'sample_sent'
                  ? 'S'
                  : 'N'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-clay-ink truncate">
                  {meeting.description}
                </p>
                <p className="text-xs text-clay-muted">{meeting.date}</p>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Modals */}
      <CreateModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleCreate}
        type="deal"
        companies={companies}
        contacts={contacts}
      />
      <LogInteractionModal
        isOpen={isLogModalOpen}
        onClose={() => setIsLogModalOpen(false)}
        onSave={async (meeting) => {
          await addMeeting(meeting);
        }}
        deals={deals}
        contacts={contacts}
        companies={companies}
      />
    </div>
  );
}
