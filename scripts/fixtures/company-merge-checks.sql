-- Merge two fixture accounts as the app does (anon key), check everything moved and was
-- filled, edit the kept account, undo, and check it all went back except the later edit.
-- Run by scripts/test-company-duplicates-migration.py after the migration is applied.
\set ON_ERROR_STOP 1
-- Veganerie (customer, kept) and Veganerie Corporation (merged), which has a branch.
insert into companies (id, name, status, website, address, tags, notes, last_contact_date, map_status, champion_contact_id, acquisition_source)
values ('11111111-1111-1111-1111-111111111111', 'Veganerie', 'active_customer', null, null, '{vegan}', 'Main contact Jajah', '2026-07-02', 'unknown', null, 'outbound'),
       ('22222222-2222-2222-2222-222222222222', 'Veganerie Corporation Co., Ltd.', 'active_customer', 'https://veganerie.co.th', '123 Sukhumvit', '{vegan,catering}', 'Invoices to HQ', '2026-08-08', 'partial', '33333333-3333-3333-3333-333333333333', 'meta_ad'),
       ('44444444-4444-4444-4444-444444444444', 'Veganerie Siam', 'prospect', null, null, '{}', null, null, 'unknown', null, null);
update companies set parent_company_id = '22222222-2222-2222-2222-222222222222' where id = '44444444-4444-4444-4444-444444444444';
insert into contacts (id, name, company_id) values ('33333333-3333-3333-3333-333333333333', 'Khun A', '22222222-2222-2222-2222-222222222222'),
  ('55555555-5555-5555-5555-555555555555', 'Jajah', '11111111-1111-1111-1111-111111111111');
insert into deals (id, title, client, company_id) values ('66666666-6666-6666-6666-666666666666', 'Butter', 'Veganerie Corporation Co., Ltd.', '22222222-2222-2222-2222-222222222222'),
  ('77777777-7777-7777-7777-777777777777', 'Custom', 'Someone else', '22222222-2222-2222-2222-222222222222');
