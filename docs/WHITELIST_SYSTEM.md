# Talaan Whitelist System

## Overview

Talaan uses an **email whitelist system** for access control. Users can only sign in if their email address has been pre-approved (whitelisted) by an organization admin.

## How It Works

### The Whitelist Flow

```
1. Super Admin → Creates Organization
   ↓
2. Super Admin → Whitelists First Admin (via database)
   ↓
3. Admin → Signs in with Google OAuth
   ↓
4. System → Checks if email is whitelisted
   ↓
5. System → Links user to whitelist entry
   ↓
6. Admin → Can now whitelist other users (via UI)
   ↓
7. Other Users → Sign in and get access
```

### Database Schema: `organization_members`

The `organization_members` table serves as the whitelist:

```sql
CREATE TABLE organization_members (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL,        -- Which organization
  user_id UUID,                         -- NULL until first sign-in
  email TEXT NOT NULL,                  -- Whitelisted email
  role TEXT NOT NULL,                   -- admin, manager, accountant
  invited_by UUID,                      -- Who added them
  is_active BOOLEAN NOT NULL,           -- Can they access?
  notes TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  UNIQUE(organization_id, email)        -- One whitelist entry per email per org
);
```

### Key Concepts

1. **Email is Primary**: The `email` column is the whitelist. If an email exists with `is_active = true`, that person can sign in.

2. **user_id is Nullable**: Set to NULL when whitelisting someone who hasn't signed in yet. Gets populated after their first successful sign-in.

3. **Pre-Approval Required**: Users cannot sign in unless their email is already whitelisted.

4. **Organization Scoped**: Each organization maintains its own whitelist.

---

## Super Admin Setup (First Time)

Super admins have direct database access and set up the initial organization and admin.

### Step 1: Create Organization

```sql
-- Create the organization
INSERT INTO organizations (id, name, slug, subscription_tier, employee_limit)
VALUES (
  gen_random_uuid(),
  'Acme Corporation',
  'acme-corp',
  'premium',
  50
)
RETURNING id;

-- Note the returned ID, you'll need it for Step 2
```

### Step 2: Whitelist First Admin

```sql
-- Whitelist the first admin user
INSERT INTO organization_members (
  organization_id,
  user_id,
  email,
  role,
  is_active,
  notes
)
VALUES (
  '<organization-id-from-step-1>',
  NULL,                           -- Will be set on first sign-in
  'admin@acmecorp.com',          -- Admin's email
  'admin',
  true,
  'Initial admin - created by super admin'
);
```

### Step 3: Admin Signs In

1. Admin goes to application
2. Clicks "Sign in with Google"
3. Uses `admin@acmecorp.com` Google account
4. System verifies email is whitelisted ✅
5. System creates user record
6. System links user_id to whitelist entry
7. Admin is granted access!

### Step 4: Admin Can Now Add Others

The admin can now use the UI to whitelist additional users:
- Navigate to **Admin → Members**
- Click **"Invite Member"**
- Enter email, select role
- Click **"Send Invite"**

---

## Admin User Management (via UI)

### Adding a User to Whitelist

**Location**: Admin → Members → Invite Member

**What happens:**
```
1. Admin enters: jane@company.com
2. System creates whitelist entry:
   organization_members {
     user_id: NULL
     email: "jane@company.com"
     role: "manager"
     is_active: true
   }
3. Jane appears in list as "Not signed in yet"
4. Jane signs in with Google
5. System links Jane's user_id to whitelist entry
6. Jane's name and picture appear in list
```

### Viewing Whitelisted Users

The members list shows:
- **Not signed in yet**: Whitelisted but never signed in (user_id is NULL)
- **Name + Picture**: Successfully signed in (user_id is populated)

Both types have full access once they sign in!

### Deactivating a User

Use the toggle in the actions menu to set `is_active = false`. This:
- Immediately blocks their access
- Keeps their data intact
- Can be re-activated later

### Removing a User

Use "Remove Member" to delete the whitelist entry. This:
- Permanently removes their access
- Does NOT delete their user record or data they created
- Cannot be undone (they must be re-whitelisted)

---

## Sign-In Flow (Technical)

### For First-Time Users

```typescript
// 1. User clicks "Sign in with Google"
// 2. Google OAuth completes

// 3. System checks whitelist
const whitelistEntry = await checkEmailWhitelist(user.email);
if (!whitelistEntry) {
  return false; // ❌ Access denied
}

// 4. System creates user record
const userId = await createOrUpdateUser({
  email: user.email,
  name: user.name,
  image: user.image
});

// 5. System links user to whitelist
await linkUserToWhitelist(userId, user.email);
// Updates: organization_members.user_id = userId WHERE email = user.email

// 6. Grant access ✅
return true;
```

### For Returning Users

