'use client';

// ─── Laya status: is grading keeping up? ───
// One line built from saved judgments (laya-status.ts). The Mac worker and the local
// Laya server stop silently when their terminal closes; a reply left waiting is the
// only sign, so this says so in words.

import Link from 'next/link';
import clsx from 'clsx';
import { STALLED_AFTER_MINUTES, formatAgo, type LayaStatus } from '@/utils/laya-status';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export default function LayaStatusLine({ status, load, now, missingReplyWords, className }: {
  /** null until the judgments are read */
  status: LayaStatus | null;
  load: 'loading' | 'error' | 'ready';
  now: number;
  /** open deals with a logged reply but no exact words pasted */
  missingReplyWords: number;
  className?: string;
}) {
  if (load === 'loading' || (load === 'ready' && !status)) return null;

  const missing = missingReplyWords > 0 && (
    <Link href="/deals?missing=reply-words" className="underline decoration-clay-hairline underline-offset-2 hover:text-clay-ink">
      {plural(missingReplyWords, 'logged reply has', 'logged replies have')} no exact words pasted
    </Link>
  );

  if (load === 'error' || !status) {
    return (
      <p data-testid="laya-status" data-health="unknown" className={clsx('text-xs text-clay-muted', className)}>
        Laya: could not read saved judgments.
      </p>
    );
  }

  const parts: string[] = [];
  if (status.withReply === 0) parts.push('no pasted replies to grade yet');
  else {
    parts.push(`${status.graded} graded`);
    if (status.needsReview > 0) {
      parts.push(`${status.needsReview} for your review${status.thai > 0 ? ` (${status.thai} Thai)` : ''}`);
    }
    if (status.waiting > 0) parts.push(`${status.waiting} waiting for the worker`);
  }
  const last = formatAgo(status.lastJudgedAt, now);
  if (last) parts.push(`last judgment ${last}`);

  return (
    <div data-testid="laya-status" data-health={status.health} className={clsx('text-xs text-clay-muted', className)}>
      <p>
        <span className={clsx('mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle',
          status.health === 'stalled' ? 'bg-clay-error' : status.health === 'waiting' ? 'bg-clay-ochre'
            : status.health === 'ok' ? 'bg-clay-success' : 'bg-clay-hairline')} aria-hidden="true" />
        Laya: {parts.join(' · ')}
        {missing && <> · {missing}</>}
      </p>
      {status.health === 'stalled' && (
        <p role="status" className="mt-0.5 text-clay-error">
          {plural(status.waiting, 'reply has', 'replies have')} waited over {STALLED_AFTER_MINUTES} minutes. The worker or the Laya server on your Mac has probably stopped.
        </p>
      )}
    </div>
  );
}
