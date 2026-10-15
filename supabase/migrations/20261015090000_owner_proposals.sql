-- Owner / decision-maker proposals, and press interviews as a source Pat confirms.
--
-- ADDITIVE. A proposal can now name a company's owner or decision maker (field
-- 'decision_maker', value = the person's name, details.job_title = the role as published).
-- On Save the webhook creates ONE new contact (identity_quality 'named', status
-- 'uncontacted') and records the source; it never edits an existing contact or sets
-- companies.decision_maker_contact_id, which stays Pat's call.
--
-- 'press' (an interview or article that names the owner) is allowed as a source for
-- proposals and for the evidence of a value Pat approved. The Hermes helper still never
-- writes a press-sourced value on its own: press is proposal-only.
--
-- DBD (the registry of directors) blocks automated access, so it is not a source here;
-- each owner proposal carries a DBD search link for Pat to check by hand before Save.

alter table public.enrichment_proposals add column if not exists details jsonb;

alter table public.enrichment_proposals drop constraint if exists enrichment_proposals_field_check;
alter table public.enrichment_proposals add constraint enrichment_proposals_field_check
  check (field in ('website', 'decision_maker'));

alter table public.enrichment_proposals drop constraint if exists enrichment_proposals_source_tier_check;
alter table public.enrichment_proposals add constraint enrichment_proposals_source_tier_check
  check (source_tier in ('own_site', 'official_social', 'official_listing', 'press'));

alter table public.enrichment_proposals drop constraint if exists enrichment_proposals_details_check;
alter table public.enrichment_proposals add constraint enrichment_proposals_details_check
  check (field <> 'decision_maker'
         or (jsonb_typeof(details) = 'object' and length(trim(coalesce(details->>'job_title', ''))) > 0));

alter table public.enrichment_evidence drop constraint if exists enrichment_evidence_source_tier_check;
alter table public.enrichment_evidence add constraint enrichment_evidence_source_tier_check
  check (source_tier in ('own_site', 'official_social', 'official_listing', 'third_party', 'press'));
