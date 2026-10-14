import { NextRequest, NextResponse } from 'next/server';
import { pendingUnsent, sendPendingProposals } from '@/lib/proposals-data';
import { sendTelegramMessage, telegramConfigured } from '@/lib/telegram';
import { businessDateKey } from '@/utils/business-time';

interface TelegramReport {
  text: string;
  isEmpty: boolean;
  counts: Record<string, number>;
}

// Shared by the scheduled Telegram routes (vercel.json).
//   GET <route>          builds the message and sends it to Telegram, then any enrichment
//                        proposals waiting for Pat (lib/proposals-data.ts)
//   GET <route>?dry=1    returns the message without sending it
// Every call needs `Authorization: Bearer $CRON_SECRET`, which Vercel adds to scheduled
// runs. Local development may preview with ?dry=1 without it.
export async function runTelegramCron(
  request: NextRequest,
  load: (today: string, appUrl: string) => Promise<TelegramReport>,
): Promise<NextResponse> {
  const dry = request.nextUrl.searchParams.get('dry') === '1';
  const secret = process.env.CRON_SECRET;
  const authorised = Boolean(secret) && request.headers.get('authorization') === `Bearer ${secret}`;
  const localPreview = dry && process.env.NODE_ENV !== 'production';
  if (!authorised && !localPreview) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  try {
    const report = await load(businessDateKey(), request.nextUrl.origin);
    if (dry) {
      const waiting = await pendingUnsent().then(rows => rows.length).catch(() => null);
      return NextResponse.json({ sent: false, reason: 'dry run', ...report, proposals_waiting: waiting });
    }
    if (!telegramConfigured()) {
      if (report.isEmpty) return NextResponse.json({ sent: false, reason: 'nothing due', counts: report.counts });
      return NextResponse.json({ sent: false, reason: 'TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are not set' }, { status: 503 });
    }
    if (!report.isEmpty) await sendTelegramMessage(report.text);
    // Enrichment proposals ride along with every scheduled run, even on a day with nothing due.
    // A failure here never hides the report that was already sent.
    const proposals = await sendPendingProposals()
      .catch(err => ({ error: err instanceof Error ? err.message : 'proposals failed' }));
    return NextResponse.json({
      sent: !report.isEmpty,
      ...(report.isEmpty ? { reason: 'nothing due' } : {}),
      counts: report.counts,
      proposals,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Telegram cron failed' }, { status: 500 });
  }
}
