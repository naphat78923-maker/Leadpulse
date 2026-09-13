// ─── LeadPulse Intelligence — Slice 1: company role taxonomy (v1) ───
//
// ONE classifier, ONE taxonomy. This module is the single source of truth for
// "what kind of business is this company". It replaces the render-time regex
// guess that lived in src/app/retention/page.tsx (whose `hotel` alternative in
// the restaurant branch was unreachable) and the ad-hoc `other` default on
// AccountType in src/utils/accountHealth.ts.
//
// Rules of this module:
// - PURE: no Supabase, no network, no LLM, no runtime imports. Node can execute
//   it directly via type stripping, which is how scripts/company-role-report.ts
//   classifies the live corpus.
// - Every classification carries EVIDENCE (which field, which matched text) and
//   a CANDIDATE list, so an ambiguous call can be reviewed instead of trusted.
// - `unknown` is a VALUE with a reason code, never a silent fallback to `other`.
// - The taxonomy is VERSIONED so archetypes and campaigns generated against v1
//   stay interpretable after the taxonomy moves.

import type { AccountType } from './accountHealth.ts';

export const TAXONOMY_VERSION = 'v1';

export type CompanyRole =
  | 'manufacturer'
  | 'brand_owner'
  | 'importer'
  | 'distributor'
  | 'wholesaler'
  | 'modern_trade_retail'
  | 'foodservice_hotel'
  | 'foodservice_restaurant'
  | 'bakery_chain'
  | 'patisserie_chain'
  | 'cloud_kitchen'
  | 'catering'
  | 'unknown';

export type RoleField = 'name' | 'industry' | 'tags';

export type RoleReasonCode =
  | 'identity_match'
  | 'identity_match_ambiguous'
  | 'tag_only_match'
  | 'tag_only_match_ambiguous'
  | 'no_role_match'
  | 'taxonomy_gap'
  | 'pat_override';

/** high = identity match, uncontested. medium = contested identity, or a clean
 *  tag-only match. low = contested tag-only match, no match, or a known gap. */
export type RoleConfidence = 'high' | 'medium' | 'low';

export interface RoleEvidence {
  field: RoleField;
  /** the literal text that triggered the rule, lowercased from the source field */
  matched_text: string;
  /** rule id, stable enough to cite in a review */
  rule: string;
}

export interface RoleCandidate {
  role: CompanyRole;
  rule: string;
  priority: number;
  evidence: RoleEvidence[];
}

export interface RoleClassification {
  role: CompanyRole;
  /** legacy integration point: AccountType drives the retention reorder interval */
  account_type: AccountType;
  taxonomy_version: string;
  confidence: RoleConfidence;
  ambiguous: boolean;
  reason_code: RoleReasonCode;
  /** human-readable, names the field and text that produced the role */
  reason: string;
  evidence: RoleEvidence[];
  candidates: RoleCandidate[];
  source: 'derived' | 'pat_override';
}

export interface ClassifiableCompany {
  name?: string | null;
  industry?: string | null;
  tags?: string[] | null;
}

/** A stored, Pat-confirmed correction. Derived at read time by default; the
 *  override only exists once a human confirms or corrects a company. */
export interface RoleOverride {
  role: CompanyRole;
  note?: string | null;
}

/** Role → label, short segment label, and legacy AccountType. AccountType must keep
 *  covering every role so the retention cadence intervals keep working unchanged.
 *
 *  `segment` is the one-word form used where a row needs a scannable category
 *  (list rows, segment filter). It is a shortening of `label`, never a different
 *  claim: every role keeps its own segment, and `unknown` stays `unknown` rather
 *  than collapsing into a nearby business type. */
export interface RoleTaxonomyEntry {
  /** full label, used wherever the role is being explained */
  label: string;
  /** short segment label for scannable surfaces — same classification, fewer words */
  segment: string;
  account_type: AccountType;
}

