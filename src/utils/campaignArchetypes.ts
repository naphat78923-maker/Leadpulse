// ─── LeadPulse Intelligence — Slice 1, Deliverable B: campaign archetypes v1 ───
//
// FOUR archetypes, not six. Each one exists because accounts in this role have
// already bought, and each pain statement is traceable to a won deal or a logged
// outcome. Where the evidence is thin, the archetype says so instead of sounding
// confident (see `evidence_requirement.strength_expectation`).
//
// Deliberate omissions, and why: an export importer/distributor archetype and an
// institutional catering archetype both have prospects in the CRM but no won
// account and no logged positive outcome behind them, so they are NOT published.
// Explee inferred six archetypes from a marketing page in one pass; the whole
// point of this layer is that we only state what a real account supports.
//
// Account names deliberately do NOT appear here: this file is committed, and the
// named evidence lives in the gitignored report produced by
// scripts/archetype-evidence-report.ts. Every archetype declares what evidence
// must exist for it to be publishable, and the report fails if it does not.

import { TAXONOMY_VERSION, type CompanyRole } from './companyRole.ts';

export interface ArchetypeEvidenceRequirement {
  /** taxonomy v1 roles whose accounts may satisfy this archetype */
  roles_covered: CompanyRole[];
  /** at least this many accounts in those roles must be PROVEN BUYERS.
   *  Buying evidence is a closed_won deal OR recorded order history, because the
   *  CRM contains 11 active customers with 200 order events and no won deal at
   *  all: anchoring on deals alone undercounts real buyers. */
  min_buying_accounts: number;
  /** at least this many positive logged outcomes must exist across those roles */
  min_positive_outcomes: number;
  /** what the requirement is meant to prove, and how it was set */
  basis: string;
  /** what we expect the evidence to look like, stated before it was measured */
  strength_expectation: 'well_evidenced' | 'emerging' | 'single_account';
}

export interface CampaignArchetype {
  id: string;
  name: string;
  taxonomy_version: string;
  /** the role a campaign built on this archetype targets by default */
  vertical_role: CompanyRole;
  /** the buyer's situation, phrased as the problem they have, not what we sell */
  pain: string;
  /** what a qualified account must look like */
  criteria: string[];
  /** the specific ask and the proof to lead with */
  offer_angle: string;
  /** the observed signal that produced this archetype (no account names here) */
  origin_signal: string;
  evidence_requirement: ArchetypeEvidenceRequirement;
}

