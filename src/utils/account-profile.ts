// ─── Account profile: Laya's fit grade and where each saved value came from ───
// Pure. Loading lives in lib/crm.ts; the panel is CompanyDetail.

import { FIT_THRESHOLD } from './prospectFit.ts';
import { LAYA_PUBLISHED_ARCHETYPES, type LayaPublishedArchetype } from './laya-buyer-response.ts';
import { deriveMapStatus } from './stakeholder-map.ts';

/** Long label for the grade bars, short label for chips. */
export const FIT_LABELS: Record<LayaPublishedArchetype, { long: string; short: string }> = {
  bakery_patisserie_brands: { long: 'Bakery, patisserie', short: 'Bakery' },
  modern_trade_specialty_retail: { long: 'Grocery', short: 'Grocery' },
  plant_based_restaurant_cafe: { long: 'Plant-based café', short: 'Plant-based café' },
};

export interface CompanyFit {
  /** fit Noul per published archetype, highest first */
  grades: { archetype: LayaPublishedArchetype; noul: number }[];
  best: { archetype: LayaPublishedArchetype; noul: number };
  fits: boolean;
  judgedAt: string;
}

/** Laya's saved fit answers as grades, or null when any published archetype is missing. */
export function fitFromAnswers(
  answers: Record<string, { noul?: unknown }> | null | undefined,
  judgedAt: string,
): CompanyFit | null {
  if (!answers) return null;
  const grades: CompanyFit['grades'] = [];
  for (const archetype of LAYA_PUBLISHED_ARCHETYPES as LayaPublishedArchetype[]) {
    const noul = answers[`fit_${archetype}`]?.noul;
    if (typeof noul !== 'number' || !Number.isFinite(noul) || noul < 0 || noul > 1) return null;
    grades.push({ archetype, noul });
  }
  grades.sort((a, b) => b.noul - a.noul);
  return { grades, best: grades[0], fits: grades[0].noul >= FIT_THRESHOLD, judgedAt };
}

export const percent = (noul: number) => `${Math.round(noul * 100)}%`;

/** "Bakery 65%" for a fit, "No fit" otherwise. */
export function fitChipLabel(fit: CompanyFit): string {
  return fit.fits ? `${FIT_LABELS[fit.best.archetype].short} ${percent(fit.best.noul)}` : 'No fit';
}

export interface EvidenceRow {
  entity_type: 'company' | 'contact';
  entity_id: string | null;
  field: string;
  value: string;
  source_url: string;
  source_tier: 'own_site' | 'official_social' | 'official_listing' | 'third_party' | 'press';
  quote: string;
  recorded_at: string;
}

const TIER_SHORT: Record<EvidenceRow['source_tier'], string> = {
  own_site: 'own site',
  official_social: 'official social',
  official_listing: 'official listing',
  press: 'press',
  third_party: 'third party',
};