export const ROLE_TAXONOMY: Record<CompanyRole, RoleTaxonomyEntry> = {
  manufacturer: { label: 'Manufacturer', segment: 'Manufacturer', account_type: 'other' },
  brand_owner: { label: 'Brand owner', segment: 'Brand owner', account_type: 'other' },
  importer: { label: 'Importer', segment: 'Importer', account_type: 'other' },
  distributor: { label: 'Distributor', segment: 'Distributor', account_type: 'other' },
  wholesaler: { label: 'Wholesaler', segment: 'Wholesaler', account_type: 'other' },
  modern_trade_retail: { label: 'Modern trade / retail', segment: 'Retail', account_type: 'modern_trade' },
  foodservice_hotel: { label: 'Hotel foodservice', segment: 'Hotel', account_type: 'hotel' },
  foodservice_restaurant: { label: 'Restaurant foodservice', segment: 'Restaurant', account_type: 'restaurant' },
  bakery_chain: { label: 'Bakery chain', segment: 'Bakery', account_type: 'bakery' },
  patisserie_chain: { label: 'Patisserie chain', segment: 'Patisserie', account_type: 'bakery' },
  cloud_kitchen: { label: 'Cloud kitchen', segment: 'Cloud kitchen', account_type: 'restaurant' },
  catering: { label: 'Catering', segment: 'Catering', account_type: 'restaurant' },
  unknown: { label: 'Unknown', segment: 'Unknown', account_type: 'other' },
};

export const COMPANY_ROLES: CompanyRole[] = Object.keys(ROLE_TAXONOMY) as CompanyRole[];

interface RoleRule {
  /** lower wins */
  priority: number;
  label: string;
  role: CompanyRole;
  pattern: RegExp;
  /** matched text that means "no usable v1 role exists", e.g. a school */
  gap?: boolean;
}

/**
 * Ordered, deterministic rule table.
 *
 * P0 — identity fields (name, industry) outrank tags. Tags carry channel and
 *      provenance strings (`Export`, `VG Saveur|Thailand`, `historical-buyer`,
 *      `vegan / bakery foodservice`) that describe how a record was collected or
 *      what a venue buys, not what the business IS. A cafe tagged
 *      `vegan / bakery foodservice` is still a restaurant.
 *
 * P1 — production and channel identity outrank venue identity: a
 *      "Bakery / cake manufacturer / OEM" is a manufacturer, and the old
 *      `/food/`-style matching is exactly the defect that called manufacturers
 *      restaurants.
 *
 * P2 — explicit "modern trade" outranks the generic wholesale token, because a
 *      record reading "Modern trade / wholesale (cash and carry)" is stating its
 *      channel, and the wholesale word is the fallback description.
 *
 * P3 — venue roles, narrowest first: hotel, bakery, patisserie, retail,
 *      restaurant, catering. `dessert` is deliberately NOT a patisserie token:
 *      it appears in restaurant menus ("... / dessert menu") and would beat the
 *      restaurant role on a record that is plainly a restaurant.
 *
 * P4 — brand_owner is last of the real roles: a brand word is often decoration
 *      on a record whose buying identity is a bakery, cake shop, or restaurant.
 */
const ROLE_RULES: RoleRule[] = [
  {
    priority: 1,
    label: 'institution_gap',
    role: 'unknown',
    gap: true,
    pattern: /\b(school|academy|university|institute|college)\b/,
  },
  {
    priority: 2,
    label: 'cloud_kitchen',
    role: 'cloud_kitchen',
    pattern: /\b(cloud kitchen|ghost kitchen|dark kitchen|virtual kitchen)\b/,
  },
  {
    priority: 3,
    label: 'manufacturer',
    role: 'manufacturer',
    pattern: /\b(manufactur\w*|co-?pack\w*|co-?manufactur\w*|oem|production plant|ingredients supplier)\b/,
  },
  {
    priority: 4,
    label: 'importer',
    role: 'importer',
    pattern: /\bimport(?:er|ers|s|ation)?\b/,
  },
  {
    priority: 5,
    label: 'modern_trade_explicit',
    role: 'modern_trade_retail',
    pattern: /\bmodern trade\b/,
  },
  {
    priority: 6,
    label: 'distributor',
    role: 'distributor',
    pattern: /\bdistribut\w*\b/,
  },
  {
    priority: 7,
    label: 'wholesaler',
    role: 'wholesaler',
    pattern: /\bwholesal\w*\b/,
  },
  {
    priority: 8,
    label: 'foodservice_hotel',
    role: 'foodservice_hotel',
    pattern: /\b(hotel|resort|hospital\w*)\b/,
  },
  {
    priority: 9,
    label: 'bakery_chain',
    role: 'bakery_chain',
    pattern: /\b(bakery|bakeries|bread|viennoiserie|boulangerie)\b/,
  },
  {
    priority: 10,
    label: 'patisserie_chain',
    role: 'patisserie_chain',
    pattern: /\b(patisserie|patiss|pastry|pastries|cake|cakes|doughnut|donut)\b/,
  },
  {
    priority: 11,
    label: 'modern_trade_retail',
    role: 'modern_trade_retail',
    pattern:
      /\b(retail\w*|supermarket|hypermarket|grocery|mall|department store|health food|e-?commerce|online shop|specialty shop|organic shop)\b/,
  },
  {
    priority: 12,
    label: 'foodservice_restaurant',
    role: 'foodservice_restaurant',
    pattern: /\b(restaurant|cafe|café|bistro|eatery|diner|dining|food court|kitchen)\b/,
  },
  {
    priority: 13,
    label: 'catering',
    role: 'catering',
    pattern: /\bcater\w*\b/,
  },
  {
    priority: 14,
    label: 'brand_owner',
    role: 'brand_owner',
    pattern: /\b(brand|branding)\b/,
  },
];

