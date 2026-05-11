# Super Admin Setup Guide

> **Audience**: Database administrators and system operators with direct database access

This guide is for super admins who need to set up a new organization and create the first admin user.

---

## Prerequisites

- Direct access to the Supabase/PostgreSQL database
- SQL client or Supabase Dashboard access
- Email address of the person who will be the organization admin

---

## Setup Steps

### Step 1: Run the Latest Migration

Ensure you've run the latest migration that adds email support to `organization_members`:

```bash
# Apply the migration
psql -f supabase/migrations/002_fix_organization_members_whitelist.sql

# Or via Supabase CLI
supabase db push
```

### Step 2: Create Organization

```sql
-- Create a new organization
INSERT INTO organizations (
  name,
  slug,
  subscription_tier,
  employee_limit,
  is_active,
  address,
  contact_email,
  contact_phone
)
VALUES (
  'Acme Corporation',              -- Company name
  'acme-corp',                     -- URL-friendly slug (unique)
  'premium',                       -- 'free', 'basic', 'premium', 'enterprise'
  50,                              -- Maximum number of employees
  true,                            -- Active status
  '123 Business St, City, Country', -- Optional address
  'contact@acmecorp.com',          -- Optional contact email
  '+1-555-0123'                    -- Optional contact phone
)
RETURNING id, slug;
```

**Important**: Save the returned `id` and `slug` - you'll need them!

### Step 3: Whitelist First Admin

Now whitelist the email of the person who will be the organization admin:

```sql
-- Replace <ORGANIZATION_ID> with the ID from Step 2
-- Replace admin@acmecorp.com with the actual admin's email

INSERT INTO organization_members (
  organization_id,
  user_id,
  email,
  role,
  invited_by,
  is_active,
  notes
)
VALUES (
  '<ORGANIZATION_ID>',             -- From Step 2
  NULL,                            -- Will be set on first sign-in
  'admin@acmecorp.com',           -- Admin's Google email
  'admin',                         -- Role: admin, manager, or accountant
  NULL,                            -- No inviter (super admin setup)
  true,                            -- Active
  'Initial admin - created by super admin on ' || NOW()::date
)
RETURNING id, email;
```

### Step 4: Verify Setup

```sql
-- Verify organization was created
SELECT 
  id,
  name,
  slug,
  subscription_tier,
  employee_limit,
  is_active,
  created_at
FROM organizations 
WHERE slug = 'acme-corp';

-- Verify admin was whitelisted
SELECT 
  id,
  email,
  role,
  is_active,
  user_id,
  created_at
FROM organization_members 
WHERE organization_id = '<ORGANIZATION_ID>';
```

You should see:
- Organization with status `is_active = true`
- One member with `user_id = NULL` (will be populated after first sign-in)
- Member with `role = 'admin'` and `is_active = true`

### Step 5: Notify the Admin

Send the admin these instructions:

```
Subject: Your Talaan Admin Account is Ready

Hello,

Your organization "Acme Corporation" has been set up in Talaan.

To access your admin account:

1. Go to: https://your-talaan-domain.com
2. Click "Sign in with Google"
3. Use this email: admin@acmecorp.com
4. You will be granted admin access immediately

Once signed in, you can:
- View your organization dashboard
- Add team members (Admin → Members → Invite Member)
- Create clients
- Manage batches and documents

Important: You must use the email address "admin@acmecorp.com" when 
signing in with Google. If you use a different email, access will be denied.

Need help? Contact: support@talaan.com
```

---

## What Happens Next

### When Admin Signs In

1. Admin clicks "Sign in with Google"
2. Google OAuth authenticates with `admin@acmecorp.com`
3. Talaan checks if email is whitelisted ✅
4. System creates user record in `users` table
5. System links `user_id` to whitelist entry in `organization_members`
6. Admin is granted access with full admin permissions

### After Admin Signs In

The admin can now:
- Access the full Talaan application
- See their organization's dashboard
- Add team members via UI (Admin → Members)
- Manage clients, batches, and documents
- Configure organization settings

---

## Adding Multiple Organizations

To add another organization, repeat Steps 2-5 with different values:

```sql
-- Example: Second organization
INSERT INTO organizations (name, slug, subscription_tier, employee_limit)
VALUES ('Beta Corp', 'beta-corp', 'basic', 20)
RETURNING id;

INSERT INTO organization_members (organization_id, user_id, email, role, is_active)
VALUES ('<NEW_ORG_ID>', NULL, 'admin@betacorp.com', 'admin', true);
```

