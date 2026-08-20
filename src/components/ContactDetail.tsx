'use client';

import { useState } from 'react';
import { Contact, CONTACT_STATUS_LABELS, ContactStatus, Company } from '@/types/crm';
import { Mail, Phone, X, Edit2, Save, Loader2, Check } from 'lucide-react';
import clsx from 'clsx';
import { useToast } from '@/components/ToastProvider';
import * as crm from '@/lib/crm';

const statusOptions: ContactStatus[] = ['active', 'replied', 'not_interested', 'no_response', 'parked'];

interface ContactDetailProps {
  contact: Contact;
  onClose: () => void;
  onSaved: () => void;
  companies: Company[];
}

export default function ContactDetail({ contact, onClose, onSaved, companies }: ContactDetailProps) {
  const { addToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editData, setEditData] = useState({
    name: contact.name,
    email: contact.email || '',
    phone: contact.phone || '',
    phone_second: contact.phone_second || '',
    line: contact.line || '',
    job_title: contact.job_title || '',
    company_id: contact.company_id || '',
    status: contact.status,
    notes: contact.notes || '',
  });

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const updated = await crm.updateContact(contact.id, { ...editData });
      // Re-sync local field so the saved values show immediately
      setEditData({
        name: updated.name,
        email: updated.email || '',
        phone: updated.phone || '',
        line: updated.line || '',
        phone_second: updated.phone_second || '',
        job_title: updated.job_title || '',
        company_id: updated.company_id || '',
        status: updated.status,
        notes: updated.notes || '',
      });
      setEditing(false);
      setSaved(true);
      onSaved();
      addToast('Contact saved!');
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      console.error('Failed to update contact:', err);
      setError('Could not save: ' + (err.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 p-0 md:p-4" onClick={onClose}>
      <div className={clsx(
        'bg-white dark:bg-clay-card w-full md:max-w-md md:rounded-2xl rounded-t-2xl p-6 max-h-[80vh] overflow-y-auto transition-all duration-300',
        saving ? 'scale-[0.98] opacity-80' : saved ? 'scale-100 opacity-100 ring-2 ring-clay-success/40' : 'scale-100 opacity-100'
      )} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          {editing ? (
            <input
              type="text"
              value={editData.name}
              onChange={e => setEditData(prev => ({ ...prev, name: e.target.value }))}
              className="text-lg font-semibold text-clay-ink bg-transparent border-b border-clay-ink outline-none flex-1 mr-2"
            />
          ) : (
            <h2 className="text-lg font-semibold text-clay-ink">{contact.name}</h2>
          )}
          <div className="flex items-center gap-1">
            {editing && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="p-2 text-clay-success active:opacity-70 transition-all disabled:opacity-50"
                aria-label="Save contact"
              >
                {saving ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <span className={clsx('inline-flex transition-transform', saved && 'scale-110')}>
                    <Check className={clsx('w-5 h-5 transition-colors', saved ? 'text-clay-success' : '')} />
                  </span>
                )}
              </button>
            )}
            <button onClick={() => setEditing(!editing)} className="p-2 text-clay-muted active:opacity-70">
              <Edit2 className="w-5 h-5" />
            </button>
            <button onClick={onClose} className="p-2 text-clay-muted active:opacity-70">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {saving && (
          <div className="mb-4 flex items-center gap-2 text-sm text-clay-success animate-pulse">
            <Loader2 className="w-4 h-4 animate-spin" />
            Saving…
          </div>
        )}
        {saved && !saving && (
          <div className="mb-4 flex items-center gap-2 text-sm text-clay-success animate-[pulse-dot_1s_ease-in-out]">
            <Check className="w-4 h-4" />
            Saved
          </div>
        )}
        {error && !saving && (
          <div className="mb-4 text-sm text-clay-error">{error}</div>
        )}

        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2 text-clay-body">
            <Mail className="w-4 h-4 text-clay-muted" />
            {editing ? (
              <input
                type="email"
                value={editData.email}
                onChange={e => setEditData(prev => ({ ...prev, email: e.target.value }))}
                className="flex-1 px-2 py-1 border border-clay-hairline rounded text-base bg-white dark:bg-clay-card"
                placeholder="Email"
              />
            ) : (
              <span className="truncate">{contact.email || '—'}</span>
            )}
          </div>

          <div className="flex items-center gap-2 text-clay-body">
            <Phone className="w-4 h-4 text-clay-muted" />
            {editing ? (
              <input
                type="tel"
                value={editData.phone}
                onChange={e => setEditData(prev => ({ ...prev, phone: e.target.value }))}
                className="flex-1 px-2 py-1 border border-clay-hairline rounded text-base bg-white dark:bg-clay-card"
                placeholder="Phone"
              />
            ) : (
   <span className="truncate">{contact.phone || '—'}</span>
 )}
 </div>

 {/* Second Phone */}
 <div className="flex items-center gap-2 text-clay-body">
 <Phone className="w-4 h-4 text-clay-ochre" />
 <span className="text-clay-muted text-xs">+</span>
 {editing ? (
   <input
     type="tel"
     value={editData.phone_second || ''}
     onChange={e => setEditData(prev => ({ ...prev, phone_second: e.target.value }))}
     className="flex-1 px-2 py-1 border border-clay-hairline rounded text-base bg-white dark:bg-clay-card"
     placeholder="Second phone (optional)"
   />
 ) : (
   <span className="truncate text-clay-ochre font-medium">
     {contact.phone_second ? contact.phone_second : '+ add second'}
   </span>
 )}
 </div>

 <div className="text-clay-body">
            <span className="text-clay-muted">Role: </span>
            {editing ? (
              <input
                type="text"
                value={editData.job_title}
                onChange={e => setEditData(prev => ({ ...prev, job_title: e.target.value }))}
                className="inline-block w-1/2 px-2 py-1 border border-clay-hairline rounded text-base bg-white dark:bg-clay-card"
                placeholder="e.g., Owner, Purchasing"
              />
            ) : (
              contact.job_title || '—'
            )}
          </div>

          <div className="text-clay-body">
            <span className="text-clay-muted">LINE: </span>
            {editing ? (
              <input
                type="text"
                value={editData.line}
                onChange={e => setEditData(prev => ({ ...prev, line: e.target.value }))}
                className="inline-block w-1/2 px-2 py-1 border border-clay-hairline rounded text-base bg-white dark:bg-clay-card"
                placeholder="@lineid"
              />
            ) : (
              contact.line || '—'
            )}
          </div>

          <div className="text-clay-body">
            <span className="text-clay-muted">Status: </span>
            {editing ? (
              <select
                value={editData.status}
                onChange={e => setEditData(prev => ({ ...prev, status: e.target.value as ContactStatus }))}
                className="inline-block px-2 py-1 border border-clay-hairline rounded text-base bg-white dark:bg-clay-card"
              >
                {statusOptions.map(s => <option key={s} value={s}>{CONTACT_STATUS_LABELS[s]}</option>)}
              </select>
            ) : (
              <span className="px-2 py-0.5 bg-clay-card rounded text-xs">{CONTACT_STATUS_LABELS[contact.status]}</span>
            )}
          </div>

          <div className="text-clay-body">
            <span className="text-clay-muted">Company: </span>
            {editing ? (
              <select
                value={editData.company_id || ''}
                onChange={e => setEditData(prev => ({ ...prev, company_id: e.target.value }))}
                className="inline-block px-2 py-1 border border-clay-hairline rounded text-base bg-white dark:bg-clay-card"
              >
                <option value="">— None —</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            ) : (
              <span className="text-clay-body">
                {contact.company_id
                  ? companies.find(c => c.id === contact.company_id)?.name || 'Unknown'
                  : '—'}
              </span>
            )}
          </div>

          <div className="text-clay-body">
            <span className="text-clay-muted">Notes:</span>
            {editing ? (
              <textarea
                value={editData.notes}
                onChange={e => setEditData(prev => ({ ...prev, notes: e.target.value }))}
                rows={4}
                className="w-full mt-1 px-2 py-2 border border-clay-hairline rounded text-base bg-white dark:bg-clay-card resize-none"
                placeholder="Add notes..."
              />
            ) : (
              <div className="bg-clay-surface rounded-lg p-3 text-clay-body text-xs leading-relaxed mt-1">
                {contact.notes || 'No notes yet'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
