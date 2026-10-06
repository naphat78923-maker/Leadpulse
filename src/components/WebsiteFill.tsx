'use client';

// "Fill from website" on an account: reads the account's own site and offers only the
// details the account does not hold yet. Nothing changes until "Add" is pressed.

import { useState } from 'react';
import { Image as ImageIcon, Loader2, Mail, MapPin, MessageCircle, Phone, Sparkles, AtSign, type LucideIcon } from 'lucide-react';
import type { Company, Contact } from '@/types/crm';
import * as crm from '@/lib/crm';
import { useCrm } from '@/components/CrmProvider';
import { useToast } from '@/components/ToastProvider';
import { fetchLead } from '@/components/LinkFill';
import { applyMissing, missingDetails, routeContact, type MissingDetail, type MissingKey } from '@/utils/lead-apply';
import type { PageLead } from '@/utils/page-extract';

const ICON: Record<MissingKey, LucideIcon> = {
  address: MapPin, logo: ImageIcon, email: Mail, phone: Phone, line: MessageCircle, instagram: AtSign, facebook: AtSign,
};

const button = 'inline-flex items-center gap-1.5 rounded-lg border border-clay-hairline px-3 py-2 text-xs font-medium transition-colors';

export default function WebsiteFill({ company, companyContacts, onSaved }: { company: Company; companyContacts: Contact[]; onSaved: () => void }) {
  const { createContact, refresh } = useCrm();
  const { addToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [found, setFound] = useState<{ lead: PageLead; missing: MissingDetail[] } | null>(null);

  if (!company.website?.trim()) return null;

  const look = async () => {
    setBusy(true);
    setNote(null);
    setFound(null);
    try {
      const lead = await fetchLead(company.website!.trim());
      const missing = missingDetails(company, companyContacts, lead);
      if (missing.length === 0) setNote('Nothing new on their website.');
      else setFound({ lead, missing });
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'That page could not be read.');
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    if (!found) return;
    setBusy(true);
    try {
      const { companyPatch, route } = applyMissing(company, found.lead, found.missing);
      if (Object.keys(companyPatch).length > 0) await crm.updateCompany(company.id, companyPatch);
      if (route) await createContact(routeContact(company.id, company.name, route));
      else await refresh();
      const count = found.missing.length;
      addToast(`Added ${count} ${count === 1 ? 'detail' : 'details'}`);
      setFound(null);
      onSaved();
    } catch (err) {
      setNote(`Could not save: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-4" data-testid="website-fill">
      {!found && (
        <button type="button" onClick={look} disabled={busy} className={`${button} bg-clay-surface text-clay-ink hover:border-clay-lavender`}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />}
          Fill from website
        </button>
      )}
      {note && <p role="status" className="mt-1.5 text-xs text-clay-muted">{note}</p>}
      {found && (
        <div className="rounded-xl border border-clay-hairline p-3">
          <p className="mb-2 text-xs text-clay-muted">
            Found {found.missing.length} {found.missing.length === 1 ? 'detail' : 'details'} this account doesn’t have
          </p>
          <ul className="space-y-1.5">
            {found.missing.map(detail => {
              const Icon = ICON[detail.key];
              return (
                <li key={detail.key} className="flex min-w-0 items-center gap-2 text-sm text-clay-ink">
                  <Icon className="h-3.5 w-3.5 shrink-0 text-clay-muted-soft" aria-hidden="true" />
                  <span className="truncate">{detail.label}</span>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={add} disabled={busy} className={`${button} bg-clay-ink text-clay-canvas`}>
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
              Add {found.missing.length} {found.missing.length === 1 ? 'detail' : 'details'}
            </button>
            <button type="button" onClick={() => setFound(null)} disabled={busy} className={`${button} text-clay-muted`}>Dismiss</button>
          </div>
        </div>
      )}
    </div>
  );
}
