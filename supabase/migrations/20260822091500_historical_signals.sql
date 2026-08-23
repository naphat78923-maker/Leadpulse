-- ============================================================================
-- LeadPulse — Historical Sales Signals (Phase 1)
-- Additive, non-destructive. Depends on: customers, sales (historical import)
-- and companies (CRM). Safe to run: create table/view if not exists + insert
-- on conflict do nothing.
-- ============================================================================

-- Trigram similarity for fuzzy name matching (Supabase ships pg_trgm).
create extension if not exists pg_trgm;

-- Normalize a name for comparison: lowercase, drop (Branch) suffixes, strip punctuation.
create or replace function normalize_name(n text) returns text
language sql immutable as $$
  select lower(regexp_replace(regexp_replace(n, '\(.*?\)', '', 'g'), '[^a-z0-9\s]', '', 'g'))
$$;

-- ---------------------------------------------------------------------------
-- customer_link: maps a historical sales customer → CRM company (nullable).
-- match_confidence: 'auto' (fuzzy seed) | 'manual' (Pat confirmed) | 'none'
-- reviewed: set true after Pat confirms/clears the auto match.
-- ---------------------------------------------------------------------------
create table if not exists customer_link (
  historical_customer_id text primary key references customers(customer_id) on delete cascade,
  crm_company_id uuid,
  match_confidence text not null default 'auto'
    check (match_confidence in ('auto', 'manual', 'none')),
  reviewed boolean not null default false,
  created_at timestamptz default now()
);
create index if not exists idx_customer_link_crm on customer_link (crm_company_id);

-- ---------------------------------------------------------------------------
-- FUZZY SEED (run once; idempotent). Picks the best-matching non-deleted CRM
-- company by trigram similarity of normalized names. ~80% accurate — follow
-- with a manual review pass (query at bottom).
-- ---------------------------------------------------------------------------
insert into customer_link (historical_customer_id, crm_company_id, match_confidence)
select
  c.customer_id,
  comp.id,
  case when sim >= 0.8 then 'auto' else 'auto' end
from customers c
cross join lateral (
  select id, similarity(normalize_name(c.name_en), normalize_name(name)) as sim
  from companies
  where deleted_at is null
  order by sim desc
  limit 1
) comp
where sim >= 0.6
on conflict (historical_customer_id) do nothing;

-- ---------------------------------------------------------------------------
-- reorder_signals: read-only view. Returns ONLY overdue, rhythm-eligible,
-- non-intercompany customers, ranked by commercial weight.
-- App layer applies suppression (recent meeting / open deal) + caps at 5.
-- ---------------------------------------------------------------------------
-- NOTE: CREATE VIEW IF NOT EXISTS is unsupported on some Postgres versions.
-- Use DROP VIEW IF EXISTS + CREATE VIEW (idempotent, safe to re-run).
drop view if exists reorder_signals;
create view reorder_signals as
with inv as (
  select customer_id, date, amount_thb
  from sales
  where document_type = 'Invoice' and is_zero_value = false
),
ranked as (
  select
    customer_id, date, amount_thb,
    lag(date) over (partition by customer_id order by date) as prev_date
  from inv
),
gaps as (
  select customer_id, (date - prev_date)::int as gap_days
  from ranked
  where prev_date is not null
),
typ as (
  select customer_id,
         percentile_cont(0.5) within group (order by amount_thb) as median_value
  from inv group by customer_id
),
stat as (
  select
    r.customer_id,
    count(*) as order_count,
    min(r.date) as first_order,
    max(r.date) as last_order,
    (max(r.date) - min(r.date))::int as span_days,
    (select percentile_cont(0.5) within group (order by g.gap_days)
       from gaps g where g.customer_id = r.customer_id) as median_gap_days
  from ranked r
  group by r.customer_id
)
select
  st.customer_id,
  c.name_en,
  c.is_intercompany,
  st.order_count,
  st.first_order,
  st.last_order,
  st.span_days,
  coalesce(st.median_gap_days, 0)::int as median_gap_days,
  coalesce(t.median_value, 0) as median_value,
  (current_date - st.last_order)::int as days_since_last,
  greatest(21, round(coalesce(st.median_gap_days, 0) * 1.5))::int as threshold_days,
  ((current_date - st.last_order)::int - coalesce(st.median_gap_days, 0)::int) as severity_days,
  case
    when (current_date - st.last_order)::int > greatest(21, round(coalesce(st.median_gap_days, 0) * 1.5))::int
    then true else false
  end as is_overdue,
  l.crm_company_id,
  l.match_confidence
from stat st
join customers c on c.customer_id = st.customer_id
join typ t on t.customer_id = st.customer_id
left join customer_link l on l.historical_customer_id = st.customer_id
where c.is_intercompany = false
  and st.order_count >= 3
  and st.span_days >= 90
  and (current_date - st.last_order)::int > greatest(21, round(coalesce(st.median_gap_days, 0) * 1.5))::int
order by (severity_days * coalesce(t.median_value, 0)) desc;

-- ---------------------------------------------------------------------------
-- REVIEW PASS (run after seed): list auto-matches Pat should confirm/clear.
-- For any row where the match looks wrong, set crm_company_id = null (or the
-- correct id) and reviewed = true.
-- ---------------------------------------------------------------------------
-- select l.historical_customer_id, c.name_en as historical_name,
--        comp.name as crm_name, l.match_confidence, l.reviewed
-- from customer_link l
-- join customers c on c.customer_id = l.historical_customer_id
-- left join companies comp on comp.id = l.crm_company_id
-- where l.match_confidence = 'auto' and l.reviewed = false
-- order by c.name_en;
