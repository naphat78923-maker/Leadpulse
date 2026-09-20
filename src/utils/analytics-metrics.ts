import { Company, Deal, DealStage } from '@/types/crm';

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
