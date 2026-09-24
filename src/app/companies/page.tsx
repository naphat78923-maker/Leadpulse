'use client';

import { useState, useMemo, useEffect } from 'react';
import { Company, COMPANY_STATUS_LABELS, Contact, Deal } from '@/types/crm';
import { useCrm } from '@/components/CrmProvider';
import CreateModal from '@/components/CreateModal';
import CompanyDetail from '@/components/CompanyDetail';
import CompanyLogo from '@/components/CompanyLogo';
import LayaLeadTierBadge from '@/components/LayaLeadTierBadge';
import { bestLeadSignal, type LeadSignal } from '@/utils/lead-scoring';
import { Search, Plus, Tag, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import { PageTransition } from '@/components/motion';

type ViewMode = 'all' | 'by_status';

export default function CompaniesPage() {
  const [view, setView] = useState<ViewMode>('all');
  const [search, setSearch] = useState('');
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Deep-link support: /companies?company=<id> opens that company directly, used by the
  // Prospect Review screen's "Open the company record" link. Read from window.location
  // rather than useSearchParams so this page keeps its current static rendering mode.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('company');
    if (id) setSelectedCompany(id);
  }, []);

  const { companies: dbCompanies, contacts: dbContacts, deals: dbDeals, loading, refresh, createCompany } = useCrm();
  const companies: Company[] = dbCompanies;
  const contacts: Contact[] = dbContacts;
  const deals: Deal[] = dbDeals;

  // Deterministic Laya lead-tier rollup per company (hottest open deal).
  // No model call — safe to compute for every row on any device.
  const signalByCompanyId = useMemo(() => {
    const dealsByCompany = new Map<string, Deal[]>();
    for (const deal of deals) {
      if (!deal.company_id) continue;
      const list = dealsByCompany.get(deal.company_id) ?? [];
      list.push(deal);
      dealsByCompany.set(deal.company_id, list);
    }
    const map = new Map<string, LeadSignal>();
    for (const [companyId, companyDeals] of dealsByCompany) {
      const signal = bestLeadSignal(companyDeals);
      if (signal) map.set(companyId, signal);
    }
    return map;
  }, [deals]);

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
    // Let errors bubble to the modal so failures are visible.
    await createCompany(data);
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
    <PageTransition className="p-4 md:p-6 max-w-6xl pb-20 lg:pb-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold text-clay-ink">Companies</h1>
          <p className="text-xs md:text-sm text-clay-muted mt-0.5">{companies.length} total</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 px-3 py-2 bg-clay-ink text-clay-canvas text-sm font-medium rounded-lg motion-press"
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
                    className="flex items-center gap-3 bg-white dark:bg-clay-card border border-clay-hairline rounded-lg p-3 cursor-pointer active:bg-clay-surface"
                  >
                    <CompanyLogo src={company.logo_url} name={company.name} id={company.id} size={40} />
                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm font-medium text-clay-ink truncate">{company.name}</h4>
                      <p className="text-xs text-clay-muted mt-0.5">
                        {company.tags.join(', ') || '—'}
                      </p>
                      <span className="inline-flex items-center gap-1.5 mt-1">
                        <span className="inline-block text-[10px] font-medium text-clay-muted bg-clay-card px-1.5 py-0.5 rounded">
                          {COMPANY_STATUS_LABELS[company.status]}
                        </span>
                        <LayaLeadTierBadge signal={signalByCompanyId.get(company.id) ?? null} />
                      </span>
                    </div>
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
              className="flex items-center gap-3 bg-white dark:bg-clay-card border border-clay-hairline rounded-lg p-3 cursor-pointer active:bg-clay-surface"
            >
              <CompanyLogo src={company.logo_url} name={company.name} id={company.id} size={40} />
              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-medium text-clay-ink truncate">{company.name}</h4>
                <p className="text-xs text-clay-muted mt-0.5">
                  {company.tags.join(', ') || '—'}
                </p>
                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                  <LayaLeadTierBadge signal={signalByCompanyId.get(company.id) ?? null} />
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
    </PageTransition>
  );
}
