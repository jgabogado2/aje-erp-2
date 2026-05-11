# Talaan Setup Prerequisites

This document outlines the required order of operations for setting up the Talaan application and its data dependencies.

## Overview

The Talaan application follows a strict hierarchical data model where certain entities must be created before others. This guide ensures you follow the correct sequence to avoid foreign key constraint violations.

---

## Database Schema Dependency Tree

```
organizations
  └── organization_members (requires: organizations, users)
        └── clients (requires: organizations)
              ├── batches (requires: organizations, clients, users)
              │     ├── batch_documents (requires: organizations, clients, batches)
              │     ├── receipts (requires: organizations, clients, batches)
              │     └── invoices (requires: organizations, clients, batches, receipts)
              │           └── invoice_lines (requires: invoices)
              ├── client_contacts (requires: organizations, clients)
              ├── client_tax_types (requires: organizations, clients)
              ├── client_chart_of_accounts (requires: organizations, clients)
              └── xero_connections (requires: organizations, clients)
                    └── xero_push_records (requires: organizations, clients, invoices)
```

---

## Setup Order

### Step 1: Create Organization

**Table:** `organizations`

**Prerequisites:** None

**Description:** Organizations are the top-level entity in the system. Each organization represents a company or business that uses the Talaan platform.

**Required Fields:**
- `name` (TEXT, required)
- `slug` (TEXT, required, unique)

**Optional Fields:**
- `subscription_tier` (TEXT, default: 'free')
- `employee_limit` (INTEGER, default: 5)
- `address` (TEXT)
- `contact_email` (TEXT)
- `contact_phone` (TEXT)

**Example:**
```sql
INSERT INTO organizations (name, slug, subscription_tier, employee_limit)
VALUES ('Acme Corporation', 'acme-corp', 'premium', 50);
```

**Notes:**
- The `slug` must be unique and URL-friendly
- Choose appropriate subscription tier and employee limit based on your needs

---

### Step 2: User Sign-Up (via OAuth)

**Table:** `users`

**Prerequisites:** None (but organization should exist for membership)

**Description:** Users are created automatically when they sign in via Google OAuth. The system syncs their profile information from Google.

**How Users Are Created:**
1. User clicks "Sign in with Google"
2. System authenticates with Google OAuth
3. User profile is automatically created/updated in `users` table
4. System checks if user is a member of any organization

**User Fields (Auto-populated):**
- `id` (UUID, auto-generated)
- `email` (TEXT, from Google)
- `name` (TEXT, from Google)
- `image` (TEXT, from Google profile picture)
- `emailVerified` (TIMESTAMP, set on successful sign-in)

**Important:** Users cannot sign in successfully unless they are members of an organization (see Step 3).

---

### Step 3: Add Organization Members

**Table:** `organization_members`

**Prerequisites:** 
- Organization must exist (Step 1)
- User must exist (Step 2, or can be created manually)

**Description:** This is the crucial step that links users to organizations and assigns their roles. Users MUST be organization members to access the application.

**Required Fields:**
- `organization_id` (UUID, FK to organizations)
- `user_id` (UUID, FK to users)
- `role` (TEXT, one of: 'admin', 'manager', 'accountant')

**Optional Fields:**
- `invited_by` (UUID, FK to organization_members, nullable)
- `notes` (TEXT, nullable)

**How to Add Members:**

#### Option A: Via Admin UI (Recommended - Invite by Email)
1. Sign in as an admin user (must already be an organization member)
2. Navigate to Admin → Members
3. Click "Add Member"
4. Enter the email address of the person you want to invite
5. Select their role (admin, manager, or accountant)
6. Click "Create Member"

