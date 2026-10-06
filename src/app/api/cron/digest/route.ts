import { NextRequest, NextResponse } from 'next/server';
import { loadDailyDigest } from '@/lib/digest-data';
import { sendTelegramMessage, telegramConfigured } from '@/lib/telegram';
import { businessDateKey } from '@/utils/business-time';

// The morning digest, run by the host's scheduler (vercel.json).
//   GET /api/cron/digest          builds the digest and sends it to Telegram
//   GET /api/cron/digest?dry=1    returns the message without sending it
// Every call needs `Authorization: Bearer $CRON_SECRET`, which Vercel adds to scheduled
// runs. Local development may preview with ?dry=1 without it.
export async function GET(request: NextRequest) {
  const dry = request.nextUrl.searchParams.get('dry') === '1';
  const secret = process.env.CRON_SECRET;
  const authorised = Boolean(secret) && request.headers.get('authorization') === `Bearer ${secret}`;
  const localPreview = dry && process.env.NODE_ENV !== 'production';
  if (!authorised && !localPreview) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  try {
    const digest = await loadDailyDigest(businessDateKey(), request.nextUrl.origin);
    if (dry) return NextResponse.json({ sent: false, reason: 'dry run', ...digest });
    if (digest.isEmpty) return NextResponse.json({ sent: false, reason: 'nothing due', counts: digest.counts });
    if (!telegramConfigured()) {
      return NextResponse.json({ sent: false, reason: 'TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are not set' }, { status: 503 });
    }
    await sendTelegramMessage(digest.text);
    return NextResponse.json({ sent: true, counts: digest.counts });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Digest failed' }, { status: 500 });
  }
}
