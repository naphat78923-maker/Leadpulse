-- Journey board redesign: Won/Lost/Park are exits, not columns.
-- Nudges are derived from follow-up date + silence (nudge_stage no longer required).
-- Optional exit metadata for filters/lists.

ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS lost_reason TEXT,
  ADD COLUMN IF NOT EXISTS park_reason TEXT,
  ADD COLUMN IF NOT EXISTS won_note TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'deals_lost_reason_check'
  ) THEN
    ALTER TABLE deals
      ADD CONSTRAINT deals_lost_reason_check
      CHECK (lost_reason IS NULL OR lost_reason IN ('price', 'taste', 'timing', 'vendor_list', 'no_reply', 'other'));
  END IF;
END $$;

COMMENT ON COLUMN deals.lost_reason IS 'Exit reason when stage=closed_lost (price|taste|timing|vendor_list|no_reply|other)';
COMMENT ON COLUMN deals.park_reason IS 'Why the deal was parked (exit, not a journey column)';
COMMENT ON COLUMN deals.won_note IS 'Optional first SKU / order note when marking won';

-- nudge_stage remains nullable for backwards compatibility but UI no longer edits it.
COMMENT ON COLUMN deals.nudge_stage IS 'Deprecated for edits — nudges derive from follow-up date + silence (NG-001..004)';
