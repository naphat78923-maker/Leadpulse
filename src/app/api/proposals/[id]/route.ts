import { NextRequest, NextResponse } from 'next/server';
import { decideFromApp } from '@/lib/proposals-data';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Save / Not theirs on a proposal from the account panel. The same rules as the Telegram
// buttons (lib/proposals-data.ts decideProposal); the Telegram message is updated to match.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'Unknown proposal' }, { status: 404 });
  const body = await request.json().catch(() => null) as { action?: unknown; reason?: unknown } | null;
  const action = body?.action;
  if (action !== 'save' && action !== 'reject' && action !== 'same') {
    return NextResponse.json({ error: 'action must be save, reject or same' }, { status: 400 });
  }
  const reason = body?.reason === 'closed' || body?.reason === 'customer' || body?.reason === 'not_fit' ? body.reason : null;
  try {
    const result = await decideFromApp(id, action, undefined, undefined, reason);
    return NextResponse.json(result, { status: result.retry ? 503 : 200 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not decide' }, { status: 500 });
  }
}
