-- ============================================================================
-- Migration 007 — Promote task_lists to "task item"; strip tasks to "subtask"
-- ============================================================================
-- Conceptual flip. After this migration:
--   task_lists  = "task item": carries frequency/assignee/skip rules and is
--                 the row that task_entries are generated for.
--   tasks       = "subtask": optional, lightweight. Just a name + display
--                 order under a task_list. Tied into the parent's entries
--                 via task_entries.subtask_completions (JSONB list of ids).
--
-- Per user choice, this is a destructive migration: all phase-2 data is
-- wiped because (a) we're still pre-production, and (b) the task_list ↔
-- tasks relationship and the task_list_templates JSONB shape both change.
-- Categories also get wiped because their JSONB template shape changes.
-- ============================================================================


-- ============================================================================
-- 7.0  Wipe phase 2 data — keep sites, users, organizations, holidays
-- ============================================================================

TRUNCATE TABLE
  task_entries,
  tasks,
  task_lists,
  tracker_sections,
  site_trackers,
  tracker_categories
RESTART IDENTITY CASCADE;


-- ============================================================================
-- 7.1  task_lists gains task-item properties
-- ============================================================================
-- Default on frequency only exists to satisfy NOT NULL across the
-- (empty) table; we strip the default so future inserts must be explicit.

ALTER TABLE task_lists
  ADD COLUMN IF NOT EXISTS frequency TEXT NOT NULL DEFAULT 'MONTHLY'
    CHECK (frequency IN ('DAILY','WEEKLY','MONTHLY','QUARTERLY','ANNUAL','BIR','CUSTOM')),
  ADD COLUMN IF NOT EXISTS assigned_to    UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS skip_weekends  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS skip_holidays  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_active      BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_by     UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE task_lists ALTER COLUMN frequency DROP DEFAULT;

CREATE INDEX IF NOT EXISTS idx_task_lists_frequency ON task_lists(frequency);
CREATE INDEX IF NOT EXISTS idx_task_lists_assigned  ON task_lists(assigned_to);
CREATE INDEX IF NOT EXISTS idx_task_lists_is_active ON task_lists(is_active);


-- ============================================================================
-- 7.2  tasks stripped down to subtask shape
-- ============================================================================

DROP INDEX IF EXISTS idx_tasks_frequency;
DROP INDEX IF EXISTS idx_tasks_assigned;
DROP INDEX IF EXISTS idx_tasks_is_active;

ALTER TABLE tasks
  DROP COLUMN IF EXISTS frequency,
  DROP COLUMN IF EXISTS assigned_to,
  DROP COLUMN IF EXISTS skip_weekends,
  DROP COLUMN IF EXISTS skip_holidays,
  DROP COLUMN IF EXISTS is_active,
  DROP COLUMN IF EXISTS created_by;


-- ============================================================================
-- 7.3  task_entries: rekey to task_list, add subtask completions
-- ============================================================================

ALTER TABLE task_entries
  DROP CONSTRAINT IF EXISTS task_entries_task_id_period_unique,
  DROP CONSTRAINT IF EXISTS task_entries_task_id_period_date_period_label_key,
  DROP CONSTRAINT IF EXISTS task_entries_task_period_unique;

ALTER TABLE task_entries DROP COLUMN IF EXISTS task_id;

