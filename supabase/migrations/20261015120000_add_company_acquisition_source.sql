-- How an account was acquired: Pat's own outreach, a Meta (Facebook/Instagram) ad,
-- a referral, or another inbound route — plus the campaign or ad name when known.
--
-- ADDITIVE. Two nullable columns on companies. Deals carry no copy: a deal's source is
-- its company's, read through deals.company_id, so the Pipeline filter and the funnel
-- never disagree with the account. The free-text companies.lead_source (from the
-- original setup script) is left as it is; this is the closed field reports read.
--
-- Deliberately NO backfill. null means "not recorded", and existing accounts stay null
-- until Pat sets them; a source is never inferred from history.
--
-- No RLS change: companies already has its policy, and soft-deleted rows
-- (deleted_at) keep their source so a restore brings it back.

alter table public.companies
  add column if not exists acquisition_source text;

alter table public.companies
  add column if not exists acquisition_campaign text;

comment on column public.companies.acquisition_source is
  'How the account was acquired: outbound | meta_ad | referral | inbound_other. null = not recorded.';
comment on column public.companies.acquisition_campaign is
  'Optional campaign or ad name for the acquisition source, e.g. the Meta ad set.';

-- Closed vocabulary as a DATABASE guard, not just a TypeScript type. Changing a value
-- here means changing ACQUISITION_SOURCES in src/utils/acquisition-source.ts in the
-- same commit.
alter table public.companies
  drop constraint if exists companies_acquisition_source_check;

alter table public.companies
  add constraint companies_acquisition_source_check
  check (acquisition_source is null or acquisition_source in ('outbound', 'meta_ad', 'referral', 'inbound_other'));

create index if not exists idx_companies_acquisition_source
  on public.companies (acquisition_source)
  where deleted_at is null;
