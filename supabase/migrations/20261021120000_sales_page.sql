-- LeadPulse — Sales page: month totals, every customer's order rhythm, FlowAccount import.
--
-- sales / customers / customer_link stay closed to anon (20260929120000). The page reaches
-- them only through these functions: aggregates, a read-only preview, and an import that only
-- adds invoices (it never edits or deletes anything).
--
-- Orders logged in the app and FlowAccount invoices for the same order. Every order Pat takes
-- ends up as a FlowAccount invoice, so an order logged in the app (account_events) only counts
-- while no imported invoice can cover it yet: when it is dated after the latest invoice. Each
-- import supersedes the logged orders it covers, with nothing deleted. Logged orders for an
-- account not yet tied to a FlowAccount customer count under that account ('crm:<id>').
-- Before this, a linked account's logged order counted whatever its date, so importing its
-- invoice counted the order twice.
--
-- Customer names are matched the way FlowAccount writes them: customers.name_th holds the
-- export's name verbatim. The key ignores case and every space ("( สำนักงานใหญ่ )") and
-- folds the two spellings of sara am (จํากัด / จำกัด).
--
-- Applied live 2026-10-21 (sales_page, then sales_page_v2 which replaced the first draft's
-- "replace the logged order" delete with the dated rule above).

drop function if exists public.preview_invoice_import(jsonb);
drop function if exists public.import_invoices(jsonb, uuid[]);

create or replace view unified_sales as
select s.customer_id, s.date, s.amount_thb, false as is_zero_value
from sales s
where s.document_type = 'Invoice' and s.is_zero_value = false
union all
select coalesce(l.historical_customer_id, 'crm:' || e.company_id::text) as customer_id,
       e.event_date as date,
       e.amount as amount_thb,
       (e.amount <= 0) as is_zero_value
from account_events e
left join lateral (
  select cl.historical_customer_id from customer_link cl
  where cl.crm_company_id = e.company_id
  order by cl.historical_customer_id
  limit 1
) l on true
where e.source not like 'backfill-from-sales%'  -- the 369-row copy of the sales history
  and e.company_id is not null
  and e.event_date > coalesce((select max(s.date) from sales s where s.document_type = 'Invoice'), '-infinity'::date);

create or replace function public.sales_name_key(name text)
returns text
language sql immutable set search_path = public
as $$
  select lower(replace(regexp_replace(coalesce(name, ''), '\s+', '', 'g'), 'ํา', 'ำ'))
$$;

-- Month totals for the chart. Crema (sister company) is left out, as in reorder_signals.
create or replace function public.sales_by_month(since date)
returns table (month date, amount numeric, orders integer, buyers integer)
language sql stable security definer set search_path = public
as $$
  select date_trunc('month', u.date)::date,
         round(sum(u.amount_thb)),
         count(*)::integer,
         count(distinct u.customer_id)::integer
  from unified_sales u
  left join customers c on c.customer_id = u.customer_id
  where not u.is_zero_value and not coalesce(c.is_intercompany, false) and u.date >= since
  group by 1
  order by 1
$$;

-- How current the invoices are (the page asks for an import when this is old).
create or replace function public.latest_invoice_date()
returns date
language sql stable security definer set search_path = public
as $$
  select max(s.date) from sales s where s.document_type = 'Invoice'
$$;

-- Every customer's rhythm (reorder_signals lists only the overdue ones). Same-day orders are
-- one delivery, so zero-day gaps are left out of the typical gap.
create or replace function public.customer_rhythms()
returns table (customer_id text, name_en text, name_th text, crm_company_id uuid,
               order_count integer, first_order date, last_order date,
               median_gap_days integer, median_value numeric)
language sql stable security definer set search_path = public
as $$
  with inv as (
    select u.customer_id, u.date, u.amount_thb from unified_sales u where not u.is_zero_value
  ), gaps as (
    select inv.customer_id, inv.date - lag(inv.date) over (partition by inv.customer_id order by inv.date) as gap
    from inv
  ), gap_stats as (
    select gaps.customer_id, percentile_cont(0.5) within group (order by gaps.gap) as median_gap
    from gaps where gaps.gap > 0 group by gaps.customer_id
  ), stats as (
    select inv.customer_id, count(*)::integer as order_count, min(inv.date) as first_order,
           max(inv.date) as last_order,
           percentile_cont(0.5) within group (order by inv.amount_thb::double precision) as median_value
    from inv group by inv.customer_id
  )
  select s.customer_id, coalesce(c.name_en, co.name), c.name_th,
         coalesce(l.crm_company_id, co.id), s.order_count, s.first_order,
         s.last_order, round(g.median_gap)::integer, round(s.median_value::numeric)
  from stats s
  left join customers c on c.customer_id = s.customer_id
  left join companies co on s.customer_id like 'crm:%' and co.id::text = substr(s.customer_id, 5)
  left join gap_stats g on g.customer_id = s.customer_id
  left join customer_link l on l.historical_customer_id = s.customer_id
  where not coalesce(c.is_intercompany, false) and (c.customer_id is not null or co.id is not null)
