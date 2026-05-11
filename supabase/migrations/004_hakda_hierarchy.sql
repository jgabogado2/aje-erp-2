-- ============================================================================
-- Migration 004 — HAKDA Phase 2b: sections, task lists, tasks
-- ============================================================================
-- These tables are the per-site instantiation of the tracker_categories
-- templates added in 003. When a Super Admin assigns a category to a site
-- (creating a site_trackers row), the app seeds matching tracker_sections
-- and task_lists from the category's JSONB templates.
--
-- FK behavior:
--   site_trackers      -> tracker_sections : CASCADE  (drop everything when
--   site_trackers      -> task_lists       : CASCADE   the tracker is removed)
--   tracker_sections   -> task_lists       : SET NULL (matches HAKDA — task
--                                                      lists can be ungrouped)
--   task_lists         -> tasks            : CASCADE
--   users              -> tasks.assigned_to: SET NULL (preserve task on user
--   users              -> tasks.created_by : SET NULL  deletion)
-- ============================================================================


-- ============================================================================
-- 4.1  tracker_sections
-- ============================================================================

CREATE TABLE IF NOT EXISTS tracker_sections (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_tracker_id  UUID NOT NULL REFERENCES site_trackers(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  display_order    INT  NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Unique-by-name within a tracker so the UI never shows two sections with
  -- the same label. App layer also dedupes on rename.
  CONSTRAINT tracker_sections_site_tracker_name_unique
    UNIQUE (site_tracker_id, name)
);

CREATE INDEX IF NOT EXISTS idx_tracker_sections_site_tracker
  ON tracker_sections(site_tracker_id);
CREATE INDEX IF NOT EXISTS idx_tracker_sections_order
  ON tracker_sections(site_tracker_id, display_order);

DROP TRIGGER IF EXISTS update_tracker_sections_updated_at ON tracker_sections;
CREATE TRIGGER update_tracker_sections_updated_at
  BEFORE UPDATE ON tracker_sections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE tracker_sections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tracker_sections_service_role_only" ON tracker_sections;
CREATE POLICY "tracker_sections_service_role_only"
  ON tracker_sections FOR ALL
  TO authenticated, anon
  USING (false) WITH CHECK (false);


-- ============================================================================
-- 4.2  task_lists
-- ============================================================================

CREATE TABLE IF NOT EXISTS task_lists (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_tracker_id     UUID NOT NULL REFERENCES site_trackers(id) ON DELETE CASCADE,
  tracker_section_id  UUID REFERENCES tracker_sections(id) ON DELETE SET NULL,
  name                TEXT NOT NULL,
  display_order       INT  NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT task_lists_site_tracker_name_unique
    UNIQUE (site_tracker_id, name)
);

CREATE INDEX IF NOT EXISTS idx_task_lists_site_tracker ON task_lists(site_tracker_id);
CREATE INDEX IF NOT EXISTS idx_task_lists_section      ON task_lists(tracker_section_id);
CREATE INDEX IF NOT EXISTS idx_task_lists_order
  ON task_lists(site_tracker_id, tracker_section_id, display_order);

DROP TRIGGER IF EXISTS update_task_lists_updated_at ON task_lists;
CREATE TRIGGER update_task_lists_updated_at
  BEFORE UPDATE ON task_lists
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE task_lists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "task_lists_service_role_only" ON task_lists;
CREATE POLICY "task_lists_service_role_only"
  ON task_lists FOR ALL
  TO authenticated, anon
  USING (false) WITH CHECK (false);


-- ============================================================================
-- 4.3  tasks
-- ============================================================================
-- A task is what gets a series of task_entries (one per period) generated
-- for it by the engine in Phase 2c. Frequency defaults to the tracker
-- category's frequency in the UI but is stored explicitly so individual
-- tasks can override (e.g., a quarterly task inside a monthly tracker).

CREATE TABLE IF NOT EXISTS tasks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_list_id    UUID NOT NULL REFERENCES task_lists(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  assigned_to     UUID REFERENCES users(id) ON DELETE SET NULL,
  frequency       TEXT NOT NULL CHECK (frequency IN (
                    'DAILY', 'WEEKLY', 'MONTHLY',
                    'QUARTERLY', 'ANNUAL', 'BIR', 'CUSTOM'
                  )),
  skip_weekends   BOOLEAN NOT NULL DEFAULT false,
  skip_holidays   BOOLEAN NOT NULL DEFAULT false,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  display_order   INT     NOT NULL DEFAULT 0,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_task_list  ON tasks(task_list_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned   ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_is_active  ON tasks(is_active);
CREATE INDEX IF NOT EXISTS idx_tasks_order      ON tasks(task_list_id, display_order);

DROP TRIGGER IF EXISTS update_tasks_updated_at ON tasks;
CREATE TRIGGER update_tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tasks_service_role_only" ON tasks;
CREATE POLICY "tasks_service_role_only"
  ON tasks FOR ALL
  TO authenticated, anon
  USING (false) WITH CHECK (false);


-- ============================================================================
-- 4.4  RPC: assign_tracker_to_site (atomic site_tracker + seed)
-- ============================================================================
-- One transaction does the whole thing:
--   1. Insert the site_trackers row for (site, category, year)
--   2. Seed tracker_sections from category.section_templates
--   3. Seed task_lists from category.task_list_templates, resolving the
--      section name reference to the just-inserted section id
--
-- If any step fails, the whole transaction rolls back — no orphan
-- site_trackers row left behind. Org-scope and duplicate checks stay in
-- the API layer; this function just does the persistence.

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
  v_site_tracker_id    UUID;
  v_section_templates  JSONB;
  v_task_list_templates JSONB;
  v_section            JSONB;
  v_task_list          JSONB;
  v_section_id_by_name JSONB := '{}'::jsonb;
  v_new_section_id     UUID;
  v_lookup_section_id  UUID;
BEGIN
  SELECT section_templates, task_list_templates
    INTO v_section_templates, v_task_list_templates
  FROM tracker_categories
  WHERE id = p_category_id;

  IF v_section_templates IS NULL THEN
    RAISE EXCEPTION 'tracker_category % not found', p_category_id;
  END IF;

  -- 1. Create the site_tracker.
  INSERT INTO site_trackers (site_id, tracker_category_id, year, is_active)
  VALUES (p_site_id, p_category_id, p_year, true)
  RETURNING id INTO v_site_tracker_id;

  -- 2. Seed sections, remembering name -> uuid for task list resolution.
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

  -- 3. Seed task lists, resolving section reference (nullable).
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
      site_tracker_id, tracker_section_id, name, display_order
    ) VALUES (
      v_site_tracker_id,
      v_lookup_section_id,
      v_task_list->>'name',
      COALESCE((v_task_list->>'order')::int, 0)
    );
  END LOOP;

  RETURN v_site_tracker_id;
END;
$$;

REVOKE ALL ON FUNCTION assign_tracker_to_site(UUID, UUID, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION assign_tracker_to_site(UUID, UUID, INT) FROM authenticated, anon;


-- ============================================================================
-- End of Migration 004
-- ============================================================================