**What happens when you invite someone:**
- The system creates a user record with their email (if they haven't signed in before)
- The system adds them as a member of your organization
- When they sign in with Google using that email, the system:
  - Updates their profile with Google information (name, picture)
  - Grants them immediate access based on their assigned role
  
**Important:** The invited user MUST sign in with the exact email address you invited. Google OAuth will authenticate them and match their email to the invitation.

#### Option B: Via SQL (For Initial Setup)
```sql
-- First, ensure user exists in users table
INSERT INTO users (id, email, name)
VALUES (gen_random_uuid(), 'admin@example.com', 'Admin User')
ON CONFLICT (email) DO NOTHING;

-- Then add them as organization member
INSERT INTO organization_members (organization_id, user_id, role, is_active)
SELECT 
  o.id as organization_id,
  u.id as user_id,
  'admin' as role,
  true as is_active
FROM organizations o
CROSS JOIN users u
WHERE o.slug = 'acme-corp'
  AND u.email = 'admin@example.com';
```

**Roles:**
- **admin**: Full access to all features, can manage members and organization settings
- **manager**: Can create and manage clients, batches, and invoices
- **accountant**: Read access to data, can view reports (limited write access)

**Important Notes:**
- At least one admin must exist per organization
- Users can be members of multiple organizations (though the current UI doesn't support this yet)
- Members must have `is_active = true` to access the system

---

### Step 4: Create Clients

**Table:** `clients`

**Prerequisites:**
- Organization must exist (Step 1)

**Description:** Clients represent the businesses or entities that your organization provides accounting services for.

**Required Fields:**
- `organization_id` (UUID, FK to organizations)
- `tin` (TEXT, Tax Identification Number, unique per organization)
- `name` (TEXT)

**Example:**
```sql
INSERT INTO clients (organization_id, tin, name, is_active)
SELECT id, '123-456-789', 'Client Company Inc', true
FROM organizations
WHERE slug = 'acme-corp';
```

**Notes:**
- The combination of `organization_id` and `tin` must be unique
- Set `is_active = false` to disable access without deleting the client

---

### Step 5: Create Batches (Optional)

**Table:** `batches`

**Prerequisites:**
- Organization exists (Step 1)
- Client exists (Step 4)
- User exists (Step 2) - for `created_by` field

**Description:** Batches group documents and receipts together for processing.

**Required Fields:**
- `organization_id` (UUID)
- `client_id` (UUID)
- `batch_number` (TEXT, unique per org/client combination)
- `batch_type` (TEXT, one of: 'TAX', 'XERO')
- `batch_category` (TEXT, one of: 'SLS', 'SLSP', 'BILL', 'PURCHASE')
- `created_by` (UUID, FK to users)

---

### Step 6: Additional Client Configuration (Optional)

After creating clients, you may optionally configure:

#### Client Contacts
**Table:** `client_contacts`

Manage contact information for suppliers/vendors.

#### Client Tax Types
**Table:** `client_tax_types`

Define tax types specific to the client.

#### Client Chart of Accounts
**Table:** `client_chart_of_accounts`

Set up accounting codes for the client.

#### Xero Connections
**Table:** `xero_connections`

Connect client to Xero accounting software.

---

## Understanding the Invite Flow

### How User Invitations Work

The system supports inviting users **before** they have signed in. Here's what happens behind the scenes:

#### Scenario 1: Inviting a New User (Never Signed In)

```
1. Admin enters: john@example.com
   ↓
2. System creates placeholder user:
   users {
     id: <generated-uuid>
     email: "john@example.com"
     name: null
     image: null
   }
   ↓
3. System creates organization membership:
   organization_members {
     user_id: <user-uuid>
     organization_id: <your-org-id>
     role: "manager"
     is_active: true
   }
   ↓
4. John signs in with Google
   ↓
5. System finds existing user by email and updates:
   users {
     id: <same-uuid>
     email: "john@example.com"
     name: "John Doe" (from Google)
     image: "https://..." (from Google)
   }
   ↓
6. John has full access!
```

#### Scenario 2: Inviting an Existing User (Already Signed In)

```
1. Admin enters: jane@example.com (already in system)
   ↓
2. System finds existing user record
   ↓
3. System checks if already a member → Not found
   ↓
4. System creates organization membership:
   organization_members {
     user_id: <existing-user-uuid>
     organization_id: <your-org-id>
     role: "accountant"
     is_active: true
   }
   ↓
5. Jane signs in again
   ↓
6. Jane now sees your organization's data!
```

#### Scenario 3: User Already a Member

```
1. Admin enters: existing-member@example.com
   ↓
2. System checks if user is already a member
   ↓
3. ❌ Error: "User is already a member of this organization"
```

### Important Notes About Invites

- **Email Must Match:** The invited user MUST sign in with Google using the exact email address you specify
- **No Email Notification:** The system does NOT send email notifications (you need to tell them separately)
- **Google OAuth Required:** Users can only sign in via Google OAuth, not username/password
- **Pending Status:** Invited users show as "Not signed in yet" until they complete their first login
- **Immediate Access:** Once they sign in, they immediately have access based on their assigned role

---

## Initial Setup Checklist

Use this checklist for setting up a new Talaan instance:

- [ ] **Step 1:** Create organization in `organizations` table
- [ ] **Step 2:** Create first admin user via Google OAuth sign-in (will fail initially, this is expected)
- [ ] **Step 3:** Manually add the user as an organization member with 'admin' role via SQL
- [ ] **Step 4:** Sign in again (should succeed now)
- [ ] **Step 5:** Use Admin UI to add additional members
- [ ] **Step 6:** Create clients via the application
- [ ] **Step 7:** Configure client settings as needed
- [ ] **Step 8:** Create batches and start processing documents

---

## Common Issues and Solutions

### Issue: "Access denied: User is not a member of any organization"

**Cause:** The user exists in the `users` table but has no entry in `organization_members`.

**Solution:** Add the user as an organization member:
```sql
INSERT INTO organization_members (organization_id, user_id, role, is_active)
VALUES (
  '<organization-id>',
  '<user-id>',
  'admin',
  true
);
```

### Issue: "Cannot create client - organization does not exist"

**Cause:** Attempting to create a client before creating an organization.

**Solution:** Create the organization first (Step 1), then create the client.

### Issue: "Foreign key violation on batches.created_by"

**Cause:** The `created_by` user_id doesn't exist in the users table.

**Solution:** Ensure the user has signed in at least once, or create the user manually.

### Issue: "User cannot see any data after signing in"

**Cause:** User is not a member of the organization, or their membership is inactive.

**Solution:** 
1. Check if user is in `organization_members`: 
   ```sql
   SELECT * FROM organization_members WHERE user_id = '<user-id>';
   ```
2. If missing, add them (Step 3)
3. If exists, ensure `is_active = true`:
   ```sql
   UPDATE organization_members 
   SET is_active = true 
   WHERE user_id = '<user-id>';
   ```

### Issue: "Invited user shows 'Not signed in yet' but they already signed in"

**Cause:** They signed in with a different email than the one you invited.

**Solution:** 
1. Check what email they used to sign in:
   ```sql
   SELECT email FROM users WHERE email ILIKE '%partial-email%';
   ```
2. Either:
   - Update the invitation to use their actual Google email, OR
   - Ask them to sign in with the invited email address

### Issue: "User can't sign in after being invited"

**Cause:** Possible issues:
- They're using a different email than invited
- They're not using Google OAuth
- Their membership is inactive

**Solution:**
1. Verify the invitation exists:
   ```sql
   SELECT om.*, u.email 
   FROM organization_members om
   JOIN users u ON u.id = om.user_id
   WHERE u.email = 'invited-email@example.com';
   ```
2. Ensure `is_active = true`
3. Confirm they're signing in with Google OAuth (not another provider)
4. Verify the email matches exactly (case-insensitive but must be exact match)

---

## Security Considerations

1. **First Admin Setup:** The very first admin user must be added via direct database access. Subsequent admins can be added via the UI by existing admins.

2. **Row Level Security (RLS):** All tables have RLS enabled. Users can only access data for organizations they are members of.

3. **Role Permissions:**
   - Only admins can create/delete organizations
   - Admins and managers can create/edit clients and batches
   - Accountants have read-only access

4. **Audit Trail:** The `invited_by` field in `organization_members` tracks who added each member.

---

## Database Migration

If you're migrating from an older version that used `whitelisted_users`:

1. Run the latest migration (`001_initial_schema_20241201.sql`)
2. Data in `whitelisted_users` is NOT automatically migrated
3. Manually migrate users:
   ```sql
   -- Create users from whitelisted_users
   INSERT INTO users (id, email, name)
   SELECT gen_random_uuid(), email, null
   FROM whitelisted_users
   ON CONFLICT (email) DO NOTHING;
   
   -- Create organization_members from whitelisted_users
   INSERT INTO organization_members (organization_id, user_id, role, is_active, notes)
   SELECT 
     wu.company_id,
     u.id,
     wu.role,
     wu.is_active,
     wu.notes
   FROM whitelisted_users wu
   JOIN users u ON u.email = wu.email
   WHERE wu.company_id IS NOT NULL;
   ```

---

## Support

For additional help, refer to:
- [DATABASE_MIGRATIONS.md](./DATABASE_MIGRATIONS.md) - Database schema details
- [AUTHENTICATION_BLUEPRINT.md](./AUTHENTICATION_BLUEPRINT.md) - Authentication system
- [TALAAN_ERD.md](./TALAAN_ERD.md) - Entity relationship diagram

