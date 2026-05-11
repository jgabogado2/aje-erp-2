# Talaan -- Detailed Entity Relationship Documentation (ERD)

This document describes the **logical data model** for Talaan, based on
the agreed architecture and recommendations.\
It explains each entity, its purpose, key fields, and relationships,
with emphasis on **multi-tenancy**, **receipt vs invoice separation**,
**SLSP compliance**, and **Xero integration**.

------------------------------------------------------------------------

## Core Architectural Principles

1.  **Multi-Tenant by Design**
    -   All business data is scoped by `organization_id`
    -   Users can only access data belonging to their organization
2.  **Domain Separation**
    -   **Receipts** represent the *source document / tax truth*
    -   **Invoices** represent the *accounting truth*
    -   SLSP operates on receipts
    -   Xero operates on invoices and invoice lines
3.  **Immutability**
    -   Receipts should not be overwritten after validation
    -   Invoices may change until pushed to Xero

------------------------------------------------------------------------

## Core Entities

## Organizations

Represents a tenant company using the system.

**Key Fields** 
- `id` (UUID, Primary Key)
- `name` (TEXT, NOT NULL)
- `slug` (TEXT, UNIQUE, NOT NULL)
- `subscription_tier` (TEXT, DEFAULT 'free', CHECK: 'free'|'basic'|'premium'|'enterprise')
- `employee_limit` (INTEGER, DEFAULT 5)
- `is_active` (BOOLEAN, NOT NULL, DEFAULT true)
- `address` (TEXT)
- `contact_email` (TEXT)
- `contact_phone` (TEXT)
- `created_at` (TIMESTAMP WITH TIME ZONE, DEFAULT NOW())
- `updated_at` (TIMESTAMP WITH TIME ZONE, DEFAULT NOW())

**Relationships** 
- One organization has many users (via organization_members)
- One organization has many clients

------------------------------------------------------------------------

## Users

Represents an authenticated system user (NextAuth compatible).

**Key Fields** 
- `id` (UUID, Primary Key, NOT NULL)
- `name` (TEXT)
- `email` (TEXT, UNIQUE, NOT NULL)
- `emailVerified` (TIMESTAMP WITH TIME ZONE)
- `image` (TEXT)
- `created_at` (TIMESTAMP WITH TIME ZONE, DEFAULT NOW())
- `updated_at` (TIMESTAMP WITH TIME ZONE, DEFAULT NOW())

Users do not directly own business data; access is granted via
organization membership.

------------------------------------------------------------------------

## Organization Members

Join table between users and organizations (renamed from whitelisted_users).

**Key Fields** 
- `id` (UUID, Primary Key)
- `organization_id` (UUID, NOT NULL, FK → organizations.id)
- `user_id` (UUID, NOT NULL, FK → users.id)
- `role` (TEXT, NOT NULL, CHECK: 'admin'|'manager'|'accountant')
- `invited_by` (UUID, FK → organization_members.id, nullable)
- `is_active` (BOOLEAN, NOT NULL, DEFAULT true)
- `notes` (TEXT)
- `created_at` (TIMESTAMP WITH TIME ZONE, DEFAULT NOW())
- `updated_at` (TIMESTAMP WITH TIME ZONE, DEFAULT NOW())

**Constraints** 
- Unique `(organization_id, user_id)`

------------------------------------------------------------------------

## Clients

Represents an end client of an organization (the taxpayer / accounting
entity).

**Key Fields** 
- `id` (UUID, Primary Key)
- `organization_id` (UUID, NOT NULL, FK → organizations.id)
- `tin` (TEXT, NOT NULL)
- `name` (TEXT, NOT NULL)
- `is_active` (BOOLEAN, NOT NULL, DEFAULT true)
- `created_at` (TIMESTAMP WITH TIME ZONE, DEFAULT NOW())
- `updated_at` (TIMESTAMP WITH TIME ZONE, DEFAULT NOW())

**Constraints**
- Unique `(organization_id, tin)`

**Relationships** 
- One client belongs to one organization
- One client has many batches
- One client has configuration data (tax types, chart of accounts, contacts)
- One client has at most one Xero connection

