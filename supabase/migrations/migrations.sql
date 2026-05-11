-- Database Migrations for Authentication
-- Run this entire file in your Supabase SQL Editor

-- ============================================================================
-- Migration 1: Create `update_updated_at_column()` function
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Migration 2: Create `users` table
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY NOT NULL,
  name TEXT,
  email TEXT NOT NULL UNIQUE,
  "emailVerified" TIMESTAMP WITH TIME ZONE,
  image TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public users are viewable by everyone"
  ON users FOR SELECT USING (true);

CREATE POLICY "Allow authenticated users to insert users"
  ON users FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update users"
  ON users FOR UPDATE USING (true) WITH CHECK (true);

-- ============================================================================
-- Migration 3: Create `whitelisted_users` table
-- ============================================================================

CREATE TABLE IF NOT EXISTS whitelisted_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'user')),
  company_id UUID,
  invited_by UUID REFERENCES whitelisted_users(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whitelisted_users_email ON whitelisted_users(email);
CREATE INDEX IF NOT EXISTS idx_whitelisted_users_role ON whitelisted_users(role);
CREATE INDEX IF NOT EXISTS idx_whitelisted_users_company_id ON whitelisted_users(company_id);
CREATE INDEX IF NOT EXISTS idx_whitelisted_users_invited_by ON whitelisted_users(invited_by);
CREATE INDEX IF NOT EXISTS idx_whitelisted_users_is_active ON whitelisted_users(is_active);
CREATE INDEX IF NOT EXISTS idx_whitelisted_users_created_at ON whitelisted_users(created_at);

CREATE TRIGGER update_whitelisted_users_updated_at
  BEFORE UPDATE ON whitelisted_users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE whitelisted_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations for authenticated users"
  ON whitelisted_users FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- Migration 4: Insert initial admin user
-- IMPORTANT: Replace 'your-admin@example.com' with your actual admin email
-- ============================================================================

INSERT INTO whitelisted_users (email, role, is_active)
VALUES ('your-admin@example.com', 'admin', true)
ON CONFLICT (email) DO NOTHING;

-- ============================================================================
-- Migration 5: Create `organization_members` table
-- Replaces `whitelisted_users` with multi-org support and user linking
-- ============================================================================

CREATE TABLE IF NOT EXISTS organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  organization_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'accountant')),
  invited_by UUID REFERENCES organization_members(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_org_members_email_org
  ON organization_members(email, organization_id);

CREATE INDEX IF NOT EXISTS idx_org_members_user_id ON organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org_id ON organization_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_members_is_active ON organization_members(is_active);

CREATE TRIGGER update_organization_members_updated_at
  BEFORE UPDATE ON organization_members
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations for service role"
  ON organization_members FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- Migration 6: Seed initial admin into organization_members
-- Uses a fixed organization UUID for the default org
-- IMPORTANT: Replace 'jasper@ajeit.io' with your actual admin email if different
-- ============================================================================

INSERT INTO organization_members (email, organization_id, role, is_active)
VALUES (
  'jasper@ajeit.io',
  '00000000-0000-0000-0000-000000000001',
  'admin',
  true
)
ON CONFLICT DO NOTHING;

