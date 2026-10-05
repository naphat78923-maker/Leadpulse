'use client';

// ─── Deal panel: draft a message ───
// A starting draft built from the account's segment (its likely problem), the product and
// the contact's name. Pat edits it, copies it or opens his mail app, sends it himself, then
// logs it in one tap. Nothing is sent from here.

import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Copy, Mail, Phone } from 'lucide-react';
import type { Company, Contact, Deal } from '@/types/crm';
import { useToast } from '@/components/ToastProvider';
import { isCompanyRoute } from '@/utils/contact-identity';
import { getWorkflowAction } from '@/utils/deal-workflow';
import {
  TEMPLATE_LABEL,
  buildDraft,
  defaultTemplateKind,
  segmentPainFor,
  type DraftLanguage,
  type TemplateKind,
} from '@/utils/message-templates';

export type DraftChannel = 'email' | 'dm' | 'call';

const KINDS: TemplateKind[] = ['first_outreach', 'sample_followup', 'check_in'];

const chip = (selected: boolean) => clsx(
  'inline-flex h-8 items-center rounded-lg border px-2.5 text-xs transition-colors',
  selected ? 'border-clay-lavender/60 bg-clay-lavender/20 text-clay-ink' : 'border-clay-hairline text-clay-body hover:border-clay-ink/30',
);
const action = 'inline-flex h-9 items-center gap-1.5 rounded-lg border border-clay-hairline px-3 text-xs font-medium text-clay-ink transition-transform duration-150 ease-out hover:border-clay-lavender active:scale-[0.97]';

export default function MessageDraft({
  deal,
  company,
  contacts,
  onLog,
}: {
  deal: Deal;
  company?: Company;
  /** every contact; the deal's people and the account's channels are picked from it */
  contacts: Contact[];
  /** open the log form for this deal, set to the channel used and titled after the draft */
  onLog: (channel: DraftChannel, title: string) => void;
}) {
  const { addToast } = useToast();

  // Who the message goes to: a person on the deal if there is one; channels may come from
  // the account's routes (info@, front desk) when the person has none.
  const { person, email, phone } = useMemo(() => {
    const onDeal = contacts.filter(c => (deal.contact_ids ?? []).includes(c.id));
    const atCompany = company ? contacts.filter(c => c.company_id === company.id) : [];
    const person = onDeal.find(c => !isCompanyRoute(c)) ?? null;
    const pool = [...(person ? [person] : []), ...onDeal, ...atCompany];
    return {
      person,
      email: pool.find(c => c.email?.trim())?.email?.trim() ?? null,
      phone: pool.find(c => c.phone?.trim())?.phone?.trim() ?? null,
    };
  }, [contacts, deal.contact_ids, company]);

  const pain = useMemo(() => segmentPainFor(company), [company]);
  const [kind, setKind] = useState<TemplateKind>(() => defaultTemplateKind({ lane: getWorkflowAction(deal), companyStatus: company?.status }));
  const [language, setLanguage] = useState<DraftLanguage>(person?.outreach_language === 'thai' ? 'thai' : 'english');
  // null = show the generated draft; a string = Pat's edit, kept until he switches template or language.
  const [edited, setEdited] = useState<string | null>(null);

  const draft = useMemo(
    () => buildDraft({ kind, language, companyName: company?.name ?? deal.client ?? '', contactName: person?.name, product: deal.product, pain }),
    [kind, language, company, deal.client, deal.product, person, pain],
  );
  const body = edited ?? draft.body;
  const title = `${TEMPLATE_LABEL[kind]} message sent`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(body);
      addToast('Draft copied');
    } catch {
      addToast('Could not copy. Select the text and copy it by hand.', 'error');
    }
  };

  return (
    <div className="space-y-3" data-testid="message-draft">
      <p className="text-xs text-clay-muted">
        <span className="font-medium text-clay-body">{pain.segment}:</span> {pain.pain}
      </p>

      <div className="flex flex-wrap items-center gap-1.5">
        <div role="radiogroup" aria-label="Message type" className="flex flex-wrap gap-1.5">
          {KINDS.map(k => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => { setKind(k); setEdited(null); }} className={chip(kind === k)}>
              {TEMPLATE_LABEL[k]}
            </button>
          ))}
        </div>
        <div role="radiogroup" aria-label="Language" className="ml-auto flex gap-1.5">
          {(['english', 'thai'] as const).map(l => (
            <button key={l} type="button" role="radio" aria-checked={language === l} onClick={() => { setLanguage(l); setEdited(null); }} className={chip(language === l)}>
              {l === 'english' ? 'EN' : 'ไทย'}
            </button>
          ))}
        </div>
      </div>

      <textarea
        aria-label="Message draft"
        value={body}
        onChange={event => setEdited(event.target.value)}
        rows={9}
        className="w-full resize-y rounded-xl border border-clay-hairline bg-transparent px-3.5 py-3 text-sm leading-relaxed text-clay-ink focus:border-clay-ink/40 focus:outline-none focus:ring-2 focus:ring-clay-ink/10"
      />

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void copy()} className={action}>
          <Copy className="h-3.5 w-3.5" /> Copy
        </button>
        {email && (
          <a href={`mailto:${email}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(body)}`} className={action} aria-label={`Open an email to ${email}`}>
            <Mail className="h-3.5 w-3.5" /> Email
          </a>
        )}
        {phone && (
          <a href={`tel:${phone.replace(/[^+\d]/g, '')}`} className={action} aria-label={`Call ${phone}`}>
            <Phone className="h-3.5 w-3.5" /> Call
          </a>
        )}
        <button
          type="button"
          onClick={() => onLog(email ? 'email' : 'dm', title)}
          className="ml-auto inline-flex h-9 items-center rounded-lg bg-clay-ink px-3.5 text-xs font-medium text-clay-canvas transition-transform duration-150 ease-out hover:opacity-90 active:scale-[0.97]"
        >
          Sent it, log
        </button>
      </div>
      <p className="text-[11px] text-clay-muted">Nothing is sent from here. Copy the draft or open your mail app, send it yourself, then log it.</p>
    </div>
  );
}
