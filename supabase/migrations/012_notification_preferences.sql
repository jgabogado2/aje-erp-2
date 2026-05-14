-- ============================================================================
-- Migration 012 — per-user notification preferences
-- ============================================================================

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id    UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  channels   JSONB NOT NULL DEFAULT
               '{"overdue":"email","upcoming":"email","assigned":"in_app","status_changed":"off"}'::jsonb,
  digest     TEXT NOT NULL DEFAULT 'daily'
               CHECK (digest IN ('immediate', 'daily', 'off')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notification_preferences_service_role_only" ON notification_preferences;
CREATE POLICY "notification_preferences_service_role_only"
  ON notification_preferences FOR ALL
  TO authenticated, anon
  USING (false) WITH CHECK (false);
