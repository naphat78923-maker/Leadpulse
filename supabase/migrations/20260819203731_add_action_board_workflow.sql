-- LeadPulse action-board workflow: a durable, user-facing "what happens next" state.
-- Pipeline stage remains separate for sales-health reporting.
ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS workflow_action TEXT,
  ADD COLUMN IF NOT EXISTS nudge_stage TEXT,
  ADD COLUMN IF NOT EXISTS sample_status TEXT;

-- Preserve a helpful first board position for existing deals.
UPDATE deals
SET workflow_action = CASE
  WHEN stage = 'closed_won' THEN 'success'
  WHEN stage = 'negotiation' THEN 'testing'
  WHEN stage = 'proposal' THEN 'sample'
  WHEN stage = 'contacted' THEN 'reply'
  WHEN stage = 'closed_lost' THEN 'parked'
  ELSE 'outreach'
END
WHERE workflow_action IS NULL;

ALTER TABLE deals
  ALTER COLUMN workflow_action SET DEFAULT 'outreach',
  ALTER COLUMN workflow_action SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'deals_workflow_action_check'
  ) THEN
    ALTER TABLE deals
      ADD CONSTRAINT deals_workflow_action_check
      CHECK (workflow_action IN ('outreach', 'reply', 'sample', 'testing', 'reschedule', 'parked', 'success'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'deals_nudge_stage_check'
  ) THEN
    ALTER TABLE deals
      ADD CONSTRAINT deals_nudge_stage_check
      CHECK (nudge_stage IS NULL OR nudge_stage IN ('warm', 'remind', 'firm', 'parking'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'deals_sample_status_check'
  ) THEN
    ALTER TABLE deals
      ADD CONSTRAINT deals_sample_status_check
      CHECK (sample_status IS NULL OR sample_status IN ('sent', 'received'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_deals_workflow_action ON deals(workflow_action);
