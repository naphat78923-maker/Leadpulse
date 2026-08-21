'use client';

import { useEffect, useState } from 'react';
import { MeetingType, Meeting, Deal, Contact, Company, NudgeStage, MEETING_TYPE_LABELS, PRODUCT_OPTIONS, DealWorkflowAction } from '@/types/crm';
import { X, Calendar, MessageCircle, Phone, Mail, Users, FileText, ArrowRight } from 'lucide-react';
import clsx from 'clsx';
import ContactPicker from '@/components/ContactPicker';
import * as crm from '@/lib/crm';
import { NUDGE_OPTIONS, nudgeColorClass, NEXT_WORKFLOW, WORKFLOW_BY_ID, canNudge, stageFromWorkflow } from '@/utils/deal-workflow';

interface LogInteractionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (meeting: Omit<Meeting, 'id' | 'created_at'>) => void;
  deals: Deal[];
  contacts: Contact[];
  companies: Company[];
  selectedDealId?: string;
  initialContactIds?: string[];
  initialCompanyId?: string;
}

// De-bloated: 5 interaction types. Sample/Nudge are workflow steps, not meeting logs.
const typeOptions: { value: MeetingType; label: string; icon: React.ReactNode }[] = [
  { value: 'call', label: 'Call', icon: <Phone className="w-4 h-4" /> },
  { value: 'email', label: 'Email', icon: <Mail className="w-4 h-4" /> },
  { value: 'dm', label: 'DM', icon: <MessageCircle className="w-4 h-4" /> },
  { value: 'meeting', label: 'Meeting', icon: <Users className="w-4 h-4" /> },
  { value: 'note', label: 'Note', icon: <FileText className="w-4 h-4" /> },
];

const outcomeOptions = [
  { value: 'positive', label: 'Positive', color: 'bg-clay-success/10 text-clay-success border-clay-success/20' },
  { value: 'neutral', label: 'Neutral', color: 'bg-clay-card text-clay-body border-clay-hairline' },
  { value: 'negative', label: 'Negative', color: 'bg-clay-error/10 text-clay-error border-clay-error/20' },
  { value: 'no_response', label: 'No Response', color: 'bg-clay-card text-clay-muted border-clay-hairline' },
];