------------------------------------------------------------------------

## Batches

Logical grouping for processing receipts or invoices.

**Key Fields** 
- `id` (UUID, Primary Key)
- `organization_id` (UUID, NOT NULL, FK → organizations.id)
- `client_id` (UUID, NOT NULL, FK → clients.id)
- `batch_number` (TEXT, NOT NULL)
- `batch_name` (TEXT)
- `batch_type` (TEXT, NOT NULL, CHECK: 'TAX'|'XERO')
- `batch_category` (TEXT, NOT NULL, CHECK: 'SLS'|'SLSP'|'BILL'|'PURCHASE')
- `status` (TEXT, NOT NULL, DEFAULT 'draft', CHECK: 'draft'|'processing'|'completed'|'archived')
- `created_by` (UUID, NOT NULL, FK → users.id)
- `created_at` (TIMESTAMP WITH TIME ZONE, DEFAULT NOW())
- `updated_at` (TIMESTAMP WITH TIME ZONE, DEFAULT NOW())

**Constraints**
- Unique `(organization_id, client_id, batch_number)`

**Relationships** 
- One batch belongs to one client
- One batch contains many batch documents

------------------------------------------------------------------------

## Batch Documents

Represents uploaded files (receipts or invoices).

**Key Fields** 
- `id` (UUID, Primary Key)
- `organization_id` (UUID, NOT NULL, FK → organizations.id)
- `client_id` (UUID, NOT NULL, FK → clients.id)
- `batch_id` (UUID, NOT NULL, FK → batches.id)
- `file_name` (TEXT, NOT NULL)
- `file_type` (TEXT)
- `storage_key` (TEXT, NOT NULL)
- `status` (TEXT, NOT NULL, DEFAULT 'uploaded', CHECK: 'uploaded'|'processing'|'completed'|'failed')
- `created_at` (TIMESTAMP WITH TIME ZONE, DEFAULT NOW())
- `updated_at` (TIMESTAMP WITH TIME ZONE, DEFAULT NOW())

**Relationships** 
- One batch document generates one receipt

------------------------------------------------------------------------

## Receipts (Tax Source of Truth)

Represents extracted and validated receipt data, used for SLSP
reporting.

**Key Fields** 
- `id` (UUID, Primary Key)
- `organization_id` (UUID, NOT NULL, FK → organizations.id)
- `client_id` (UUID, NOT NULL, FK → clients.id)
- `batch_id` (UUID, NOT NULL, FK → batches.id)
- `batch_document_id` (UUID, FK → batch_documents.id, nullable)
- `supplier_name` (TEXT, NOT NULL)
- `supplier_tin` (TEXT)
- `supplier_address` (TEXT)
- `supplier_type` (TEXT)
- `receipt_number` (TEXT)
- `receipt_date` (DATE, NOT NULL)
- `total_amount` (DECIMAL(15, 2), NOT NULL, CHECK: >= 0)
- `invoice_category` (TEXT)
- `vatable_sales` (DECIMAL(15, 2), DEFAULT 0, CHECK: >= 0)
- `vat_exempt_sales` (DECIMAL(15, 2), DEFAULT 0, CHECK: >= 0)
- `input_vat` (DECIMAL(15, 2), DEFAULT 0, CHECK: >= 0)
- `zero_rated_sales` (DECIMAL(15, 2), DEFAULT 0, CHECK: >= 0)
- `raw_ocr_json` (JSONB)
- `confidence_score` (DECIMAL(5, 2))
- `created_at` (TIMESTAMP WITH TIME ZONE, DEFAULT NOW())
- `updated_at` (TIMESTAMP WITH TIME ZONE, DEFAULT NOW())

**Validation Rule**

    vatable_sales
    + vat_exempt_sales
    + zero_rated_sales
    + input_vat
    = total_amount

**Relationships** 
- One receipt may generate zero or many invoices
- SLSP reports operate exclusively on receipts

------------------------------------------------------------------------

## Invoices (Accounting Record)

