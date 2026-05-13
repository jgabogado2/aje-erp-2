-- ============================================================================
-- Migration 008 — audit_log
-- ============================================================================
-- Cross-cutting append-only event record. Status changes on task_entries
-- plus structural CRUD on sites, users, tracker_categories, site_trackers,
-- tracker_sections, task_lists, tasks. Display-order reorders are NOT
-- recorded (too noisy, low value).
--
-- FK behavior:
--   organization_id : CASCADE  — if the tenant goes away the trail goes too
--   user_id         : SET NULL — preserve trail when the actor is deleted
--   site_id         : SET NULL — preserve trail when a referenced site is
--                                deleted (entity_id still points to whatever
--                                the audited row was)
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  site_id         UUID REFERENCES sites(id) ON DELETE SET NULL,
  entity_type     TEXT NOT NULL CHECK (entity_type IN (
                    'task_entry', 'site', 'user', 'tracker_category',
                    'site_tracker', 'tracker_section', 'task_list', 'task'
                  )),
  entity_id       UUID NOT NULL,
  action          TEXT NOT NULL CHECK (action IN (
                    'create', 'update', 'delete', 'status_change'
                  )),
  -- For 'update' / 'status_change' actions, store ONLY the changed fields
  -- on each side so audit rows stay compact even when entities are wide.
  -- Shape: { fieldName: { from: <prev>, to: <next> }, ... }
  old_value       JSONB,
  new_value       JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Common filter dimensions for the viewer UI.
CREATE INDEX IF NOT EXISTS idx_audit_log_org_created
  ON audit_log(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_site_created
  ON audit_log(site_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity
  ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_user
  ON audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_action
  ON audit_log(action);

-- Append-only: revoke UPDATE/DELETE from anyone in case a future policy
-- gets loosened by accident. Inserts still go through the service role.
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_log_service_role_only" ON audit_log;
CREATE POLICY "audit_log_service_role_only"
  ON audit_log FOR ALL
  TO authenticated, anon
  USING (false) WITH CHECK (false);

-- End of Migration 008
