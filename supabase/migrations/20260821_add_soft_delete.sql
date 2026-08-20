-- LeadPulse soft-delete: recoverable archive for companies, contacts, deals, meetings.
-- Rows stay in the database (so they can be restored) but are hidden from the UI
-- until deleted_at is cleared. Every delete is undoable via the activity trail.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE contacts  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE deals     ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE meetings  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_companies_deleted ON companies(deleted_at);
CREATE INDEX IF NOT EXISTS idx_contacts_deleted  ON contacts(deleted_at);
CREATE INDEX IF NOT EXISTS idx_deals_deleted     ON deals(deleted_at);
CREATE INDEX IF NOT EXISTS idx_meetings_deleted  ON meetings(deleted_at);
