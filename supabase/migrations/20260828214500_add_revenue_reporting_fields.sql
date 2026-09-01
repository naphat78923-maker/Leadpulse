-- Revenue reporting fields approved by Pat on 2026-08-28.
-- Existing values are THB. Open deals use 2026-12-31 as a planning close date.

ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS currency text,
  ADD COLUMN IF NOT EXISTS close_date date,
  ADD COLUMN IF NOT EXISTS stage_probability numeric;

ALTER TABLE public.deals
  ALTER COLUMN currency SET DEFAULT 'THB';

COMMENT ON COLUMN public.deals.currency IS
  'ISO 4217 currency code for deal value. Existing records were confirmed as THB by Pat.';
COMMENT ON COLUMN public.deals.close_date IS
  'Planning close date, not proof of an observed close.';
COMMENT ON COLUMN public.deals.stage_probability IS
  'Whole-number forecast probability from 0 to 100.';

UPDATE public.deals
SET currency = 'THB'
WHERE currency IS NULL;

UPDATE public.deals
SET close_date = DATE '2026-12-31'
WHERE stage NOT IN ('closed_won', 'closed_lost');

UPDATE public.deals
SET stage_probability = CASE stage
  WHEN 'research' THEN 10
  WHEN 'contacted' THEN 20
  WHEN 'proposal' THEN 50
  WHEN 'negotiation' THEN 75
  WHEN 'closed_won' THEN 100
  WHEN 'closed_lost' THEN 0
  ELSE stage_probability
END;

ALTER TABLE public.deals
  DROP CONSTRAINT IF EXISTS deals_stage_probability_range;
ALTER TABLE public.deals
  ADD CONSTRAINT deals_stage_probability_range
  CHECK (stage_probability IS NULL OR stage_probability BETWEEN 0 AND 100);
