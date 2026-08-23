# Historical Buying Signals — handoff (updated 2026-08-23 late evening)

## Retention/sales mismatch REWORK (this session)
Pat reported retention scores didn't reflect past sales (Earth House = actually
Earthling Cafe). Root causes found and fixed:

1. **account_events never existed** — Slice 5 Phase B was deferred; scorer got
   zero revenue data (M hardcoded 0, F counted CRM won-deals, lastOrderDate
   never passed).
2. **Earthling (Thailand) Co., Ltd. was unlinked** — 49 invoices ฿112,256 net,
   last order 2026-08-11, invisible to everything. Pat confirmed Earthling Cafe
   = Earthling Thailand (NOT related to Earth House Bangkok, which is a
   different business and not in CRM or ledger).

### Done (verified live / built)
- customer_link row INSERTED via REST sb_secret:
  earthling-thailand-co-ltd → ca2e2ce4-31ca-4ecc-919a-4fa50b336709,
  match_confidence=manual, reviewed=true. /signals improves IMMEDIATELY.
- src/lib/crm.ts: getAccountEvents() + AccountEvent type added.
- CrmProvider.tsx: fetches account_events (graceful [] pre-DDL), exposes
  accountEvents, maps last_human_touch/next_touch_due onto companies.
- retention/page.tsx: passes events + lastOrderDate into accountHealthScore;
  lastTouch honors persisted last_human_touch; true distinct-order count
  (distinctOrderCountOf); card shows M sub-score when full weights + lifetime
  ฿ net · order count.
- Simulation with REAL scorer on live snapshot: Earthling Cafe 14→72
  (Dormant→#1, R .93/F 1.0/M .62); Aleenta 47→63; Veganerie 48→52;
  Central Tops 49→56. Stale-history accounts honestly dropped (Tropical
  Island −27, SKS −25, Tantraphan/Slow Combo −22).
- npm run build GREEN all routes.

### SQL APPLIED by Pat (2026-08-23 evening) — verified live
supabase/migrations/20260823_apply_account_events_backfill.sql ran in dashboard
SQL editor. REST readback: 216 invoice rows across 16 companies; Earthling Cafe
= 49 rows / ฿112,256 net / last order 2026-08-11 (exactly as predicted; delta
vs ~218 estimate = Invoice-only filter correctly skipping credit-note rows).
App fetch layer now receives real data on next load/deploy.

### DEPLOYED LIVE 2026-08-23 (by Jarvis with Pat's go-ahead)
Correction to earlier note: agent-shell uploads do NOT always hang.
`vercel deploy --prebuilt --prod --yes` completed in ~2min (dpl_HuuzVbHCasxKbEkNmHmTixpXqWuW,
READY) and auto-aliased leadpulse-one-ashen.vercel.app. Verified CONTENT not
just 200: new `accountEvents` identifier present in served chunks
(0ca4ikb9l2cpd.js, 17d4ft6n9up98.js); anon-key probe of account_events
returns all 216 rows. If a future upload does stall, kill the zombie,
retry once, then fall back to Pat-run.
Post-deploy content check for /retention: Earthling Cafe should show
~72 · Watch with `฿112,256 · 48 orders` on the card (hard-refresh first;
Next.js static shells can serve from browser cache).

## Phase 1 historical-signals scope (unchanged, locked)
Overdue-vs-own-rhythm only: ≥3 orders, ≥90d span, non-intercompany,
flag when silent > max(21, 1.5×median gap), cap 5, evidence lines,
collapsed Home card, never duplicate current activity.

## Still open
- Same-day invoice dedupe in view SQL (Tantraphan median_gap=0 artifact).
- customer_link anon-write policy for any future in-app mapping UI.
- Dismiss/Snooze localStorage-only per device (accepted trade-off).
- Recommend git remote + Vercel git integration to end CLI deploys (repo
  currently has NO remote — commits are local-only until that lands).
- Nutra Regenerative Protein soft-deleted 2026-08-23 but keeps 17
  account_events rows (฿15,429). Correct-by-design; restoring re-lights them.
- MILLION FOODS STATUS FLAG (raised 2026-08-23, Pat undecided): CRM status is
  `prospect` but ledger shows 7 invoices ฿65,783 (2024→2025-03). Prospect
  status excludes it from Retention entirely. Needs Pat's call: promote to
  active_customer (enters scoring) or leave as prospect.

## Link-completion session (2026-08-23 evening, data-only — NO deploy needed)
Pat approved + executed via REST: Veganerie auto-link CONFIRMED (manual/
reviewed). Sweep found ฿1.3M unlinked revenue; Pat ruled: Vistro Co., Ltd.
linked to Vistro (31 inv ฿131,787); Veganerie Corporation = SEPARATE business;
created + linked + backfilled CP Axtra Public Co., Ltd. (inactive, ฿416,513,
last buy 2024-10), Healthy Lux Head Office (active, 72 inv ฿147,898 thru
2026-08-11), The Mall Group (active, ฿109,743 single-day burst 2026-06-11),
Veganerie Corporation (active, 35 inv ฿92,835 thru 2026-08-08).
account_events now 369 rows across 21 company ids. All customer_link rows
manual/reviewed except none outstanding. Expected /retention after refresh:
Vistro ~69, Healthy Lux ~69, Veganerie Corp ~67, Veganerie ~60 (Watch);
Mall Group ~45 At-risk (single order — correct caution). ±few pts by
industry-derived reorder interval.
