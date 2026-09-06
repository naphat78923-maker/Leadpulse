'use client';

import { useMemo, useState } from 'react';
import { Check, Search, X } from 'lucide-react';
import clsx from 'clsx';
import { Company, Contact } from '@/types/crm';
import EntityAvatar from '@/components/EntityAvatar';

interface ContactPickerProps {
  contacts: Contact[];
  companies: Company[];
  selectedCompanyId?: string;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export default function ContactPicker({ contacts, companies, selectedCompanyId, selectedIds, onChange }: ContactPickerProps) {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);

  const companyName = useMemo(() => {
    const map = new Map(companies.map(c => [c.id, c.name]));
    return (id: string | null) => (id ? map.get(id) || null : null);
  }, [companies]);

  // Contacts without a name render as "-" everywhere else — keep them out of search results.
  const searchable = useMemo(() => contacts.filter(c => (c.name || '').trim().length > 0), [contacts]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = searchable.filter(c => {
      if (!q) return true;
      const company = companyName(c.company_id) || '';
      return [c.name, company, c.email, c.phone, c.phone_second, c.line, c.job_title]
        .some(field => (field || '').toLowerCase().includes(q));
    });
    return matches
      .map(contact => ({ contact, inCompany: !!selectedCompanyId && contact.company_id === selectedCompanyId }))
      .sort((a, b) => {
        if (a.inCompany !== b.inCompany) return a.inCompany ? -1 : 1;
        return a.contact.name.localeCompare(b.contact.name);
      });
  }, [searchable, query, companyName, selectedCompanyId]);

  const selectedContacts = useMemo(
    () => selectedIds.map(id => contacts.find(c => c.id === id)).filter((c): c is Contact => !!c),
    [selectedIds, contacts]
  );

  const toggle = (id: string) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter(v => v !== id) : [...selectedIds, id]);
  };

  return (
    <div>
      <label className="block text-sm font-medium text-clay-body mb-2">Contacts</label>
      {selectedContacts.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {selectedContacts.map(c => (
            <button key={c.id} type="button" onClick={() => toggle(c.id)} className="flex items-center gap-1.5 pl-1.5 pr-2 py-1.5 rounded-lg text-sm font-medium bg-clay-ink text-clay-canvas min-h-[44px]">
              <EntityAvatar kind="person" name={c.name} id={c.id} size={28} interactive={false} />
              {c.name}
              <X className="w-3.5 h-3.5 opacity-70" />
            </button>
          ))}
        </div>
      )}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-clay-muted pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Search contacts by name, company, phone…"
          className="w-full pl-9 pr-3 py-3 border border-clay-hairline rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-clay-ink bg-white dark:bg-clay-card text-clay-ink"
        />
      </div>
      {focused && (
        <div className="mt-2 border border-clay-hairline rounded-lg max-h-52 overflow-y-auto bg-white dark:bg-clay-card">
          {results.map(({ contact, inCompany }) => {
            const selected = selectedIds.includes(contact.id);
            const company = companyName(contact.company_id);
            return (
              <button
                key={contact.id}
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => toggle(contact.id)}
                className={clsx('w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left min-h-[44px] border-b border-clay-hairline/60 last:border-0', selected ? 'bg-clay-surface' : 'active:bg-clay-surface')}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <EntityAvatar kind="person" name={contact.name} id={contact.id} size={32} interactive={false} />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-clay-ink truncate">{contact.name}</span>
                    <span className="block text-xs text-clay-muted truncate">{[company, contact.job_title].filter(Boolean).join(' · ') || 'No company'}</span>
                  </span>
                </span>
                <span className="flex items-center gap-1.5 shrink-0">
                  {inCompany && <span className="text-[10px] font-semibold tracking-wider text-clay-ochre uppercase">Company</span>}
                  {selected && <Check className="w-4 h-4 text-clay-success" />}
                </span>
              </button>
            );
          })}
          {results.length === 0 && <p className="px-3 py-3 text-sm text-clay-muted">No matching contacts.</p>}
        </div>
      )}
    </div>
  );
}
