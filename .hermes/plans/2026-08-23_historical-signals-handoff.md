# Historical Buying Signals — handoff (2026-08-23 evening)

## Status
DATA DONE · CODE DONE · BUILD GREEN · DEPLOY BLOCKED ONLY ON UPLOAD PATH

## Approved scope (Phase 1, locked)
Overdue-vs-own-rhythm signal only: ≥3 orders, ≥90d span, non-intercompany,
flag when silent > max(21, 1.5×median gap), cap 5, evidence line each,
collapsed card below Action queue, never duplicate current activity.

## DB state (verified)
- `reorder_signals` view live: 14 overdue rows, all correct per rule.
- ALL 14 linked in `customer_link` (match_confidence=manual, reviewed=true).
- Pat-confirmed: Broccoli Revolution, Million Foods, Aleenta Resort Phang Nga,
  Central Food Retail FDC → Central Tops TOngtin (same relationship).
- Sunshine Market → Gourmet market REJECTED by Pat; standalone company made instead.
- 10 companies created today: active_customer, tag `historical-buyer`,
  lead_source `historical-sales-import`, evidence in notes.
- Veganerie auto-link still unreviewed. RLS: anon can't read sales/customers/
  customer_link or write links (42501); view bypasses RLS; writes need sb_secret key.

## Code (uncommitted working tree)
- src/lib/historical.ts PATCHED: gate on crm_company_id + client-side sort by
  severity_days × median_value before slice(0,5). Both audit defects fixed.
- ReorderSignalsCard wired into page.tsx (~line 517). npm run build green.
- Prebuilt prod output ALREADY COMPILED in .vercel/output (37MB).

## Deploy — next step (Pat runs in his terminal)
Agent-shell vercel uploads hang forever (3 zombies removed; rmun52iue still prod).
    cd ~/Projects/LeadPulse
    vercel deploy --prebuilt --prod
Then: verify Ready → promote/alias to leadpulse-one-ashen.vercel.app
(recipe: jarvis skill ref leadpulse-retention-and-deploy §B) → confirm card.
Expected first five on Home: Tropical Island, Tantraphan Supermarket, OHTL,
Sunshine Market, Slow Combo Retail (Central/Million/Aleenta/Broccoli suppressed
by recent touches/open deals — unlocks over coming days/weeks).

## Deferred
- Dedupe same-day invoices in view SQL (Tantraphan median_gap=0 artifact).
- customer_link anon-write policy needed for any in-app mapping UI.
- Dismiss/Snooze are localStorage-only per device (accepted trade-off).
- Recommend git remote + Vercel git integration to end CLI deploys entirely.
