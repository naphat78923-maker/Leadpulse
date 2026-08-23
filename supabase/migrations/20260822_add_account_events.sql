-- LeadPulse Slice 5 (Phase B) — Account-Watch data layer.
-- Unlocks the Monetary (M) component of the Account Health Score.
-- Run this in the Supabase dashboard SQL editor (or via the migration
-- runner) BEFORE applying scripts/import-account-events.py with --apply.
-- LeadPulse convention: new tables use RLS OFF (app reads via anon key).

-- account_events: piped per-company sales/order history (Monetary source).
-- One row per order line item; order_id dedupes multiple lines per order.
CREATE TABLE IF NOT EXISTS public.account_events (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id    uuid REFERENCES public.companies(id) ON DELETE CASCADE,
    event_date    date        NOT NULL,
    amount        numeric(12,2) NOT NULL DEFAULT 0,   -- net (excl. VAT)
    amount_inc_vat numeric(12,2),
    product_line  text,
    order_id      text,                              -- dedup key for F
    source        text        NOT NULL,              -- export filename
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_account_events_company ON public.account_events(company_id);
CREATE INDEX IF NOT EXISTS idx_account_events_date    ON public.account_events(event_date);
CREATE INDEX IF NOT EXISTS idx_account_events_order   ON public.account_events(order_id);

-- standing_order_flag: a standing reorder = perfect F (1.0) without history.
ALTER TABLE public.companies
    ADD COLUMN IF NOT EXISTS standing_order_flag boolean NOT NULL DEFAULT false;

-- LeadPulse convention: new tables need RLS OFF (app reads via anon key).
ALTER TABLE public.account_events DISABLE ROW LEVEL SECURITY;
