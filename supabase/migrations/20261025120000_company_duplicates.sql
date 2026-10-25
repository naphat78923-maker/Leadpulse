-- Duplicate accounts: merge two records of one business, mark a branch, or say "Not a duplicate".
--
-- ADDITIVE. A new nullable column, two new tables and two functions; no existing row changes.
--
-- parent_company_id: "Branch of" on the Accounts page's Possible duplicates review. A branch
-- ("Broccoli Revolution - Sukhumvit Rd") points at its main account; the account panel shows it.
--
-- company_duplicate_dismissals: pairs Pat marked "Not a duplicate", so the review stops showing
-- them. One row per pair, the smaller id first.
--
-- merge_companies(keep_id, merge_id): everything that hangs off the merged account moves to the
-- kept one (contacts, deals, logged interactions, orders, enrichment evidence and proposals,
-- aliases, the FlowAccount customer link, its prospect review when the kept one has none, its
-- branches), the kept account's empty fields are filled from the other, the other's name is
-- kept as an alias, and the other account is archived (deleted_at), as Archive does. Laya's
-- judgments stay with the archived account; Laya grades the kept one again. One transaction.
--
-- company_merges: what each merge moved and filled, so unmerge_companies(id) can put it back.
-- Undo moves back only rows still on the kept account, and restores a filled field only while
-- it still holds the value the merge put there. Closed to the app's key; the functions are the
-- only way in.

alter table public.companies add column if not exists parent_company_id uuid
  references public.companies(id) on delete set null;
alter table public.companies drop constraint if exists companies_parent_not_self;
alter table public.companies add constraint companies_parent_not_self check (parent_company_id is null or parent_company_id <> id);
create index if not exists companies_parent_idx on public.companies (parent_company_id) where parent_company_id is not null;

create table if not exists public.company_duplicate_dismissals (
  company_a uuid not null references public.companies(id) on delete cascade,
  company_b uuid not null references public.companies(id) on delete cascade,
  dismissed_at timestamptz not null default now(),
  primary key (company_a, company_b),
  check (company_a < company_b)
);

alter table public.company_duplicate_dismissals enable row level security;
drop policy if exists "Read for anon" on public.company_duplicate_dismissals;
create policy "Read for anon" on public.company_duplicate_dismissals for select to public using (true);
drop policy if exists "Add for anon" on public.company_duplicate_dismissals;
create policy "Add for anon" on public.company_duplicate_dismissals for insert to public with check (true);
drop policy if exists "Remove for anon" on public.company_duplicate_dismissals;
create policy "Remove for anon" on public.company_duplicate_dismissals for delete to public using (true);

create table if not exists public.company_merges (
  id uuid primary key default gen_random_uuid(),
  kept_id uuid not null references public.companies(id) on delete cascade,
  merged_id uuid not null references public.companies(id) on delete cascade,
  kept_name text not null,
  merged_name text not null,
  -- {"contacts": [ids], "deals": [ids], ..., "customer_link": [customer ids], "deal_clients": {deal id: old client}}
  moved jsonb not null,
  -- the kept account's changed fields: their values before the merge, and the values it set
  previous jsonb not null,
  filled jsonb not null,
  alias_ids uuid[] not null default '{}',
  merged_at timestamptz not null default now(),
  undone_at timestamptz
);
create index if not exists company_merges_kept_idx on public.company_merges (kept_id);
alter table public.company_merges enable row level security;

