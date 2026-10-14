-- Values the enrichment job found but may not save on its own: each one waits for Pat.
--
-- ADDITIVE. A new table; no existing table or row changes. Hermes inserts a proposal only
-- after its quote passed the source check (the page was fetched, the quote is on it and the
-- value is inside the quote). LeadPulse sends pending proposals to Telegram with Save / Not
-- theirs buttons; the webhook records Pat's decision and, on Save, writes the value with a
-- read-back and an enrichment_evidence row. Nothing is applied without that tap.
--
-- field is an allowlist that widens one field at a time, each with its own review. It starts
-- with companies.website only.
--
-- A value proposed once is never proposed again for the same record and field (unique
-- index), so a rejected website does not come back every run.
--
-- Anon key: select, insert and update (to record a decision); no delete. Not a security
-- boundary (the app has no auth layer); the webhook checks Telegram's secret token and
-- Pat's chat id before deciding anything.

create table if not exists public.enrichment_proposals (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('company', 'contact')),
  entity_id uuid not null,
  company_id uuid not null references public.companies(id) on delete cascade,
  field text not null check (field in ('website')),
  value text not null check (length(trim(value)) > 0),
  -- what the field held when proposed; a Save is refused if it has changed since
  current_value text,
  source_url text not null check (source_url ~ '^https?://'),
  source_tier text not null check (source_tier in ('own_site', 'official_social', 'official_listing')),
  quote text not null check (length(trim(quote)) > 0),
  quote_check text not null check (quote_check = 'passed'),
  -- how it was found, in a few words ("search result 1 for ...; homepage names the company")
  reason text,
  status text not null default 'pending'
    check (status in ('pending', 'applied', 'rejected', 'stale', 'failed')),
  decision_note text,
  run_ref text,
  proposed_at timestamptz not null default now(),
  telegram_message_id bigint,
  sent_at timestamptz,
  decided_at timestamptz,
  check ((status = 'pending') = (decided_at is null))
);

create unique index if not exists enrichment_proposals_once_idx
  on public.enrichment_proposals (entity_type, entity_id, field, lower(value));
create index if not exists enrichment_proposals_pending_idx
  on public.enrichment_proposals (proposed_at) where status = 'pending';

alter table public.enrichment_proposals enable row level security;
drop policy if exists "Read for anon" on public.enrichment_proposals;
create policy "Read for anon" on public.enrichment_proposals for select to public using (true);
drop policy if exists "Propose for anon" on public.enrichment_proposals;
create policy "Propose for anon" on public.enrichment_proposals for insert to public with check (status = 'pending');
drop policy if exists "Decide for anon" on public.enrichment_proposals;
create policy "Decide for anon" on public.enrichment_proposals for update to public using (true) with check (true);
