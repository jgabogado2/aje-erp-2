-- ============================================================================
-- Migration 005 — HAKDA Phase 2c: task entries
-- ============================================================================
-- Task entries are the per-period work items generated from tasks. A task under
-- a year-scoped site_tracker owns its generated entries for that tracker year.
-- BIR tasks generate both monthly and quarterly rows, so idempotency uses
-- (task_id, period_date, period_label) instead of period_date alone.
-- ============================================================================

CREATE TABLE IF NOT EXISTS task_entries (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id           UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  period_date       DATE NOT NULL,
  period_label      TEXT NOT NULL,
  due_date          DATE NOT NULL,
  submission_date   DATE,
  status            TEXT NOT NULL DEFAULT 'NOT_DONE' CHECK (status IN (
                      'NOT_DONE', 'ONGOING', 'DONE', 'DONE_LATE'
                    )),
  bir_status        TEXT CHECK (bir_status IN (
                      'NO_SUBMISSION',
                      'SUBMITTED_TO_FRG',
                      'APPROVED_FOR_FILING',
                      'FILED_FOR_PAYMENT',
                      'FILED_AND_PAID',
                      'FILED_NO_PAYMENT'
                    )),
  value             TEXT,
  marked_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  marked_at         TIMESTAMPTZ,
  note              TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT task_entries_task_period_unique
    UNIQUE (task_id, period_date, period_label)
);

CREATE INDEX IF NOT EXISTS idx_task_entries_task_period
  ON task_entries(task_id, period_date);
CREATE INDEX IF NOT EXISTS idx_task_entries_task_status
  ON task_entries(task_id, status);
CREATE INDEX IF NOT EXISTS idx_task_entries_period_date
  ON task_entries(period_date);

DROP TRIGGER IF EXISTS update_task_entries_updated_at ON task_entries;
CREATE TRIGGER update_task_entries_updated_at
  BEFORE UPDATE ON task_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE task_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "task_entries_service_role_only" ON task_entries;
CREATE POLICY "task_entries_service_role_only"
  ON task_entries FOR ALL
  TO authenticated, anon
  USING (false) WITH CHECK (false);

-- ============================================================================
-- End of Migration 005
-- ============================================================================
