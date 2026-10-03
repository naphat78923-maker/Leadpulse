import { Company, Deal, DealStage } from '@/types/crm';
import { LOST_REASON_OPTIONS } from './deal-workflow';

export const ACTIVE_DEAL_STAGES: DealStage[] = ['research', 'contacted', 'proposal', 'negotiation'];

const STAGE_PROBABILITY: Record<DealStage, number> = {
  research: 0.1,
  contacted: 0.25,
  proposal: 0.5,
  negotiation: 0.75,
  closed_won: 1,
  closed_lost: 0,
};

export interface SourcePerformanceRow {
  source: string;
  total: number;
  won: number;
  rate: number;
}

/** Current forecast is active pipeline only; closed revenue belongs in a reporting period. */
export function calculateWeightedForecast(deals: Deal[]): number {
  return deals
    .filter(deal => ACTIVE_DEAL_STAGES.includes(deal.stage))
    .reduce((total, deal) => total + (deal.value || 0) * STAGE_PROBABILITY[deal.stage], 0);
}

/** Win rate is won outcomes divided by all resolved outcomes from that source. */
export function calculateSourcePerformance(deals: Deal[], companies: Company[]): SourcePerformanceRow[] {
  const sourceByCompanyId = new Map(companies.map(company => [company.id, company.lead_source || 'Unknown']));
  const bySource = new Map<string, { total: number; won: number }>();

  deals
    .filter(deal => deal.stage === 'closed_won' || deal.stage === 'closed_lost')
    .forEach(deal => {
      const source = deal.company_id ? (sourceByCompanyId.get(deal.company_id) ?? 'No company') : 'No company';
      const current = bySource.get(source) || { total: 0, won: 0 };
      current.total += 1;
      if (deal.stage === 'closed_won') current.won += 1;
      bySource.set(source, current);
    });

  return [...bySource.entries()]
    .map(([source, values]) => ({
      source,
      ...values,
      rate: values.total > 0 ? (values.won / values.total) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total);
}

/** Each lane's value weighted by the win probability of its deals' stages. */
export function weightedLaneValues(
  lanes: { id: string }[],
  byAction: Record<string, Pick<Deal, 'value' | 'stage'>[]>,
): Record<string, number> {
  const sums: Record<string, number> = {};
  for (const lane of lanes) {
    sums[lane.id] = (byAction[lane.id] || []).reduce((total, deal) => total + (deal.value || 0) * STAGE_PROBABILITY[deal.stage], 0);
  }
  return sums;
}

export interface ReasonTotal {
  label: string;
  count: number;
}

const NOT_RECORDED = 'Not recorded';

function totals(labels: string[]): ReasonTotal[] {
  const counts = new Map<string, number>();
  for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);
  // Most common first; "Not recorded" always last so real reasons lead.
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => Number(a.label === NOT_RECORDED) - Number(b.label === NOT_RECORDED) || b.count - a.count || a.label.localeCompare(b.label));
}

/** Why deals were lost, most common first. */
export function lostReasonTotals(deals: Pick<Deal, 'lost_reason'>[]): ReasonTotal[] {
  const labelOf = new Map<string, string>(LOST_REASON_OPTIONS.map(option => [option.value, option.label]));
  return totals(deals.map(deal => (deal.lost_reason ? labelOf.get(deal.lost_reason) ?? deal.lost_reason : NOT_RECORDED)));
}

/**
 * Why deals were parked, most common first. Park reasons are free text, so the same
 * reason typed with different capitals or spacing counts once, shown as first typed.
 */
export function parkReasonTotals(deals: Pick<Deal, 'park_reason'>[]): ReasonTotal[] {
  const shown = new Map<string, string>();
  return totals(deals.map(deal => {
    const text = deal.park_reason?.trim().replace(/\s+/g, ' ');
    if (!text) return NOT_RECORDED;
    const key = text.toLocaleLowerCase();
    if (!shown.has(key)) shown.set(key, text);
    return shown.get(key)!;
  }));
}
