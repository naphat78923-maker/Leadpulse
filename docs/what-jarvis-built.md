# LeadPulse: What Jarvis Built

**Audience:** Pat (product owner) and any future agent session picking up LeadPulse.
**Status:** As of 2026-08-26. Source-backed from session logs, the live DB, git history, and the repo.
**Repo:** `~/Projects/LeadPulse` · **Prod:** `https://leadpulse-one-ashen.vercel.app`
**DB:** Supabase project `mkyhikarlxuwvprjabbi` (linked via Supabase CLI).

This is a build ledger, not a how-to. It records what was actually shipped, what is open, and the non-obvious rules so we don't rebuild or contradict prior work.

---

## 1. Architecture (how it is wired)

- **Stack:** Next.js (App Router) + TypeScript + Supabase (Postgres + PostgREST). Client app talks to Supabase directly via an anon key.
- **Connection:** `src/lib/supabase.ts` exports a single `supabase` client (hardcoded URL + anon key). Do not multiply clients.
- **Data layer:** `src/lib/crm.ts` is the ONLY Supabase access point for the four core tables. Every read filters `.is('deleted_at', null)` (soft delete). Every write null-coerces blank UUID/date/value fields to avoid `22P02` type errors.
- **Types:** `src/types/crm.ts` is the single TS source of truth for the `Company / Contact / Deal / Meeting` shapes. Types and the live DB columns are confirmed in sync (introspected 2026-08-24).
- **Views (read-only, app consumes these):**
  - `reorder_signals` — ranked reorder predictions for linked CRM companies (read by `src/lib/historical.ts`).
  - `unified_sales` — merges invoice history + app-recorded sales; feeds `reorder_signals`.
  - `real_revenue` — billing-grade revenue view.
  - Note: there is **no** `historical_signals` view. The app never referenced one; that was a false alarm during review.

---

## 2. Features shipped (verified live or committed)

### A. Buying-signals loop (Aug 23, shipped to preview `b0cb54d`+`238124e`)
- Closed-won deal → automatic `account_events` row (source `app_closed_won`) → flows into `unified_sales` → drops the buyer's reorder signal instantly.
- **Critical gotcha we learned:** `account_events` already held 369 rows from a prior `backfill-from-sales-2026-08-23` job (a copy of invoice history). A naive UNION double-counted everything. Fix: `unified_sales` v2 excludes `source LIKE 'backfill-from-sales%'`. **Always check a deferred table is empty before unioning.**
- Dependency order: `reorder_signals` depends on `unified_sales`; drop child before parent (plain DROP VIEW fails `2BP01`).

### B. "Log sale" repeat-order path (Aug 23, `b0cb54d`)
- Company detail panel: 🛒 Sales section + **Log sale** → amount (required, ฿), date (default today), product optional → `createAccountEvent(..., 'app_manual')`.
- Both `app_closed_won` and `app_manual` feed the same signal math. E2E proven: a ฿2,500 test order dropped signals 14→13, then cleanup restored exactly 14.
- Rule for Pat: typing `value` on an already-won deal records nothing. Sale only fires on a Success-lane move; repeats go through Log sale.

### C. Auto-clear follow-up on close (Aug 23, `20260823_clear_followup_on_close.sql`)
- Trigger `trg_clear_followup_on_close` nulls `deals.followup_date` the moment a deal enters `closed_won`/`closed_lost`.
- Backfill cleared 11 stale dates. Live fire-test confirmed: planting a date on a closed deal gets nulled instantly.

### D. Explicit outbound fields (Aug 26, `20260826_add_explicit_outbound_fields.sql`, **live but untracked in git**)
- `deals.draft_primary_ask` (nullable TEXT) — client-facing primary ask, kept separate from internal `next_action`.
- `contacts.identity_quality` (TEXT, NOT NULL default `unknown`, CHECK in `named|role_only|company_route|unknown`) — contact-name classification.
- UI: `src/utils/contact-identity.ts` is the single source of truth for identity labels + name-field copy. Create/edit controls in `CreateModal`, `ContactDetail`, `DealDetail`. Tests in `src/lib/crm.test.ts`, `*.test.tsx` siblings.

### E. Detail-field hierarchy cleanup (Aug 26, uncommitted plan + work)
- Deal drawer no longer duplicates the deal name. Product/Priority/Value collapsed into a "Commercial details" section.
- Primary client ask shows inside an Ebimaru drafting brief only for outreach/reply/reschedule deals; stored asks never orphaned.
- "Second Phone" renamed to "Alternate phone" across create/detail.
- Non-scope (explicitly NOT changed): ContactStatus enum, CRM status data, Ebimaru cron config.