$$;

-- What an import would do, row by row, without writing anything: already in LeadPulse?
-- which FlowAccount customer, and which account it is tied to.
create or replace function public.preview_invoice_import(rows jsonb)
returns table (document_no text, already_in boolean, customer_id text, customer_name text, crm_company_id uuid)
language sql stable security definer set search_path = public
as $$
  with input as (
    select upper(trim(r->>'document_no')) as doc, r->>'customer_name' as nm
    from jsonb_array_elements(rows) r
  ), matched as (
    select i.doc,
           exists (select 1 from sales s where s.document_no = i.doc) as already_in,
           (select c.customer_id from customers c
             where sales_name_key(c.name_th) = sales_name_key(i.nm) or sales_name_key(c.name_en) = sales_name_key(i.nm)
             order by c.customer_id limit 1) as cid
    from input i
  )
  select m.doc, m.already_in, m.cid, c.name_en, l.crm_company_id
  from matched m
  left join customers c on c.customer_id = m.cid
  left join customer_link l on l.historical_customer_id = m.cid
$$;

-- Save an import. rows: [{document_no, date, customer_name, currency, fx_rate,
-- amount_original, crm_company_id?}] straight from the FlowAccount sales report.
-- crm_company_id ties a customer to an account the first time it is seen. Invoices already in
-- are skipped, so importing the same file twice changes nothing.
create or replace function public.import_invoices(rows jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = public
as $$
declare
  r jsonb;
  doc text;
  nm text;
  d date;
  amt numeric;
  fx numeric;
  thb numeric;
  kind text;
  cid text;
  company uuid;
  interco boolean;
  added integer := 0;
  already integer := 0;
  new_customers integer := 0;
begin
  if jsonb_typeof(rows) is distinct from 'array' or jsonb_array_length(rows) > 1000 then
    raise exception 'rows must be a list of at most 1000 invoices';
  end if;
  for r in select value from jsonb_array_elements(rows) loop
    doc := upper(trim(r->>'document_no'));
    nm := trim(regexp_replace(coalesce(r->>'customer_name', ''), '\s+', ' ', 'g'));
    d := (r->>'date')::date;
    amt := (r->>'amount_original')::numeric;
    fx := coalesce(nullif(r->>'fx_rate', '')::numeric, 1);
    if doc !~ '^(INV|CA|CN)[0-9]{6,}$' then
      raise exception 'Not a FlowAccount invoice number: %', doc;
    end if;
    if nm = '' or d is null or amt is null or fx <= 0 then
      raise exception 'Invoice % is missing its date, customer or amount', doc;
    end if;
    if exists (select 1 from sales s where s.document_no = doc) then
      already := already + 1;
      continue;
    end if;

    cid := null;
    select c.customer_id, c.is_intercompany into cid, interco from customers c
    where sales_name_key(c.name_th) = sales_name_key(nm) or sales_name_key(c.name_en) = sales_name_key(nm)
    order by c.customer_id limit 1;
    if cid is null then
      cid := 'fa-' || left(md5(sales_name_key(nm)), 12);
      insert into customers (customer_id, name_en, name_th, is_intercompany)
      values (cid, nm, nm, false) on conflict (customer_id) do nothing;
      if found then new_customers := new_customers + 1; end if;
      interco := false;
    end if;

    company := nullif(r->>'crm_company_id', '')::uuid;
    if company is not null then
      insert into customer_link (historical_customer_id, crm_company_id, match_confidence, reviewed)
      values (cid, company, 'manual', true)
      on conflict (historical_customer_id) do update
        set crm_company_id = excluded.crm_company_id, match_confidence = 'manual', reviewed = true
        where customer_link.crm_company_id is null;
    end if;

    kind := case when doc like 'CN%' then 'Credit Note' else 'Invoice' end;
    thb := round(abs(amt) * fx, 2);
    insert into sales (document_no, document_type, date, customer_id, currency, fx_rate,
                       amount_original, amount_thb, signed_amount, is_zero_value, is_intercompany)
    values (doc, kind, d, cid, coalesce(nullif(upper(trim(r->>'currency')), ''), 'THB'), fx,
            abs(amt), thb, case when kind = 'Credit Note' then -thb else thb end, thb = 0, coalesce(interco, false));
    added := added + 1;
  end loop;

  return jsonb_build_object('added', added, 'already_in', already, 'new_customers', new_customers);
end
$$;

revoke all on function public.sales_by_month(date) from public;
revoke all on function public.customer_rhythms() from public;
revoke all on function public.latest_invoice_date() from public;
revoke all on function public.preview_invoice_import(jsonb) from public;
revoke all on function public.import_invoices(jsonb) from public;
grant execute on function public.sales_by_month(date) to anon, authenticated;
grant execute on function public.customer_rhythms() to anon, authenticated;
grant execute on function public.latest_invoice_date() to anon, authenticated;
grant execute on function public.preview_invoice_import(jsonb) to anon, authenticated;
grant execute on function public.import_invoices(jsonb) to anon, authenticated;
