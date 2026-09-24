'use client';

import type { Company, Deal } from '@/types/crm';
import LayaScoreCard from '@/components/LayaScoreCard';
import { dealsWithVerbatimBuyerReply } from '@/utils/lead-scoring';

/**
 * Account/contact-level rollup of the shipped Laya buyer-response review: one
 * on-demand scorer per open deal that carries a verbatim buyer reply. Nothing
 * is scored until the per-deal button is tapped (Mac-local worker, explicit
 * action only) — this section itself never triggers a model call.
 *
 * Renders nothing when no deal is scorable, so accounts without verbatim
 * buyer evidence stay quiet instead of showing an empty upsell.
 */
export default function LayaBuyerSignalsSection({
  deals,
  companyFor,
}: {
  deals: Deal[];
  companyFor: (deal: Deal) => Company | undefined;
}) {
  const scorable = dealsWithVerbatimBuyerReply(deals);
  if (scorable.length === 0) return null;

  return (
    <div className="mt-4 pt-4 border-t border-clay-hairline" data-testid="laya-buyer-signals">
      <h3 className="text-sm font-semibold text-clay-ink mb-1">🧠 Laya buyer signals</h3>
      <p className="text-[11px] text-clay-muted mb-3">
        Verbatim buyer replies on open deals, interpreted on demand by the local Laya worker. Advisory only — never changes priority, stage, or workflow.
      </p>
      <div className="space-y-3">
        {scorable.map(deal => (
          <div key={deal.id}>
            <p className="text-xs font-medium text-clay-ink mb-1.5 truncate">{deal.title}</p>
            <LayaScoreCard deal={deal} company={companyFor(deal)} />
          </div>
        ))}
      </div>
    </div>
  );
}
