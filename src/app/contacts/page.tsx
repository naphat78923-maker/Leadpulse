'use client';

import { useState, useMemo } from 'react';
import { Contact, CONTACT_STATUS_LABELS, Company } from '@/types/crm';
import { useCrm } from '@/components/CrmProvider';
import { contacts as dataContacts, companies as dataCompanies } from '@/data/crmData';
import CreateModal from '@/components/CreateModal';
import ContactDetail from '@/components/ContactDetail';
import { Search, Plus, Mail, Phone, ChevronRight, Loader2 } from 'lucide-react';
import clsx from 'clsx';

type ViewMode = 'all' | 'by_status';

export default function ContactsPage() {
  const [view, setView] = useState<ViewMode>('all');
  const [search, setSearch] = useState('');
  const [selectedContact, setSelectedContact] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { contacts: dbContacts, companies: dbCompanies, loading, refresh, createContact } = useCrm();
  const contacts: Contact[] = dbContacts.length > 0 ? dbContacts : (dataContacts as any);
  const companies = dbCompanies.length > 0 ? dbCompanies : (dataCompanies as any);

  const filtered = useMemo(() => {
    if (!search) return contacts;
    const q = search.toLowerCase();
    return contacts.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.email && c.email.toLowerCase().includes(q)) ||
      (c.job_title && c.job_title.toLowerCase().includes(q))
    );
  }, [contacts, search]);

  const groupedByStatus = useMemo(() => {
    const groups: Record<string, Contact[]> = {};
    filtered.forEach(c => {
      const key = c.status || 'unknown';
      if (!groups[key]) groups[key] = [];
      groups[key].push(c);
    });
    return groups;
  }, [filtered]);

  const handleCreate = async (data: any) => {
    try {
      await createContact(data);
    } catch (err) {
      console.error('Failed to create contact:', err);
    }
  };

  const activeContact = selectedContact ? contacts.find(c => c.id === selectedContact) : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 text-clay-ink animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl pb-20 lg:pb-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold text-clay-ink">Contacts</h1>
          <p className="text-xs md:text-sm text-clay-muted mt-0.5">{contacts.length} total</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 px-3 py-2 bg-clay-ink text-clay-canvas text-sm font-medium rounded-lg active:opacity-85"
        >
          <Plus className="w-4 h-4" /> <span className="hidden sm:inline">New</span>
        </button>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-clay-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-3 bg-white dark:bg-clay-card border border-clay-hairline rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-clay-ink"
          />
        </div>
        <div className="flex bg-clay-card rounded-lg p-0.5">
          <button onClick={() => setView('all')} className={clsx('px-3 py-2 text-xs font-medium rounded-md', view === 'all' ? 'bg-clay-ink text-clay-canvas' : 'text-clay-muted')}>All</button>
          <button onClick={() => setView('by_status')} className={clsx('px-3 py-2 text-xs font-medium rounded-md', view === 'by_status' ? 'bg-clay-ink text-clay-canvas' : 'text-clay-muted')}>Status</button>
        </div>
      </div>

      {view === 'by_status' ? (
        <div className="space-y-4">
          {Object.entries(groupedByStatus).map(([status, items]) => (
            <div key={status}>
              <h3 className="text-sm font-semibold text-clay-ink mb-2">{CONTACT_STATUS_LABELS[status as keyof typeof CONTACT_STATUS_LABELS] || status} ({items.length})</h3>
              <div className="space-y-2">
                {items.map((contact: Contact) => (
                  <div
                    key={contact.id}
                    onClick={() => setSelectedContact(contact.id)}
                    className="bg-white dark:bg-clay-card border border-clay-hairline rounded-lg p-3 flex items-center gap-3 cursor-pointer active:bg-clay-surface"
                  >
                    <div className="w-10 h-10 rounded-full bg-clay-surface flex items-center justify-center text-clay-ink font-semibold text-sm flex-shrink-0">
                      {contact.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-medium text-clay-ink truncate">{contact.name}</h4>
                      <p className="text-xs text-clay-muted truncate">{contact.job_title || contact.email || '—'}</p>
                      {contact.company_id && (
                        <p className="text-[10px] text-clay-muted-soft truncate">
                          🏢 {companies.find((c: Company) => c.id === contact.company_id)?.name || 'Unknown'}
                        </p>
                      )}
                    </div>
                    <ChevronRight className="w-4 h-4 text-clay-muted flex-shrink-0" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((contact: Contact) => (
            <div
              key={contact.id}
              onClick={() => setSelectedContact(contact.id)}
              className="bg-white dark:bg-clay-card border border-clay-hairline rounded-lg p-3 flex items-center gap-3 cursor-pointer active:bg-clay-surface"
            >
              <div className="w-10 h-10 rounded-full bg-clay-surface flex items-center justify-center text-clay-ink font-semibold text-sm flex-shrink-0">
                {contact.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-medium text-clay-ink truncate">{contact.name}</h4>
                <p className="text-xs text-clay-muted truncate">{contact.job_title || contact.email || '—'}</p>
                <div className="flex items-center gap-2 mt-1">
                  {contact.email && (
                    <span className="inline-flex items-center gap-1 text-xs text-clay-muted-soft">
                      <Mail className="w-3 h-3" />
                    </span>
                  )}
                  {contact.phone && (
                    <span className="inline-flex items-center gap-1 text-xs text-clay-muted-soft">
                      <Phone className="w-3 h-3" />
                    </span>
                  )}
                  {contact.phone_second && (
                    <span className="inline-flex items-center gap-1 text-xs text-clay-ochre">
                      <Phone className="w-3 h-3" />
                    </span>
                  )}
                  <span className="text-[10px] font-medium text-clay-muted bg-clay-card px-1.5 py-0.5 rounded">
                    {CONTACT_STATUS_LABELS[contact.status]}
                  </span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-clay-muted flex-shrink-0" />
            </div>
          ))}
        </div>
      )}

      {activeContact && (
        <ContactDetail
          contact={activeContact}
          onClose={() => setSelectedContact(null)}
          onSaved={refresh}
          companies={companies}
        />
      )}

      <CreateModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleCreate}
        type="contact"
        companies={companies}
      />
    </div>
  );
}