const same = (a: string | null | undefined, b: string | null | undefined) =>
  (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();

/**
 * The newest applied source for each saved value, keyed "<entity>:<id>:<field>". A source is
 * shown only while the field still holds the value it supports: once Pat edits the field, the
 * old source no longer describes it and its chip disappears.
 */
export function sourcesFor(rows: readonly EvidenceRow[]) {
  const latest = new Map<string, EvidenceRow>();
  for (const row of rows) {
    if (!row.entity_id) continue;
    const key = `${row.entity_type}:${row.entity_id}:${row.field}`;
    const seen = latest.get(key);
    if (!seen || row.recorded_at > seen.recorded_at) latest.set(key, row);
  }
  return (entity: 'company' | 'contact', id: string, field: string, current: string | null | undefined): EvidenceRow | null => {
    const row = latest.get(`${entity}:${id}:${field}`);
    return row && current && same(row.value, current) ? row : null;
  };
}

/** "own site · 14 Oct" in Bangkok time. */
export function sourceChipLabel(row: Pick<EvidenceRow, 'source_tier' | 'recorded_at'>): string {
  const date = new Date(row.recorded_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok' });
  return `${TIER_SHORT[row.source_tier]} · ${date}`;
}

/** "gateauxhouse.co.th/contactus" from a source URL. */
/** "alicebakery.co.th" from a saved website, with or without https://; null when there is none. */
export function siteHost(website: string | null | undefined): string | null {
  const raw = website?.trim();
  if (!raw) return null;
  try {
    return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}

export function shortUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname.replace(/^www\./, '')}${parsed.pathname.replace(/\/$/, '')}`;
  } catch {
    return url;
  }
}

// ─── Panel layout helpers ───

interface PanelDeal {
  id: string;
  title: string;
  product?: string | null;
  stage: string;
  followup_date: string | null;
  next_action: string | null;
  workflow_action?: string | null;
}

const CLOSED_STAGES = new Set(['closed_won', 'closed_lost']);

/** Open deals, soonest follow-up first (undated last). */
export function openDeals<T extends PanelDeal>(deals: readonly T[]): T[] {
  return deals
    .filter((d) => !CLOSED_STAGES.has(d.stage) && d.workflow_action !== 'parked')
    .slice()
    .sort((a, b) => (a.followup_date ?? '9999').localeCompare(b.followup_date ?? '9999') || a.title.localeCompare(b.title));
}

/** The one thing to do next on this account: the soonest dated follow-up on an open deal. */
export function nextStep<T extends PanelDeal>(deals: readonly T[], today: string): { deal: T; date: string; overdueDays: number } | null {
  const dated = openDeals(deals).filter((d) => d.followup_date && /^\d{4}-\d{2}-\d{2}/.test(d.followup_date));
  if (dated.length === 0) return null;
  const deal = dated[0];
  const date = deal.followup_date!.slice(0, 10);
  const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86_400_000);
  return { deal, date, overdueDays: Math.max(0, days) };
}

/**
 * Notes as Pat wrote them: the enrichment job's "[ROUTE UPDATE <date>]" paragraphs are dropped
 * (the source chips now say where a route came from). Nothing is changed in the database.
 */
export function readableNotes(notes: string | null | undefined): string {
  if (!notes) return '';
  return notes
    .split(/\n\s*\n/)
    .filter((para) => !/^\s*\[ROUTE UPDATE [^\]]*\]/.test(para))
    .join('\n\n')
    .replace(/\s*\[ROUTE UPDATE [^\]]*\][^\n]*(\n(?!\n)[^\n]*)*/g, '')
    .trim();
}

/** "Butter" for the deal "GALLOTHAI CO., LTD. / Bakery House — Butter" on that account's panel:
 *  the account name is already the heading. Other titles are left as they are. */
export function dealLabel(title: string, companyName: string): string {
  const t = (title ?? '').trim();
  const name = (companyName ?? '').trim();
  if (!name || !t.toLowerCase().startsWith(name.toLowerCase())) return t;
  const rest = t.slice(name.length).replace(/^\s*[—–:|-]\s*/, '').trim();
  return rest || t;
}

// ─── Roles on people (replaces the "Who must say yes" diagram) ───


export type PersonRole = 'decides' | 'champion' | 'blocker';

export const ROLE_LABELS: Record<PersonRole, string> = { decides: 'Decides', champion: 'Champion', blocker: 'Blocker' };

const ROLE_FIELD = {
  decides: 'decision_maker_contact_id',
  champion: 'champion_contact_id',
  blocker: 'blocker_contact_id',
} as const;

type RoleCompany = {
  decision_maker_contact_id?: string | null;
  champion_contact_id?: string | null;
  blocker_contact_id?: string | null;
  blocker_label?: string | null;
  map_status?: 'unknown' | 'partial' | 'complete';
};

/** The role a person holds on this account, if any. */
export function roleOf(company: RoleCompany, contactId: string): PersonRole | null {
  for (const role of Object.keys(ROLE_FIELD) as PersonRole[]) {
    if (company[ROLE_FIELD[role]] === contactId) return role;
  }
  return null;
}

/** The change that gives this person this role (or none): one role per person, one person per
 *  role, and the map status recomputed as the old map did. A blocker contact replaces a note. */
export function rolePatch(company: RoleCompany, contactId: string, role: PersonRole | null): RoleCompany {
  const patch: RoleCompany = {};
  for (const r of Object.keys(ROLE_FIELD) as PersonRole[]) {
    if (company[ROLE_FIELD[r]] === contactId && r !== role) patch[ROLE_FIELD[r]] = null;
  }
  if (role) patch[ROLE_FIELD[role]] = contactId;
  if (role === 'blocker') patch.blocker_label = null;
  patch.map_status = deriveMapStatus({ ...company, ...patch } as Parameters<typeof deriveMapStatus>[0]);
  return patch;
}

// Who usually decides, strongest first: owners and founders, then directors and GMs, then
// purchasing, then the head of the kitchen.
const DECIDING_ROLES: RegExp[] = [
  /owner|founder|เจ้าของ|ผู้ก่อตั้ง/i,
  /\bceo\b|managing director|general manager|\bgm\b|director|กรรมการ|ผู้จัดการ/i,
  /purchas|procure|\bbuyer\b|จัดซื้อ/i,
  /head chef|executive chef|chef[- ]owner/i,
];

/** The person most likely to decide, by published role, when nobody is set to decide yet. */
export function suggestDecider<T extends { id: string; job_title?: string | null }>(company: RoleCompany, people: readonly T[]): T | null {
  if (company.decision_maker_contact_id) return null;
  for (const rank of DECIDING_ROLES) {
    const match = people.find((p) => rank.test(p.job_title ?? ''));
    if (match) return match;
  }
  return null;
}
