-- Why Pat skipped a proposal, and other names an account goes by.
--
-- ADDITIVE. A new nullable column and a new table; no existing row changes.
--
-- reject_reason: a new-lead proposal is skipped with Closed, Customer or Not a fit (other
-- proposals keep a plain "not theirs"). Hermes reads these: a guide that keeps naming closed
-- shops is dropped, and "Not a fit" is the evidence for tuning Laya's fit cutoff.
--
-- company_aliases: other names, website domains, handles and phones of an account, so a
-- business a guide calls "Earth House" is recognised as the customer "Earthling Cafe". Rows
-- come from Pat tapping "Same as <account>" on a proposal. Hermes reads them before proposing.

alter table public.enrichment_proposals add column if not exists reject_reason text;
alter table public.enrichment_proposals drop constraint if exists enrichment_proposals_reject_reason_check;
alter table public.enrichment_proposals add constraint enrichment_proposals_reject_reason_check
  check (reject_reason is null or (status = 'rejected' and reject_reason in ('closed', 'customer', 'not_fit')));

create table if not exists public.company_aliases (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  kind text not null check (kind in ('name', 'domain', 'handle', 'phone')),
  value text not null check (length(trim(value)) > 0),
  source text,
  created_at timestamptz not null default now()
);
create unique index if not exists company_aliases_once_idx on public.company_aliases (kind, lower(trim(value)));
create index if not exists company_aliases_company_idx on public.company_aliases (company_id);

alter table public.company_aliases enable row level security;
drop policy if exists "Read for anon" on public.company_aliases;
create policy "Read for anon" on public.company_aliases for select to public using (true);
drop policy if exists "Add for anon" on public.company_aliases;
create policy "Add for anon" on public.company_aliases for insert to public with check (true);
