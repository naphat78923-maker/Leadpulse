'use client';

import { useState } from 'react';
import { Company, COMPANY_STATUS_LABELS, CompanyStatus, Contact } from '@/types/crm';
import { Building2, Tag, X, Edit2, Loader2, Check, UserPlus, Trash2, Gift } from 'lucide-react';
import clsx from 'clsx';
import { useToast } from '@/components/ToastProvider';
import { useCrm } from '@/components/CrmProvider';
import * as crm from '@/lib/crm';

const statusOptions: CompanyStatus[] = ['prospect', 'active_customer', 'inactive', 'lost'];

interface CompanyDetailProps {
  company: Company;
  onClose: () => void;
  onSaved: () => void;
  contacts: Contact[];
  companyContacts: Contact[];
}

export default function CompanyDetail({ company, onClose, onSaved, contacts, companyContacts }: CompanyDetailProps) {
  const { addToast } = useToast();
  const { createContact, refresh, deleteEntity, meetings } = useCrm();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddContact, setShowAddContact] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [newContact, setNewContact] = useState<any>({ name: '', email: '', phone: '', phone_second: '', line: '', job_title: '' });
  const [editData, setEditData] = useState({
    name: company.name,
    status: company.status,
    lead_source: company.lead_source || '',
    account_owner: company.account_owner || '',
    industry: company.industry || '',
    tags: (company.tags || []).join(', '),
    address: company.address || '',
    website: company.website || '',
    notes: company.notes || '',
  });

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        ...editData,
        tags: editData.tags ? editData.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      };
      const updated = await crm.updateCompany(company.id, payload);
      setEditData({
        name: updated.name,
        status: updated.status,
        lead_source: updated.lead_source || '',
        account_owner: updated.account_owner || '',
        industry: updated.industry || '',
        tags: (updated.tags || []).join(', '),
        address: updated.address || '',
        website: updated.website || '',
        notes: updated.notes || '',
      });
      setEditing(false);
      setSaved(true);
      onSaved();
      addToast('Company saved!');
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      console.error('Failed to update company:', err);
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
            <h2 className="text-lg font-semibold text-clay-ink">{company.name}</h2>
          )}
          <div className="flex items-center gap-1">
            {editing && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="p-2 text-clay-success active:opacity-70 transition-all disabled:opacity-50"
                aria-label="Save company"
              >
                {saving ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <span className={clsx('inline-flex transition-transform', saved && 'scale-110')}>
                    <Check className="w-5 h-5" />
                  </span>
                )}
              </button>
            )}
            <button onClick={() => setEditing(!editing)} className="p-2 text-clay-muted active:opacity-70">
              <Edit2 className="w-5 h-5" />
            </button>
            <button onClick={() => setConfirmArchive(true)} className="p-2 text-clay-muted-soft active:opacity-70 hover:text-clay-error transition-colors" aria-label="Archive company">
              <Trash2 className="w-5 h-5" />
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
          <div className="text-clay-body">
            <span className="text-clay-muted">Status: </span>
            {editing ? (
              <select
                value={editData.status}
                onChange={e => setEditData(prev => ({ ...prev, status: e.target.value as CompanyStatus }))}
                className="inline-block px-2 py-1 border border-clay-hairline rounded text-base bg-white dark:bg-clay-card"
              >
                {statusOptions.map(s => <option key={s} value={s}>{COMPANY_STATUS_LABELS[s]}</option>)}
              </select>
            ) : (
              <span className="px-2 py-0.5 bg-clay-card rounded text-xs">{COMPANY_STATUS_LABELS[company.status]}</span>
            )}
          </div>

          <div className="text-clay-body">
            <span className="text-clay-muted">Owner: </span>
            {editing ? (
              <input
                type="text"
                value={editData.account_owner}
                onChange={e => setEditData(prev => ({ ...prev, account_owner: e.target.value }))}
                className="inline-block w-1/2 px-2 py-1 border border-clay-hairline rounded text-base bg-white dark:bg-clay-card"
              />
            ) : (
              company.account_owner || '—'
            )}
          </div>

          <div className="text-clay-body">
            <span className="text-clay-muted">Source: </span>
            {editing ? (
              <input
                type="text"
                value={editData.lead_source}
                onChange={e => setEditData(prev => ({ ...prev, lead_source: e.target.value }))}
                className="inline-block w-1/2 px-2 py-1 border border-clay-hairline rounded text-base bg-white dark:bg-clay-card"
              />
            ) : (
              company.lead_source || '—'
            )}
          </div>

          <div className="text-clay-body">
            <span className="text-clay-muted">Industry: </span>
            {editing ? (
              <input
                type="text"
                value={editData.industry}
                onChange={e => setEditData(prev => ({ ...prev, industry: e.target.value }))}
                className="inline-block w-1/2 px-2 py-1 border border-clay-hairline rounded text-base bg-white dark:bg-clay-card"
              />
            ) : (
              company.industry || '—'
            )}
          </div>

          <div className="text-clay-body">
            <span className="text-clay-muted">Tags: </span>
            {editing ? (
              <input
                type="text"
                value={editData.tags}
                onChange={e => setEditData(prev => ({ ...prev, tags: e.target.value }))}
                className="inline-block w-2/3 px-2 py-1 border border-clay-hairline rounded text-base bg-white dark:bg-clay-card"
                placeholder="tag1, tag2"
              />
            ) : (
              <span className="text-xs">{(company.tags || []).map(t => <span key={t} className="inline-block bg-clay-card px-1.5 py-0.5 rounded mr-1">{t}</span>) || '—'}</span>
            )}
          </div>

          <div className="text-clay-body">
            <span className="text-clay-muted">Website: </span>
            {editing ? (
              <input
                type="url"
                value={editData.website}
                onChange={e => setEditData(prev => ({ ...prev, website: e.target.value }))}
                className="inline-block w-2/3 px-2 py-1 border border-clay-hairline rounded text-base bg-white dark:bg-clay-card"
              />
            ) : (
              company.website || '—'
            )}
          </div>

          <div className="text-clay-body">
            <span className="text-clay-muted">Address:</span>
            {editing ? (
              <textarea
                value={editData.address}
                onChange={e => setEditData(prev => ({ ...prev, address: e.target.value }))}
                rows={2}
                className="w-full mt-1 px-2 py-2 border border-clay-hairline rounded text-base bg-white dark:bg-clay-card resize-none"
              />
            ) : (
              <div className="bg-clay-surface rounded-lg p-3 text-clay-body text-xs leading-relaxed mt-1">
                {company.address || 'No address yet'}
              </div>
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
                {company.notes || 'No notes yet'}
              </div>
            )}
          </div>

          {/* Rewards history (retention, read-only) */}
          <div className="mt-4 pt-4 border-t border-clay-hairline">
            <h3 className="text-sm font-semibold text-clay-ink flex items-center gap-1.5">
              <Gift className="w-4 h-4 text-clay-ochre" /> Rewards given
            </h3>
            {(() => {
              const rewards = meetings.filter((m) => m.company_id === company.id && m.type === 'reward');
              if (rewards.length === 0) {
                return <p className="text-xs text-clay-muted-soft mt-1.5">No surprise rewards logged yet.</p>;
              }
              return (
                <div className="mt-2 space-y-1.5">
                  {rewards.map((m) => (
                    <div key={m.id} className="bg-clay-surface rounded-lg p-2.5 text-xs text-clay-body">
                      <span className="font-medium text-clay-ink">{m.date}</span>
                      <span className="text-clay-muted"> · {m.description}</span>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>

          {/* Contacts Section */}
          <div className="mt-4 pt-4 border-t border-clay-hairline">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-clay-ink">👥 Contacts ({companyContacts.length})</h3>
              <button
                onClick={() => setShowAddContact(!showAddContact)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-clay-hairline bg-clay-surface text-xs font-medium text-clay-ink active:bg-clay-card transition-colors"
              >
                <UserPlus className="w-3.5 h-3.5" />
                {showAddContact ? 'Cancel' : 'Add'}
              </button>
            </div>

            {/* Add contact form */}
            {showAddContact && (
              <div className="bg-clay-surface rounded-xl p-3 mb-3 space-y-2">
                <input
                  type="text"
                  value={newContact.name}
                  onChange={e => setNewContact((prev: any) => ({ ...prev, name: e.target.value }))}
                  placeholder="Contact name *"
                  className="w-full px-3 py-2 border border-clay-hairline rounded-lg text-base bg-white dark:bg-clay-card"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="email"
                    value={newContact.email}
                    onChange={e => setNewContact((prev: any) => ({ ...prev, email: e.target.value }))}
                    placeholder="Email"
                    className="px-3 py-2 border border-clay-hairline rounded-lg text-base bg-white dark:bg-clay-card"
                  />
                  <input
                    type="tel"
                    value={newContact.phone}
                    onChange={e => setNewContact((prev: any) => ({ ...prev, phone: e.target.value }))}
                    placeholder="Phone"
                    className="px-3 py-2 border border-clay-hairline rounded-lg text-base bg-white dark:bg-clay-card"
                  />
                </div>
                <input
                  type="tel"
                  value={newContact.phone_second}
                  onChange={e => setNewContact((prev: any) => ({ ...prev, phone_second: e.target.value }))}
                  placeholder="Second phone"
                  className="w-full px-3 py-2 border border-clay-hairline rounded-lg text-base bg-white dark:bg-clay-card"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={newContact.line}
                    onChange={e => setNewContact((prev: any) => ({ ...prev, line: e.target.value }))}
                    placeholder="LINE ID"
                    className="px-3 py-2 border border-clay-hairline rounded-lg text-base bg-white dark:bg-clay-card"
                  />
                  <input
                    type="text"
                    value={newContact.job_title}
                    onChange={e => setNewContact((prev: any) => ({ ...prev, job_title: e.target.value }))}
                    placeholder="Job title"
                    className="px-3 py-2 border border-clay-hairline rounded-lg text-base bg-white dark:bg-clay-card"
                  />
                </div>
                <button
                  onClick={async () => {
                    if (!newContact.name.trim()) {
                      addToast('Contact name is required');
                      return;
                    }
                    setSaving(true);
                    setError(null);
                    try {
                      await createContact({
                        ...newContact,
                        company_id: company.id,
                        status: 'active',
                        notes: '',
                      });
                      setNewContact({ name: '', email: '', phone: '', phone_second: '', line: '', job_title: '' });
                      setShowAddContact(false);
                      onSaved();
                      refresh();
                      addToast('Contact added!');
                    } catch (err: any) {
                      console.error('Failed to create contact:', err);
                      setError('Could not save: ' + (err.message || 'Unknown error'));
                    } finally {
                      setSaving(false);
                    }
                  }}
                  disabled={saving}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-clay-ink text-clay-canvas text-sm font-medium rounded-lg active:opacity-85 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                  Save contact
                </button>
              </div>
            )}

            {companyContacts.length > 0 ? (
              <div className="space-y-2">
                {companyContacts.map((contact: Contact) => (
                  <div key={contact.id} className="bg-clay-surface rounded-lg p-3 text-sm text-clay-body">
                    <p className="font-medium text-clay-ink">{contact.name}</p>
                    <p className="text-xs text-clay-muted">{contact.job_title || contact.email || '—'}</p>
                    {contact.phone && (
                      <p className="text-xs text-clay-muted-soft">📱 {contact.phone}</p>
                    )}
                    {contact.phone_second && (
                      <p className="text-xs text-clay-ochre">📱 {contact.phone_second}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-clay-muted-soft">No contacts linked yet. Add one above or create a contact and select this company.</p>
            )}
          </div>
          {confirmArchive && (
            <div className="mt-4 rounded-xl border border-clay-hairline bg-clay-surface p-4">
              <div className="flex gap-3"><span className="text-2xl">🗑️</span><div><p className="font-semibold text-clay-ink">Archive this company?</p><p className="text-xs text-clay-muted mt-1">{company.name} and its linked contacts will be hidden from lists. You can undo this from the Activity feed.</p></div></div>
              <div className="grid grid-cols-2 gap-2 mt-3"><button onClick={() => { setConfirmArchive(false); setSaving(true); deleteEntity('company', company.id, company.name).then(() => { setSaving(false); addToast('Company archived'); onClose(); }).catch(err => { setSaving(false); setError('Could not archive: ' + (err.message || 'Unknown error')); }); }} className="px-3 py-2.5 bg-clay-error text-white text-sm font-medium rounded-lg">Archive</button><button onClick={() => setConfirmArchive(false)} className="px-3 py-2.5 bg-clay-card text-clay-ink text-sm font-medium rounded-lg">Cancel</button></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
