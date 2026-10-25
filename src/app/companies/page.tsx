'use client';

import { Suspense, useEffect, useRef, useState, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { Company, COMPANY_STATUS_LABELS, Contact, Deal } from '@/types/crm';
import { useCrm } from '@/components/CrmProvider';
import CreateModal from '@/components/CreateModal';
import CompanyDetail from '@/components/CompanyDetail';
import ContactDetail from '@/components/ContactDetail';
import CompanyLogo from '@/components/CompanyLogo';
import DuplicateReview from '@/components/DuplicateReview';
import EntityAvatar from '@/components/EntityAvatar';
import { useQuerySelection } from '@/hooks/useQuerySelection';
import { isCompanyRoute } from '@/utils/contact-identity';
import { linkInText, routeContact, type LeadRoute } from '@/utils/lead-apply';
import { useBusinessDateKey } from '@/utils/useBusinessDateKey';
import * as crm from '@/lib/crm';
import {
  ACCOUNT_SORT_LABELS,
  isAccountSort,
  lastTouches,
  nextFollowUps,
  rowWhen,
  sortAccounts,
  type AccountSort,
  type WhenTone,
} from '@/utils/account-row';
import { ArrowUpDown, Check, ChevronDown, Loader2, Plus, Search, User } from 'lucide-react';
import clsx from 'clsx';
import { PageTransition } from '@/components/motion';

type ViewMode = 'all' | 'by_status';

const STATUS_CHIP: Record<Company['status'], { label: string; className: string }> = {
  prospect: { label: 'Prospect', className: 'bg-clay-card text-clay-body dark:bg-white/[0.06]' },
  active_customer: { label: 'Customer', className: 'bg-clay-mint/30 text-clay-ink' },
  inactive: { label: 'Inactive', className: 'bg-clay-card text-clay-muted-soft dark:bg-white/[0.06]' },
  lost: { label: 'Lost', className: 'bg-clay-error/10 text-clay-error' },
};

const WHEN_TONE: Record<WhenTone, string> = {
  late: 'font-medium text-clay-warning-strong dark:text-clay-ochre',
  today: 'font-semibold text-clay-ink',
  ahead: 'text-clay-ink',
  past: 'text-clay-muted',
};

// Per-viewer convenience: the list opens in the order Pat last picked.
const SORT_KEY = 'leadpulse.accounts.sort';
function savedSort(): AccountSort {
  try {
    const value = window.localStorage.getItem(SORT_KEY);
    return isAccountSort(value) ? value : 'name';
  } catch {
    return 'name';
  }
}

function contactMatches(contact: Contact, q: string): boolean {
  return (
    contact.name.toLowerCase().includes(q) ||
    Boolean(contact.email?.toLowerCase().includes(q)) ||
    Boolean(contact.phone?.toLowerCase().includes(q)) ||
    Boolean(contact.job_title?.toLowerCase().includes(q))
  );
}

/** "Follow up ▾": Name, Follow up or Last touch. */
function SortMenu({ value, onChange }: { value: AccountSort; onChange: (sort: AccountSort) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Sort by ${ACCOUNT_SORT_LABELS[value].toLowerCase()}`}
        className="flex h-[46px] items-center gap-1.5 whitespace-nowrap rounded-lg border border-clay-hairline bg-white px-3 text-xs font-medium text-clay-ink dark:bg-clay-card"
      >
        <ArrowUpDown className="h-3.5 w-3.5" aria-hidden="true" />
        {ACCOUNT_SORT_LABELS[value]}
        <ChevronDown className="hidden h-3.5 w-3.5 text-clay-muted md:block" aria-hidden="true" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-[52px] z-20 w-44 rounded-xl border border-clay-hairline bg-white p-1 shadow-lg dark:bg-clay-card">
          {(Object.keys(ACCOUNT_SORT_LABELS) as AccountSort[]).map((sort) => (
            <button
              key={sort}
              type="button"
              role="menuitemradio"
              aria-checked={sort === value}
              onClick={() => { onChange(sort); setOpen(false); }}
              className={clsx(
                'flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm text-clay-ink',
                sort === value ? 'bg-clay-lavender/20' : 'hover:bg-clay-surface',
              )}
            >
              {ACCOUNT_SORT_LABELS[sort]}
              {sort === value && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
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
  // Read on the client only; the list renders after the CRM data loads, never on the server.
  const [sort, setSortState] = useState<AccountSort>(() => (typeof window === 'undefined' ? 'name' : savedSort()));
  const setSort = (next: AccountSort) => {
    setSortState(next);
    try { window.localStorage.setItem(SORT_KEY, next); } catch { /* private window: the choice lasts this visit */ }
  };
  // /companies?company=<id> opens that account (links from This week and Prospect Review).
  const [selectedCompany, setSelectedCompany] = useQuerySelection('company');
  const [selectedContact, setSelectedContact] = useState<string | null>(null);
  // /companies?add=<link> opens New account with that link read in. A link shared to the
  // installed app from a phone arrives the same way (manifest share_target: link / text).
  const params = useSearchParams();
  const sharedLink = linkInText(params.get('add')) ?? linkInText(params.get('link')) ?? linkInText(params.get('text'));
  const [modalChoice, setIsModalOpen] = useState<boolean | null>(null);
  const isModalOpen = modalChoice ?? Boolean(sharedLink);

  const { companies: dbCompanies, contacts: dbContacts, deals: dbDeals, meetings = [], loading, refresh, createCompany, createContact } = useCrm();
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

  // Proposals waiting for Pat per account, and logos found on their sites. Extras: if either
  // fails to load, rows show without it.
  const [waitingByCompany, setWaitingByCompany] = useState<Map<string, number>>(new Map());
  const [logoProposals, setLogoProposals] = useState<Set<string>>(new Set());
  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([crm.getPendingProposals(), crm.getLogoProposals()]).then(([waitingResult, logoResult]) => {
      if (cancelled) return;
      if (waitingResult.status === 'fulfilled') {
        const counts = new Map<string, number>();
        for (const p of waitingResult.value) if (p.company_id) counts.set(p.company_id, (counts.get(p.company_id) ?? 0) + 1);
        setWaitingByCompany(counts);
      }
      if (logoResult.status === 'fulfilled') setLogoProposals(new Set(logoResult.value.keys()));
    });
    return () => { cancelled = true; };
  }, [dbCompanies]);

  const followUps = useMemo(() => nextFollowUps(deals), [deals]);
  const touches = useMemo(() => lastTouches(companies, contacts, meetings), [companies, contacts, meetings]);

  const q = search.trim().toLowerCase();

  // An account matches on its own fields or on any of its people.
  const { filtered, matchedPeople } = useMemo(() => {
    const matchedPeople = new Map<string, Contact[]>();
    const matching = !q ? companies : companies.filter((c) => {
      const matches = (contactsByCompany.get(c.id) ?? []).filter((contact) => contactMatches(contact, q));
      const people = matches.filter((contact) => !isCompanyRoute(contact));
      if (people.length) matchedPeople.set(c.id, people);
      return (
        matches.length > 0 ||
        c.name.toLowerCase().includes(q) ||
        Boolean(c.industry?.toLowerCase().includes(q)) ||
        Boolean(c.what_they_make?.toLowerCase().includes(q)) ||
        c.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
    return { filtered: sortAccounts(matching, sort, followUps, touches), matchedPeople };
  }, [companies, contactsByCompany, q, sort, followUps, touches]);

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

  // Phone: name over what they make, the date over the status chip. Desktop: one 44px line.
  const renderRow = (company: Company, showStatus: boolean) => {
    const people = matchedPeople.get(company.id);
    const makes = company.what_they_make?.trim() || company.industry?.trim() || '';
    const when = rowWhen(sort, followUps.get(company.id), touches.get(company.id), todayKey);
    const logoWaiting = !company.logo_url && logoProposals.has(company.id);
    const waiting = (waitingByCompany.get(company.id) ?? 0) + (logoWaiting ? 1 : 0);
    const waitingLabel = logoWaiting && waiting === 1 ? 'Logo to review' : `${waiting} to review`;
    const status = STATUS_CHIP[company.status] ?? STATUS_CHIP.prospect;
    return (
      <button
        key={company.id}
        type="button"
        onClick={() => setSelectedCompany(company.id)}
        className={clsx(
          'grid w-full cursor-pointer items-center gap-x-2.5 px-3 py-2 text-left hover:bg-clay-surface active:bg-clay-surface',
          'grid-cols-[36px_minmax(0,1fr)_auto] md:h-11 md:gap-x-3 md:py-0',
          showStatus
            ? 'md:grid-cols-[32px_minmax(0,1.35fr)_minmax(0,1fr)_8.5rem_5.75rem]'
            : 'md:grid-cols-[32px_minmax(0,1.35fr)_minmax(0,1fr)_8.5rem]',
        )}
      >
        <CompanyLogo src={company.logo_url} name={company.name} id={company.id} size={36} className="md:h-8! md:w-8!" />
        <span className="flex min-w-0 flex-col gap-0.5 md:contents">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-sm font-medium text-clay-ink">{company.name}</span>
            {waiting > 0 && (
              <span className="shrink-0 rounded-md bg-clay-warning/20 px-1.5 py-px text-[10.5px] font-medium text-clay-warning-strong dark:text-clay-ochre">
                {waitingLabel}
              </span>
            )}
          </span>
          {people ? (
            <span className="flex min-w-0 items-center gap-1 text-xs text-clay-lavender md:text-[13px]">
              <User className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{people.map((p) => p.name).join(', ')}</span>
            </span>
          ) : (
            <span className="truncate text-xs text-clay-muted md:text-[13px]">{makes}</span>
          )}
        </span>
        <span className="flex flex-col items-end gap-1 md:contents">
          <span className={clsx('whitespace-nowrap text-xs md:text-[12.5px]', when && WHEN_TONE[when.tone])} title={when?.date}>
            {when && <><span className="md:hidden">{when.short}</span><span className="hidden md:inline">{when.text}</span></>}
          </span>
          {showStatus && (
            <span className={clsx('justify-self-start whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-medium', status.className)}>
              {status.label}
            </span>
          )}
        </span>
      </button>
    );
  };

  const list = (items: Company[], showStatus: boolean) => (
    <div className="divide-y divide-clay-hairline overflow-hidden rounded-xl border border-clay-hairline bg-white dark:bg-clay-card">
      {items.map((company) => renderRow(company, showStatus))}
    </div>
  );

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

      <div className="flex items-center gap-2 mb-3">
        <div className="flex-1 relative min-w-0">
          <Search className="w-4 h-4 text-clay-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search accounts or people…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-3 bg-white dark:bg-clay-card border border-clay-hairline rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-clay-ink"
          />
        </div>
        <div className="hidden md:flex bg-clay-card rounded-lg p-0.5">
          <button onClick={() => setView('all')} className={clsx('px-3 py-2 text-xs font-medium rounded-md', view === 'all' ? 'bg-clay-ink text-clay-canvas' : 'text-clay-muted')}>All</button>
          <button onClick={() => setView('by_status')} className={clsx('px-3 py-2 text-xs font-medium rounded-md', view === 'by_status' ? 'bg-clay-ink text-clay-canvas' : 'text-clay-muted')}>Status</button>
        </div>
        <SortMenu value={sort} onChange={setSort} />
      </div>

      {/* Pairs that look like one business entered twice; out of the way while searching. */}
      {!q && <DuplicateReview companies={companies} contacts={contacts} onOpenCompany={setSelectedCompany} />}

      {view === 'by_status' ? (
        <div className="space-y-4">
          {Object.entries(groupedByStatus).map(([status, items]) => (
            <div key={status}>
              <h3 className="text-sm font-semibold text-clay-ink mb-2">{COMPANY_STATUS_LABELS[status as keyof typeof COMPANY_STATUS_LABELS] || status} ({items.length})</h3>
              {list(items, false)}
            </div>
          ))}
        </div>
      ) : filtered.length > 0 && list(filtered, true)}

      {peopleWithoutAccount.length > 0 && (
        <section className="mt-6">
          <h3 className="text-sm font-semibold text-clay-ink mb-2">People without an account ({peopleWithoutAccount.length})</h3>
          <div className="divide-y divide-clay-hairline overflow-hidden rounded-xl border border-clay-hairline bg-white dark:bg-clay-card">
            {peopleWithoutAccount.map((contact) => (
              <button
                key={contact.id}
                type="button"
                onClick={() => setSelectedContact(contact.id)}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-clay-surface active:bg-clay-surface md:h-11 md:gap-3 md:py-0"
              >
                <EntityAvatar kind="person" name={contact.name} id={contact.id} size={32} className="flex-shrink-0" />
                <span className="min-w-0 flex-1 md:flex md:items-center md:gap-3">
                  <span className="block truncate text-sm font-medium text-clay-ink md:w-1/2 md:flex-none">{contact.name}</span>
                  <span className="block truncate text-xs text-clay-muted md:text-[13px]">{contact.job_title || contact.email || ''}</span>
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
          onOpenCompany={setSelectedCompany}
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