### F. "Do now" board (committed `b853664`)
- Filter/sort/search board over deals with attention states: `overdue | today | needs-review | all` (`src/utils/deal-board.ts`). Safe interaction logging via `updateDealIfUnchanged` (optimistic-concurrency guard in `crm.ts`): rejects a stale transition instead of overwriting a newer deal; treats a lost response as a no-op success if it already landed.

### G. Data hygiene sweep (Aug 24, executed by Jarvis)
- **17 overdue deal follow-ups** cleared (`followup_date` NULL) — verified 17/17.
- **2 meeting year-typos** fixed: `2023-07-01/02` → `2026-07-01/02`.
- 24 other overdue meetings intentionally left as a separate backlog (Pat's call).

---

## 3. Schema review result (2026-08-24, live introspection)

**Verdict: schema is correct and wired correctly.** Every core table, column, and CHECK constraint matches the TS types and `crm.ts`. No breakage.

Issues found (hygiene, not breakage):
1. **Security is wide open (by design, solo mode).** Anon key ships in the client; core tables have `Allow all for anon` RLS. Customer data is not access-controlled. Fix only when a second user arrives (add auth + per-row policies). `account_events`/`activity_events` RLS is *disabled* — align with the others so a future RLS flip doesn't lock them.
2. **`setup-supabase.sql` is stale** — missing `deleted_at`, `last_human_touch`, `next_touch_due`, `standing_order_flag` that live has via migrations. It is reference-only, not applied. Regenerate or label as historical.
3. **Untracked migration applied:** `20260826_add_explicit_outbound_fields.sql` exists live but is NOT committed. Commit it so the repo matches reality (matters for `supabase db reset` and handoffs).
4. **Type gap:** live `companies.standing_order_flag boolean NOT NULL` is undeclared in `types/crm.ts`. No runtime error (TS ignores extras) but add it for cleanliness.

---

## 4. Hard rules for future work (do not violate)

- **Consult before cascading renames.** Product/`leadpulse` is Pat's live CRM. Any schema/label/type rename must be confirmed with Pat first; preserve action-first UX and explicit Save + confirmation/undo.
- **Never expose secrets.** `sb_secret_*` (service-role) stays server-side only; the anon key is already in the client (acceptable for solo mode). Redact any key in chat.
- **Soft delete only.** Use `deleted_at`; never hard DELETE from the four core tables.
- **Null-coerce blanks.** Empty UUID/date/value strings → `null` on insert/PATCH, or Postgres throws `22P02`.
- **Don't assume a deferred table is empty** (see account_events backfill lesson).
- **Untracked migration + uncommitted work exist in the tree** (Aug 26). Before `supabase db reset` or handing off, reconcile git with live.

---

## 5. Open queue (as of 2026-08-26)

1. Value backfill on 67 deals (value now feeds forecast AND signal math).
2. 6 zero-channel contacts.
3. 24-meeting overdue backlog (separate from the 17-deal sweep, which is done).
4. Commit the untracked `20260826` migration + reconcile uncommitted Aug 26 UI work.
5. Security model decision (anon allow-all) before any multi-user future.

## 6. Pipeline (proposed, NOT started — Pat deferred)

### P1. Bill-scan ingestion for won deals ("Scan bill")
- In-app module on won deal / company: upload supplier invoice (digital PDF or photo) → extract customer, date, line items, total → **human review card** → explicit Save writes `account_events` (source `app_invoice_scan`). Reuses Log-sale + `unified_sales` → `reorder_signals` path. No new data model.
- Extraction: digital-PDF text parse first (free, server-side); scanned-photo vision-OCR as fallback. Never auto-write; always Pat-confirm.
- Privacy: process server-side inside Supabase boundary; customer bills are confidential. Gated behind the security-model work (#5).
- Open questions for when picked up: digital-PDF-only vs photo-OCR from day one; are bills mostly emailed digital or printed-photo?
- Status: deferred by Pat 2026-08-26, "done further in pipeline."

### P2. Competitive feature menu (from strategy chat, unprioritized)
- Tier 1 moat: per-product-line reorder cadence; standing-order auto-detection (uses live `standing_order_flag`); reorder probability + next-best-action.
- Tier 2 busywork: surgical morning push/digest; offline-first PWA; voice-note auto-log.
- Tier 3 field-sales: route/territory planning; visit check-in + shelf photo.
- Tier 4 intel: ฿ leaderboard + product-mix shift; churn/lost-deal reason capture.

---

## 6. How to verify anything here

- Live schema: introspect `mkyhikarlxuwvprjabbi` via `information_schema` / `pg_constraint` / `pg_policies` (read-only).
- Live data counts: `hermes -z "$(cat brief)"` headless runs reuse the Supabase MCP when the in-session MCP OAuth has expired (it expires repeatedly).
- `.env.local` is Vercel-CLI-format and malformed for shell `source` — do NOT source it; use the headless-MCP route for live queries.
