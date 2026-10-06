'use client';

import { Suspense, useState, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { Company, COMPANY_STATUS_LABELS, Contact, Deal } from '@/types/crm';
import { useCrm } from '@/components/CrmProvider';
import CreateModal from '@/components/CreateModal';
import CompanyDetail from '@/components/CompanyDetail';
import ContactDetail from '@/components/ContactDetail';
import CompanyLogo from '@/components/CompanyLogo';
import EntityAvatar from '@/components/EntityAvatar';
import LayaLeadTierBadge from '@/components/LayaLeadTierBadge';
import { useQuerySelection } from '@/hooks/useQuerySelection';
import { bestLeadSignal, type LeadSignal } from '@/utils/lead-scoring';
import { isCompanyRoute } from '@/utils/contact-identity';
import { linkInText, routeContact, type LeadRoute } from '@/utils/lead-apply';
import { useBusinessDateKey } from '@/utils/useBusinessDateKey';
import { BadgeCheck, CircleX, Clock, Loader2, Moon, Plus, Search, Sprout, Tag, User, Users, type LucideIcon } from 'lucide-react';
import clsx from 'clsx';
import { PageTransition } from '@/components/motion';

type ViewMode = 'all' | 'by_status';

const STATUS_ICON: Record<Company['status'], LucideIcon> = {
  prospect: Sprout,
  active_customer: BadgeCheck,
  inactive: Moon,
  lost: CircleX,
};

const factIcon = 'h-3.5 w-3.5 shrink-0 text-clay-muted-soft';

/** "Today", "9d ago", "3mo ago" since a saved date; null when there is none. */
function sinceLabel(date: string | null | undefined, today: string): string | null {
  const from = Date.parse(`${(date ?? '').slice(0, 10)}T00:00:00Z`);
  const to = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  const days = Math.round((to - from) / 86_400_000);
  if (days < 0) return null;
  if (days === 0) return 'Today';
  if (days < 60) return `${days}d ago`;
  if (days < 365) return `${Math.round(days / 30)}mo ago`;
  return `${Math.round(days / 365)}y ago`;
}

function contactMatches(contact: Contact, q: string): boolean {
  return (
    contact.name.toLowerCase().includes(q) ||
    Boolean(contact.email?.toLowerCase().includes(q)) ||
    Boolean(contact.phone?.toLowerCase().includes(q)) ||
    Boolean(contact.job_title?.toLowerCase().includes(q))
  );
}

// Suspense boundary for useSearchParams (via useQuerySelection) — see its docs.
export default function AccountsPage() {
  return (
    <Suspense>
      <Accounts />
    </Suspense>
  );
}

function Accounts() {
  const todayKey = useBusinessDateKey();
  const [view, setView] = useState<ViewMode>('all');
  const [search, setSearch] = useState('');
  // /companies?company=<id> opens that account (links from This week and Prospect Review).
  const [selectedCompany, setSelectedCompany] = useQuerySelection('company');
  const [selectedContact, setSelectedContact] = useState<string | null>(null);
  // /companies?add=<link> opens New account with that link read in. A link shared to the
  // installed app from a phone arrives the same way (manifest share_target: link / text).
  const params = useSearchParams();
  const sharedLink = linkInText(params.get('add')) ?? linkInText(params.get('link')) ?? linkInText(params.get('text'));
  const [modalChoice, setIsModalOpen] = useState<boolean | null>(null);
  const isModalOpen = modalChoice ?? Boolean(sharedLink);

  const { companies: dbCompanies, contacts: dbContacts, deals: dbDeals, loading, refresh, createCompany, createContact } = useCrm();
  const companies: Company[] = dbCompanies;
  const contacts: Contact[] = dbContacts;
  const deals: Deal[] = dbDeals;

  // People per account for counts and name matches; routes (info@, general LINE) aren't people.
  const peopleCount = useMemo(() => contacts.filter((c) => !isCompanyRoute(c)).length, [contacts]);

  const contactsByCompany = useMemo(() => {
    const map = new Map<string, Contact[]>();
    for (const contact of contacts) {
      if (!contact.company_id) continue;
      const list = map.get(contact.company_id) ?? [];
      list.push(contact);
      map.set(contact.company_id, list);
    }
    return map;
  }, [contacts]);

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

  const q = search.trim().toLowerCase();

  // An account matches on its own fields or on any of its people.
  const { filtered, matchedPeople } = useMemo(() => {
    const matchedPeople = new Map<string, Contact[]>();
    if (!q) return { filtered: companies, matchedPeople };
    const filtered = companies.filter((c) => {
      const matches = (contactsByCompany.get(c.id) ?? []).filter((contact) => contactMatches(contact, q));
      const people = matches.filter((contact) => !isCompanyRoute(contact));
      if (people.length) matchedPeople.set(c.id, people);
      return (
        matches.length > 0 ||
        c.name.toLowerCase().includes(q) ||
        Boolean(c.industry?.toLowerCase().includes(q)) ||
        c.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
    return { filtered, matchedPeople };
  }, [companies, contactsByCompany, q]);

  const peopleWithoutAccount = useMemo(
    () => contacts.filter((c) => !c.company_id && (!q || contactMatches(c, q))),
    [contacts, q],
  );

  const groupedByStatus = useMemo(() => {
    const groups: Record<string, Company[]> = {};
    filtered.forEach(c => {
      const key = c.status || 'unknown';
      if (!groups[key]) groups[key] = [];
      groups[key].push(c);
    });
    return groups;
  }, [filtered]);

  const handleCreate = async (data: Parameters<typeof createCompany>[0] & { contact_route?: LeadRoute | null }) => {
    // Let errors bubble to the modal so failures are visible.
    const { contact_route: route, ...company } = data;
    const created = await createCompany(company);
    // An email, phone or LINE read from their site is kept as a way to reach the account.
    if (route && created?.id) await createContact(routeContact(created.id, company.name, route));
  };

  const activeCompany = selectedCompany ? companies.find(c => c.id === selectedCompany) : null;
  const activeContact = selectedContact ? contacts.find(c => c.id === selectedContact) : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 text-clay-ink animate-spin" />
      </div>
    );
  }

  const renderRow = (company: Company, showStatus: boolean) => {
    const people = matchedPeople.get(company.id);
    const peopleCount = (contactsByCompany.get(company.id) ?? []).filter((c) => !isCompanyRoute(c)).length;
    const lastContact = sinceLabel(company.last_contact_date, todayKey);
    const StatusIcon = STATUS_ICON[company.status];
    return (
      <div
        key={company.id}
        onClick={() => setSelectedCompany(company.id)}
        className="flex items-center gap-3 bg-white dark:bg-clay-card border border-clay-hairline rounded-lg p-3 cursor-pointer active:bg-clay-surface"
      >
        <CompanyLogo src={company.logo_url} name={company.name} id={company.id} size={40} />
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-medium text-clay-ink truncate">{company.name}</h4>
          {people ? (
            <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-clay-lavender">
              <User className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{people.map((p) => p.name).join(', ')}</span>
            </p>
          ) : company.tags.length > 0 ? (
            <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-clay-muted">
              <Tag className={factIcon} aria-hidden="true" />
              <span className="truncate">{company.tags.join(', ')}</span>
            </p>
          ) : null}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-clay-muted">
            {showStatus && (
              <span className="inline-flex items-center gap-1">
                <StatusIcon className={factIcon} aria-hidden="true" />
                {COMPANY_STATUS_LABELS[company.status]}
              </span>
            )}
            {peopleCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <Users className={factIcon} aria-hidden="true" />
                {peopleCount} {peopleCount === 1 ? 'person' : 'people'}
              </span>
            )}
            {lastContact && (
              <span className="inline-flex items-center gap-1" title={`Last contact ${company.last_contact_date}`}>
                <Clock className={factIcon} aria-hidden="true" />
                {lastContact}
              </span>
            )}
            <LayaLeadTierBadge signal={signalByCompanyId.get(company.id) ?? null} />
          </div>
        </div>
      </div>
    );
  };

  return (
    <PageTransition className="p-4 md:p-6 max-w-6xl pb-20 lg:pb-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold text-clay-ink">Accounts</h1>
          <p className="text-xs md:text-sm text-clay-muted mt-0.5">{companies.length} accounts · {peopleCount} people</p>
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
            placeholder="Search accounts or people…"
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
              <div className="space-y-2">{items.map((company) => renderRow(company, false))}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">{filtered.map((company) => renderRow(company, true))}</div>
      )}

      {peopleWithoutAccount.length > 0 && (
        <section className="mt-6">
          <h3 className="text-sm font-semibold text-clay-ink mb-2">People without an account ({peopleWithoutAccount.length})</h3>
          <div className="space-y-2">
            {peopleWithoutAccount.map((contact) => (
              <button
                key={contact.id}
                type="button"
                onClick={() => setSelectedContact(contact.id)}
                className="flex w-full items-center gap-3 bg-white dark:bg-clay-card border border-clay-hairline rounded-lg p-3 text-left active:bg-clay-surface"
              >
                <EntityAvatar kind="person" name={contact.name} id={contact.id} size={40} className="flex-shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-clay-ink truncate">{contact.name}</span>
                  <span className="block text-xs text-clay-muted truncate">{contact.job_title || contact.email || '—'}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {!filtered.length && !peopleWithoutAccount.length && (
        <p className="py-10 text-center text-sm text-clay-muted">No accounts or people match “{search}”.</p>
      )}

      {activeCompany && (
        <CompanyDetail
          company={activeCompany}
          onClose={() => setSelectedCompany(null)}
          onSaved={refresh}
          contacts={contacts}
          companyContacts={contactsByCompany.get(activeCompany.id) ?? []}
        />
      )}

      {activeContact && (
        <ContactDetail
          contact={activeContact}
          onClose={() => setSelectedContact(null)}
          onSaved={refresh}
          companies={companies}
        />
      )}

      <CreateModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSave={handleCreate} type="company" initialLink={sharedLink} companies={companies} />
    </PageTransition>
  );
}
