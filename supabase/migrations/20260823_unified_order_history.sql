-- LeadPulse — Unified order history: app-recorded sales feed buying signals.
-- Part 1 applies the deferred account_events table (Slice 5 Phase B data layer).
-- Part 2 creates unified_sales = imported invoices ∪ app-recorded closed-won orders,
-- and repoints reorder_signals at it. No overlap by construction: CSV imports only
-- ever write `sales`; the app only ever writes `account_events`.
-- Zero-amount events (deals closed without a value) are flagged and excluded by
-- the same is_zero_value rule the invoice branch uses.
-- Applied live 2026-08-23 via Supabase MCP (migrations: unified_order_history
-- + unified_order_history_v2). v2 excludes source LIKE 'backfill-from-sales%'
-- rows from the event branch: a 369-row copy of the sales history already sat
-- in account_events, and the naive union double-counted every buyer (signals
-- went 14 -> 15, unified_sales inflated to 807). With the exclusion:
-- reorder_signals = 14 (exact baseline), unified_sales = 438.

-- ── Part 1: account_events (from supabase/migrations/20260822_add_account_events.sql) ──
CREATE TABLE IF NOT EXISTS public.account_events (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id     uuid REFERENCES public.companies(id) ON DELETE CASCADE,
    event_date     date        NOT NULL,
    amount         numeric(12,2) NOT NULL DEFAULT 0,   -- net (excl. VAT)
    amount_inc_vat numeric(12,2),
    product_line   text,
    order_id       text,                               -- dedup key
    source         text        NOT NULL,               -- export filename / 'app_closed_won'
    created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_account_events_company ON public.account_events(company_id);
CREATE INDEX IF NOT EXISTS idx_account_events_date    ON public.account_events(event_date);
CREATE INDEX IF NOT EXISTS idx_account_events_order   ON public.account_events(order_id);

ALTER TABLE public.companies
    ADD COLUMN IF NOT EXISTS standing_order_flag boolean NOT NULL DEFAULT false;

-- LeadPulse convention: new tables need RLS OFF (app reads/writes via anon key).
ALTER TABLE public.account_events DISABLE ROW LEVEL SECURITY;

-- ── Part 2: unified view (drop-then-create; views do not support IF NOT EXISTS) ──
DROP VIEW IF EXISTS unified_sales;
CREATE VIEW unified_sales AS
SELECT s.customer_id, s.date, s.amount_thb, false AS is_zero_value
FROM sales s
WHERE s.document_type = 'Invoice' AND s.is_zero_value = false
UNION ALL
SELECT l.historical_customer_id AS customer_id,
       e.event_date             AS date,
       e.amount                 AS amount_thb,
       (e.amount <= 0)          AS is_zero_value
FROM account_events e
JOIN customer_link l ON l.crm_company_id = e.company_id
WHERE e.source NOT LIKE 'backfill-from-sales%';  -- exclude the 369-row sales-copy backfill (would double-count)

-- reorder_signals: identical logic to production, but inv CTE now reads unified_sales
-- so app-recorded closed-won orders advance each buyer's cycle + typical value.
DROP VIEW IF EXISTS reorder_signals;
CREATE VIEW reorder_signals AS
WITH inv AS (
    SELECT u.customer_id, u.date, u.amount_thb
    FROM unified_sales u
    WHERE u.is_zero_value = false
),
ranked AS (
    SELECT inv.customer_id, inv.date, inv.amount_thb,
           lag(inv.date) OVER (PARTITION BY inv.customer_id ORDER BY inv.date) AS prev_date
    FROM inv
),
gaps AS (
    SELECT ranked.customer_id, ranked.date - ranked.prev_date AS gap_days
    FROM ranked
    WHERE ranked.prev_date IS NOT NULL
),
typ AS (
    SELECT inv.customer_id,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY (inv.amount_thb::double precision)) AS median_value
    FROM inv
    GROUP BY inv.customer_id
),
stat AS (
    SELECT r.customer_id,
           count(*) AS order_count,
           min(r.date) AS first_order,
           max(r.date) AS last_order,
           max(r.date) - min(r.date) AS span_days,
           (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY (g.gap_days::double precision))
              FROM gaps g WHERE g.customer_id = r.customer_id) AS median_gap_days
    FROM ranked r
    GROUP BY r.customer_id
)
SELECT st.customer_id,
    c.name_en,
    c.is_intercompany,
    st.order_count,
    st.first_order,
    st.last_order,
    st.span_days,
    COALESCE(st.median_gap_days, 0)::integer AS median_gap_days,
    COALESCE(t.median_value, 0::double precision) AS median_value,
    CURRENT_DATE - st.last_order AS days_since_last,
    GREATEST(21::double precision, round(COALESCE(st.median_gap_days, 0::double precision) * 1.5))::integer AS threshold_days,
    CURRENT_DATE - st.last_order - COALESCE(st.median_gap_days, 0)::integer AS severity_days,
    CASE
        WHEN (CURRENT_DATE - st.last_order) > GREATEST(21::double precision, round(COALESCE(st.median_gap_days, 0::double precision) * 1.5))::integer THEN true
        ELSE false
    END AS is_overdue,
    l.crm_company_id,
    l.match_confidence
FROM stat st
JOIN customers c ON c.customer_id = st.customer_id
JOIN typ t ON t.customer_id = st.customer_id
LEFT JOIN customer_link l ON l.historical_customer_id = st.customer_id
WHERE c.is_intercompany = false
  AND st.order_count >= 3
  AND st.span_days >= 90
  AND (CURRENT_DATE - st.last_order) > GREATEST(21::double precision, round(COALESCE(st.median_gap_days, 0::double precision) * 1.5))::integer
ORDER BY ((CURRENT_DATE - st.last_order - COALESCE(st.median_gap_days, 0)::integer)::double precision * COALESCE(t.median_value, 0::double precision)) DESC;
