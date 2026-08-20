'use client';

import { useState, useMemo } from 'react';
import { Company, COMPANY_STATUS_LABELS, Contact } from '@/types/crm';
import { useCrm } from '@/components/CrmProvider';
import { companies as dataCompanies, contacts as dataContacts } from '@/data/crmData';
import CreateModal from '@/components/CreateModal';
import CompanyDetail from '@/components/CompanyDetail';
import { Search, Plus, Building2, Tag, Loader2 } from 'lucide-react';
import clsx from 'clsx';

type ViewMode = 'all' | 'by_status';

export default function CompaniesPage() {
  const [view, setView] = useState<ViewMode>('all');
  const [search, setSearch] = useState('');
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { companies: dbCompanies, contacts: dbContacts, loading, refresh, createCompany } = useCrm();
  const companies: Company[] = dbCompanies.length > 0 ? dbCompanies : (dataCompanies as any);
  const contacts: Contact[] = dbContacts.length > 0 ? dbContacts : (dataContacts as any);

  const filtered = useMemo(() => {
    if (!search) return companies;
    const q = search.toLowerCase();
    return companies.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.industry && c.industry.toLowerCase().includes(q)) ||
      c.tags.some(t => t.toLowerCase().includes(q))
    );
  }, [companies, search]);

  const groupedByStatus = useMemo(() => {
    const groups: Record<string, Company[]> = {};
    filtered.forEach(c => {
      const key = c.status || 'unknown';
      if (!groups[key]) groups[key] = [];
      groups[key].push(c);
    });
    return groups;
  }, [filtered]);

  const handleCreate = async (data: any) => {
    try {
      await createCompany(data);
    } catch (err) {
      console.error('Failed to create company:', err);
    }
  };

  const activeCompany = selectedCompany ? companies.find(c => c.id === selectedCompany) : null;

  const companyContacts = useMemo(() => {
    if (!activeCompany) return [];
    return contacts.filter((c: Contact) => c.company_id === activeCompany.id);
  }, [contacts, activeCompany]);

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
          <h1 className="text-xl md:text-2xl font-semibold text-clay-ink">Companies</h1>
          <p className="text-xs md:text-sm text-clay-muted mt-0.5">{companies.length} total</p>
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
              <h3 className="text-sm font-semibold text-clay-ink mb-2">{COMPANY_STATUS_LABELS[status as keyof typeof COMPANY_STATUS_LABELS] || status} ({items.length})</h3>
              <div className="space-y-2">
                {items.map((company: Company) => (
                  <div
                    key={company.id}
                    onClick={() => setSelectedCompany(company.id)}
                    className="bg-white dark:bg-clay-card border border-clay-hairline rounded-lg p-3 cursor-pointer active:bg-clay-surface"
                  >
                    <h4 className="text-sm font-medium text-clay-ink">{company.name}</h4>
                    <p className="text-xs text-clay-muted mt-0.5">
                      {company.tags.join(', ') || '—'}
                    </p>
                    <span className="inline-block mt-1 text-[10px] font-medium text-clay-muted bg-clay-card px-1.5 py-0.5 rounded">
                      {COMPANY_STATUS_LABELS[company.status]}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((company: Company) => (
            <div
              key={company.id}
              onClick={() => setSelectedCompany(company.id)}
              className="bg-white dark:bg-clay-card border border-clay-hairline rounded-lg p-3 cursor-pointer active:bg-clay-surface"
            >
              <h4 className="text-sm font-medium text-clay-ink">{company.name}</h4>
              <p className="text-xs text-clay-muted mt-0.5">
                {company.tags.join(', ') || '—'}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span className="inline-flex items-center gap-1 text-xs text-clay-muted-soft">
                  <Building2 className="w-3 h-3" />
                </span>
                <span className="inline-block text-[10px] font-medium text-clay-muted bg-clay-card px-1.5 py-0.5 rounded">
                  {contacts.filter((c: Contact) => c.company_id === company.id).length} contacts
                </span>
                {company.tags.map(tag => (
                  <span key={tag} className="inline-block text-[10px] font-medium text-clay-muted bg-clay-card px-1.5 py-0.5 rounded">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {activeCompany && (
        <CompanyDetail
          company={activeCompany}
          onClose={() => setSelectedCompany(null)}
          onSaved={refresh}
          contacts={contacts}
          companyContacts={companyContacts}
        />
      )}

      <CreateModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSave={handleCreate} type="company" />
    </div>
  );
}