Represents a normalized accounting record, primarily for Xero.

**Key Fields** 
- `id` (UUID, Primary Key)
- `organization_id` (UUID, NOT NULL, FK → organizations.id)
- `client_id` (UUID, NOT NULL, FK → clients.id)
- `batch_id` (UUID, FK → batches.id, nullable)
- `receipt_id` (UUID, FK → receipts.id, nullable)
- `contact_id` (UUID, FK → client_contacts.id, nullable)
- `invoice_date` (DATE, NOT NULL)
- `total_amount` (DECIMAL(15, 2), NOT NULL, CHECK: >= 0)
- `currency` (TEXT, NOT NULL, DEFAULT 'PHP')
- `status` (TEXT, NOT NULL, DEFAULT 'draft', CHECK: 'draft'|'finalized'|'pushed'|'cancelled')
- `created_at` (TIMESTAMP WITH TIME ZONE, DEFAULT NOW())
- `updated_at` (TIMESTAMP WITH TIME ZONE, DEFAULT NOW())

**Relationships** 
- One invoice may reference one receipt
- One invoice has many invoice lines
- One invoice may be pushed to Xero

------------------------------------------------------------------------

## Invoice Lines

Represents individual line items for accounting.

**Key Fields** 
- `id` (UUID, Primary Key)
- `invoice_id` (UUID, NOT NULL, FK → invoices.id)
- `description` (TEXT, NOT NULL)
- `quantity` (DECIMAL(10, 2), DEFAULT 1, CHECK: > 0)
- `unit_price` (DECIMAL(15, 2), NOT NULL, CHECK: >= 0)
- `line_amount` (DECIMAL(15, 2), NOT NULL, CHECK: >= 0)
- `account_code` (TEXT)
- `tax_type_id` (UUID, FK → client_tax_types.id, nullable)
- `created_at` (TIMESTAMP WITH TIME ZONE, DEFAULT NOW())
- `updated_at` (TIMESTAMP WITH TIME ZONE, DEFAULT NOW())

Supports: 
- Multi-line invoices
- Optional line-item combination (aggregation)

------------------------------------------------------------------------

## Client Chart of Accounts

Client-specific accounting configuration.

**Key Fields** 
- `id` (UUID, Primary Key)
- `organization_id` (UUID, NOT NULL, FK → organizations.id)
- `client_id` (UUID, NOT NULL, FK → clients.id)
- `account_code` (TEXT, NOT NULL)
- `account_name` (TEXT, NOT NULL)
- `description` (TEXT)
- `is_active` (BOOLEAN, NOT NULL, DEFAULT true)
- `created_at` (TIMESTAMP WITH TIME ZONE, DEFAULT NOW())
- `updated_at` (TIMESTAMP WITH TIME ZONE, DEFAULT NOW())

**Constraints**
- Unique `(organization_id, client_id, account_code)`

------------------------------------------------------------------------

## Client Tax Types

Client-specific tax classifications.

**Key Fields** 
- `id` (UUID, Primary Key)
- `organization_id` (UUID, NOT NULL, FK → organizations.id)
- `client_id` (UUID, NOT NULL, FK → clients.id)
- `name` (TEXT, NOT NULL)
- `description` (TEXT)
- `is_active` (BOOLEAN, NOT NULL, DEFAULT true)
- `created_at` (TIMESTAMP WITH TIME ZONE, DEFAULT NOW())
- `updated_at` (TIMESTAMP WITH TIME ZONE, DEFAULT NOW())

------------------------------------------------------------------------

## Client Contacts

Represents suppliers or merchants.

**Key Fields** 
- `id` (UUID, Primary Key)
- `organization_id` (UUID, NOT NULL, FK → organizations.id)
- `client_id` (UUID, NOT NULL, FK → clients.id)
- `name` (TEXT, NOT NULL)
- `email` (TEXT)
- `tax_number` (TEXT)
- `address` (TEXT)
- `source` (TEXT, NOT NULL, DEFAULT 'MANUAL', CHECK: 'MANUAL'|'XERO')
- `external_id` (TEXT)
- `created_at` (TIMESTAMP WITH TIME ZONE, DEFAULT NOW())
- `updated_at` (TIMESTAMP WITH TIME ZONE, DEFAULT NOW())

