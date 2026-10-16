-- Profile-field and new-lead proposals.
--
-- ADDITIVE. Two more company fields Pat can approve from Telegram, and a new kind of proposal
-- for a business that is not in LeadPulse yet. No existing row changes.
--
--   what_they_make  companies.what_they_make, in the account's own words (its menu or about
--                   page). Its column comment already says a value from the website is saved
--                   only after Pat approves it; this is that approval.
--   address         companies.address, from the account's own contact page.
--   new_company     a business found in a guide or the press that Laya judged a fit. It has no
--                   company yet, so entity_id and company_id are null; value is its name and
--                   details hold industry, tags, area and Laya's fit. Save creates one prospect
--                   company (no deal, no contact) and records where the name came from.

alter table public.enrichment_proposals alter column entity_id drop not null;
alter table public.enrichment_proposals alter column company_id drop not null;

alter table public.enrichment_proposals drop constraint if exists enrichment_proposals_field_check;
alter table public.enrichment_proposals add constraint enrichment_proposals_field_check
  check (field in ('website', 'decision_maker', 'what_they_make', 'address', 'new_company'));

-- Only a new-company proposal may lack a company, and it must lack one.
alter table public.enrichment_proposals drop constraint if exists enrichment_proposals_subject_check;
alter table public.enrichment_proposals add constraint enrichment_proposals_subject_check
  check ((field = 'new_company') = (company_id is null and entity_id is null));

alter table public.enrichment_proposals drop constraint if exists enrichment_proposals_details_check;
alter table public.enrichment_proposals add constraint enrichment_proposals_details_check
  check ((field <> 'decision_maker'
          or (jsonb_typeof(details) = 'object' and length(trim(coalesce(details->>'job_title', ''))) > 0))
     and (field <> 'new_company'
          or (jsonb_typeof(details) = 'object' and length(trim(coalesce(details->>'industry', ''))) > 0)));

-- The same business is proposed once, however many guides name it.
create unique index if not exists enrichment_proposals_new_company_once_idx
  on public.enrichment_proposals (lower(trim(value))) where field = 'new_company';

-- Where a discovered company's name came from: its evidence row has no company until Save.
-- (enrichment_evidence.company_id stays required: Save records evidence after creating it.)
