-- LeadPulse: closed deals should not carry follow-up dates.
-- Trigger clears followup_date whenever a deal enters closed_won / closed_lost,
-- plus a one-time backfill for already-closed rows still holding dates.
-- Applied live 2026-08-23 via Supabase MCP (migration: clear_followup_on_close).

CREATE OR REPLACE FUNCTION clear_followup_on_close()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.stage IN ('closed_won','closed_lost') AND NEW.followup_date IS NOT NULL THEN
    NEW.followup_date := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_clear_followup_on_close ON public.deals;
CREATE TRIGGER trg_clear_followup_on_close
BEFORE INSERT OR UPDATE ON public.deals
FOR EACH ROW EXECUTE FUNCTION clear_followup_on_close();

-- One-time backfill: clear stale dates on already-closed deals
UPDATE public.deals
SET followup_date = NULL, updated_at = NOW()
WHERE stage IN ('closed_won','closed_lost') AND followup_date IS NOT NULL;
