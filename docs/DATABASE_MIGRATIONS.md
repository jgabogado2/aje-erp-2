# Database Migrations for Authentication

Run these migrations in your Supabase SQL Editor in order.

## Migration 1: Create `update_updated_at_column()` function

```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

## Migration 2: Create `users` table

```sql
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
```

## Migration 3: Create `whitelisted_users` table

```sql
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
```

## Migration 4: Insert initial admin user

Replace `your-admin@example.com` with your actual admin email:

```sql
INSERT INTO whitelisted_users (email, role, is_active)
VALUES ('your-admin@example.com', 'admin', true)
ON CONFLICT (email) DO NOTHING;
```

## Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable "Google+ API" or "Google Identity API"
4. Create OAuth 2.0 credentials:
   - Application type: **Web application**
   - Authorized redirect URIs:
     - Development: `http://localhost:3000/api/auth/callback/google`
     - Production: `https://your-domain.com/api/auth/callback/google`
5. Copy the Client ID and Client Secret to your `.env.local` file

