-- PROPOSED FOR REVIEW: neutral initial contact state, never a historical backfill.
-- Apply to the live database only after Pat approves the migration and rollout.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Fail closed if the deployed status constraint differs from the reviewed schema.
DO $$
DECLARE status_attribute smallint;
BEGIN
  SELECT attnum INTO status_attribute FROM pg_attribute
    WHERE attrelid = 'public.contacts'::regclass AND attname = 'status' AND NOT attisdropped;
  IF status_attribute IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.contacts'::regclass AND conname = 'contacts_status_check'
      AND contype = 'c' AND conkey = ARRAY[status_attribute]::smallint[]
  ) OR (SELECT count(*) FROM pg_constraint
    WHERE conrelid = 'public.contacts'::regclass AND contype = 'c'
      AND status_attribute = ANY(conkey)) <> 1 THEN
    RAISE EXCEPTION 'Unexpected contacts.status constraints; inspect live schema before applying this migration';
  END IF;
END $$;

ALTER TABLE public.contacts DROP CONSTRAINT contacts_status_check;
ALTER TABLE public.contacts ADD CONSTRAINT contacts_status_check
  CHECK (status IN ('uncontacted', 'active', 'replied', 'not_interested', 'no_response', 'parked')) NOT VALID;
ALTER TABLE public.contacts VALIDATE CONSTRAINT contacts_status_check;
ALTER TABLE public.contacts ALTER COLUMN status SET DEFAULT 'uncontacted';

-- Intentionally no UPDATE: existing status/history must remain exactly as stored.
NOTIFY pgrst, 'reload schema';
COMMIT;
