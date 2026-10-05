-- Security advisor: rls_disabled_in_public (activity_events, account_events)
--
-- Both tables are read and written from the browser with the anon key
-- (src/lib/crm.ts: getActivityEvents/createActivityEvent/updateActivityEvent,
-- getAccountEvents/createAccountEvent/recordOrderForClosedDeal), and
-- scripts/import-account-events.py also writes account_events with the anon key.
-- Turning RLS on without a policy would make every one of those calls return
-- nothing or fail, so each table gets the same single permissive policy as
-- companies, deals, meetings and prospect_reviews.
--
-- This is NOT a security boundary: the app has no authentication layer, so anyone
-- holding the anon key keeps full read/write access, exactly as before. It brings
-- these two tables in line with the rest of the schema and gives one place to
-- tighten access if an auth layer is added. It supersedes the "RLS OFF" convention
-- noted in 20260822_add_account_events.sql.

alter table public.activity_events enable row level security;
drop policy if exists "Allow all for anon" on public.activity_events;
create policy "Allow all for anon" on public.activity_events
  for all to public using (true) with check (true);

alter table public.account_events enable row level security;
drop policy if exists "Allow all for anon" on public.account_events;
create policy "Allow all for anon" on public.account_events
  for all to public using (true) with check (true);
