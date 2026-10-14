-- Where every enriched value came from: one row per field the enrichment job wrote or held.
--
-- ADDITIVE. A new table; no existing table or row changes. The Hermes enrichment helper
-- writes a row for each field it fills (outcome 'applied') and for each field it refused
-- because its quote could not be checked against the live page (outcome 'held'), so
-- LeadPulse can show the source next to a value and Pat can see what was held and why.
--
-- quote is the exact text on source_url that contains the value. quote_check 'passed'
-- means the helper re-fetched source_url and found the quote there, and found the value
-- inside the quote; 'failed' means it did not, and the value was not written.
--
-- Append-only from the anon key: select and insert, no update or delete policy. A later
-- correction is a new row, so the history of what was claimed and from where survives.

create table if not exists public.enrichment_evidence (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('company', 'contact')),
  -- null only for a held value on a contact that was never created
  entity_id uuid,
  company_id uuid not null references public.companies(id) on delete cascade,
  field text not null,
  value text not null,
  source_url text not null check (source_url ~ '^https?://'),
  source_tier text not null check (source_tier in ('own_site', 'official_social', 'official_listing', 'third_party')),
  quote text not null,
  quote_check text not null check (quote_check in ('passed', 'failed')),
  outcome text not null check (outcome in ('applied', 'held')),
  hold_reason text,
  method text,
  fetched_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  run_ref text,
  check (entity_id is not null or outcome = 'held')
);

create index if not exists enrichment_evidence_entity_idx on public.enrichment_evidence (entity_type, entity_id);
create index if not exists enrichment_evidence_company_idx on public.enrichment_evidence (company_id, recorded_at desc);

alter table public.enrichment_evidence enable row level security;
drop policy if exists "Read for anon" on public.enrichment_evidence;
create policy "Read for anon" on public.enrichment_evidence for select to public using (true);
drop policy if exists "Append for anon" on public.enrichment_evidence;
create policy "Append for anon" on public.enrichment_evidence for insert to public with check (true);