---

## Troubleshooting

### Admin Can't Sign In After Setup

**Check 1: Is email whitelisted?**
```sql
SELECT * FROM organization_members WHERE email = 'admin@acmecorp.com';
```
- Should return 1 row
- `is_active` should be `true`

**Check 2: Is organization active?**
```sql
SELECT is_active FROM organizations WHERE slug = 'acme-corp';
```
- Should return `true`

**Check 3: Is admin using correct email?**
- They must sign in with Google using the exact whitelisted email
- Ask them: "What email do you see in Google after signing in?"

### Admin Signs In But Has No Permissions

**Check their role**:
```sql
SELECT role FROM organization_members WHERE email = 'admin@acmecorp.com';
```
- Should be `'admin'` not `'manager'` or `'accountant'`

**Fix it**:
```sql
UPDATE organization_members 
SET role = 'admin' 
WHERE email = 'admin@acmecorp.com';
```

### Need to Change Admin Email

If you set up the wrong email:

```sql
UPDATE organization_members 
SET email = 'correct-admin@acmecorp.com'
WHERE email = 'wrong-admin@acmecorp.com'
  AND organization_id = '<ORG_ID>';
```

### Need to Add Another Admin

Organizations can have multiple admins:

```sql
INSERT INTO organization_members (organization_id, user_id, email, role, is_active)
VALUES ('<ORG_ID>', NULL, 'second-admin@acmecorp.com', 'admin', true);
```

---

## Best Practices

### 1. Use Company Email Addresses

Prefer company domain emails over personal emails:
- ✅ `admin@acmecorp.com`
- ❌ `john.personal@gmail.com`

This makes it easier to manage access and looks more professional.

### 2. Document Who You Whitelist

Use the `notes` field to track setup:
```sql
notes: 'Initial admin - created by super admin on 2026-01-30 - Ticket #12345'
```

### 3. Set Appropriate Employee Limits

Choose based on subscription tier:
- Free: 5-10 employees
- Basic: 20-50 employees
- Premium: 50-100 employees
- Enterprise: 100+ employees

### 4. Use Descriptive Slugs

Slugs appear in URLs, make them professional:
- ✅ `acme-corp`, `beta-services`, `gamma-consulting`
- ❌ `test123`, `myorg`, `company1`

### 5. Verify Before Notifying

Always run Step 4 verification queries before telling the admin they're ready.

---

## Quick Reference

### Create Organization + Admin (Complete Script)

```sql
-- Variables (edit these)
\set org_name 'Acme Corporation'
\set org_slug 'acme-corp'
\set admin_email 'admin@acmecorp.com'
\set tier 'premium'
\set emp_limit 50

-- Create organization
WITH new_org AS (
  INSERT INTO organizations (name, slug, subscription_tier, employee_limit, is_active)
  VALUES (:'org_name', :'org_slug', :'tier', :emp_limit, true)
  RETURNING id, name, slug
)
-- Create admin
INSERT INTO organization_members (organization_id, user_id, email, role, is_active, notes)
SELECT 
  id, 
  NULL, 
  :'admin_email', 
  'admin', 
  true,
  'Initial admin - created by super admin on ' || NOW()::date
FROM new_org
RETURNING *;

-- Verify
SELECT 
  o.name as org_name,
  o.slug as org_slug,
  om.email as admin_email,
  om.role,
  om.is_active
FROM organizations o
JOIN organization_members om ON om.organization_id = o.id
WHERE o.slug = :'org_slug';
```

---

## Security Notes

1. **Super Admin Access**: Only trusted personnel should have database access
2. **Whitelist First**: Always whitelist admin before they try to sign in
3. **Audit Logs**: All queries should be logged for security audit
4. **Email Verification**: Double-check email addresses before creating
5. **Unique Slugs**: Organization slugs must be unique across the system

---

## Support

For issues or questions:
- Check troubleshooting section above
- Review main documentation: `docs/WHITELIST_SYSTEM.md`
- Contact development team

---

**Remember**: Once the first admin is set up, all other user management happens through the application UI. Super admin database access is only needed for:
- Creating new organizations
- Creating first admin for each organization
- Emergency access recovery

