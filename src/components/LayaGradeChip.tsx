// ─── A deal card's Laya grade, in one small chip ───
// review → amber "Laya: review"; graded with a tier move → "Laya ↑ A" / "Laya ↓ C";
// graded, tier kept → muted "Laya B"; no reply or not graded → nothing (cards stay lean).
// "· warmer" / "· cooler" follows when the reading moved against the previous reply.

import clsx from 'clsx';
import type { DealGrade } from '@/utils/grade';

const ORDER = ['D', 'C', 'B', 'A', 'S'];

export default function LayaGradeChip({ grade }: { grade?: DealGrade }) {
  if (!grade || grade.status === 'not_graded') return null;
  if (grade.status === 'needs_review') {
    return (
      <span data-laya-chip="review" title={grade.review.join(' · ')}
        className="rounded border border-clay-ochre/40 bg-clay-ochre/10 px-1.5 py-0.5 text-[10px] font-semibold text-clay-ochre">
        Laya: review
      </span>
    );
  }
  const move = Math.sign(ORDER.indexOf(grade.tier) - ORDER.indexOf(grade.baseTier));
  const trend = grade.trend && grade.trend.direction !== 'steady' ? grade.trend.direction : null;
  const title = [
    ...(trend ? [`${trend === 'up' ? 'warmer' : 'cooler'} than the previous reply`] : []),
    ...grade.reasons.slice(0, 3).map(r => r.label),
  ].join(' · ');
  return (
    <span data-laya-chip={move > 0 ? 'up' : move < 0 ? 'down' : 'kept'} title={title}
      className={clsx('rounded border px-1.5 py-0.5 text-[10px] font-semibold',
        move > 0 && 'border-clay-success/40 bg-clay-success/10 text-clay-success',
        move < 0 && 'border-clay-error/30 bg-clay-error/10 text-clay-error',
        move === 0 && 'border-clay-hairline text-clay-muted')}>
      Laya {move > 0 ? '↑ ' : move < 0 ? '↓ ' : ''}{grade.tier}
      {trend && <span data-laya-trend={trend} className="ml-1 font-normal">{trend === 'up' ? '· warmer' : '· cooler'}</span>}
    </span>
  );
}
