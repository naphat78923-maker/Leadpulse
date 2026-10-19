// ─── Account profile: Laya's fit grade and where each saved value came from ───
// Pure. Loading lives in lib/crm.ts; the panel is CompanyDetail.

import { FIT_THRESHOLD } from './prospectFit.ts';
import { LAYA_PUBLISHED_ARCHETYPES, type LayaPublishedArchetype } from './laya-buyer-response.ts';

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
export function shortUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname.replace(/^www\./, '')}${parsed.pathname.replace(/\/$/, '')}`;
  } catch {
    return url;
  }
}
