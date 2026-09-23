'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, UserPlus, X } from 'lucide-react';
import clsx from 'clsx';
import type { Company, Contact } from '@/types/crm';
import { useCrm } from '@/components/CrmProvider';
import { useToast } from '@/components/ToastProvider';
import * as crm from '@/lib/crm';
import {
  deriveMapStatus,
  mapStatusLabel,
  type StakeholderRole,
} from '@/utils/stakeholder-map';

interface StakeholderMiniMapProps {
  company: Company;
  companyName?: string;
  productHint?: string | null;
  onUpdated?: () => void;
  compact?: boolean;
}

type PickerTarget = StakeholderRole | null;

function shortName(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 14);
  return `${parts[0]} ${parts[parts.length - 1][0]}.`.slice(0, 16);
}

export default function StakeholderMiniMap({
  company,
  companyName,
  productHint,
  onUpdated,
  compact = false,
}: StakeholderMiniMapProps) {
  const { contacts, refresh } = useCrm();
  const { addToast } = useToast();
  const [picker, setPicker] = useState<PickerTarget>(null);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [blockerTextMode, setBlockerTextMode] = useState(false);
  const [blockerLabelDraft, setBlockerLabelDraft] = useState(company.blocker_label || '');
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setPrefersReducedMotion(mq.matches);
    apply();
    mq.addEventListener?.('change', apply);
    return () => mq.removeEventListener?.('change', apply);
  }, []);

  const companyContacts = useMemo(
    () => contacts.filter(c => c.company_id === company.id && (c.name || '').trim()),
    [contacts, company.id]
  );

  const byId = useMemo(() => new Map(contacts.map(c => [c.id, c])), [contacts]);
  const champion = company.champion_contact_id ? byId.get(company.champion_contact_id) : undefined;
  const dm = company.decision_maker_contact_id ? byId.get(company.decision_maker_contact_id) : undefined;
  const blockerContact = company.blocker_contact_id ? byId.get(company.blocker_contact_id) : undefined;
  const blockerLabel = (company.blocker_label || '').trim();
  const hasBlocker = !!blockerContact || !!blockerLabel;
  const status = deriveMapStatus(company);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = companyContacts.length ? companyContacts : contacts.filter(c => (c.name || '').trim());
    if (!q) return pool.slice(0, 40);
    return pool
      .filter(c =>
        [c.name, c.job_title, c.phone, c.line]
          .some(f => (f || '').toLowerCase().includes(q))
      )
      .slice(0, 40);
  }, [companyContacts, contacts, query]);

  const persist = async (patch: Partial<Company>) => {
    setSaving(true);
    try {
      const next = { ...company, ...patch };
      const map_status = deriveMapStatus(next);
      await crm.updateCompany(company.id, { ...patch, map_status });
      await refresh();
      onUpdated?.();
      addToast('Stakeholder map updated');
    } catch (err: any) {
      console.error(err);
      addToast('Could not update map: ' + (err?.message || 'error'));
    } finally {
      setSaving(false);
    }
  };

  const assignContact = async (role: StakeholderRole, contactId: string | null) => {
    if (role === 'champion') await persist({ champion_contact_id: contactId });
    else if (role === 'decision_maker') await persist({ decision_maker_contact_id: contactId });
    else await persist({ blocker_contact_id: contactId, blocker_label: contactId ? null : company.blocker_label });
    setPicker(null);
    setQuery('');
    setCreating(false);
    setNewName('');
    setBlockerTextMode(false);
  };

  const saveBlockerLabel = async () => {
    const label = blockerLabelDraft.trim() || null;
    await persist({ blocker_label: label, blocker_contact_id: label ? null : company.blocker_contact_id });
    setPicker(null);
    setBlockerTextMode(false);
  };

  const createAndAssign = async (role: StakeholderRole) => {
    const name = newName.trim();
    if (!name) {
      addToast('Name is required (email optional)');
      return;
    }
    setSaving(true);
    try {
      const created = await crm.createContact({
        name,
        email: null,
        phone: null,
        phone_second: null,
        line: null,
        job_title: null,
        company_id: company.id,
        status: 'active',
        notes: null,
        last_contacted_date: null,
      });
      const patch: Partial<Company> =
        role === 'champion'
          ? { champion_contact_id: created.id }
          : role === 'decision_maker'
            ? { decision_maker_contact_id: created.id }
            : { blocker_contact_id: created.id, blocker_label: null };
      const next = { ...company, ...patch };
      await crm.updateCompany(company.id, { ...patch, map_status: deriveMapStatus(next) });
      await refresh();
      onUpdated?.();
      addToast('Contact tagged on map');
      setPicker(null);
      setQuery('');
      setCreating(false);
      setNewName('');
    } catch (err: any) {
      console.error(err);
      addToast('Could not create contact: ' + (err?.message || 'error'));
    } finally {
      setSaving(false);
    }
  };

  const openPicker = (role: StakeholderRole) => {
    setPicker(role);
    setQuery('');
    setCreating(false);
    setNewName('');
    setBlockerTextMode(false);
    setBlockerLabelDraft(company.blocker_label || '');
  };

  const title = companyName || company.name;
  const subtitle = productHint ? `${title} · ${productHint}` : title;

  return (
    <section
      className={clsx(
        'rounded-xl border border-clay-hairline bg-gradient-to-b from-[#fbf8f1] to-[#f0e8da] dark:from-clay-surface dark:to-clay-card p-3',
        compact && 'p-2.5'
      )}
      data-stakeholder-minimap
      aria-label="Who must say yes"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <h3 className="text-base font-bold tracking-tight text-clay-ink">Who must say yes</h3>
          <p className="text-[10px] font-semibold tracking-wider text-clay-muted uppercase mt-1 truncate">{subtitle}</p>
        </div>
      </div>

      <div className="relative">
        <svg viewBox="0 0 640 200" className="w-full h-auto block" role="img" aria-label="Stakeholder map">
          <style>{`
            .sm-edge { fill: none; stroke: #57534e; stroke-width: 2.5; stroke-dasharray: 5 7; }
            .sm-edge-strong { stroke: #14532d; stroke-dasharray: 4 6; stroke-width: 2.75; }
            .sm-edge-block { stroke: #991b1b; stroke-dasharray: 3 6; stroke-width: 2.5; }
            @media (prefers-reduced-motion: no-preference) {
              .sm-edge { animation: sm-dash 1.5s linear infinite; }
              @keyframes sm-dash { to { stroke-dashoffset: -24; } }
            }
            @media (prefers-reduced-motion: reduce) {
              .sm-edge { animation: none; }
            }
          `}</style>
          <defs>
            <marker id="sm-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0 L10 5 L0 10 z" fill="#14532d" />
            </marker>
            <marker id="sm-arrow-muted" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0 L10 5 L0 10 z" fill="#57534e" />
            </marker>
            <marker id="sm-arrow-block" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0 L10 5 L0 10 z" fill="#991b1b" />
            </marker>
          </defs>

          {/* champion → DM influence */}
          <path
            className={clsx('sm-edge', champion && 'sm-edge-strong')}
            d="M180 110 C210 110, 230 110, 250 110"
            markerEnd={champion ? 'url(#sm-arrow)' : 'url(#sm-arrow-muted)'}
          />
          {/* blocker → DM friction (dashed red when set) */}
          <path
            className={clsx('sm-edge', hasBlocker && 'sm-edge-block')}
            d="M460 60 C420 55, 360 90, 340 100"
            opacity={hasBlocker ? 1 : 0.35}
            markerEnd={hasBlocker ? 'url(#sm-arrow-block)' : 'url(#sm-arrow-muted)'}
          />

          {/* Champion node */}
          <rect
            x="40" y="78" width="140" height="64" rx="16"
            className={champion ? 'fill-white stroke-[#d6d3d1]' : 'fill-[#fff7ed] stroke-[#fdba74]'}
            strokeWidth="1.5"
            strokeDasharray={champion ? undefined : '4 3'}
          />
          <text x="58" y="102" fontSize="11" fontWeight="800" fill="#78716c">CHAMPION</text>
          <text x="58" y="122" fontSize="14" fontWeight="800" fill="#1c1917">
            {champion ? shortName(champion.name) : 'Add champion'}
          </text>

          {/* DM node — dark when empty */}
          {!dm && (
            <circle cx="320" cy="110" r="28" fill="rgba(28,25,23,.08)">
              {!prefersReducedMotion && (
                <animate attributeName="r" values="24;30;24" dur="2s" repeatCount="indefinite" />
              )}
            </circle>
          )}
          <rect
            x="250" y="78" width="140" height="64" rx="16"
            fill={dm ? '#fff' : '#1c1917'}
            stroke={dm ? '#d6d3d1' : '#1c1917'}
            strokeWidth="1.5"
          />
          <text x="268" y="102" fontSize="11" fontWeight="800" fill={dm ? '#78716c' : '#a8a29e'}>DECISION MAKER</text>
          <text x="268" y="122" fontSize="14" fontWeight="800" fill={dm ? '#1c1917' : '#fff'}>
            {dm ? shortName(dm.name) : 'DM unknown'}
          </text>

          {/* Blocker node */}
          <rect
            x="460" y="28" width="140" height="64" rx="16"
            className={hasBlocker ? 'fill-white stroke-[#d6d3d1]' : 'fill-white/60 stroke-[#e7e0d4]'}
            strokeWidth="1.5"
            strokeDasharray={hasBlocker ? undefined : '4 3'}
          />
          <text x="478" y="52" fontSize="11" fontWeight="800" fill="#78716c">BLOCKER</text>
          <text x="478" y="72" fontSize="13" fontWeight="800" fill="#1c1917">
            {blockerContact
              ? shortName(blockerContact.name)
              : blockerLabel
                ? blockerLabel.slice(0, 14)
                : 'Add blocker'}
          </text>
        </svg>
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => openPicker('decision_maker')}
          disabled={saving}
          className={clsx(
            'rounded-full px-3 py-2 text-xs font-extrabold min-h-[40px]',
            !dm
              ? 'bg-clay-ink text-clay-canvas border border-clay-ink'
              : 'bg-white dark:bg-clay-card border border-clay-hairline text-clay-body'
          )}
        >
          {dm ? 'Change DM' : 'Tag decision maker'}
        </button>
        <button
          type="button"
          onClick={() => openPicker('champion')}
          disabled={saving}
          className="rounded-full px-3 py-2 text-xs font-extrabold min-h-[40px] bg-white dark:bg-clay-card border border-clay-hairline text-clay-body"
        >
          {champion ? 'Change champion' : 'Add champion'}
        </button>
        <button
          type="button"
          onClick={() => openPicker('blocker')}
          disabled={saving}
          className="rounded-full px-3 py-2 text-xs font-extrabold min-h-[40px] bg-white dark:bg-clay-card border border-clay-hairline text-clay-muted"
        >
          {hasBlocker ? 'Edit blocker' : 'Add blocker'}
        </button>
        <span
          className={clsx(
            'rounded-full px-3 py-2 text-xs font-extrabold min-h-[40px] inline-flex items-center border',
            status === 'complete'
              ? 'border-clay-mint/50 bg-clay-mint/15 text-clay-teal'
              : status === 'partial'
                ? 'border-clay-hairline bg-white dark:bg-clay-card text-clay-body'
                : 'border-clay-hairline/70 bg-transparent text-clay-muted font-semibold'
          )}
        >
          Map status: {mapStatusLabel(status)}
        </span>
        {saving && <Loader2 className="w-4 h-4 animate-spin text-clay-muted self-center" />}
      </div>

      <div className="mt-2 flex flex-wrap gap-3 text-[11px] font-semibold text-[#57534e]">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-[#166534]" aria-hidden />
          Active path
        </span>
        <span className="inline-flex items-center gap-1.5 text-[#b91c1c]">
          <span className="inline-block w-2 h-2 rounded-full bg-[#b91c1c]" aria-hidden />
          Blocker
        </span>
        <span className="inline-flex items-center gap-1.5 text-[#b45309]">
          <span className="inline-block w-2 h-2 rounded-full border-2 border-[#b45309] bg-transparent" aria-hidden />
          Unknown
        </span>
      </div>

      {picker && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-end md:items-center justify-center p-0 md:p-4" onClick={() => setPicker(null)}>
          <div
            className="bg-white dark:bg-clay-card w-full md:max-w-sm md:rounded-2xl rounded-t-2xl p-4 max-h-[70vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-clay-ink">
                {picker === 'decision_maker' && 'Tag decision maker'}
                {picker === 'champion' && 'Add champion'}
                {picker === 'blocker' && 'Map blocker'}
              </h3>
              <button type="button" onClick={() => setPicker(null)} className="p-2 text-clay-muted" aria-label="Close picker">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[11px] text-clay-muted mb-2">
              Contacts at {company.name}. Email not required.
            </p>

            {picker === 'blocker' && (
              <div className="mb-3 space-y-2">
                <button
                  type="button"
                  onClick={() => setBlockerTextMode(v => !v)}
                  className="text-xs font-semibold text-clay-ochre underline"
                >
                  {blockerTextMode ? 'Pick a contact instead' : 'Or use a free-text label (e.g. Procurement)'}
                </button>
                {blockerTextMode && (
                  <div className="flex gap-2">
                    <input
                      value={blockerLabelDraft}
                      onChange={e => setBlockerLabelDraft(e.target.value)}
                      placeholder="Procurement"
                      className="flex-1 px-3 py-2 border border-clay-hairline rounded-lg text-base bg-white dark:bg-clay-card"
                    />
                    <button
                      type="button"
                      onClick={saveBlockerLabel}
                      disabled={saving}
                      className="px-3 py-2 rounded-lg bg-clay-ink text-clay-canvas text-xs font-bold"
                    >
                      Save
                    </button>
                  </div>
                )}
              </div>
            )}

            {!blockerTextMode && (
              <>
                <input
                  type="search"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search contacts…"
                  className="w-full mb-2 px-3 py-2.5 border border-clay-hairline rounded-lg text-base bg-white dark:bg-clay-card"
                  autoFocus
                />
                <div className="border border-clay-hairline rounded-lg max-h-48 overflow-y-auto mb-3">
                  {filtered.length === 0 && (
                    <p className="px-3 py-3 text-xs text-clay-muted">No contacts yet — create one below.</p>
                  )}
                  {filtered.map((c: Contact) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => assignContact(picker, c.id)}
                      className="w-full text-left px-3 py-2.5 border-b border-clay-hairline/60 last:border-0 min-h-[44px] active:bg-clay-surface"
                    >
                      <span className="block text-sm font-medium text-clay-ink">{c.name}</span>
                      <span className="block text-xs text-clay-muted">{c.job_title || 'No title'}</span>
                    </button>
                  ))}
                </div>

                {(company.champion_contact_id && picker === 'champion') ||
                (company.decision_maker_contact_id && picker === 'decision_maker') ||
                (company.blocker_contact_id && picker === 'blocker') ? (
                  <button
                    type="button"
                    onClick={() => assignContact(picker, null)}
                    className="w-full mb-2 text-xs font-semibold text-clay-error py-2"
                  >
                    Clear {picker === 'decision_maker' ? 'decision maker' : picker}
                  </button>
                ) : null}

                {!creating ? (
                  <button
                    type="button"
                    onClick={() => setCreating(true)}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-dashed border-clay-hairline text-xs font-bold text-clay-body"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    Create contact for this company
                  </button>
                ) : (
                  <div className="space-y-2">
                    <input
                      value={newName}
                      onChange={e => setNewName(e.target.value)}
                      placeholder="Name *"
                      className="w-full px-3 py-2 border border-clay-hairline rounded-lg text-base bg-white dark:bg-clay-card"
                    />
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => createAndAssign(picker)}
                      className="w-full clay-btn-primary py-2.5 text-sm font-bold"
                    >
                      {saving ? 'Saving…' : 'Create & tag'}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
