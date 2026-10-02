'use client';

// ─── This week: missing data and Laya status ───
// What stops deals from being graded or valued, counted per gap with a link to the
// board filtered to it, and whether Laya is keeping up with the pasted replies.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { Deal, Meeting } from '@/types/crm';
import { useLayaGrades } from '@/hooks/useLayaReviewList';
import { DATA_GAPS, DATA_GAP_LABEL, buildDataGapReport } from '@/utils/deal-data-gaps';
import { buildLayaStatus } from '@/utils/laya-status';
import LayaStatusLine from '@/components/LayaStatusLine';

export default function DataHealthCard({ deals, meetings }: { deals: Deal[]; meetings: Meeting[] }) {
  const { grades, judgments, status: load } = useLayaGrades(deals, meetings);
  const [now] = useState(() => Date.now());
  const report = useMemo(() => buildDataGapReport(deals, meetings), [deals, meetings]);
  const status = useMemo(
    () => (load === 'ready' ? buildLayaStatus({ deals, grades, judgments, now }) : null),
    [load, deals, grades, judgments, now],
  );

  if (report.total === 0 && (load !== 'ready' || status?.health === 'idle')) return null;

  return (
    <section aria-labelledby="data-health" className="rounded-xl border border-clay-hairline bg-white p-3.5 dark:bg-clay-card" data-testid="data-health-card">
      <h2 id="data-health" className="mb-1 text-sm font-semibold text-clay-ink">Missing data · {report.total}</h2>
      {report.total === 0 ? (
        <p className="text-xs text-clay-muted">Every open deal has a next action, a contact and a value.</p>
      ) : (
        <ul className="divide-y divide-clay-hairline">
          {DATA_GAPS.filter(gap => report.counts[gap] > 0).map(gap => (
            <li key={gap}>
              <Link href={`/deals?missing=${gap}`} className="flex items-baseline justify-between gap-2 rounded-md py-1.5 text-sm text-clay-body hover:bg-clay-surface hover:text-clay-ink">
                <span>{DATA_GAP_LABEL[gap]}</span>
                <span className="shrink-0 text-xs font-medium text-clay-ink">{report.counts[gap]}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <LayaStatusLine
        status={status}
        load={load}
        now={now}
        missingReplyWords={0}
        className="mt-2 border-t border-clay-hairline pt-2"
      />
    </section>
  );
}
