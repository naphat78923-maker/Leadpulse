import { NextRequest, NextResponse } from 'next/server';
import { proposeLogo, proposeMissingLogos } from '@/lib/logo-proposals';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// A few sites read one after another can take a while.
export const maxDuration = 60;

// POST /api/logo-proposals { companyId } → look for that account's logo on its website.
// POST /api/logo-proposals {} → every account with a website, no logo and no proposal yet.
// Found logos wait in storage for Pat's Use logo / Not theirs; no company row is written here.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as { companyId?: unknown } | null;
  const companyId = body?.companyId;
  try {
    if (companyId === undefined) {
      const results = await proposeMissingLogos();
      return NextResponse.json({ results, proposed: results.filter((r) => r.status === 'proposed').length });
    }
    if (typeof companyId !== 'string' || !UUID.test(companyId)) {
      return NextResponse.json({ error: 'Unknown account' }, { status: 404 });
    }
    return NextResponse.json(await proposeLogo(companyId));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not look for a logo' }, { status: 500 });
  }
}
