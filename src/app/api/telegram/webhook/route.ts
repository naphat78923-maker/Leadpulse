import { NextRequest, NextResponse } from 'next/server';
import { handleTelegramUpdate } from '@/lib/proposals-data';

// Telegram calls this when Pat taps Save / Not theirs on a proposal.
// Registered with setWebhook(secret_token = TELEGRAM_WEBHOOK_SECRET, allowed_updates =
// ["callback_query"]); Telegram sends that secret in a header on every call, so a request
// without it is refused. Only button presses from TELEGRAM_CHAT_ID are acted on.
export async function POST(request: NextRequest) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!secret || !chatId) return NextResponse.json({ error: 'Not configured' }, { status: 503 });
  if (request.headers.get('x-telegram-bot-api-secret-token') !== secret) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  const update = await request.json().catch(() => null);
  if (!update || typeof update !== 'object') return NextResponse.json({ ok: true, result: 'ignored: not JSON' });
  try {
    const result = await handleTelegramUpdate(update, chatId);
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    // 200 so Telegram does not redeliver the same tap in a loop; the proposal stays as it was.
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : 'failed' });
  }
}
