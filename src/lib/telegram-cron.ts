import { NextRequest, NextResponse } from 'next/server';
import { sendTelegramMessage, telegramConfigured } from '@/lib/telegram';
import { businessDateKey } from '@/utils/business-time';

interface TelegramReport {
  text: string;
  isEmpty: boolean;
  counts: Record<string, number>;
}

// Shared by the scheduled Telegram routes (vercel.json).
//   GET <route>          builds the message and sends it to Telegram
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
    if (dry) return NextResponse.json({ sent: false, reason: 'dry run', ...report });
    if (report.isEmpty) return NextResponse.json({ sent: false, reason: 'nothing due', counts: report.counts });
    if (!telegramConfigured()) {
      return NextResponse.json({ sent: false, reason: 'TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are not set' }, { status: 503 });
    }
    await sendTelegramMessage(report.text);
    return NextResponse.json({ sent: true, counts: report.counts });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Telegram cron failed' }, { status: 500 });
  }
}
