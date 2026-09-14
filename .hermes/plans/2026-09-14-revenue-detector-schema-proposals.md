# Revenue detector — schema proposals (2026-09-14)

**Status:** proposals awaiting Pat's decision. **Nothing here has been executed.**
De-identified: no account names, contact routes, or customer detail.

Companion to the implemented slice: the account-level reason set in
`src/utils/deal-board.ts`, the report at `scripts/revenue-signal-report.ts`, and
the unapplied migration `supabase/migrations/20260914_add_deal_comp_status.sql`.

## Change log

- **2026-09-14 — Proposal 2 rejected as written** (Pat). No anon-readable view.
  Replaced with a privileged server-side credential. Escalated to its own
  security finding (see below).
- **2026-09-14 — ranking changed to recency-first.** Applied; see Proposal 4.

---

## Proposal 1 — `src/types/crm.ts` declares fields the database does not have

**Finding (first-hand, verified against live schema).** `Deal` declares the whole
"Sales Controls (2026-09-03)" block, but `deals` has **27 columns in the live
database** and none of them are those fields. Missing on the table:

`blocker`, `owner_contact_id`, `stale_days`, `test_recipient_contact_id`,
`test_application`, `test_conditions`, `test_result_texture`,
`test_result_flavour`, `test_feedback_date`, `reship_count`, `reship_history`,
`value_type`, `conflicting_signals`.

**Why it matters.** TypeScript compiles green against columns that do not exist.
`select *` returns nothing for them, so reads look like `undefined` rather than an
error; the first real *write* or an explicit `select('test_feedback_date')` fails
with `42703`. It is a landmine, not a fire — but it is loaded, and it silently
blocks any signal that wants a test/comp discriminator.

**Not changed.** Left exactly as-is. Removing type declarations that may describe
planned schema is Pat's call, not mine.

**Two routes, Pat chooses:**

- **Route A — add the columns.** A migration mirroring the declared types. Honest
  if the Sales Controls slice was designed but never shipped. Cost: the write
  paths for those fields must ship in the same slice ("no column without its
  writer"), so this is a real slice, not a patch.
- **Route B — mark them not-yet-live.** Keep the declarations (they document
  intent) but make the drift explicit so no reader trusts them: either a
  `not_yet_live` doc comment on each, or move the block behind a
  `PlannedDealFields` type the app does not consume. Cost: near zero.

**Recommendation: Route B now, Route A when that slice is actually scheduled.**
Optionally add a contract test asserting the declared-vs-live column diff so this
cannot silently drift further in either direction.

---

## Proposal 2 — the order-history tables are unreadable by the app's own client

**Finding (first-hand, verified against live RLS policies).** The detector cannot
see the historical order corpus through the app's read path:

- `sales` — RLS on, single policy for role `authenticated`
- `customers` — RLS on, policy for role `authenticated` only
- `customer_link` — RLS on with **zero policies** (deny-all)

LeadPulse has **no auth layer**, so the client connects as `anon` and PostgREST
returns **zero rows with no error**. Measured with the app's own client:
`sales` 0 rows, `customers` 0 rows, `customer_link` 0 rows — while
`unified_sales` (439), `reorder_signals` (15) and `real_revenue` (418) are fully
readable, as are `companies`, `deals`, `meetings` (anon policy) and
`account_events` (RLS disabled).

**Why it matters.** An account-level detector that needs *raw order history* can
only see the app-recorded branch (`account_events`), not the 441 invoiced sales
rows that constitute the real reorder history. `reorder-gap` and
`customer-no-won-deal` are therefore not evaluable live until this is resolved.

A first live run reported `reorder-gap=0` before this was caught. That was a false
negative produced by an unreadable source, not an empty result. The report script
now **refuses to run** (exit 2) when a required source returns zero rows, and
`--allow-partial-read` stamps the caveat into the artefact.

**~~Proposed fix — a view, not a grant.~~ REJECTED (Pat, 2026-09-14). Do not
create an anon-readable view.** A view readable by `anon` would re-create the
exact exposure this audit uncovered: it would hand the revenue ledger to every
holder of the bundled anon key.

**Agreed approach — a privileged server-side credential.** The detector is a
server-side script; it should authenticate with a privileged credential supplied
from the server environment, never `anon`. With such a credential it can read
`sales`, `customers` and `customer_link` directly, so **no new view is needed at
all**. The join logic already implemented in `scripts/revenue-signal-report.ts`
becomes the query that runs under that credential — not an object exposed to
`anon`:

```sql
-- runs inside the report script under the server credential, NOT exposed to anon
select l.crm_company_id as company_id, s.document_no, s.date, s.amount_thb
from sales s
join customer_link l on l.historical_customer_id = s.customer_id
where s.document_type = 'Invoice' and s.is_zero_value = false
  and l.crm_company_id is not null
  and s.customer_id not in (select customer_id from customers where is_intercompany = true)
union all
select e.company_id, coalesce(e.order_id, e.event_date::text), e.event_date, e.amount
from account_events e
where e.source not like 'backfill-from-sales%' and e.amount > 0;
```

**Escalation — now its own security finding.** The same read-path audit found the
three *existing* views are readable by `anon` and, because they run with the
owner's privileges, **bypass the RLS their base tables enforce**. That is a
separate, higher-severity issue with its own document:
`.hermes/security/2026-09-14-anon-rls-bypass-via-owner-views.md`.
**No policy or view was changed.**

**Rejected outright:** granting `anon` select on `sales`/`customer_link`, or
publishing any new view to `anon`. The anon key ships in the client bundle
(verified in `.next/static/chunks/`), so either would expose the revenue ledger.

---

## Proposal 3 — payment/comp field

See `supabase/migrations/20260914_add_deal_comp_status.sql`. Proposed, **not
applied** (verified: `deals` has no `comp_status` / `paid_test_date` column).
Writer `buildCompStatusUpdate()` ships in `src/utils/deal-board.ts` with tests.
Blocked signals stay blocked until it lands.

---

## Proposal 4 — APPLIED: ranking is recency-first, value second

**Requirement (Pat, 2026-09-14).** A 480-day silence against a 131-day habit is a
lost account, not a recoverable one. The top of the list was archaeology.

**What changed (presentation only — threshold logic untouched):**

- `AccountSignalItem` gained `last_order_date` and `days_since_last_order`.
  `days_since_last_order` is `null` when an account has no recorded order, and
  those rows sort last (no recency evidence).
- Sort order is now: `days_since_last_order ASC`, then `revenue_at_risk DESC`,
  then name, then reason. `revenue_at_risk` is retained as the **secondary** key.
- The report publishes `rank_rule` alongside `formula`, and every ranked line
  shows the recency evidence that produced its position.
- `revenue_at_risk = trailing_median_order_value × weight[reason]` is unchanged
  and still published.

**Exploratory check on the real corpus (200 accounts, 15 signalled):** the ranked
list is now monotonic in silence — 21d, 34d, 37d, 95d, 102d, 102d, 173d, 173d,
178d, 178d, 339d, 339d, 391d, 416d, 480d, 524d, 577d, 577d, 922d, 922d, 1162d,
1162d — with value breaking ties inside equal recency. The ฿48,715 account at
480 days fell from rank **1 to rank 15**; the 21-day lapse rose from 19 to 1.

**Tests:** four new assertions cover it, including one that proves the money-only
ordering would have been the reverse (rank 1 is worth ฿1,000 against rank 3's
฿100,000), and one asserting the change altered order and not membership — the
per-reason counts and reconciliation are identical.