/** Exported for review and tests: the rule table is the taxonomy's mechanics. */
export const ROLE_RULES_FOR_REVIEW: { priority: number; label: string; role: CompanyRole; source: string }[] =
  ROLE_RULES.map((r) => ({ priority: r.priority, label: r.label, role: r.role, source: r.pattern.source }));

const IDENTITY_FIELDS: RoleField[] = ['name', 'industry'];
const ALL_FIELDS: RoleField[] = ['name', 'industry', 'tags'];

function fieldText(company: ClassifiableCompany, field: RoleField): string {
  if (field === 'name') return (company.name ?? '').toLowerCase();
  if (field === 'industry') return (company.industry ?? '').toLowerCase();
  return (company.tags ?? []).filter((t): t is string => typeof t === 'string' && t.length > 0).join(' | ').toLowerCase();
}

function isIdentity(field: RoleField): boolean {
  return IDENTITY_FIELDS.includes(field);
}

interface FiredRule {
  rule: RoleRule;
  evidence: RoleEvidence[];
  identityMatch: boolean;
}

function firedRules(company: ClassifiableCompany): FiredRule[] {
  const fired: FiredRule[] = [];
  for (const rule of ROLE_RULES) {
    const evidence: RoleEvidence[] = [];
    let identityMatch = false;
    for (const field of ALL_FIELDS) {
      const text = fieldText(company, field);
      if (!text) continue;
      const m = text.match(rule.pattern);
      if (!m) continue;
      evidence.push({ field, matched_text: m[0].trim(), rule: rule.label });
      if (isIdentity(field)) identityMatch = true;
    }
    if (evidence.length > 0) fired.push({ rule, evidence, identityMatch });
  }
  return fired;
}

function describe(role: CompanyRole, evidence: RoleEvidence[]): string {
  const first = evidence[0];
  if (!first) return `No v1 rule matched, so role is unknown.`;
  const more = evidence.length > 1 ? ` (+${evidence.length - 1} more match${evidence.length > 2 ? 'es' : ''})` : '';
  return `${ROLE_TAXONOMY[role].label} from ${first.field} "${first.matched_text}"${more}`;
}

const INSTITUTION_RE = /\b(school|academy|university|institute|college)\b/;
const INSTITUTION_TAIL_RE = /\b(school|academy|university|institute|college)\s*$/;

/**
 * Does an institutional word HEAD this record's stated identity?
 *
 * True only when the industry phrase (parentheticals ignored) has a segment ending
 * in the institution word AND no other segment states a trading business. A record
 * whose only institutional hint is in its name or tags returns false, so a name
 * like "X School" cannot override a real bakery/restaurant industry.
 */
function institutionHeadsIdentity(company: ClassifiableCompany): boolean {
  const industry = (company.industry ?? '').toLowerCase().replace(/\([^)]*\)/g, ' ');
  if (!INSTITUTION_RE.test(industry)) return false;
  const segments = industry
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);
  const institutionHeads = segments.some((seg) => INSTITUTION_TAIL_RE.test(seg));
  if (!institutionHeads) return false;
  const otherTradingSegment = segments.some(
    (seg) => !INSTITUTION_RE.test(seg) && ROLE_RULES.some((rule) => !rule.gap && rule.pattern.test(seg))
  );
  return !otherTradingSegment;
}

/**
 * Classify one company into taxonomy v1.
 *
 * Deterministic and idempotent: same input always yields the same role, evidence,
 * and candidates. Nothing is written anywhere.
 */
