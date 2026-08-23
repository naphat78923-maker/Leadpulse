-- ============================================================================
-- LeadPulse — Apply account_events (DDL) + backfill from historical sales
-- Created 2026-08-23. Paste the WHOLE file into Supabase dashboard → SQL editor
-- and Run. Safe to re-run (idempotent): IF NOT EXISTS everywhere + NOT EXISTS
-- guard on the insert.
--
-- What it does:
--   1. Creates public.account_events (the Monetary/Frequency/recency source).
--   2. Adds companies.standing_order_flag (default false).
--   3. Disables RLS on account_events (LeadPulse convention: anon reads).
--   4. Backfills one row per Invoice from the imported `sales` ledger, joined
--      through Pat-reviewed customer_link mappings (incl. Earthling Thailand
--      → Earthling Cafe, linked 2026-08-23).
-- ============================================================================

-- ── 1. Table ──
CREATE TABLE IF NOT EXISTS public.account_events (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id     uuid REFERENCES public.companies(id) ON DELETE CASCADE,
    event_date     date         NOT NULL,
    amount         numeric(12,2) NOT NULL DEFAULT 0,   -- net (excl. VAT)
    amount_inc_vat numeric(12,2),
    product_line   text,
    order_id       text,                               -- dedup key for F
    source         text        NOT NULL,               -- export filename
    created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_account_events_company ON public.account_events(company_id);
CREATE INDEX IF NOT EXISTS idx_account_events_date    ON public.account_events(event_date);
CREATE INDEX IF NOT EXISTS idx_account_events_order   ON public.account_events(order_id);

-- ── 2. Standing-order flag ──
ALTER TABLE public.companies
    ADD COLUMN IF NOT EXISTS standing_order_flag boolean NOT NULL DEFAULT false;

-- ── 3. RLS off (app reads via anon key) ──
ALTER TABLE public.account_events DISABLE ROW LEVEL SECURITY;

-- ── 4. Backfill: sales ⟶ account_events via reviewed links ──
-- One row per Invoice (mirrors the reorder_signals view's filter:
-- document_type='Invoice' AND is_zero_value=false).
INSERT INTO public.account_events
    (company_id, event_date, amount, amount_inc_vat, product_line, order_id, source)
SELECT
    l.crm_company_id,
    s.date,
    s.amount_thb,
    s.amount_thb * COALESCE(NULLIF(s.fx_rate, 0), 1),
    NULL::text,
    s.document_no,
    'backfill-from-sales-2026-08-23'
FROM sales s
JOIN customer_link l ON l.historical_customer_id = s.customer_id
WHERE l.crm_company_id IS NOT NULL
  AND s.document_type = 'Invoice'
  AND s.is_zero_value = false
  AND NOT EXISTS (
        SELECT 1 FROM public.account_events ae
        WHERE ae.company_id = l.crm_company_id
          AND ae.order_id   = s.document_no
  );

-- ── 5. Verify ──
-- Expected: ~218 rows total; Earthling Cafe (ca2e2ce4-31ca-4ecc-919a-4fa50b336709)
-- = 49 rows, ฿112,256 net.
SELECT c.name,
       COUNT(*)              AS event_rows,
       SUM(ae.amount)::int   AS net_thb,
       MAX(ae.event_date)    AS last_order
FROM public.account_events ae
JOIN public.companies c ON c.id = ae.company_id
GROUP BY c.name
ORDER BY net_thb DESC;
