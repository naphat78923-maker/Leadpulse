-- CRM hygiene pass: fill missing values (approved by Pat 2026-09-18).
-- Fills only NULLs; never overwrites known data. Soft-deleted rows are left
-- untouched. Follow-up dates are NOT mass-filled from free text: event
-- timestamps inside last_outcome are not due dates, and inventing activity
-- dates would drive false nudges. The 118 open deals with no follow-up date
-- stay visible as a real gap for the app-level reliable next-action-date work.

UPDATE public.deals
SET currency = 'THB'
WHERE currency IS NULL
  AND deleted_at IS NULL;

UPDATE public.deals
SET close_date = DATE '2026-12-31'
WHERE close_date IS NULL
  AND stage NOT IN ('closed_won', 'closed_lost')
  AND deleted_at IS NULL;

UPDATE public.deals
SET stage_probability = CASE stage
  WHEN 'research' THEN 10
  WHEN 'contacted' THEN 20
  WHEN 'proposal' THEN 50
  WHEN 'negotiation' THEN 75
  WHEN 'closed_won' THEN 100
  WHEN 'closed_lost' THEN 0
END
WHERE stage_probability IS NULL
  AND stage IN ('research', 'contacted', 'proposal', 'negotiation', 'closed_won', 'closed_lost')
  AND deleted_at IS NULL;

-- Verification (run after applying):
-- SELECT
--   count(*) FILTER (WHERE stage_probability IS NULL AND deleted_at IS NULL) AS prob_null,
--   count(*) FILTER (WHERE close_date IS NULL AND stage NOT IN ('closed_won','closed_lost') AND deleted_at IS NULL) AS close_null_open,
--   count(*) FILTER (WHERE followup_date IS NULL AND stage NOT IN ('closed_won','closed_lost') AND deleted_at IS NULL) AS followup_null_open,
--   count(*) FILTER (WHERE currency IS NULL AND deleted_at IS NULL) AS cur_null
-- FROM public.deals;