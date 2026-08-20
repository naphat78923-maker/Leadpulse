-- Add 'dm' (direct message / LINE / WhatsApp) to the meetings.type check constraint.
-- This lets DM follow-ups count on the Activity pulse alongside calls, emails, meetings, samples, and nudges.
ALTER TABLE meetings DROP CONSTRAINT IF EXISTS meetings_type_check;
ALTER TABLE meetings ADD CONSTRAINT meetings_type_check
  CHECK (type IN ('call', 'email', 'meeting', 'sample_sent', 'nudge', 'note', 'dm'));
