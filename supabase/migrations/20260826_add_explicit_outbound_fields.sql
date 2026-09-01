-- LeadPulse explicit outbound fields, lean slice.
-- Existing contacts remain unclassified until Pat reviews them; do not infer
-- whether a person is named from the contact name or role text.

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS identity_quality TEXT NOT NULL DEFAULT 'unknown';

ALTER TABLE public.contacts
  DROP CONSTRAINT IF EXISTS contacts_identity_quality_check;

ALTER TABLE public.contacts
  ADD CONSTRAINT contacts_identity_quality_check
  CHECK (identity_quality IN ('named', 'role_only', 'company_route', 'unknown'));

-- Client-facing intent stays separate from the internal CRM next action.
ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS draft_primary_ask TEXT;
