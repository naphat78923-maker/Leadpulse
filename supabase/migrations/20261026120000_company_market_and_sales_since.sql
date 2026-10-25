-- Accounts page: Local / Export, and sorting by recent sales.
--
-- ADDITIVE.
--
-- 1. companies.market: Pat's own Local / Export choice for an account. null means Pat has not
--    set it, and the app falls back to its location rules (src/utils/account-market.ts) and
--    otherwise shows "Not sure". The rules are never written here: a stored value is always
--    Pat's, so a rule change can't silently overwrite a choice.
--
-- 2. sales_by_company(since): invoiced sales per CRM account since a date, for the "Sales, last
--    90 days" sort. Same sources and exclusions as sales_by_month (zero-value and intercompany
--    invoices left out) and the same account link as customer_rhythms.

alter table public.companies
  add column if not exists market text;

comment on column public.companies.market is
  'Pat''s choice: local (in Thailand) | export (outside Thailand). null = not set; the app falls back to its location rules.';

alter table public.companies
  drop constraint if exists companies_market_check;

alter table public.companies
  add constraint companies_market_check
  check (market is null or market in ('local', 'export'));

create or replace function public.sales_by_company(since date)
returns table (crm_company_id uuid, amount numeric)
language sql stable security definer set search_path = public
as $$
  select coalesce(l.crm_company_id, co.id), round(sum(u.amount_thb))
  from unified_sales u
  left join customers c on c.customer_id = u.customer_id
  left join companies co on u.customer_id like 'crm:%' and co.id::text = substr(u.customer_id, 5)
  left join customer_link l on l.historical_customer_id = u.customer_id
  where not u.is_zero_value and not coalesce(c.is_intercompany, false) and u.date >= since
    and coalesce(l.crm_company_id, co.id) is not null
  group by 1
$$;

revoke all on function public.sales_by_company(date) from public;
grant execute on function public.sales_by_company(date) to anon, authenticated;
