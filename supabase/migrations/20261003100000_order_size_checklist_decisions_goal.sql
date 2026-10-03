-- 2026-10-03: four additive pieces, none touching existing data.
--
-- 1. deals.stated_order_kg — the order size the buyer stated, saved on purpose from
--    the card's kg chip (it is read from buyer_reply by code; this is the confirmed copy).
-- 2. deals.call_checklist — answers to the short qualifying checklist (who decides,
--    monthly volume, current product), as one JSON object so questions can change
--    without a migration.
-- 3. laya_review_decisions — Pat's confirm/reject on a deal Laya routed to review.
--    Append-only: the newest row per (deal, input) is the decision; older rows are the
--    calibration record.
-- 4. sales_goals — one revenue goal per month.
--
-- The app has no sign-in, so like the other app tables these are writable by anon.
-- laya_review_decisions allows insert and select only: a decision is never edited.

alter table public.deals add column if not exists stated_order_kg numeric
  check (stated_order_kg is null or stated_order_kg > 0);
alter table public.deals add column if not exists call_checklist jsonb
  check (call_checklist is null or jsonb_typeof(call_checklist) = 'object');

create table if not exists public.laya_review_decisions (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  -- the judged input the decision is about (laya_judgments.input_sha256); null for a
  -- Thai reply, which is never sent to Laya
  input_sha256 text check (input_sha256 is null or input_sha256 ~ '^[0-9a-f]{64}$'),
  decision text not null check (decision in ('confirm', 'reject')),
  base_tier text not null check (base_tier in ('S', 'A', 'B', 'C', 'D')),
  suggested_tier text check (suggested_tier is null or suggested_tier in ('S', 'A', 'B', 'C', 'D')),
  momentum numeric,
  -- why Laya sent it to review, as shown when the decision was made
  review_reasons text[] not null default '{}',
  decided_at timestamptz not null default now()
);

create index if not exists laya_review_decisions_deal_idx
  on public.laya_review_decisions (deal_id, decided_at desc);

alter table public.laya_review_decisions enable row level security;
drop policy if exists "Read for app" on public.laya_review_decisions;
create policy "Read for app" on public.laya_review_decisions
  for select to anon, authenticated using (true);
drop policy if exists "Insert for app" on public.laya_review_decisions;
create policy "Insert for app" on public.laya_review_decisions
  for insert to anon, authenticated with check (true);
revoke update, delete, truncate on public.laya_review_decisions from anon, authenticated;
grant select, insert on public.laya_review_decisions to anon, authenticated;

create table if not exists public.sales_goals (
  -- first day of the month the goal is for
  month date primary key check (extract(day from month) = 1),
  amount numeric not null check (amount >= 0),
  updated_at timestamptz not null default now()
);

alter table public.sales_goals enable row level security;
drop policy if exists "Allow all for anon" on public.sales_goals;
create policy "Allow all for anon" on public.sales_goals
  for all to anon, authenticated using (true) with check (true);
revoke truncate on public.sales_goals from anon, authenticated;
grant select, insert, update, delete on public.sales_goals to anon, authenticated;
