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
  /** at least this many CUSTOMER-FACING contacts carrying a recorded positive outcome
   *  must exist across those roles. Internal workflow rows (nudges, system rewards)
   *  never count, and an outbound contact alone is activity, not a response. */
  min_positive_contact_outcomes: number;
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
    // Provenance of this text: an earlier draft claimed a win closed because a
    // promotional bundle with free samples had been attached. The source journal says
    // that promotion was never confirmed, so the claim was WITHDRAWN rather than
    // restated. The copy below asserts only what the journals support, and a unit test
    // keeps the withdrawn claim out of it.
    origin_signal:
      'The largest buying cluster in the CRM sits here: the most accounts with order history, the most recorded wins, and the only subscription in the book. No closing mechanism is asserted for these wins, because the journals do not record how they were produced.',
    evidence_requirement: {
      roles_covered: ['foodservice_restaurant', 'cloud_kitchen'],
      min_buying_accounts: 3,
      min_positive_contact_outcomes: 5,
      basis:
        'Set from the observed cluster: multiple won accounts, several still placing orders or holding a subscription, and the largest share of customer-facing contacts with a recorded positive outcome.',
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
      'The single largest recorded win in the CRM is a modern-trade account, and it is the ONLY win whose journal records the promotional mechanics of its close: a discount tab, a tasting booth, and samples for a photoshoot. Other wins record outcomes (a subscription, an expansion target, sell-through numbers) but not the mechanics that produced them.',
    evidence_requirement: {
      // wholesalers are deliberately NOT covered: they have zero buying evidence, and
      // the considered-and-rejected list records them as untested
      roles_covered: ['modern_trade_retail'],
      min_buying_accounts: 2,
      min_positive_contact_outcomes: 1,
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
      min_positive_contact_outcomes: 1,
      basis:
        'Set from the observed cluster: a won patisserie brand and a won vegan bakery with a recorded expansion intent, alongside a large prospect base of bakery brands and chains.',
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
  /** the role a campaign would target if the hypothesis is ever supported */
  intended_vertical_role?: CompanyRole;
  /** A whole archetype preserved because its thinking is worth keeping even though
   *  the evidence is not there yet. Withholding the claim is not discarding the idea. */
  untested_hypothesis?: {
    pain: string;
    offer_angle: string;
    criteria: string[];
    observed_origin_signal: string;
  };
  /** The bar this archetype failed, stated explicitly so it is never quietly lowered
   *  to keep it published. */
  unmet_requirement?: string;
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
  {
    id: 'hotel_resort_foodservice',
    name: 'Hotel and resort foodservice',
    roles: ['foodservice_hotel'],
    intended_vertical_role: 'foodservice_hotel',
    reason:
      'WITHDRAWN FROM THE PUBLISHED SET on 2026-09-11 after the evidence layer stopped counting internal workflow rows as engagement. Two hotels have buying evidence, but the role records ZERO customer-facing contacts with a recorded positive outcome: its only positive outcome was an internal nudge row. Withholding is not a verdict on hotels as a market, which remains the largest unworked cluster in the taxonomy; it means the current evidence does not support treating this sales approach as validated.',
    unmet_requirement:
      'Failed: >=2 accounts with buying evidence and >=1 positive customer-facing outcome. Buying evidence met (2), positive customer-facing outcomes NOT met (0 of 1). The bar is deliberately NOT lowered to retain publication.',
    untested_hypothesis: {
      pain:
        'Purchasing is centralised behind brand standards, so a single outlet decision is rarely enough: the substitute has to clear a quality bar once and then be usable across several outlets and menus, including afternoon tea, pastry and events.',
      offer_angle:
        'Win one outlet with a pastry-team trial, document the result, then use that outlet as the internal reference when approaching the group.',
      criteria: [
        'Hotel, resort, or venue with its own kitchen or pastry operation',
        'Menu changes are seasonal, with sugar-free or plant-based requests already present',
        'Buying is centralised, with an F&B director or executive chef in the chain',
        'A single outlet can be used as the proving ground before group-wide adoption',
      ],
      observed_origin_signal:
        'Two hotels have ordered; only one has a recorded win, and the other has order history with no win on record. Hotels are also the largest unworked cluster in the taxonomy: a fifth of the company list, with two accounts showing buying evidence.',
    },
  },
];

export const ARCHETYPE_COUNT_BOUNDS = { min: 3, max: 5 } as const;
