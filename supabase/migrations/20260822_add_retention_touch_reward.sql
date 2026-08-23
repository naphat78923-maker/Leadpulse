-- LeadPulse Slice 5 — persist touch dates + reward meeting type (Phase 2)
-- Run in Supabase dashboard SQL editor, then refresh the app.
-- LeadPulse convention: new columns nullable; RLS stays as-is (app uses anon key).

-- 1) Persisted touch-cadence fields on companies.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS last_human_touch date,
  ADD COLUMN IF NOT EXISTS next_touch_due date;

CREATE INDEX IF NOT EXISTS idx_companies_next_touch ON public.companies(next_touch_due);

-- 2) Allow 'reward' as a meeting type so granted surprise rewards are auditable.
ALTER TABLE public.meetings DROP CONSTRAINT IF EXISTS meetings_type_check;
ALTER TABLE public.meetings ADD CONSTRAINT meetings_type_check
  CHECK (type IN ('call', 'email', 'meeting', 'sample_sent', 'nudge', 'note', 'dm', 'reward'));