ALTER TABLE task_entries
  ADD COLUMN IF NOT EXISTS task_list_id UUID NOT NULL
    REFERENCES task_lists(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS subtask_completions JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE task_entries
  ADD CONSTRAINT task_entries_task_list_period_unique
  UNIQUE (task_list_id, period_date, period_label);

DROP INDEX IF EXISTS idx_task_entries_task;
CREATE INDEX IF NOT EXISTS idx_task_entries_task_list
  ON task_entries(task_list_id);
CREATE INDEX IF NOT EXISTS idx_task_entries_period_date
  ON task_entries(period_date);


-- ============================================================================
-- 7.4  Rewrite assign_tracker_to_site for new template shape
-- ============================================================================
-- New task_list_templates JSONB:
--   [{
--     name, order, section,
--     frequency,                       -- required (drives entry generation)
--     skip_weekends, skip_holidays,    -- optional (default false)
--     subtasks: [{ name, order }]      -- optional
--   }]
--
-- This RPC stays atomic for the structural seed. The API layer follows up
-- with a TS pass that uses lib/task-engine.ts to generate task_entries for
-- each newly-seeded task_list — handled there instead of in PLPGSQL so the
-- engine has access to holidays and tested generation rules.

CREATE OR REPLACE FUNCTION assign_tracker_to_site(
  p_site_id      UUID,
  p_category_id  UUID,
  p_year         INT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_site_tracker_id     UUID;
  v_section_templates   JSONB;
  v_task_list_templates JSONB;
  v_section             JSONB;
  v_task_list           JSONB;
  v_subtask             JSONB;
  v_section_id_by_name  JSONB := '{}'::jsonb;
  v_new_section_id      UUID;
  v_lookup_section_id   UUID;
  v_new_task_list_id    UUID;
BEGIN
  SELECT section_templates, task_list_templates
    INTO v_section_templates, v_task_list_templates
  FROM tracker_categories
  WHERE id = p_category_id;

  IF v_section_templates IS NULL THEN
    RAISE EXCEPTION 'tracker_category % not found', p_category_id;
  END IF;

  INSERT INTO site_trackers (site_id, tracker_category_id, year, is_active)
  VALUES (p_site_id, p_category_id, p_year, true)
  RETURNING id INTO v_site_tracker_id;

  -- 1. Seed sections; build name -> id map for task list resolution.
  FOR v_section IN
    SELECT value
    FROM jsonb_array_elements(v_section_templates) WITH ORDINALITY t(value, idx)
    ORDER BY (value->>'order')::int, idx
  LOOP
    INSERT INTO tracker_sections (site_tracker_id, name, display_order)
    VALUES (
      v_site_tracker_id,
      v_section->>'name',
      COALESCE((v_section->>'order')::int, 0)
    )
    RETURNING id INTO v_new_section_id;

    v_section_id_by_name := v_section_id_by_name
      || jsonb_build_object(v_section->>'name', v_new_section_id::text);
  END LOOP;

  -- 2. Seed task_lists (= task items) with frequency/skip rules and
  --    optional subtasks. Entries are NOT generated here; the API layer
  --    handles that after this RPC returns.
  FOR v_task_list IN
    SELECT value
    FROM jsonb_array_elements(v_task_list_templates) WITH ORDINALITY t(value, idx)
    ORDER BY (value->>'order')::int, idx
  LOOP
    v_lookup_section_id := NULL;
    IF v_task_list->>'section' IS NOT NULL THEN
      v_lookup_section_id := (
        v_section_id_by_name->>(v_task_list->>'section')
      )::uuid;
    END IF;

    INSERT INTO task_lists (
      site_tracker_id, tracker_section_id, name, display_order,
      frequency, skip_weekends, skip_holidays, is_active
    ) VALUES (
      v_site_tracker_id,
      v_lookup_section_id,
      v_task_list->>'name',
      COALESCE((v_task_list->>'order')::int, 0),
      COALESCE(v_task_list->>'frequency', 'MONTHLY'),
      COALESCE((v_task_list->>'skip_weekends')::boolean, false),
      COALESCE((v_task_list->>'skip_holidays')::boolean, false),
      true
    )
    RETURNING id INTO v_new_task_list_id;

    -- Optional subtask seed.
    IF jsonb_typeof(v_task_list->'subtasks') = 'array' THEN
      FOR v_subtask IN
        SELECT value
        FROM jsonb_array_elements(v_task_list->'subtasks') WITH ORDINALITY t(value, idx)
        ORDER BY (value->>'order')::int NULLS LAST, idx
      LOOP
        INSERT INTO tasks (task_list_id, name, display_order)
        VALUES (
          v_new_task_list_id,
          v_subtask->>'name',
          COALESCE((v_subtask->>'order')::int, 0)
        );
      END LOOP;
    END IF;
  END LOOP;

  RETURN v_site_tracker_id;
END;
$$;

REVOKE ALL ON FUNCTION assign_tracker_to_site(UUID, UUID, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION assign_tracker_to_site(UUID, UUID, INT) FROM authenticated, anon;


-- ============================================================================
-- End of Migration 007
-- ============================================================================
