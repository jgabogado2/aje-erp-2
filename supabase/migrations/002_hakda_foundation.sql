-- ============================================================================
-- Migration 002 — HAKDA Phase 1 Foundation
-- ============================================================================
-- Adds the org/site/user_sites layer, migrates role enum to HAKDA names
-- (SUPER_ADMIN / SITE_MANAGER / STAFF), and drops the legacy whitelisted_users
-- table. Idempotent where reasonable. Run AFTER migrations.sql.
-- ============================================================================


-- ============================================================================
-- 2.1  organizations (tenant: a company)
-- ============================================================================
-- UUID PK keeps FK types consistent across the schema. `code` is the
-- human-facing short identifier (e.g. 'ORG-001') shown in URLs and UI.

CREATE TABLE IF NOT EXISTS organizations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_organizations_code      ON organizations(code);
CREATE INDEX IF NOT EXISTS idx_organizations_is_active ON organizations(is_active);

DROP TRIGGER IF EXISTS update_organizations_updated_at ON organizations;
CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- API layer (service role) is the security boundary. Block all direct
-- authenticated/anon access; service role bypasses RLS.
DROP POLICY IF EXISTS "organizations_service_role_only" ON organizations;
CREATE POLICY "organizations_service_role_only"
  ON organizations FOR ALL
  TO authenticated, anon
  USING (false) WITH CHECK (false);

-- Seed: AJE organization. Uses the fixed UUID that organization_members
-- already references so existing rows stay valid when we add the FK.
INSERT INTO organizations (id, code, name, is_active)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'ORG-001',
  'AJE',
  true
)
ON CONFLICT (id) DO UPDATE
  SET code = EXCLUDED.code,
      name = EXCLUDED.name;


-- ============================================================================
-- 2.2  Migrate organization_members.role -> HAKDA names
-- ============================================================================
-- old: admin / manager / accountant
-- new: SUPER_ADMIN / SITE_MANAGER / STAFF
--
-- Order: drop CHECK -> update rows -> add new CHECK. The CHECK constraint
-- in migrations.sql was unnamed; Postgres auto-named it
-- `organization_members_role_check`.

ALTER TABLE organization_members
  DROP CONSTRAINT IF EXISTS organization_members_role_check;

UPDATE organization_members
SET role = CASE role
  WHEN 'admin'      THEN 'SUPER_ADMIN'
  WHEN 'manager'    THEN 'SITE_MANAGER'
  WHEN 'accountant' THEN 'STAFF'
  ELSE role
END
WHERE role IN ('admin', 'manager', 'accountant');

ALTER TABLE organization_members
  ADD CONSTRAINT organization_members_role_check
  CHECK (role IN ('SUPER_ADMIN', 'SITE_MANAGER', 'STAFF'));


-- ============================================================================
-- 2.3  Add FK organization_members.organization_id -> organizations.id
-- ============================================================================
-- Was previously a free-floating UUID. Now that organizations exists and
-- the AJE row is seeded with the matching id, this FK is safe.

ALTER TABLE organization_members
  DROP CONSTRAINT IF EXISTS organization_members_organization_id_fkey;

ALTER TABLE organization_members
  ADD CONSTRAINT organization_members_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;

-- Tighten RLS: API-layer-only (was permissive `USING (true)`).
DROP POLICY IF EXISTS "Allow all operations for service role" ON organization_members;
DROP POLICY IF EXISTS "organization_members_service_role_only" ON organization_members;
CREATE POLICY "organization_members_service_role_only"
  ON organization_members FOR ALL
  TO authenticated, anon
  USING (false) WITH CHECK (false);


-- ============================================================================
-- 2.4  sites (office under an organization)
-- ============================================================================

CREATE TABLE IF NOT EXISTS sites (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  code             TEXT NOT NULL,
  name             TEXT NOT NULL,
  address          TEXT,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Codes are unique per org so two tenants can both have a 'MNL-01'.
  CONSTRAINT sites_org_code_unique UNIQUE (organization_id, code)
);

CREATE INDEX IF NOT EXISTS idx_sites_organization_id ON sites(organization_id);
CREATE INDEX IF NOT EXISTS idx_sites_is_active       ON sites(is_active);

DROP TRIGGER IF EXISTS update_sites_updated_at ON sites;
CREATE TRIGGER update_sites_updated_at
  BEFORE UPDATE ON sites
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE sites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sites_service_role_only" ON sites;
CREATE POLICY "sites_service_role_only"
  ON sites FOR ALL
  TO authenticated, anon
  USING (false) WITH CHECK (false);


-- ============================================================================
-- 2.5  user_sites (which users belong to which sites, with site-scoped role)
-- ============================================================================
-- system role lives on organization_members; site-scoped role lives here.
-- SUPER_ADMIN doesn't need rows here — RBAC checks system role first.

CREATE TABLE IF NOT EXISTS user_sites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  site_id     UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('SITE_MANAGER', 'STAFF')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT user_sites_user_site_unique UNIQUE (user_id, site_id)
);

CREATE INDEX IF NOT EXISTS idx_user_sites_user_id ON user_sites(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sites_site_id ON user_sites(site_id);

DROP TRIGGER IF EXISTS update_user_sites_updated_at ON user_sites;
CREATE TRIGGER update_user_sites_updated_at
  BEFORE UPDATE ON user_sites
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE user_sites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_sites_service_role_only" ON user_sites;
CREATE POLICY "user_sites_service_role_only"
  ON user_sites FOR ALL
  TO authenticated, anon
  USING (false) WITH CHECK (false);


-- ============================================================================
-- 2.6  Drop legacy whitelisted_users
-- ============================================================================
-- organization_members fully replaces it. Verified: no app code references
-- this table any more.

DROP TABLE IF EXISTS whitelisted_users CASCADE;


-- ============================================================================
-- End of Migration 002
-- ============================================================================