export const CAMPAIGN_ARCHETYPES_V1: CampaignArchetype[] = [
  {
    id: 'plant_based_restaurant_cafe',
    name: 'Plant-based restaurant and cafe kitchens',
    taxonomy_version: TAXONOMY_VERSION,
    vertical_role: 'foodservice_restaurant',
    pain:
      'Their menu is already plant-based, so dairy-free is a requirement rather than a compromise, and nobody in the kitchen is comparing it to dairy butter. The block still has to laminate, pan-fry and hold texture in brioche, shokupan, pastry and ice cream, so it is judged purely on whether it performs in their own recipes.',
    criteria: [
      'Plant-based or vegan menu is the core concept, not a section of a conventional menu',
      'Kitchen does its own baking or pastry, or has a named pastry lead',
      'Decision sits with a chef-owner, head chef, or chef-patron',
      'Either already ordering, or has taken samples into a menu test',
    ],
    offer_angle:
      'Sample-led trial run against their own brioche, shokupan or pastry recipe, then convert the winning flavour into a standing reorder.',
    origin_signal:
      'The largest won-deal cluster in the CRM sits here, including a 15kg butter subscription and a win that closed only after a promo bundle with free samples was attached.',
    evidence_requirement: {
      roles_covered: ['foodservice_restaurant', 'cloud_kitchen'],
      min_buying_accounts: 3,
      min_positive_outcomes: 5,
      basis:
        'Set from the observed cluster: multiple won restaurant accounts, several still placing orders or holding subscriptions, and a majority of the positive logged outcomes in the whole CRM.',
      strength_expectation: 'well_evidenced',
    },
  },
  {
    id: 'modern_trade_specialty_retail',
    name: 'Modern trade, specialty retail and online grocery',
    taxonomy_version: TAXONOMY_VERSION,
    vertical_role: 'modern_trade_retail',
    pain:
      'They sell to shoppers, not in a kitchen, so the product has to prove itself on a shelf: packaging that photographs, a unit that survives a tasting, and a promotion that turns a first purchase into a repeat. The buying decision is governed by shelf space, margin and promo mechanics rather than by recipe performance.',
    criteria: [
      'Retail, grocery, or online-grocery channel rather than a kitchen',
      'Buying is centralised or category-managed, with a named buyer',
      'Category already carries plant-based or specialty imports',
      'Promotion and shelf trial are part of how they launch a new line',
    ],
    offer_angle:
      'Lead with tasting-booth support, sample packs for photoshoot and in-store trial, and a bounded introductory margin, then measure sell-through by unit before committing to a listing.',
    origin_signal:
      'The single largest recorded win in the CRM is a modern-trade account, and its journal shows how it closed: a promotional tab, a tasting booth, and samples sent for a photoshoot.',
    evidence_requirement: {
      // wholesalers are deliberately NOT covered: they have zero proven buyers, and
      // the considered-and-rejected list records them as untested
      roles_covered: ['modern_trade_retail'],
      min_buying_accounts: 2,
      min_positive_outcomes: 1,
      basis:
        'Set from the observed cluster: a modern-trade win carrying most of the recorded won value, plus retail accounts with recorded order history rather than deal values.',
      strength_expectation: 'emerging',
    },
  },
  {
    id: 'bakery_patisserie_brands',
    name: 'Bakery, patisserie and multi-line dessert brands',
    taxonomy_version: TAXONOMY_VERSION,
    vertical_role: 'bakery_chain',
    pain:
      'Butter is a structural ingredient for them, so a substitute is only acceptable if it behaves identically through lamination and baking, and if every branch or production site gets the same result. Multi-line brands also carry catering or wholesale demand they could serve with a specialty butter they do not currently stock.',
    criteria: [
      'Bakery, patisserie, or dessert brand producing its own product',
      'Viennoiserie, cake or laminated pastry in the core range',
      'More than one outlet, or a production site supplying outlets',
      'Product decisions made by a head baker, pastry chef, or owner',
    ],
    offer_angle:
      'Run the comparison in their own laminating process, then price it against their current butter on yield per batch rather than per kilo, with a reorder cadence tied to their production cycle.',
    origin_signal:
      'Two won accounts sit here, one of them a vegan bakery/cafe/catering business whose recorded next step is explicitly to pitch local B2B supply for cakes, desserts, drinks and catering.',
    evidence_requirement: {
      roles_covered: ['bakery_chain', 'patisserie_chain'],
      min_buying_accounts: 2,
      min_positive_outcomes: 1,
      basis:
        'Set from the observed cluster: a won patisserie brand and a won vegan bakery with a recorded expansion intent, alongside a large prospect base of bakery brands and chains.',
      strength_expectation: 'emerging',
    },
  },
  {
    id: 'hotel_resort_foodservice',
    name: 'Hotel and resort foodservice',
    taxonomy_version: TAXONOMY_VERSION,
    vertical_role: 'foodservice_hotel',
    pain:
      'Purchasing is centralised behind brand standards, so a single outlet decision is rarely enough: the substitute has to clear a quality bar once and then be usable across several outlets and menus, including afternoon tea, pastry and events.',
    criteria: [
      'Hotel, resort, or venue with its own kitchen or pastry operation',
      'Menu changes are seasonal, with sugar-free or plant-based requests already present',
      'Buying is centralised, with an F&B director or executive chef in the chain',
      'A single outlet can be used as the proving ground before group-wide adoption',
    ],
    offer_angle:
      'Win one outlet with a pastry-team trial, document the result, then use that outlet as the internal reference when approaching the group.',
    origin_signal:
      'Two hotels have ordered; only one of them has a recorded win, and the other has order history with no win on record. Hotels are also the largest unworked cluster in the taxonomy: a fifth of the company list, with two buyers.',
    evidence_requirement: {
      roles_covered: ['foodservice_hotel'],
      min_buying_accounts: 2,
      min_positive_outcomes: 1,
      basis:
        'The weakest published bar, and labelled as such. Two buying hotels is enough to justify outreach and NOT enough to claim a pattern: treat the pain statement as a hypothesis to test rather than a proven play.',
      strength_expectation: 'emerging',
    },
  },
];

/**
 * Archetypes that the evidence does NOT support yet, recorded so the omission is a
 * decision rather than an oversight. Each one was considered and rejected on
 * measured evidence, and the live counts behind it appear in the same report under
 * role coverage. Revisit when a role gains a proven outcome.
 */
export interface ConsideredArchetype {
  id: string;
  name: string;
  roles: CompanyRole[];
  reason: string;
}

export const CONSIDERED_NOT_PUBLISHED_V1: ConsideredArchetype[] = [
  {
    id: 'supply_side_manufacturers_copackers',
    name: 'Manufacturers, co-packers and ingredient suppliers',
    roles: ['manufacturer', 'brand_owner'],
    reason:
      'Real demand exists here: accounts have placed orders. But not one has a recorded win or a positive logged outcome, so there is no source for WHY they buy, and a pain statement would be invented. Note also that the clearest account in this group is a co-packer, which is a supply relationship rather than a customer pitch.',
  },
  {
    id: 'export_importers_distributors',
    name: 'Export importers, distributors and wholesalers',
    roles: ['importer', 'distributor', 'wholesaler'],
    reason:
      'These accounts are entirely untested: no orders, no wins, and no logged outcomes behind them. Publishing an archetype here would be copying Explee, which inferred six archetypes from a marketing page in one pass.',
  },
  {
    id: 'institutional_catering',
    name: 'Institutional and event catering',
    roles: ['catering'],
    reason:
      'Accounts exist, including ones serving schools and airlines, but none has ordered or produced a logged outcome. The segmentation need is credible; the evidence is not there yet.',
  },
];

export const ARCHETYPE_COUNT_BOUNDS = { min: 3, max: 5 } as const;