export function classifyCompanyRole(
  company: ClassifiableCompany,
  override?: RoleOverride | null
): RoleClassification {
  const fired = firedRules(company);

  // An institutional word ("school", "academy") must not ERASE real role evidence,
  // but a genuine school must not be dressed up as a bakery either. The live corpus
  // contains both, so the institution decides only when it HEADS the identity
  // phrase and that phrase states no other trading business:
  //   "Bakery / baking school"          -> bakery (the school is an add-on service)
  //   "International school catering"   -> catering (school is a modifier)
  //   "Pastry school"                   -> unknown/taxonomy_gap (an institution)
  //   "Culinary school (ALMA bakery/..)"-> unknown/taxonomy_gap (parenthetical ignored)
  const gapFired = fired.find((f) => f.rule.gap) ?? null;
  const nonGapFired = fired.filter((f) => !f.rule.gap);
  const gapWins = !!gapFired && institutionHeadsIdentity(company);
  const winnerPool = gapWins ? fired : nonGapFired.length > 0 ? nonGapFired : fired;

  const identityFired = winnerPool.filter((f) => f.identityMatch);
  const tier = identityFired.length > 0 ? identityFired : winnerPool;
  const winner = tier[0];

  const rolesFired = new Set<CompanyRole>(fired.map((f) => f.rule.role));
  const ambiguous = rolesFired.size > 1;

  const candidates: RoleCandidate[] = [];
  const seenRoles = new Set<CompanyRole>();
  if (winner) seenRoles.add(winner.rule.role);
  for (const f of fired) {
    if (seenRoles.has(f.rule.role)) continue;
    seenRoles.add(f.rule.role);
    candidates.push({ role: f.rule.role, rule: f.rule.label, priority: f.rule.priority, evidence: f.evidence });
  }

  // ── derived answer ──
  let role: CompanyRole;
  let reason_code: RoleReasonCode;
  let confidence: RoleConfidence;

  if (!winner) {
    role = 'unknown';
    reason_code = 'no_role_match';
    confidence = 'low';
  } else if (winner.rule.gap) {
    role = 'unknown';
    reason_code = 'taxonomy_gap';
    confidence = 'low';
  } else {
    role = winner.rule.role;
    if (winner.identityMatch) {
      reason_code = ambiguous ? 'identity_match_ambiguous' : 'identity_match';
      confidence = ambiguous ? 'medium' : 'high';
    } else {
      reason_code = ambiguous ? 'tag_only_match_ambiguous' : 'tag_only_match';
      confidence = ambiguous ? 'low' : 'medium';
    }
  }

  const derivedEvidence = winner ? winner.evidence : [];
  let reason: string;
  if (reason_code === 'no_role_match') {
    reason = 'No v1 rule matched any identity or tag field.';
  } else if (reason_code === 'taxonomy_gap') {
    reason = `Matched ${derivedEvidence[0]?.matched_text ?? 'institution wording'} in ${derivedEvidence[0]?.field ?? 'input'}: v1 has no role for an educational or institutional buyer.`;
  } else {
    reason = describe(role, derivedEvidence);
    if (ambiguous) {
      reason += ` Contested by ${candidates.map((c) => ROLE_TAXONOMY[c.role].label).join(', ')}.`;
    }
    if (reason_code === 'tag_only_match' || reason_code === 'tag_only_match_ambiguous') {
      reason += ' Identity fields carried no role wording, so tags decided it.';
    }
    if (gapFired) {
      reason +=
        ' Also matches institutional wording, which v1 has no role for, so it is reported as a candidate rather than the answer.';
    }
  }

  const derived: RoleClassification = {
    role,
    account_type: ROLE_TAXONOMY[role].account_type,
    taxonomy_version: TAXONOMY_VERSION,
    confidence,
    ambiguous,
    reason_code,
    reason,
    evidence: derivedEvidence,
    candidates,
    source: 'derived',
  };

  if (!override || !override.role) return derived;
  if (!(override.role in ROLE_TAXONOMY)) return derived;

  return {
    role: override.role,
    account_type: ROLE_TAXONOMY[override.role].account_type,
    taxonomy_version: TAXONOMY_VERSION,
    confidence: 'high',
    ambiguous: false,
    reason_code: 'pat_override',
    reason: override.note ? `Pat override: ${override.note}` : 'Pat override.',
    evidence: derived.evidence,
    // the derived call stays visible for audit, including what it disagreed with
    candidates: [
      ...(derived.role !== override.role
        ? [{ role: derived.role, rule: `derived:${derived.reason_code}`, priority: 0, evidence: derived.evidence }]
        : []),
      ...derived.candidates,
    ],
    source: 'pat_override',
  };
}
