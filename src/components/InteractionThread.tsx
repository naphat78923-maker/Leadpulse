'use client';

import { useState } from 'react';
import { Meeting, Contact, Company, Deal, MEETING_TYPE_LABELS } from '@/types/crm';
import {
  Phone,
  Mail,
  MessageCircle,
  Users,
  FileText,
  Package,
  Bell,
  Gift,
  X,
  ArrowRight,
} from 'lucide-react';
import clsx from 'clsx';

const TYPE_ICON: Record<Meeting['type'], React.ReactNode> = {
  call: <Phone className="w-4 h-4" />,
  email: <Mail className="w-4 h-4" />,
  dm: <MessageCircle className="w-4 h-4" />,
  meeting: <Users className="w-4 h-4" />,
  note: <FileText className="w-4 h-4" />,
  sample_sent: <Package className="w-4 h-4" />,
  nudge: <Bell className="w-4 h-4" />,
  reward: <Gift className="w-4 h-4" />,
};

const OUTCOME_CHIP: Record<string, string> = {
  positive: 'bg-clay-success/10 text-clay-success border-clay-success/20',
  neutral: 'bg-clay-card text-clay-body border-clay-hairline',
  negative: 'bg-clay-error/10 text-clay-error border-clay-error/20',
  no_response: 'bg-clay-card text-clay-muted border-clay-hairline',
};

const OUTCOME_LABEL: Record<string, string> = {
  positive: 'Positive',
  neutral: 'Neutral',
  negative: 'Negative',
  no_response: 'No Response',
};

function relativeDate(value: string): string {
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return value;
    const diff = Date.now() - d.getTime();
    const day = 1000 * 60 * 60 * 24;
    if (diff < day && diff >= 0) return 'Today';
    if (diff < 2 * day && diff >= 0) return 'Yesterday';
    const days = Math.round(diff / day);
    if (days < 30) return `${days}d ago`;
    const months = Math.round(days / 30);
    if (months < 12) return `${months}mo ago`;
    return `${Math.round(months / 12)}y ago`;
  } catch {
    return value;
  }
}

interface InteractionThreadProps {
  meetings: Meeting[];
  allContacts?: Contact[];
  deals?: Deal[];
  companies?: Company[];
}

export default function InteractionThread({
  meetings,
  allContacts = [],
  deals = [],
  companies = [],
}: InteractionThreadProps) {
  const [openId, setOpenId] = useState<string | null>(null);

  const contactName = (id?: string) => (id ? allContacts.find(c => c.id === id)?.name : undefined);
  const dealById = (id?: string | null) => (id ? deals.find(d => d.id === id) : undefined);
  const companyById = (id?: string | null) => (id ? companies.find(c => c.id === id) : undefined);

  if (!meetings.length) {
    return (
      <div className="rounded-xl border border-dashed border-clay-hairline px-4 py-8 text-center">
        <p className="text-sm text-clay-muted">No interactions yet</p>
        <p className="text-xs text-clay-muted-soft mt-1">Log a call, email, or note to start the history.</p>
      </div>
    );
  }

  const openMeeting = meetings.find(m => m.id === openId) || null;

  return (
    <div className="space-y-2">
      {meetings.map(m => {
        const contactNames = (m.contact_ids || [])
          .map(contactName)
          .filter(Boolean)
          .join(', ');
        const counterparty = contactNames || companyById(m.company_id)?.name || 'General';
        const deal = dealById(m.deal_id);
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => setOpenId(m.id)}
            className="w-full flex items-start gap-3 rounded-xl border border-clay-hairline bg-white dark:bg-clay-card px-3 py-3 text-left active:bg-clay-surface transition-colors min-h-[44px]"
          >
            <span className="shrink-0 mt-0.5 text-clay-muted">{TYPE_ICON[m.type]}</span>
            <span className="flex-1 min-w-0">
              <span className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-clay-ink truncate">
                  {MEETING_TYPE_LABELS[m.type]} · {counterparty}
                </span>
                <span className="zams-mono text-[10px] text-clay-muted-soft shrink-0">{relativeDate(m.date)}</span>
              </span>
              {m.summary && (
                <span className="block text-xs text-clay-muted truncate mt-0.5">{m.summary}</span>
              )}
              {m.outcome && (
                <span className={clsx('inline-block mt-1.5 px-1.5 py-0.5 rounded border text-[10px] font-medium', OUTCOME_CHIP[m.outcome])}>
                  {OUTCOME_LABEL[m.outcome]}
                </span>
              )}
              {deal && (
                <span className="inline-flex items-center gap-1 ml-2 text-[10px] text-clay-lavender align-middle">
                  <ArrowRight className="w-3 h-3" />{deal.client}
                </span>
              )}
            </span>
          </button>
        );
      })}

      {openMeeting && (
        <div
          className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-[60] p-0 md:p-4"
          onClick={() => setOpenId(null)}
        >
          <div
            className="bg-white dark:bg-clay-card w-full md:max-w-md md:rounded-2xl rounded-t-2xl p-6 max-h-[80vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-clay-ink flex items-center gap-2">
                {TYPE_ICON[openMeeting.type]}
                {MEETING_TYPE_LABELS[openMeeting.type]}
              </h3>
              <button onClick={() => setOpenId(null)} className="p-2 text-clay-muted active:bg-clay-surface rounded-lg" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2 text-clay-body">
                <span className="text-clay-muted">Date:</span>
                <span className="zams-mono text-clay-body">{openMeeting.date}</span>
              </div>
              <div className="text-clay-body">
                <span className="text-clay-muted">With: </span>
                {(openMeeting.contact_ids || []).map(contactName).filter(Boolean).join(', ') ||
                  (companyById(openMeeting.company_id)?.name ?? '—')}
              </div>
              {dealById(openMeeting.deal_id) && (
                <div className="text-clay-body">
                  <span className="text-clay-muted">Deal: </span>
                  <span className="text-clay-lavender">{dealById(openMeeting.deal_id)!.client}</span>
                </div>
              )}
              {openMeeting.outcome && (
                <div>
                  <span className={clsx('inline-block px-2 py-0.5 rounded border text-xs font-medium', OUTCOME_CHIP[openMeeting.outcome])}>
                    {OUTCOME_LABEL[openMeeting.outcome]}
                  </span>
                </div>
              )}
              <div>
                <p className="text-clay-muted mb-1">Description</p>
                <p className="text-clay-body whitespace-pre-wrap">{openMeeting.description || '—'}</p>
              </div>
              {openMeeting.summary && (
                <div>
                  <p className="text-clay-muted mb-1">Summary</p>
                  <p className="text-clay-body whitespace-pre-wrap">{openMeeting.summary}</p>
                </div>
              )}
              {openMeeting.followup_date && (
                <div className="flex items-center gap-2 text-clay-body">
                  <span className="text-clay-muted">Follow-up:</span>
                  <span className="zams-mono">{openMeeting.followup_date}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