insert into meetings (description, type, date, company_id) values ('call', 'call', '2026-08-08', '22222222-2222-2222-2222-222222222222');
insert into interactions (description, channel, occurred_on, company_id) values ('call', 'phone', '2026-08-08', '22222222-2222-2222-2222-222222222222');
insert into account_events (company_id, event_date, amount, source) select '22222222-2222-2222-2222-222222222222', '2026-01-01'::date + g, 100, 'import' from generate_series(1, 35) g;
insert into account_events (company_id, event_date, amount, source) select '11111111-1111-1111-1111-111111111111', '2026-01-01'::date + g, 100, 'import' from generate_series(1, 20) g;
insert into enrichment_evidence (entity_type, entity_id, company_id, field, value, source_url, source_tier, quote, quote_check, outcome, fetched_at)
  values ('company', '22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'address', '123 Sukhumvit', 'https://veganerie.co.th', 'own_site', '123 Sukhumvit', 'passed', 'applied', now());
insert into enrichment_proposals (entity_type, company_id, field, value, source_url, source_tier, quote, quote_check) values ('company', '22222222-2222-2222-2222-222222222222', 'phone', '02', 'https://x.co', 'own_site', 'q', 'passed');
insert into company_aliases (company_id, kind, value) values ('22222222-2222-2222-2222-222222222222', 'name', 'Veganerie Corp');
insert into customer_link (historical_customer_id, crm_company_id) values ('C-1', '11111111-1111-1111-1111-111111111111'), ('C-2', '22222222-2222-2222-2222-222222222222');
insert into prospect_reviews (company_id, decision, reason_code) values ('22222222-2222-2222-2222-222222222222', 'keep', 'fit');

set role anon;
select merge_companies('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222') as result \gset
reset role;
\echo :result
do $$
declare k companies%rowtype; o companies%rowtype; r record;
begin
  select * into k from companies where id = '11111111-1111-1111-1111-111111111111';
  select * into o from companies where id = '22222222-2222-2222-2222-222222222222';
  assert o.deleted_at is not null, 'merged archived';
  assert k.website = 'https://veganerie.co.th' and k.address = '123 Sukhumvit', 'filled website/address';
  assert k.tags = '{vegan,catering}', 'tags joined: ' || k.tags::text;
  assert k.notes = E'Main contact Jajah\n\nFrom Veganerie Corporation Co., Ltd.:\nInvoices to HQ', 'notes kept: ' || k.notes;
  assert k.last_contact_date = '2026-08-08', 'later contact date';
  assert k.champion_contact_id = '33333333-3333-3333-3333-333333333333' and k.map_status = 'partial', 'role and map status';
  assert k.acquisition_source = 'outbound' and k.status = 'active_customer' and k.name = 'Veganerie', 'source/status/name untouched';
  assert (select count(*) from contacts where company_id = k.id) = 2, 'contacts moved';
  assert (select count(*) from account_events where company_id = k.id) = 55, 'orders moved';
  assert (select client from deals where id = '66666666-6666-6666-6666-666666666666') = 'Veganerie', 'deal client renamed';
  assert (select client from deals where id = '77777777-7777-7777-7777-777777777777') = 'Someone else', 'other client kept';
  assert (select count(*) from deals where company_id = k.id) = 2, 'deals moved';
  assert (select count(*) from meetings where company_id = k.id) = 1 and (select count(*) from interactions where company_id = k.id) = 1, 'logs moved';
  assert (select count(*) from enrichment_evidence where company_id = k.id) = 1 and (select count(*) from enrichment_proposals where company_id = k.id) = 1, 'evidence moved';
  assert (select count(*) from customer_link where crm_company_id = k.id) = 2, 'links moved';
  assert (select count(*) from prospect_reviews where company_id = k.id) = 1, 'review moved';
  assert (select parent_company_id from companies where id = '44444444-4444-4444-4444-444444444444') = k.id, 'branch repointed';
  assert (select count(*) from company_aliases where company_id = k.id and source = 'merge' and value = 'Veganerie Corporation Co., Ltd.') = 1, 'name alias';
  assert (select count(*) from company_aliases where company_id = k.id) = 2, 'aliases: moved + new name (no domain alias, kept had none)';
end $$;
-- Pat edits the address after the merge; undo must keep that edit
update companies set address = 'Edited after merge' where id = '11111111-1111-1111-1111-111111111111';
insert into deals (title, client, company_id) values ('New after merge', 'Veganerie', '11111111-1111-1111-1111-111111111111');
set role anon;
select unmerge_companies((:'result'::jsonb ->> 'merge_id')::uuid);
reset role;
do $$
declare k companies%rowtype; o companies%rowtype;
begin
  select * into k from companies where id = '11111111-1111-1111-1111-111111111111';
  select * into o from companies where id = '22222222-2222-2222-2222-222222222222';
  assert o.deleted_at is null, 'merged restored';
  assert k.website is null and k.tags = '{vegan}' and k.notes = 'Main contact Jajah' and k.last_contact_date = '2026-07-02', 'fields restored';
  assert k.champion_contact_id is null and k.map_status = 'unknown', 'roles restored';
  assert k.address = 'Edited after merge', 'later edit kept';
  assert (select count(*) from contacts where company_id = o.id) = 1 and (select count(*) from contacts where company_id = k.id) = 1, 'contacts back';
  assert (select count(*) from account_events where company_id = o.id) = 35 and (select count(*) from account_events where company_id = k.id) = 20, 'orders back';
  assert (select client from deals where id = '66666666-6666-6666-6666-666666666666') = 'Veganerie Corporation Co., Ltd.', 'client back';
  assert (select count(*) from deals where company_id = k.id) = 1, 'new deal stays';
  assert (select count(*) from customer_link where crm_company_id = o.id) = 1, 'link back';
  assert (select count(*) from prospect_reviews where company_id = o.id) = 1, 'review back';
  assert (select parent_company_id from companies where id = '44444444-4444-4444-4444-444444444444') = o.id, 'branch back';
  assert (select count(*) from company_aliases where company_id = k.id) = 0 and (select count(*) from company_aliases where company_id = o.id) = 1, 'aliases back';
  assert (select count(*) from enrichment_evidence where company_id = o.id) = 1, 'evidence back';
end $$;
\echo 'undo ok'
