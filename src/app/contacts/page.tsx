'use client';

import { useState, useMemo } from 'react';
import Image from 'next/image';
import { Contact, CONTACT_STATUS_LABELS, Company } from '@/types/crm';
import { useCrm } from '@/components/CrmProvider';
import { contacts as dataContacts, companies as dataCompanies } from '@/data/crmData';
import CreateModal from '@/components/CreateModal';
import ContactDetail from '@/components/ContactDetail';
import CompanyDetail from '@/components/CompanyDetail';
import { Search, Plus, Mail, Phone, ChevronRight, Loader2, Building2, AlertCircle } from 'lucide-react';
import clsx from 'clsx';

type ViewMode = 'all' | 'by_status' | 'by_company';

export default function ContactsPage() {
  const [view, setView] = useState<ViewMode>('all');
  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = useState<string>('all');
  const [selectedContact, setSelectedContact] = useState<string | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { contacts: dbContacts, companies: dbCompanies, loading, refresh, createContact } = useCrm();
  const contacts: Contact[] = dbContacts.length > 0 ? dbContacts : (dataContacts as any);
  const companies = dbCompanies.length > 0 ? dbCompanies : (dataCompanies as any);

  const companyName = (id?: string | null) =>
    id ? (companies.find((c: Company) => c.id === id)?.name || 'Unknown') : null;

  const sortedCompanies = useMemo(
    () => [...companies].sort((a: Company, b: Company) => a.name.localeCompare(b.name)),
    [companies]
  );

  const filtered = useMemo(() => {
    let list = contacts;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        c.name.toLowerCase().includes(q) ||
        (c.email && c.email.toLowerCase().includes(q)) ||
        (c.job_title && c.job_title.toLowerCase().includes(q))
      );
    }
    if (companyFilter !== 'all') {
      list = list.filter(c => c.company_id === companyFilter);
    }
    return list;
  }, [contacts, search, companyFilter]);

  const groupedByStatus = useMemo(() => {
    const groups: Record<string, Contact[]> = {};
    filtered.forEach(c => {
      const key = c.status || 'unknown';
      if (!groups[key]) groups[key] = [];
      groups[key].push(c);
    });
    return groups;
  }, [filtered]);

  const groupedByCompany = useMemo(() => {
    const groups: Record<string, Contact[]> = {};
    filtered.forEach(c => {
      const key = c.company_id || 'none';
      if (!groups[key]) groups[key] = [];
      groups[key].push(c);
    });
    return groups;
  }, [filtered]);

  const handleCreate = async (data: any) => {
    // Let errors bubble to the modal so failures are visible.
    await createContact(data);
  };

  const activeContact = selectedContact ? contacts.find(c => c.id === selectedContact) : null;
  const activeCompany = selectedCompany ? companies.find((c: Company) => c.id === selectedCompany) : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 text-clay-ink animate-spin" />
      </div>
    );
  }

  /* Company chip — always visible so a contact's company is never a mystery */
  const CompanyChip = ({ companyId, compact = false }: { companyId?: string | null; compact?: boolean }) => {
    const name = companyName(companyId);
    if (!name) {
      return (
        <span
          className={clsx(
            'inline-flex items-center gap-1 text-[11px] font-medium text-clay-ochre bg-clay-ochre/10 border border-clay-ochre/25 px-1.5 py-0.5 rounded',
            compact && 'text-[10px] px-1.5 py-0.5'
          )}
        >
          <AlertCircle className="w-3 h-3" />
          No company
        </span>
      );
    }
    return (
      <button
        onClick={(e) => { e.stopPropagation(); setSelectedCompany(companyId!); }}
        className="inline-flex items-center gap-1 text-[11px] font-medium text-zams-deep bg-zams-powder/50 border border-zams-mist px-1.5 py-0.5 rounded hover:bg-zams-powder transition-colors max-w-full"
      >
        <Building2 className="w-3 h-3 shrink-0" />
        <span className="truncate">{name}</span>
      </button>
    );
  };

  const renderContactCard = (contact: Contact) => (
    <div
      key={contact.id}
      onClick={() => setSelectedContact(contact.id)}
      className="bg-white dark:bg-clay-card border border-clay-hairline rounded-lg p-3 flex items-center gap-3 cursor-pointer active:bg-clay-surface hover:border-zams-violet/30 transition-colors"
    >
      <div className="w-10 h-10 rounded-full bg-clay-surface flex items-center justify-center text-clay-ink font-semibold text-sm flex-shrink-0">
        {contact.name.charAt(0)}
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-medium text-clay-ink truncate">{contact.name}</h4>
        <p className="text-xs text-clay-muted truncate">{contact.job_title || contact.email || '—'}</p>
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
          <CompanyChip companyId={contact.company_id} />
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
            {CONTACT_STATUS_LABELS[contact.status as keyof typeof CONTACT_STATUS_LABELS] || 'Unknown'}
          </span>
        </div>
      </div>
      <ChevronRight className="w-4 h-4 text-clay-muted flex-shrink-0" />
    </div>
  );

  return (
    <div className="p-4 md:p-6 max-w-6xl pb-20 lg:pb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="zams-eyebrow mb-1">Contacts · {filtered.length} of {contacts.length}</p>
          <h1 className="zams-display text-2xl md:text-[28px] leading-none">Contacts</h1>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="zams-btn-primary"
        >
          <Plus className="w-4 h-4" /> <span className="hidden sm:inline">New contact</span>
        </button>
      </div>

      {/* Search + company filter */}
      <div className="flex items-center gap-2 mb-4">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-clay-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-3 bg-white dark:bg-clay-card border border-clay-hairline rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-zams-violet/40"
          />
        </div>
        <select
          value={companyFilter}
          onChange={(e) => setCompanyFilter(e.target.value)}
          className="max-w-[45%] md:max-w-[220px] bg-white dark:bg-clay-card border border-clay-hairline rounded-lg px-2.5 py-3 text-sm text-clay-ink focus:outline-none focus:ring-2 focus:ring-zams-violet/40 truncate"
        >
          <option value="all">All companies</option>
          {sortedCompanies.map((c: Company) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <div className="flex bg-clay-card rounded-lg p-0.5 shrink-0">
          <button onClick={() => setView('all')} className={clsx('px-3 py-2 text-xs font-medium rounded-md', view === 'all' ? 'bg-clay-ink text-clay-canvas' : 'text-clay-muted')}>All</button>
          <button onClick={() => setView('by_status')} className={clsx('px-3 py-2 text-xs font-medium rounded-md', view === 'by_status' ? 'bg-clay-ink text-clay-canvas' : 'text-clay-muted')}>Status</button>
          <button onClick={() => setView('by_company')} className={clsx('px-3 py-2 text-xs font-medium rounded-md', view === 'by_company' ? 'bg-clay-ink text-clay-canvas' : 'text-clay-muted')}>Company</button>
        </div>
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
          <p className="text-sm font-medium text-clay-ink mb-1">No contacts found</p>
          <p className="text-xs text-clay-muted mb-4">Try a different search or clear the company filter.</p>
          <button
            onClick={() => { setSearch(''); setCompanyFilter('all'); }}
            className="zams-btn-outline"
          >
            Clear filters
          </button>
        </div>
      )}

      {/* All view */}
      {view === 'all' && filtered.length > 0 && (
        <div className="space-y-2">
          {filtered.map(renderContactCard)}
        </div>
      )}

      {/* Status view */}
      {view === 'by_status' && filtered.length > 0 && (
        <div className="space-y-4">
          {Object.entries(groupedByStatus).map(([status, items]) => (
            <div key={status}>
              <h3 className="zams-display text-base md:text-lg mb-2">
                {CONTACT_STATUS_LABELS[status as keyof typeof CONTACT_STATUS_LABELS] || status} ({items.length})
              </h3>
              <div className="space-y-2">
                {items.map(renderContactCard)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Company view */}
      {view === 'by_company' && filtered.length > 0 && (
        <div className="space-y-5">
          {Object.entries(groupedByCompany)
            .sort(([a], [b]) => {
              if (a === 'none') return 1;
              if (b === 'none') return -1;
              return (companyName(a) || '').localeCompare(companyName(b) || '');
            })
            .map(([companyId, items]) => (
              <div key={companyId}>
                <button
                  onClick={() => companyId !== 'none' && setSelectedCompany(companyId)}
                  className="flex items-center gap-2 mb-2 group"
                >
                  {companyId === 'none' ? (
                    <AlertCircle className="w-4 h-4 text-clay-ochre" />
                  ) : (
                    <Building2 className="w-4 h-4 text-zams-deep" />
                  )}
                  <h3 className="zams-display text-base md:text-lg group-hover:text-zams-deep transition-colors">
                    {companyId === 'none' ? 'No company' : companyName(companyId)} ({items.length})
                  </h3>
                </button>
                <div className="space-y-2">
                  {items.map(renderContactCard)}
                </div>
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

      {activeCompany && (
        <CompanyDetail
          company={activeCompany}
          onClose={() => setSelectedCompany(null)}
          onSaved={refresh}
          contacts={contacts}
          companyContacts={contacts.filter((c: Contact) => c.company_id === activeCompany.id)}
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