```typescript
// 1. User clicks "Sign in with Google"
// 2. Google OAuth completes

// 3. System checks whitelist (by email)
const whitelistEntry = await checkEmailWhitelist(user.email);
if (!whitelistEntry) {
  return false; // ❌ Access denied
}

// 4. System updates user record (name, picture, etc.)
await updateUser(user);

// 5. Grant access ✅ (user_id already linked)
return true;
```

---

## Common Scenarios

### Scenario 1: Whitelisting Before Sign-In

**Best Practice** - Add users to whitelist before they try to sign in.

```
Admin whitelists → User signs in → Immediate access
```

### Scenario 2: User Tries to Sign In First

```
User signs in → Email not whitelisted → Access denied
Admin whitelists email → User signs in again → Access granted
```

### Scenario 3: Changing Roles

```
Admin edits member → Changes role from "accountant" to "manager"
→ User signs in again → New permissions take effect
```

### Scenario 4: Re-activating Deactivated User

```
Admin deactivates member → User access blocked
Admin reactivates member → User can sign in again
```

### Scenario 5: User Signed In Under Different Email

**Problem**: User whitelisted as `jane@company.com` but signed in with `jane.personal@gmail.com`

**Solution**: Admin must whitelist the actual email they use for Google sign-in.

---

## Security Considerations

### 1. Email Must Match Exactly

The email in the whitelist MUST match the email from Google OAuth:
- Case-insensitive matching is supported
- But the email domain and username must be exact

### 2. Google OAuth Only

Users can only sign in via Google OAuth. The system:
- Does not support username/password
- Does not support other OAuth providers (yet)
- Requires valid Google account

### 3. Organization Scoping

Users only see data for organizations they're members of:
- Row Level Security (RLS) enforces this
- Admin role is scoped to their organization
- Cannot access other organizations' data

### 4. Role-Based Access

Three roles with different permissions:
- **admin**: Full access, can manage members
- **manager**: Can create/edit clients and batches
- **accountant**: Read-only access

### 5. Audit Trail

The whitelist tracks:
- `invited_by`: Who added this user
- `created_at`: When they were whitelisted
- `updated_at`: Last modification

---

## Troubleshooting

### User Can't Sign In

**Check 1: Is email whitelisted?**
```sql
SELECT * FROM organization_members 
WHERE email ILIKE 'user@example.com';
```

**Check 2: Is membership active?**
```sql
SELECT is_active FROM organization_members 
WHERE email ILIKE 'user@example.com';
```

**Check 3: Using correct Google account?**
- User must sign in with exact whitelisted email
- Check which email they're using in Google OAuth

### User Shows "Not Signed In Yet" Forever

**Cause**: They're signing in with a different email than whitelisted.

**Solution**: 
```sql
-- Check what email they actually used
SELECT email FROM users WHERE name ILIKE '%their name%';

-- Update whitelist to match, or whitelist their actual email
```

### Can't Add User - Already Exists

**Cause**: Email already whitelisted in this organization.

**Check**:
```sql
SELECT * FROM organization_members 
WHERE organization_id = '<org-id>' 
  AND email ILIKE 'user@example.com';
```

### User Has Access But Shouldn't

**Check if they're whitelisted**:
```sql
SELECT om.*, o.name as org_name
FROM organization_members om
JOIN organizations o ON o.id = om.organization_id
WHERE om.email ILIKE 'user@example.com'
  AND om.is_active = true;
```

**Deactivate them**:
```sql
UPDATE organization_members 
SET is_active = false 
WHERE email ILIKE 'user@example.com'
  AND organization_id = '<org-id>';
```

---

## Migration from Old System

If you have data in the old `whitelisted_users` table:

```sql
-- Add email column and migrate data
ALTER TABLE organization_members ADD COLUMN email TEXT;
ALTER TABLE organization_members ALTER COLUMN user_id DROP NOT NULL;

-- Copy emails from users table
UPDATE organization_members om
SET email = u.email
FROM users u
WHERE om.user_id = u.id;

-- Add constraint
ALTER TABLE organization_members ALTER COLUMN email SET NOT NULL;
ALTER TABLE organization_members 
  ADD CONSTRAINT organization_members_organization_id_email_key 
  UNIQUE (organization_id, email);
```

---

## API Functions

### Helper Functions

```sql
-- Check if email is whitelisted
SELECT is_email_whitelisted('user@example.com');

-- Get membership by email
SELECT * FROM get_membership_by_email('user@example.com');

-- Link user to whitelist after sign-in
SELECT link_user_to_whitelist('<user-id>', 'user@example.com');
```

---

## Summary

✅ **Whitelist-first approach**: Add email before user signs in  
✅ **Email-based access control**: Only whitelisted emails can access  
✅ **Automatic linking**: System links user_id after first sign-in  
✅ **Organization scoped**: Each org maintains its own whitelist  
✅ **Role-based permissions**: admin, manager, accountant roles  
✅ **Super admin setup**: Direct database access for initial setup  
✅ **Admin UI management**: Admins manage whitelist via UI  