export default function LogInteractionModal({
  isOpen,
  onClose,
  onSave,
  deals,
  contacts,
  companies,
  selectedDealId,
  initialContactIds,
  initialCompanyId,
}: LogInteractionModalProps) {
  const [type, setType] = useState<MeetingType>('call');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedDeal, setSelectedDeal] = useState(selectedDealId || '');
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>(initialContactIds || []);
  const [summary, setSummary] = useState('');
  const [outcome, setOutcome] = useState<Meeting['outcome']>(null);
  const [followupDate, setFollowupDate] = useState('');
  const [nudgeStage, setNudgeStage] = useState<NudgeStage | ''>('');

  useEffect(() => {
    if (isOpen) {
      setSelectedContactIds(initialContactIds || []);
      setSelectedDeal(selectedDealId || '');
      setNudgeStage('');
      setType('call');
      setDescription('');
      setSummary('');
      setOutcome(null);
      setFollowupDate('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const deal = deals.find(d => d.id === selectedDeal);
  const dealAction = (deal?.workflow_action || 'outreach') as DealWorkflowAction;
  const nextAction: DealWorkflowAction | undefined = deal ? NEXT_WORKFLOW[dealAction] : undefined;
  const showNudge = !!deal && !!nextAction && canNudge(nextAction);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!description) return;

    const selectedContacts = contacts.filter(c => selectedContactIds.includes(c.id));
    const companyId = selectedContacts[0]?.company_id || deal?.company_id || initialCompanyId || null;

    onSave({
      description,
      type,
      date,
      company_id: companyId,
      contact_ids: selectedContactIds,
      deal_id: selectedDeal || null,
      product: deal?.product || 'Butter',
      summary: summary || null,
      outcome,
      followup_date: followupDate || null,
    });

    // One save = one interaction + one state advance. No double logging.
    if (selectedDeal && nextAction) {
      const newStage = stageFromWorkflow(nextAction, deal!.stage);
      crm.updateDeal(selectedDeal, {
        workflow_action: nextAction,
        stage: newStage,
        nudge_stage: showNudge && nudgeStage ? (nudgeStage as NudgeStage) : null,
      }).catch((err: any) => console.error('Failed to advance deal:', err));
    }

    setDescription('');
    setSummary('');
    setFollowupDate('');
    setOutcome(null);
    setSelectedDeal('');
    setSelectedContactIds([]);
    setNudgeStage('');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 p-0 md:p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-clay-card w-full md:max-w-lg md:rounded-2xl rounded-t-2xl shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white dark:bg-clay-card flex items-center justify-between p-4 border-b border-clay-hairline z-10">
          <h2 className="text-lg font-semibold text-clay-ink">Log Interaction</h2>
          <button onClick={onClose} className="text-clay-muted hover:text-clay-ink p-2 -mr-2">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Type */}
          <div>
            <label className="block text-sm font-medium text-clay-body mb-2">Type</label>
            <div className="grid grid-cols-3 gap-2">
              {typeOptions.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setType(opt.value)}
                  className={clsx(
                    'flex items-center justify-center gap-2 px-3 py-3 rounded-lg text-sm font-medium border transition-colors min-h-[44px]',
                    type === opt.value
                      ? 'bg-clay-ink text-clay-canvas border-clay-ink'
                      : 'bg-white dark:bg-clay-card text-clay-muted border-clay-hairline active:bg-clay-surface'
                  )}
                >
                  {opt.icon}
                  <span className="hidden sm:inline">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-clay-body mb-1">Description *</label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              required
              className="w-full px-3 py-3 border border-clay-hairline rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-clay-ink bg-white dark:bg-clay-card text-clay-ink"
              placeholder="e.g., Follow-up call with K. Oil about test results"
            />
          </div>

          {/* Date */}
          <div>
            <label className="block text-sm font-medium text-clay-body mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full px-3 py-3 border border-clay-hairline rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-clay-ink bg-white dark:bg-clay-card text-clay-ink"
            />
          </div>

          {/* Linked Deal — drives the single state advance */}
          <div>
            <label className="block text-sm font-medium text-clay-body mb-1">Linked Deal</label>
            <select
              value={selectedDeal}
              onChange={e => setSelectedDeal(e.target.value)}
              className="w-full px-3 py-3 border border-clay-hairline rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-clay-ink bg-white dark:bg-clay-card text-clay-ink"
            >
              <option value="">— None (just log a note) —</option>
              {deals.filter(d => d.stage !== 'closed_won' && d.stage !== 'closed_lost').map(d => (
                <option key={d.id} value={d.id}>{d.client} — {d.product}</option>
              ))}
            </select>
          </div>

          {/* Advance deal lane — shown only when a deal is linked (single source of truth) */}
          {deal && nextAction && (
            <div className="bg-clay-surface rounded-xl p-3 border border-clay-hairline">
              <p className="flex items-center gap-2 text-xs font-medium text-clay-body mb-2">
                Advance deal to <ArrowRight className="w-3.5 h-3.5" />
                <span className="font-semibold text-clay-ink">{nextAction ? WORKFLOW_BY_ID[nextAction].label : ''}</span>
              </p>
              {showNudge ? (
                <div className="grid grid-cols-2 gap-2">
                  {NUDGE_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setNudgeStage(nudgeStage === opt.value ? '' : opt.value)}
                      className={clsx(
                        'px-3 py-2.5 rounded-lg text-sm font-medium border transition-colors min-h-[44px] flex items-center justify-center gap-1.5',
                        nudgeStage === opt.value ? nudgeColorClass(opt.value) : 'bg-white dark:bg-clay-card text-clay-muted border-clay-hairline active:bg-clay-surface'
                      )}
                    >
                      {opt.label}
                      <span className="text-[10px] opacity-70">{opt.days}d</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-clay-muted">Nudge available once sample is sent.</p>
              )}
            </div>
          )}

          {/* Linked Contacts */}
          <ContactPicker
            contacts={contacts}
            companies={companies}
            selectedCompanyId={deal?.company_id ?? undefined}
            selectedIds={selectedContactIds}
            onChange={setSelectedContactIds}
          />

          {/* Summary */}
          <div>
            <label className="block text-sm font-medium text-clay-body mb-1">Summary / Notes</label>
            <textarea
              value={summary}
              onChange={e => setSummary(e.target.value)}
              rows={3}
              className="w-full px-3 py-3 border border-clay-hairline rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-clay-ink resize-none bg-white dark:bg-clay-card text-clay-ink"
              placeholder="What was discussed, decided, or needs follow-up..."
            />
          </div>

          {/* Outcome */}
          <div>
            <label className="block text-sm font-medium text-clay-body mb-2">Outcome</label>
            <div className="grid grid-cols-2 gap-2">
              {outcomeOptions.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setOutcome(opt.value as Meeting['outcome'])}
                  className={clsx(
                    'px-3 py-3 rounded-lg text-sm font-medium border transition-colors min-h-[44px]',
                    outcome === opt.value ? opt.color : 'bg-white dark:bg-clay-card text-clay-muted border-clay-hairline active:bg-clay-surface'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Follow-up */}
          <div>
            <label className="block text-sm font-medium text-clay-body mb-1">Schedule Follow-up</label>
            <input
              type="date"
              value={followupDate}
              onChange={e => setFollowupDate(e.target.value)}
              className="w-full px-3 py-3 border border-clay-hairline rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-clay-ink bg-white dark:bg-clay-card text-clay-ink"
            />
          </div>

          <div className="flex items-center gap-3 pt-2 pb-4">
            <button
              type="submit"
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-clay-ink text-clay-canvas text-sm font-medium rounded-lg active:opacity-85 transition-opacity min-h-[48px]"
            >
              Save Interaction
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-3 bg-clay-card text-clay-ink text-sm font-medium rounded-lg active:bg-clay-surface transition-colors min-h-[48px]"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
