# Migration Guide: Email Whitelist System

This guide explains the changes made to restore the email whitelist system and how to apply them.

---

## What Changed

### Problem
The original migration changed `organization_members` to use `user_id` as the primary identifier, removing the `email` column. This broke the whitelist-first workflow where admins add emails before users sign in.

### Solution
We've restored the `email` column to `organization_members` while keeping the `user_id` for linking after sign-in.

---

## Database Changes

### Schema Modifications

**`organization_members` table now has:**

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | UUID | No | Primary key |
| `organization_id` | UUID | No | Which organization |
| `user_id` | UUID | **Yes** | NULL until first sign-in |
| **`email`** | **TEXT** | **No** | **Whitelisted email** |
| `role` | TEXT | No | admin/manager/accountant |
| `invited_by` | UUID | Yes | Who added them |
| `is_active` | BOOLEAN | No | Active status |
| `notes` | TEXT | Yes | Optional notes |

**Key Changes:**
1. ✅ Added `email` column (NOT NULL)
2. ✅ Made `user_id` nullable
3. ✅ Changed unique constraint from `(organization_id, user_id)` to `(organization_id, email)`
4. ✅ Added index on `email` column

---

## How to Apply

### Step 1: Run the Migration

```bash
# Option A: Using psql
psql $DATABASE_URL -f supabase/migrations/002_fix_organization_members_whitelist.sql

# Option B: Using Supabase CLI
supabase db push

# Option C: Via Supabase Dashboard
# Copy the contents of 002_fix_organization_members_whitelist.sql
# and run it in the SQL Editor
```

### Step 2: Verify Migration

```sql
-- Check that email column exists
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'organization_members'
  AND column_name = 'email';
-- Should return: email | text | NO

-- Check that user_id is nullable
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'organization_members'
  AND column_name = 'user_id';
-- Should return: user_id | uuid | YES

-- Check unique constraint
SELECT constraint_name
FROM information_schema.table_constraints
WHERE table_name = 'organization_members'
  AND constraint_type = 'UNIQUE';
-- Should include: organization_members_organization_id_email_key
```

### Step 3: Test the System

```sql
-- Test 1: Create a whitelist entry (before user signs in)
INSERT INTO organization_members (
  organization_id,
  user_id,
  email,
  role,
  is_active
)
VALUES (
  '<your-org-id>',
  NULL,  -- No user_id yet
  'test@example.com',
  'accountant',
  true
);

-- Test 2: Verify it was created
SELECT id, email, user_id, role 
FROM organization_members 
WHERE email = 'test@example.com';
-- Should show: user_id = NULL

-- Test 3: Clean up
DELETE FROM organization_members WHERE email = 'test@example.com';
```

---

## Code Changes Summary

### Authentication Flow (`lib/auth.config.ts`)

**Before:**
```typescript
// Check by user_id
const membership = await checkUserOrganizationMembership(userId);
```

**After:**
```typescript
// Check by email first (whitelist)
const whitelistEntry = await checkEmailWhitelist(user.email);

// Then link user_id after sign-in
await linkUserToWhitelist(userId, user.email);
```

### Helper Functions (`lib/auth-utils.ts`)

**New Functions:**
- `checkEmailWhitelist(email)` - Check if email is whitelisted
- `linkUserToWhitelist(userId, email)` - Link user_id after first sign-in

**Updated Interface:**
```typescript
interface OrganizationMember {
  user_id: string | null;  // Now nullable
  email: string;            // Now required
  // ... other fields
}
```

### Admin Actions (`app/admin/users/actions.ts`)

**Key Changes:**
- When creating members: Only `email` is required, `user_id` is NULL
- When querying members: Uses LEFT JOIN with users (since user_id can be NULL)
- Search/filter: Now uses `email` from `organization_members` table
- Display: Shows whitelisted `email` even if user hasn't signed in yet

### UI (`app/admin/users/page.tsx`)

**Display Logic:**
- Email: Always shows whitelisted email from `organization_members.email`
- Name: Shows `user.name` if signed in, else "Not signed in yet"
- Avatar: Shows `user.image` if available, else initials from email

---

## New Workflows

### Workflow 1: Whitelist Before Sign-In (Recommended)

```
1. Admin adds email to whitelist
   ↓
2. User tries to sign in
   ↓
3. System checks whitelist ✅
   ↓
4. System creates/updates user record
   ↓
5. System links user_id to whitelist entry
   ↓
6. User gets access
```