create or replace function public.merge_companies(keep_id uuid, merge_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path = public
as $$
declare
  kept companies%rowtype;
  other companies%rowtype;
  merged companies%rowtype;
  moved jsonb := '{}'::jsonb;
  ids uuid[];
  customers text[];
  clients jsonb;
  aliases uuid[] := '{}';
  alias_id uuid;
  previous jsonb;
  filled jsonb;
  host_kept text;
  host_other text;
  log_id uuid;
begin
  if keep_id is null or merge_id is null or keep_id = merge_id then
    raise exception 'Pick two different accounts to merge';
  end if;
  select * into kept from companies where id = keep_id and deleted_at is null for update;
  if not found then raise exception 'The account to keep is archived or gone'; end if;
  select * into other from companies where id = merge_id and deleted_at is null for update;
  if not found then raise exception 'The account to merge is archived or gone'; end if;

  -- Deals named after the merged account take the kept account's name.
  select coalesce(jsonb_object_agg(d.id, d.client), '{}') into clients
  from deals d where d.company_id = merge_id and d.client = other.name;
  moved := moved || jsonb_build_object('deal_clients', clients);

  with m as (update contacts set company_id = keep_id, updated_at = now() where company_id = merge_id returning id)
  select coalesce(array_agg(m.id), '{}') into ids from m;
  moved := moved || jsonb_build_object('contacts', ids);

  with m as (
    update deals set company_id = keep_id,
                     client = case when client = other.name then kept.name else client end,
                     updated_at = now()
    where company_id = merge_id returning id
  )
  select coalesce(array_agg(m.id), '{}') into ids from m;
  moved := moved || jsonb_build_object('deals', ids);

  with m as (update meetings set company_id = keep_id where company_id = merge_id returning id)
  select coalesce(array_agg(m.id), '{}') into ids from m;
  moved := moved || jsonb_build_object('meetings', ids);

  with m as (update interactions set company_id = keep_id where company_id = merge_id returning id)
  select coalesce(array_agg(m.id), '{}') into ids from m;
  moved := moved || jsonb_build_object('interactions', ids);

  with m as (update account_events set company_id = keep_id where company_id = merge_id returning id)
  select coalesce(array_agg(m.id), '{}') into ids from m;
  moved := moved || jsonb_build_object('account_events', ids);

  with m as (update enrichment_evidence set company_id = keep_id where company_id = merge_id returning id)
  select coalesce(array_agg(m.id), '{}') into ids from m;
  moved := moved || jsonb_build_object('enrichment_evidence', ids);

  with m as (update enrichment_proposals set company_id = keep_id where company_id = merge_id returning id)
  select coalesce(array_agg(m.id), '{}') into ids from m;
  moved := moved || jsonb_build_object('enrichment_proposals', ids);

  with m as (update company_aliases set company_id = keep_id where company_id = merge_id returning id)
  select coalesce(array_agg(m.id), '{}') into ids from m;
  moved := moved || jsonb_build_object('company_aliases', ids);

  with m as (update customer_link set crm_company_id = keep_id where crm_company_id = merge_id returning historical_customer_id)
  select coalesce(array_agg(m.historical_customer_id), '{}') into customers from m;
  moved := moved || jsonb_build_object('customer_link', customers);

  -- One prospect review per account: the merged one's moves only when the kept one has none.
  with m as (
    update prospect_reviews set company_id = keep_id
    where company_id = merge_id and not exists (select 1 from prospect_reviews r where r.company_id = keep_id)
    returning id
  )
  select coalesce(array_agg(m.id), '{}') into ids from m;
  moved := moved || jsonb_build_object('prospect_reviews', ids);

  with m as (
    update companies set parent_company_id = keep_id, updated_at = now()
    where parent_company_id = merge_id and id <> keep_id returning id
  )
  select coalesce(array_agg(m.id), '{}') into ids from m;
  moved := moved || jsonb_build_object('branches', ids);

  -- Empty fields on the kept account are filled from the other. Both notes are kept; the
  -- later contact dates win; tags are joined. Status and name are never changed.
  update companies c set
    lead_source = case when coalesce(trim(c.lead_source), '') = '' then other.lead_source else c.lead_source end,
    acquisition_source = coalesce(c.acquisition_source, other.acquisition_source),
    acquisition_campaign = case
      when c.acquisition_source is null and other.acquisition_source is not null then other.acquisition_campaign
      when c.acquisition_source = other.acquisition_source and coalesce(trim(c.acquisition_campaign), '') = '' then other.acquisition_campaign
      else c.acquisition_campaign end,
    account_owner = case when coalesce(trim(c.account_owner), '') = '' then other.account_owner else c.account_owner end,
    industry = case when coalesce(trim(c.industry), '') = '' then other.industry else c.industry end,
    size = case when coalesce(trim(c.size), '') = '' then other.size else c.size end,
    address = case when coalesce(trim(c.address), '') = '' then other.address else c.address end,
    website = case when coalesce(trim(c.website), '') = '' then other.website else c.website end,
    what_they_make = case when coalesce(trim(c.what_they_make), '') = '' then other.what_they_make else c.what_they_make end,
    logo_url = case when coalesce(trim(c.logo_url), '') = '' then other.logo_url else c.logo_url end,
    blocker_label = case when coalesce(trim(c.blocker_label), '') = '' then other.blocker_label else c.blocker_label end,
    notes = case
      when coalesce(trim(c.notes), '') = '' then other.notes
      when coalesce(trim(other.notes), '') = '' or trim(other.notes) = trim(c.notes) then c.notes
      else c.notes || E'\n\nFrom ' || other.name || E':\n' || other.notes end,
    tags = case
      when coalesce(other.tags, '{}') <@ coalesce(c.tags, '{}') then c.tags
      else (select array_agg(u.t order by u.o) from (
              select t, min(o) as o from unnest(coalesce(c.tags, '{}') || other.tags) with ordinality as x(t, o) group by t
            ) u) end,
    last_contact_date = greatest(c.last_contact_date, other.last_contact_date),
    last_human_touch = greatest(c.last_human_touch, other.last_human_touch),
    next_touch_due = coalesce(c.next_touch_due, other.next_touch_due),
    standing_order_flag = c.standing_order_flag or other.standing_order_flag,
    champion_contact_id = coalesce(c.champion_contact_id, other.champion_contact_id),
    decision_maker_contact_id = coalesce(c.decision_maker_contact_id, other.decision_maker_contact_id),
    blocker_contact_id = coalesce(c.blocker_contact_id, other.blocker_contact_id),
    -- a branch of the merged account takes over the merged account's own parent
    parent_company_id = case
      when c.parent_company_id is null or c.parent_company_id = merge_id then nullif(other.parent_company_id, keep_id)
      else c.parent_company_id end,
    updated_at = now()
  where c.id = keep_id
  returning * into merged;

  -- The stakeholder map status follows the roles, as deriveMapStatus does in the app.
  if (merged.champion_contact_id, merged.decision_maker_contact_id, merged.blocker_contact_id, merged.blocker_label)
     is distinct from (kept.champion_contact_id, kept.decision_maker_contact_id, kept.blocker_contact_id, kept.blocker_label) then
    update companies set map_status = case
      when champion_contact_id is not null and decision_maker_contact_id is not null then 'complete'
      when champion_contact_id is not null or decision_maker_contact_id is not null or blocker_contact_id is not null
           or coalesce(trim(blocker_label), '') <> '' then 'partial'
      else 'unknown' end
    where id = keep_id
    returning * into merged;
  end if;

  select coalesce(jsonb_object_agg(k, to_jsonb(kept) -> k), '{}'), coalesce(jsonb_object_agg(k, to_jsonb(merged) -> k), '{}')
  into previous, filled
  from jsonb_object_keys(to_jsonb(merged)) k
  where k <> 'updated_at' and (to_jsonb(kept) -> k) is distinct from (to_jsonb(merged) -> k);

  -- The merged name (and a different website domain) stay findable as aliases of the kept account.
  if lower(trim(other.name)) <> lower(trim(kept.name)) then
    insert into company_aliases (company_id, kind, value, source) values (keep_id, 'name', trim(other.name), 'merge')
    on conflict do nothing returning id into alias_id;
    if alias_id is not null then aliases := aliases || alias_id; end if;
  end if;
  host_kept := nullif(regexp_replace(lower(trim(coalesce(kept.website, ''))), '^(https?://)?(www\.)?([^/?#]+).*$', '\3'), '');
  host_other := nullif(regexp_replace(lower(trim(coalesce(other.website, ''))), '^(https?://)?(www\.)?([^/?#]+).*$', '\3'), '');
  if host_kept is not null and host_other is not null and host_other <> host_kept
     and host_other !~ '(^|\.)(instagram|facebook|fb|line)\.(com|me)$' then
    alias_id := null;
    insert into company_aliases (company_id, kind, value, source) values (keep_id, 'domain', host_other, 'merge')
    on conflict do nothing returning id into alias_id;
    if alias_id is not null then aliases := aliases || alias_id; end if;
  end if;

  update companies set deleted_at = now(), updated_at = now() where id = merge_id;

  insert into company_merges (kept_id, merged_id, kept_name, merged_name, moved, previous, filled, alias_ids)
  values (keep_id, merge_id, kept.name, other.name, moved, previous, filled, aliases)
  returning id into log_id;

  return jsonb_build_object(
    'merge_id', log_id,
    'moved', (select jsonb_object_agg(key, jsonb_array_length(value)) from jsonb_each(moved) where jsonb_typeof(value) = 'array'),
    'filled', (select coalesce(jsonb_agg(k), '[]') from jsonb_object_keys(filled) k)
  );
end
$$;

create or replace function public.unmerge_companies(merge_log_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path = public
as $$
declare
  m company_merges%rowtype;
  cur jsonb;
  restore jsonb;
begin
  select * into m from company_merges where id = merge_log_id for update;
  if not found then raise exception 'Unknown merge'; end if;
  if m.undone_at is not null then raise exception 'That merge was already undone'; end if;

  update companies set deleted_at = null, updated_at = now() where id = m.merged_id;

  update contacts set company_id = m.merged_id, updated_at = now()
  where company_id = m.kept_id and id in (select jsonb_array_elements_text(m.moved -> 'contacts')::uuid);
  update deals d set company_id = m.merged_id,
                     client = case when d.client = m.kept_name and (m.moved -> 'deal_clients') ? d.id::text
                                   then m.moved -> 'deal_clients' ->> d.id::text else d.client end,
                     updated_at = now()
  where d.company_id = m.kept_id and d.id in (select jsonb_array_elements_text(m.moved -> 'deals')::uuid);
  update meetings set company_id = m.merged_id
  where company_id = m.kept_id and id in (select jsonb_array_elements_text(m.moved -> 'meetings')::uuid);
  update interactions set company_id = m.merged_id
  where company_id = m.kept_id and id in (select jsonb_array_elements_text(m.moved -> 'interactions')::uuid);
  update account_events set company_id = m.merged_id
  where company_id = m.kept_id and id in (select jsonb_array_elements_text(m.moved -> 'account_events')::uuid);
  update enrichment_evidence set company_id = m.merged_id
  where company_id = m.kept_id and id in (select jsonb_array_elements_text(m.moved -> 'enrichment_evidence')::uuid);
  update enrichment_proposals set company_id = m.merged_id
  where company_id = m.kept_id and id in (select jsonb_array_elements_text(m.moved -> 'enrichment_proposals')::uuid);
  update company_aliases set company_id = m.merged_id
  where company_id = m.kept_id and id in (select jsonb_array_elements_text(m.moved -> 'company_aliases')::uuid);
  update customer_link set crm_company_id = m.merged_id
  where crm_company_id = m.kept_id and historical_customer_id in (select jsonb_array_elements_text(m.moved -> 'customer_link'));
  update prospect_reviews set company_id = m.merged_id
  where company_id = m.kept_id and id in (select jsonb_array_elements_text(m.moved -> 'prospect_reviews')::uuid);
  update companies set parent_company_id = m.merged_id, updated_at = now()
  where parent_company_id = m.kept_id and id in (select jsonb_array_elements_text(m.moved -> 'branches')::uuid);
  delete from company_aliases where id = any(m.alias_ids);

  -- A filled field goes back only while it still holds what the merge put there.
  select to_jsonb(c) into cur from companies c where c.id = m.kept_id;
  select coalesce(jsonb_object_agg(k, m.previous -> k), '{}') into restore
  from jsonb_object_keys(m.filled) k
  where (cur -> k) is not distinct from (m.filled -> k);
  if restore <> '{}'::jsonb then
    update companies c set
      (lead_source, acquisition_source, acquisition_campaign, account_owner, industry, size, address, website,
       what_they_make, logo_url, blocker_label, notes, tags, last_contact_date, last_human_touch, next_touch_due,
       standing_order_flag, champion_contact_id, decision_maker_contact_id, blocker_contact_id, parent_company_id,
       map_status, updated_at) =
      (select r.lead_source, r.acquisition_source, r.acquisition_campaign, r.account_owner, r.industry, r.size, r.address, r.website,
              r.what_they_make, r.logo_url, r.blocker_label, r.notes, r.tags, r.last_contact_date, r.last_human_touch, r.next_touch_due,
              r.standing_order_flag, r.champion_contact_id, r.decision_maker_contact_id, r.blocker_contact_id, r.parent_company_id,
              r.map_status, now()
       from jsonb_populate_record(c, restore) r)
    where c.id = m.kept_id;
  end if;

  update company_merges set undone_at = now() where id = m.id;
  return jsonb_build_object('merged_id', m.merged_id, 'kept_id', m.kept_id);
end
$$;

revoke all on function public.merge_companies(uuid, uuid) from public;
revoke all on function public.unmerge_companies(uuid) from public;
grant execute on function public.merge_companies(uuid, uuid) to anon, authenticated;
grant execute on function public.unmerge_companies(uuid) to anon, authenticated;
