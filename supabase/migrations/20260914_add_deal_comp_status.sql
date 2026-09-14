-- LeadPulse — PROPOSED, NOT APPLIED. Awaiting Pat's explicit approval for this
-- change and this project. Do not run this from an automated path.
--
-- WHY: payment / comp state for a deal's test or order. This is the field the
-- revenue-signal detector needs and the schema does not have. Verified
-- exhaustively on 2026-09-14 against the live project: no column matching
-- pay/paid/comp/discount/free/price/cost/settle/receipt/collect/cash exists
-- anywhere in `public`; `sales.document_type` holds only 'Invoice' (441 rows)
-- and 'Credit Note' (2 rows) — there is no receipt/paid document type, so an
-- issued invoice is not evidence of payment; and `deals.sample_status`
-- ('sent' | 'received') is delivery state only.
--
-- CONSEQUENCE IF NOT APPLIED: `paid-test-no-conversion` (the highest-priority
-- signal in the spec) and the free/comped leg of `sample-stalled-no-meeting`
-- cannot be built. paid-vs-free is not derivable, and deriving it from order
-- value or `is_zero_value` is explicitly prohibited.
--
-- Convention: additive only. `add column if not exists` + a check constraint.
-- `deals` has no RLS change needed (existing table, app writes via anon key).

alter table public.deals
  add column if not exists comp_status text not null default 'unknown';

alter table public.deals
  add column if not exists paid_test_date date;

comment on column public.deals.comp_status is
  'Payment state of a test/order. unknown = not recorded. Never inferred from order value or is_zero_value.';

-- Closed vocabulary as a DATABASE guard, not just a TypeScript type: the
-- database is the second copy that catches a bad writer. Changing a value here
-- means changing `CompStatus` in src/types/crm.ts in the same commit.
alter table public.deals
  drop constraint if exists deals_comp_status_check;

alter table public.deals
  add constraint deals_comp_status_check
  check (comp_status in ('paid', 'comped', 'unknown'));

-- Deliberately NO backfill and no data migration: every existing row takes the
-- default 'unknown'. 'unknown' is the honest value for history we cannot
-- evidence — it is not a gap to be filled by inference.
--
-- Writer: `buildCompStatusUpdate()` in src/utils/deal-board.ts ships in the same
-- slice as this file, per "no column without its writer". It is not yet called
-- from any surface — UI wiring is out of scope until the deals/pipeline and
-- nudges/signals surfaces are consolidated.
