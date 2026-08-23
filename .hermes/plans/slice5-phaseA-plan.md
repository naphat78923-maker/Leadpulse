# LeadPulse Slice 5 — Phase A Plan + Future CSV Pipeline

**Status:** Phase A implementation planned & agreed. Resolved open Qs per Pat (2026-08-21).
**Scope of THIS doc:** (1) Phase A pure scoring function, (2) be prepared for a sales-history CSV pipeline (data arrives later, converted to CSV, "all the customer retention I'll ever need").

---

## A. Resolved open questions (Pat approved recommendations)
1. **account_events source** → Pipe the future sales CSV into `account_events` (M needs $ amounts Meetings lack). Keep `meetings` as the event truth for R/O.
2. **Recompute cadence** → On-read compute + daily cache (not monthly cron).
3. **Referrals** → Pat-logged `referral` meeting type now; contact opt-in survey is Phase 2.

## B. Scoring model to implement (from `retention-account-health-spec.md`, NOT the older plan's subtractive formula)
AHS = 100 × (0.30·R + 0.25·F + 0.25·M + 0.20·O), each sub ∈ [0,1].
- Interim weights (no M yet): R 0.40 / F 0.33 / O 0.27.
- Tiers: Healthy ≥75 · Watch 50–74 · At-risk 25–49 · Dormant <25.
- Auto-switch to full weights the moment `account_events` has rows for that company.

> DISCREPANCY NOTE: `.hermes/plans/slice5-retention-watch.md` uses a different
> subtractive formula + tiers (Champion≥80…At-risk<40). This Phase A follows the
> spec doc (has real worked examples). Reconcile the plan file before 5c/UI.

## C. Phase A deliverable (pure, read-only, zero DB change)
File: `src/utils/accountHealth.ts`
- `accountHealthScore(inputs): { score, tier, R, F, M, O, weightsUsed, missing: string[] }`
- Pure function; takes a typed `HealthInputs` object, no Supabase calls.
- Safe defaults for not-yet-existing fields:
  - `accountType` unknown → expected_interval = 60 (spec default)
  - `standingOrder` undefined → treated as false
  - `events` empty → M=0, uses interim weights, flags `missing: ['monetary']`
  - `referrals` 0 → O computed from meetings/deals only
- `daysSince` uses `max(meeting.date, lastOrder.date)` with fallback to `company.created_at`.
- Exports `RETENTION_WEIGHTS` (interim + full) and `AHS_TIERS` for reuse/UI.
- Single source of truth for the formula → 5b/5c consume it.
- Matches `lead-scoring.ts` style (typed, no side effects, clamp helper).

## D. Future CSV pipeline (PREPARE NOW, run LATER when data arrives)
Goal: ingest years of sales history → `account_events` → unlocks M + full weights.

### D.1 Expected CSV shape (Pat will convert; we digest later)
Likely columns (normalize on ingest):
`date, company_name, company_id?, amount, product_line, order_id, qty, source`
- `product_line` ∈ {butter, gelato, bread, …} → drives M breadth
- Multiple files over years → append, dedupe by `order_id`.

### D.2 Ingest script (dry-run first, like the earlier SAL_EXC importer)
`scripts/import-sales-history.ts` (Node, tsx):
- Reads one-or-many CSVs from a `--dir` or `--file`.
- Fuzzy-matches `company_name` → `companies.id` (Thai names; reuse the NAME_MAP pattern from the earlier SAL_EXC importer).
- Maps `product_line` → known product enum; unknown → logged, not dropped.
- Validates: non-null amount (฿), parseable date; skips + reports bad rows.
- **Dry-run by default** (prints row counts, match rate, would-be inserts).
- `--apply` only after Pat reviews the dry-run + types `yes`.
- Never creates tables; assumes `account_events` migration exists (Phase B schema).

### D.3 Schema to create in Phase B (Supabase dashboard SQL, RLS off for solo)
`account_events`: id uuid pk, company_id uuid fk, date date, amount numeric,
product_line text, source text, order_id text unique, created_at timestamptz.
Plus `companies.standing_order_flag bool default false`,
`meetings.type` add `'referral'`.

### D.4 Freshness
On-read compute now; add daily cache (`account_state` materialized) in Phase E so
the pipeline's large history doesn't slow per-request scoring.

## E. Acceptance for Phase A
- `npx tsc --noEmit` clean.
- Unit-checked against the 4 worked examples in the spec (Mall 2.7, Vistro 37.6,
  Earthling 23.7, healthy 94.1) via a temporary test run (not committed unless wanted).
- No new DB tables, no `package.json` change, no route change.
- Build green. (Deploy only if Pat wants; Phase A is logic, not UI.)

---

## F. Phase D — Account-Watch UI + pipeline wiring (built 2026-08-22)

**UI: `src/app/retention/page.tsx`** (new route `/retention`)
- Consumes the verified `accountHealthScore()` (interim weights R/F/O; M=0
  until `account_events` is piped).
- KPI strip: Needs Action (watch+at-risk+dormant), Watch, Healthy, Monitored.
- Per-company **health ring** (score 0–100, SVG, tier-colored) + tier pill.
- Card rows: last touch date, days-silent, R/F/O sub-scores, "M pending"
  badge when on interim weights, and **why-flagged** chips (Silent 290d,
  No reorder yet, Revenue not logged, etc.).
- Filter pills (All/Healthy/Watch/At-risk/Dormant) + search; action-needed
  accounts sorted to the top.
- **Win-back loop:** "Log touch" button → existing `LogInteractionModal`
  pre-linked to the company (and an open deal if any). Saving logs the
  interaction AND updates `companies.last_contact_date` (via CrmProvider),
  which raises R on next refresh. Retention action closes the loop.
- Tapping the name opens the existing `CompanyDetail` for context.
- Added `HeartPulse` nav entry in `Sidebar.tsx`. Follows analytics-page
  patterns (loading spinner, mock-data fallback, clay tokens, 44px touch).

**Pipeline prep (ready; NOT run):**
- `supabase/migrations/20260822_add_account_events.sql` — creates
  `account_events` (+ `order_id`, `standing_order_flag`), RLS off. Run this
  in the Supabase dashboard SQL editor before importing.
- `scripts/import-account-events.py` (already existed) — dry-run SAL_EXC
  importer with NAME_MAP + fuzzy match; `--apply` gated. When Pat's full
  years-of-sales CSV arrives: drop it in, fill NAME_MAP, run dry-run,
  review UNMATCHED, run the SQL migration, then `--apply`.

**Acceptance met:** `npx tsc --noEmit` clean; `npm run build` green;
route `/retention` live at `leadpulse-one-ashen.vercel.app/retention`;
nav entry present; no DB or package.json change in this step (DB migration
is a separate, explicitly-gated step Pat runs).