**SQL State Changes:**
```sql
-- After Step 1:
organization_members: { user_id: NULL, email: 'user@example.com', ... }

-- After Step 5:
organization_members: { user_id: '<uuid>', email: 'user@example.com', ... }
users: { id: '<uuid>', email: 'user@example.com', ... }
```

### Workflow 2: User Signs In First (Not Recommended)

```
1. User tries to sign in
   ↓
2. System checks whitelist ❌ Not found
   ↓
3. Access denied
   ↓
4. Admin adds email to whitelist
   ↓
5. User tries again
   ↓
6. System checks whitelist ✅
   ↓
7. User gets access
```

---

## Breaking Changes

### For Existing Installations

If you have existing data in `organization_members` without the `email` column:

**The migration automatically:**
1. Adds the `email` column (nullable first)
2. Populates it from the `users` table via `user_id`
3. Makes it NOT NULL
4. Updates constraints and indexes

**You don't need to do anything manually** unless you have orphaned records.

### For Custom Code

If you have custom code that queries `organization_members`:

**Update these patterns:**

```typescript
// ❌ OLD: Query by user_id only
const members = await supabase
  .from('organization_members')
  .select('*')
  .eq('user_id', userId);

// ✅ NEW: Query by email (for whitelist check)
const members = await supabase
  .from('organization_members')
  .select('*')
  .ilike('email', email);

// ✅ OR: Query by user_id (for logged-in users)
const members = await supabase
  .from('organization_members')
  .select('*')
  .eq('user_id', userId);
```

---

## Rollback Plan

If you need to rollback (not recommended):

```sql
-- 1. Add back the old constraint
ALTER TABLE organization_members 
  DROP CONSTRAINT organization_members_organization_id_email_key;

ALTER TABLE organization_members
  ADD CONSTRAINT organization_members_organization_id_user_id_key 
  UNIQUE (organization_id, user_id);

-- 2. Make user_id NOT NULL again (will fail if any NULL values exist)
ALTER TABLE organization_members 
  ALTER COLUMN user_id SET NOT NULL;

-- 3. Drop email column (will lose whitelist data!)
ALTER TABLE organization_members 
  DROP COLUMN email;
```

**⚠️ Warning**: Rollback will delete all whitelist entries where users haven't signed in yet (user_id is NULL).

---

## Testing Checklist

After applying the migration, test these scenarios:

- [ ] **Whitelist new email** (via Admin UI)
  - User should appear as "Not signed in yet"
  - Email should be visible
  
- [ ] **Sign in with whitelisted email**
  - Should be granted access
  - Name and picture should appear
  - user_id should be populated
  
- [ ] **Sign in with non-whitelisted email**
  - Should be denied access
  - Should see "Access denied" message
  
- [ ] **Edit existing member**
  - Should be able to change role
  - Email should remain unchanged (read-only)
  
- [ ] **Deactivate member**
  - Active member should lose access immediately
  - Should be able to reactivate
  
- [ ] **Remove member**
  - Should delete whitelist entry
  - User record should remain (for data integrity)

---

## Frequently Asked Questions

### Q: What happens to existing users?

**A:** The migration automatically populates the `email` column from the `users` table. Existing users are not affected.

### Q: Can I whitelist someone who already has a user account?

**A:** Yes! Just add their email to the whitelist. The system will link them on next sign-in.

### Q: Can users belong to multiple organizations?

**A:** Yes, the schema supports it. Add separate whitelist entries in each organization.

### Q: What if someone changes their email?

**A:** They need to be whitelisted with the new email. The old entry can be deactivated or removed.

### Q: Can I bulk import whitelists?

**A:** Yes, use SQL:
```sql
INSERT INTO organization_members (organization_id, user_id, email, role, is_active)
VALUES
  ('<org-id>', NULL, 'user1@company.com', 'manager', true),
  ('<org-id>', NULL, 'user2@company.com', 'accountant', true),
  ('<org-id>', NULL, 'user3@company.com', 'manager', true);
```

---

## Support

- **Whitelist System Documentation**: `docs/WHITELIST_SYSTEM.md`
- **Super Admin Setup**: `SUPER_ADMIN_SETUP.md`
- **Setup Prerequisites**: `docs/SETUP_PREREQUISITES.md`

For issues, check the troubleshooting sections in these documents.

---

## Summary

✅ **Email whitelist restored** - Add users before they sign in  
✅ **Backward compatible** - Existing data automatically migrated  
✅ **user_id linking** - Automatically links after first sign-in  
✅ **Zero downtime** - Migration can be applied to live database  
✅ **Comprehensive docs** - Full documentation for all workflows  

The system now works exactly as intended: **whitelist-first, email-based access control**! 🎉

