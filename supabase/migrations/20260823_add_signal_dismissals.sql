-- ============================================================================
-- LeadPulse — Synced signal dismissals
-- Replaces per-browser localStorage dismissals with a Supabase-backed store,
-- so Dismiss/Snooze follow Pat across devices.
--
-- Semantics match the app contract exactly:
--   dismissed_until = epoch ms until which the signal is hidden
--     - Number.MAX_SAFE_INTEGER (9007199254740991) = permanent dismiss
--     - Date.now() + 30d                          = snooze
--
-- Solo mode: "Allow all for anon" policy, matching setup-supabase.sql.
-- Additive, idempotent. Safe to re-run.
-- ============================================================================

create table if not exists public.signal_dismissals (
  customer_id     text primary key references customers(customer_id) on delete cascade,
  dismissed_until bigint not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.signal_dismissals enable row level security;

drop policy if exists "Allow all for anon" on public.signal_dismissals;
create policy "Allow all for anon"
  on public.signal_dismissals for all
  using (true) with check (true);

-- Reads are one row per dismissed customer; the table stays tiny.
create index if not exists idx_signal_dismissals_until
  on public.signal_dismissals (dismissed_until);
