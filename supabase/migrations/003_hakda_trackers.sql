-- ============================================================================
-- Migration 003 — HAKDA Phase 2a: tracker categories + site trackers + holidays
-- ============================================================================
-- Adds the global tracker template (tracker_categories), per-site/per-year
-- instantiation (site_trackers), and the holidays table seeded with the
-- known Philippine 2026 public holidays. Run AFTER 002.
-- ============================================================================


-- ============================================================================
-- 3.1  tracker_categories (global templates owned by Super Admins)
-- ============================================================================
-- A tracker category is a reusable template. When a Super Admin assigns one
-- to a site (creating a site_trackers row), the section/task-list templates
-- stored here are read and instantiated on that site.
--
-- Frequency drives what the task engine generates for periods (daily, weekly,
-- monthly, quarterly, annual, BIR-hybrid, or custom).

CREATE TABLE IF NOT EXISTS tracker_categories (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Scoped to the org so a future second tenant can't see AJE's templates.
  -- HAKDA calls them "global" but global in a single-tenant sense; the FK
  -- here is the multi-tenant boundary.
  organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name                  TEXT NOT NULL,
  description           TEXT,
  frequency             TEXT NOT NULL CHECK (frequency IN (
                          'DAILY', 'WEEKLY', 'MONTHLY',
                          'QUARTERLY', 'ANNUAL', 'BIR', 'CUSTOM'
                        )),
  -- Section templates only matter for BIR / QUARTERLY / ANNUAL frequencies;
  -- shape: [{ name: 'EWT Recon', order: 0 }, ...]. Empty array otherwise.
  section_templates     JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Task list templates can optionally reference a section by name. Shape:
  -- [{ name: 'Collection', order: 0, section: 'EWT Recon' | null }, ...].
  task_list_templates   JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  created_by            UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tracker_categories_org       ON tracker_categories(organization_id);
CREATE INDEX IF NOT EXISTS idx_tracker_categories_frequency ON tracker_categories(frequency);
CREATE INDEX IF NOT EXISTS idx_tracker_categories_is_active ON tracker_categories(is_active);

DROP TRIGGER IF EXISTS update_tracker_categories_updated_at ON tracker_categories;
CREATE TRIGGER update_tracker_categories_updated_at
  BEFORE UPDATE ON tracker_categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE tracker_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tracker_categories_service_role_only" ON tracker_categories;
CREATE POLICY "tracker_categories_service_role_only"
  ON tracker_categories FOR ALL
  TO authenticated, anon
  USING (false) WITH CHECK (false);


-- ============================================================================
-- 3.2  site_trackers (year-scoped instantiation of a category at a site)
-- ============================================================================

CREATE TABLE IF NOT EXISTS site_trackers (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id               UUID NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,
  tracker_category_id   UUID NOT NULL REFERENCES tracker_categories(id) ON DELETE RESTRICT,
  year                  INT NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  is_active             BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- HAKDA constraint: one assignment per (site, category, year).
  CONSTRAINT site_trackers_site_category_year_unique
    UNIQUE (site_id, tracker_category_id, year)
);

CREATE INDEX IF NOT EXISTS idx_site_trackers_site_id   ON site_trackers(site_id);
CREATE INDEX IF NOT EXISTS idx_site_trackers_category  ON site_trackers(tracker_category_id);
CREATE INDEX IF NOT EXISTS idx_site_trackers_year      ON site_trackers(year);
CREATE INDEX IF NOT EXISTS idx_site_trackers_is_active ON site_trackers(is_active);

DROP TRIGGER IF EXISTS update_site_trackers_updated_at ON site_trackers;
CREATE TRIGGER update_site_trackers_updated_at
  BEFORE UPDATE ON site_trackers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE site_trackers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "site_trackers_service_role_only" ON site_trackers;
CREATE POLICY "site_trackers_service_role_only"
  ON site_trackers FOR ALL
  TO authenticated, anon
  USING (false) WITH CHECK (false);


-- ============================================================================
-- 3.3  holidays (skip-holidays support for the task engine)
-- ============================================================================
-- Org-scoped so different tenants can have different observances. is_recurring
-- means the same month/day in future years counts as a holiday (e.g., Christmas).

CREATE TABLE IF NOT EXISTS holidays (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  date            DATE NOT NULL,
  name            TEXT NOT NULL,
  is_recurring    BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT holidays_org_date_unique UNIQUE (organization_id, date)
);

CREATE INDEX IF NOT EXISTS idx_holidays_org_date ON holidays(organization_id, date);

ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "holidays_service_role_only" ON holidays;
CREATE POLICY "holidays_service_role_only"
  ON holidays FOR ALL
  TO authenticated, anon
  USING (false) WITH CHECK (false);


-- ============================================================================
-- 3.4  Seed Philippine 2026 public holidays for AJE
-- ============================================================================
-- Sources: Proclamation No. 727 (s. 2024) for regular/special non-working
-- days observed nationwide in the Philippines for 2026.
-- Non-working: regular holidays + special (non-working) days. Skip-holidays
-- logic treats both the same for now.
--
-- This block targets the AJE org seeded in migration 002. New organizations
-- get an empty holidays table by default; they can seed via the Admin UI or
-- by re-running this pattern with a different org id.

INSERT INTO holidays (organization_id, date, name, is_recurring) VALUES
  ('00000000-0000-0000-0000-000000000001', '2026-01-01', 'New Year''s Day', true),
  ('00000000-0000-0000-0000-000000000001', '2026-02-17', 'Chinese New Year', false),
  ('00000000-0000-0000-0000-000000000001', '2026-02-25', 'EDSA People Power Revolution Anniversary', false),
  ('00000000-0000-0000-0000-000000000001', '2026-04-02', 'Maundy Thursday', false),
  ('00000000-0000-0000-0000-000000000001', '2026-04-03', 'Good Friday', false),
  ('00000000-0000-0000-0000-000000000001', '2026-04-04', 'Black Saturday', false),
  ('00000000-0000-0000-0000-000000000001', '2026-04-09', 'Araw ng Kagitingan (Day of Valor)', true),
  ('00000000-0000-0000-0000-000000000001', '2026-05-01', 'Labor Day', true),
  ('00000000-0000-0000-0000-000000000001', '2026-06-12', 'Independence Day', true),
  ('00000000-0000-0000-0000-000000000001', '2026-08-21', 'Ninoy Aquino Day', true),
  ('00000000-0000-0000-0000-000000000001', '2026-08-31', 'National Heroes Day (last Monday of August)', false),
  ('00000000-0000-0000-0000-000000000001', '2026-11-01', 'All Saints'' Day', true),
  ('00000000-0000-0000-0000-000000000001', '2026-11-02', 'All Souls'' Day', false),
  ('00000000-0000-0000-0000-000000000001', '2026-11-30', 'Bonifacio Day', true),
  ('00000000-0000-0000-0000-000000000001', '2026-12-08', 'Feast of the Immaculate Conception of Mary', true),
  ('00000000-0000-0000-0000-000000000001', '2026-12-24', 'Christmas Eve', true),
  ('00000000-0000-0000-0000-000000000001', '2026-12-25', 'Christmas Day', true),
  ('00000000-0000-0000-0000-000000000001', '2026-12-30', 'Rizal Day', true),
  ('00000000-0000-0000-0000-000000000001', '2026-12-31', 'Last Day of the Year', true)
ON CONFLICT (organization_id, date) DO NOTHING;


-- ============================================================================
-- End of Migration 003
-- ============================================================================
