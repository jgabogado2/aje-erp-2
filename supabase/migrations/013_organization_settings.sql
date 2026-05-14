-- ============================================================================
-- Migration 013 — organization_settings (audit retention + future prefs)
-- ============================================================================

CREATE TABLE IF NOT EXISTS organization_settings (
  organization_id    UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  audit_retention_days INTEGER CHECK (audit_retention_days > 0),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE organization_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_settings_service_role_only" ON organization_settings;
CREATE POLICY "org_settings_service_role_only"
  ON organization_settings FOR ALL
  TO authenticated, anon
  USING (false) WITH CHECK (false);