------------------------------------------------------------------------

## Xero Connections

Represents a single Xero organization connection per client.

**Key Fields** 
- `id` (UUID, Primary Key)
- `organization_id` (UUID, NOT NULL, FK → organizations.id)
- `client_id` (UUID, NOT NULL, FK → clients.id)
- `xero_tenant_id` (TEXT, NOT NULL)
- `xero_tenant_name` (TEXT)
- `access_token` (TEXT, NOT NULL) -- Should be encrypted in production
- `refresh_token` (TEXT, NOT NULL) -- Should be encrypted in production
- `token_expires_at` (TIMESTAMP WITH TIME ZONE)
- `status` (TEXT, NOT NULL, DEFAULT 'active', CHECK: 'active'|'expired'|'revoked')
- `last_sync_at` (TIMESTAMP WITH TIME ZONE)
- `created_at` (TIMESTAMP WITH TIME ZONE, DEFAULT NOW())
- `updated_at` (TIMESTAMP WITH TIME ZONE, DEFAULT NOW())

**Constraints** 
- Unique `(organization_id, client_id)` - One Xero connection per client

------------------------------------------------------------------------

## Xero Push Records

Tracks invoice synchronization to Xero.

**Key Fields** 
- `id` (UUID, Primary Key)
- `organization_id` (UUID, NOT NULL, FK → organizations.id)
- `client_id` (UUID, NOT NULL, FK → clients.id)
- `invoice_id` (UUID, NOT NULL, FK → invoices.id)
- `xero_object_type` (TEXT, NOT NULL)
- `xero_object_id` (TEXT)
- `status` (TEXT, NOT NULL, DEFAULT 'pending', CHECK: 'pending'|'success'|'failed')
- `pushed_at` (TIMESTAMP WITH TIME ZONE)
- `error` (TEXT)
- `created_at` (TIMESTAMP WITH TIME ZONE, DEFAULT NOW())
- `updated_at` (TIMESTAMP WITH TIME ZONE, DEFAULT NOW())

------------------------------------------------------------------------

## Database Helper Functions

### `update_updated_at_column()`
Automatically updates the `updated_at` timestamp when a row is updated.

### `get_user_organization_role(p_user_id UUID, p_organization_id UUID)`
Returns the role of a user in a specific organization. Returns 'none' if not a member.

### `is_organization_member(p_user_id UUID, p_organization_id UUID)`
Returns true if the user is an active member of the organization.

------------------------------------------------------------------------

## Row Level Security (RLS)

All tables have Row Level Security enabled. Policies are based on:
- Organization membership
- User roles (admin, manager, accountant)

### Role-Based Access Summary

**Admin:**
- Full access to all operations
- Can manage organizations
- Can delete critical data (receipts, invoices, clients, etc.)
- Can manage Xero connections

**Manager:**
- Can view all data in their organization
- Can create and update: clients, batches, documents, receipts, invoices, contacts, tax types, chart of accounts
- Can manage organization members (add/remove)
- Cannot delete: receipts, clients, batches, invoices
- Cannot manage Xero connections

**Accountant:**
- Can view all data in their organization
- Can create and update: receipts, invoices, invoice lines
- Can delete: invoice lines (for corrections)
- Cannot delete other data
- Cannot manage members or organization settings
- Cannot manage Xero connections

------------------------------------------------------------------------

## Key Recommendations Summary

-   Always scope data by `organization_id`
-   Keep **receipts immutable** (only admins can delete)
-   Store **Invoice Category** on receipts, not invoices
-   Allow invoices to evolve independently
-   Track Xero pushes explicitly
-   Do not mix SLSP and Xero concerns in one data structure

------------------------------------------------------------------------

## Final Note

This ERD supports: 
- Regulatory compliance
- Auditability
- OCR reprocessing
- Accounting flexibility
- Clean UI separation

It is designed to scale across clients, organizations, and future
integrations.
