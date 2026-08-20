-- LeadPulse activity hub: durable audit trail of user actions (create/edit/quick_action/delete)
-- that survives reloads and can be undone. The interaction log stays in `meetings`;
-- this table captures system actions so the activity feed is complete.
CREATE TABLE IF NOT EXISTS activity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  label TEXT NOT NULL,
  description TEXT,
  undo_payload JSONB,
  applied BOOLEAN NOT NULL DEFAULT TRUE,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_events_timestamp ON activity_events(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_activity_events_entity ON activity_events(entity, entity_id);
