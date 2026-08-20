-- Add phone_second to contacts if missing
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS phone_second TEXT;
