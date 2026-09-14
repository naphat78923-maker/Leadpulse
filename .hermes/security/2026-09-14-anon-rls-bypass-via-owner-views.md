# SECURITY FINDING — anon can read revenue data through owner-privilege views

**Date:** 2026-09-14
**Severity:** High
**Status:** OPEN — no policy, view, or grant was changed. Report only.
**Found while:** building the revenue signal detector (unrelated to its correctness; the detector merely made the read path visible).

---

## Summary

The LeadPulse Supabase project enforces RLS correctly on its base tables — and
then three views hand the same data to the unauthenticated `anon` role anyway.
The views are owned by `postgres` and were created without `security_invoker`,
so they execute with the **owner's** privileges and are not filtered by the RLS
policies the underlying tables enforce.

`anon` is not a hypothetical role here. The project has **no auth layer**, and
the anon key **is shipped in the client bundle** (verified below), so every
reader of the app is `anon`.

Net effect: `sales` correctly returns zero rows to an anonymous caller, while a
view over `sales` returns 439 rows of line-level revenue to that same caller.

---

## Mechanism

PostgreSQL views default to running with the privileges of the view **owner**
(`postgres`) unless `security_invoker = true` is set. Supabase runs **17.6**, so
`security_invoker` is available. All three views in `public` lack it:

```
pg_version: 17.6
views: 3
views_without_security_invoker: 3
```

The base tables themselves are configured correctly:

| object | RLS | policy |
|---|---|---|
| `sales` | on | `authenticated full access sales` (role `authenticated`) |
| `customers` | on | `authenticated full access customers` (role `authenticated`) |
| `customer_link` | on | **none** (deny-all) |
| `companies` / `deals` / `meetings` | on | `Allow all for anon` (role `public`) |
| `account_events` | **off** | — |

Because LeadPulse has no auth layer, the app connects as `anon`. The
`authenticated`-only policies therefore deny it — and PostgREST returns **zero
rows with no error**, which is indistinguishable from a genuine empty result.

---

## Verified evidence

Read with the app's **own anon client** (`src/lib/supabase.ts`), `count: 'exact'`:

```
companies          count=204   OK
deals              count=173   OK
account_events     count=371   OK
meetings           count=76    OK
sales              count=0     ← denied, silently
customers          count=0     ← denied, silently
customer_link      count=0     ← denied, silently
unified_sales      count=439   ← READABLE despite sales being denied
reorder_signals    count=15    ← READABLE, and exposes customer names
real_revenue       count=418   ← READABLE, line-level revenue
```

The anon key reaching browsers is confirmed, not assumed — the key literal from
`src/lib/supabase.ts` (208 chars, sha256 `a39a602b1aa2815d…`) is present in a
client chunk under `.next/static/chunks/`, alongside the project host.

**Which views the product actually uses:** only `reorder_signals`, read by
`src/lib/historical.ts`. **`unified_sales` and `real_revenue` have no consumer
anywhere in `src/`** — they are exposed surface with nothing reading them.

---

## Impact

An unauthenticated caller holding the shipped bundle can:

1. **Read line-level historical revenue** — `real_revenue` and `unified_sales`
   expose document number, date, customer id, amount in THB and original
   currency, per invoice line. That is the commercial ledger.
2. **Attribute revenue to a named party.** `reorder_signals` exposes
   `name_en` (from `customers`, a table `anon` is correctly denied) plus
   `order_count`, `median_value`, `days_since_last`, `threshold_days` and
   `crm_company_id`. Joined against `companies` (anon-readable), revenue is
   attributable to named CRM accounts — the exact inference the
   `authenticated`-only policy exists to prevent.
3. **Derive counterparty behaviour** — order cadence, typical order value, and
   which accounts are lapsing.

No credentials are needed beyond what the bundle already carries.

---

## Why this was NOT fixed here

- Changing policies or view definitions is a schema and access-control change,
  outside the authorised scope ("Do not change any policy or view yourself").
- The obvious one-line fix is a **trap**: setting `security_invoker = true` on
  `reorder_signals` would start returning zero rows to `anon`, which would
  silently break the Signals surface (`src/lib/historical.ts`). Both the
  exposure and the fix cross a real product dependency.
- `security_invoker` on a view whose base tables are `authenticated`-only cannot
  work while the app has no auth layer. The root cause is architectural, not a
  missing flag.

---

## Remediation options (for Pat's decision — none applied)

**Option 1 — remove the dead exposure (smallest, safest, immediate).**
`unified_sales` and `real_revenue` have no in-app consumer. Dropping them (or
revoking `anon` SELECT on them) removes 439 + 418 rows of revenue exposure with
zero product impact. **Recommend doing this first regardless of what else is
chosen.**

**Option 2 — narrow what `reorder_signals` exposes.** It only needs to power the
Signals surface. If it dropped `name_en`, `median_value` and `crm_company_id`
(returning an opaque id, or resolving names server-side), the commercial detail
stops leaking. Requires changing `src/lib/historical.ts` in step.

**Option 3 — introduce authentication and a server-side credential.** The
correct long-term fix: server routes hold a privileged key, `anon` gets no
revenue access at all, and RLS becomes meaningful. Largest change; also unblocks
the revenue detector's need for raw order history.

**Option 4 — `security_invoker = true`.** Correct as a hardening step, but on its
own it breaks every anon read the app currently depends on. Only viable
**together with** Option 3.

---

## What I did NOT determine

- **Whether this data has already been accessed by anyone else.** I have no
  access-log evidence of who read these views and cannot say whether the
  exposure was ever exercised. Read-only ClickHouse log queries against the
  Supabase log store were not run.
- **Whether the anon key has been rotated** or is presumed public. It is
  bundled by design, so rotation alone does not remediate this.
- **The full reachable surface.** I enumerated only the objects related to this
  investigation; I did not audit every table and view in `public` for the same
  pattern (there are 3 views in total, all affected — but I did not audit
  `interactions` or other dormant objects).

---

## Reproduction

```bash
# from the repo root, using the app's own client
node -e "
import('./src/lib/supabase.ts').then(async ({supabase}) => {
  for (const t of ['sales','unified_sales','real_revenue','reorder_signals'])
    console.log(t, (await supabase.from(t).select('*',{count:'exact'}).limit(1)).count);
});"
# expect: sales 0, unified_sales 439, real_revenue 418, reorder_signals 15
```
