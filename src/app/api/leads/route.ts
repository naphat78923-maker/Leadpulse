import { NextRequest, NextResponse } from 'next/server';
import { captureWebsiteLead } from '@/lib/website-lead-data';
import { MAX_BODY_BYTES, SECRET_HEADER, allowedOrigin, checkAccess, clientIp, overall, perVisitor } from '@/lib/website-lead-guard';
import { parseWebsiteLead } from '@/utils/website-lead';

// POST /api/leads: an enquiry from the VG Saveur website's form. Public, so it trusts nothing
// but the fields utils/website-lead.ts reads. See docs/website-lead-form.md for the form side.

function cors(request: Request): Record<string, string> {
  const origin = allowedOrigin(request);
  return origin
    ? { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': `content-type, ${SECRET_HEADER}`, 'access-control-max-age': '86400', vary: 'origin' }
    : { vary: 'origin' };
}

const reply = (request: Request, body: Record<string, unknown>, status = 200) =>
  NextResponse.json(body, { status, headers: cors(request) });

export function OPTIONS(request: NextRequest) {
  return new Response(null, { status: 204, headers: cors(request) });
}

async function readBody(request: NextRequest): Promise<unknown> {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return undefined;
  const type = request.headers.get('content-type') ?? '';
  if (type.includes('application/x-www-form-urlencoded')) return Object.fromEntries(new URLSearchParams(text));
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const access = checkAccess(request);
  if (!access.ok) return reply(request, { error: access.status === 503 ? 'Lead capture is not set up' : 'Not allowed' }, access.status);

  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_BODY_BYTES) return reply(request, { error: 'Too large' }, 413);
  const body = await readBody(request);
  if (body === undefined) return reply(request, { error: 'Too large' }, 413);

  const parsed = parseWebsiteLead(body);
  // A bot that filled the hidden field is told it worked, so it does not try again.
  if (!parsed.ok && parsed.spam) return reply(request, { ok: true });
  if (!parsed.ok) return reply(request, { error: parsed.error, field: parsed.field ?? null }, 400);

  if (!perVisitor(clientIp(request)) || !overall('all')) {
    return reply(request, { error: 'Too many enquiries. Please call or message us on LINE.' }, 429);
  }

  try {
    await captureWebsiteLead(parsed.lead);
    return reply(request, { ok: true });
  } catch {
    return reply(request, { error: 'Could not send your enquiry. Please try again or message us on LINE.' }, 500);
  }
}
