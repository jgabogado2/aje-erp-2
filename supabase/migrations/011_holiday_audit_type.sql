-- ============================================================================
-- Migration 011 — extend audit_log entity_type to include 'holiday'
-- ============================================================================
-- Alters the CHECK constraint so holidays CRUD can be recorded in audit_log.
-- Postgres requires dropping and re-adding the constraint to change its list.
-- ============================================================================

ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_entity_type_check;

ALTER TABLE audit_log ADD CONSTRAINT audit_log_entity_type_check
  CHECK (entity_type IN (
    'task_entry', 'site', 'user', 'tracker_category',
    'site_tracker', 'tracker_section', 'task_list', 'task', 'holiday'
  ));
