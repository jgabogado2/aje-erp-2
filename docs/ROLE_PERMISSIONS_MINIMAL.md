# Role Permissions - Minimal Draft

## Role Hierarchy

1. **ADMIN** - Full system access, organization management
2. **MANAGER** - Operational management, client and data management
3. **ACCOUNTANT** - Data entry, viewing, and accounting-specific tasks

---

## Permission Matrix

### Organizations
| Action | ADMIN | MANAGER | ACCOUNTANT |
|--------|-------|---------|------------|
| View organization | ✅ | ✅ | ✅ |
| Create organization | ✅ | ❌ | ❌ |
| Update organization | ✅ | ❌ | ❌ |
| Delete organization | ✅ | ❌ | ❌ |

### Organization Members
| Action | ADMIN | MANAGER | ACCOUNTANT |
|--------|-------|---------|------------|
| View members | ✅ | ✅ | ✅ |
| Add members | ✅ | ✅ | ❌ |
| Update members | ✅ | ✅ | ❌ |
| Remove members | ✅ | ✅ | ❌ |

### Clients
| Action | ADMIN | MANAGER | ACCOUNTANT |
|--------|-------|---------|------------|
| View clients | ✅ | ✅ | ✅ |
| Create clients | ✅ | ✅ | ❌ |
| Update clients | ✅ | ✅ | ❌ |
| Delete clients | ✅ | ❌ | ❌ |

### Batches
| Action | ADMIN | MANAGER | ACCOUNTANT |
|--------|-------|---------|------------|
| View batches | ✅ | ✅ | ✅ |
| Create batches | ✅ | ✅ | ❌ |
| Update batches | ✅ | ✅ | ❌ |
| Delete batches | ✅ | ❌ | ❌ |

### Batch Documents
| Action | ADMIN | MANAGER | ACCOUNTANT |
|--------|-------|---------|------------|
| View documents | ✅ | ✅ | ✅ |
| Upload documents | ✅ | ✅ | ❌ |
| Update documents | ✅ | ✅ | ❌ |
| Delete documents | ✅ | ❌ | ❌ |

### Receipts
| Action | ADMIN | MANAGER | ACCOUNTANT |
|--------|-------|---------|------------|
| View receipts | ✅ | ✅ | ✅ |
| Create receipts | ✅ | ✅ | ✅ |
| Update receipts (validation) | ✅ | ✅ | ✅ |
| Delete receipts | ✅ | ❌ | ❌ |

### Client Contacts
| Action | ADMIN | MANAGER | ACCOUNTANT |
|--------|-------|---------|------------|
| View contacts | ✅ | ✅ | ✅ |
| Create contacts | ✅ | ✅ | ❌ |
| Update contacts | ✅ | ✅ | ❌ |
| Delete contacts | ✅ | ❌ | ❌ |

### Invoices
| Action | ADMIN | MANAGER | ACCOUNTANT |
|--------|-------|---------|------------|
| View invoices | ✅ | ✅ | ✅ |
| Create invoices | ✅ | ✅ | ✅ |
| Update invoices | ✅ | ✅ | ✅ |
| Delete invoices | ✅ | ❌ | ❌ |

### Invoice Lines
| Action | ADMIN | MANAGER | ACCOUNTANT |
|--------|-------|---------|------------|
| View invoice lines | ✅ | ✅ | ✅ |
| Create invoice lines | ✅ | ✅ | ✅ |
| Update invoice lines | ✅ | ✅ | ✅ |
| Delete invoice lines | ✅ | ✅ | ✅ |

### Client Tax Types
| Action | ADMIN | MANAGER | ACCOUNTANT |
|--------|-------|---------|------------|
| View tax types | ✅ | ✅ | ✅ |
| Create tax types | ✅ | ✅ | ❌ |
| Update tax types | ✅ | ✅ | ❌ |
| Delete tax types | ✅ | ❌ | ❌ |

### Client Chart of Accounts
| Action | ADMIN | MANAGER | ACCOUNTANT |
|--------|-------|---------|------------|
| View chart of accounts | ✅ | ✅ | ✅ |
| Create accounts | ✅ | ✅ | ❌ |
| Update accounts | ✅ | ✅ | ❌ |
| Delete accounts | ✅ | ❌ | ❌ |

### Xero Connections
| Action | ADMIN | MANAGER | ACCOUNTANT |
|--------|-------|---------|------------|
| View connections | ✅ | ✅ | ✅ |
| Create connections | ✅ | ❌ | ❌ |
| Update connections | ✅ | ❌ | ❌ |
| Delete connections | ✅ | ❌ | ❌ |

### Xero Push Records
| Action | ADMIN | MANAGER | ACCOUNTANT |
|--------|-------|---------|------------|
| View push records | ✅ | ✅ | ✅ |
| Create push records | ✅ | ✅ | ❌ |
| Update push records | ✅ | ✅ | ❌ |
| Delete push records | ✅ | ❌ | ❌ |

---

## Summary by Role

### ADMIN
- **Full system control**
- Can manage organization settings
- Can manage all members
- Can delete critical data (receipts, organizations, clients, batches, invoices)
- Can manage Xero connections
- Highest level of access

### MANAGER
- **Operational management**
- Can manage clients, batches, documents
- Can manage team members (add/remove)
- Can create and update all business data
- Cannot delete critical data (receipts, clients, batches, invoices)
- Cannot manage Xero connections
- Can create and update receipts/invoices for data entry

### ACCOUNTANT
- **Data entry and viewing**
- Can view all data
- Can create and update business data (receipts, invoices, invoice lines)
- Can delete invoice lines (for corrections)
- Cannot delete other data (receipts, invoices, clients, etc.)
- Cannot manage members or organization settings
- Cannot manage Xero connections
- Cannot create clients, batches, or configuration data
- Focus on data entry and validation

---

## Notes for Review

1. **Receipt Deletion**: Only ADMIN can delete receipts (immutability principle)
2. **Xero Management**: Only ADMIN can manage Xero connections (sensitive credentials)
3. **Member Management**: MANAGER can add/remove members (operational need)
4. **Client Deletion**: Only ADMIN can delete clients
5. **Accountant Limitations**: ACCOUNTANT is primarily for data entry, no deletion rights except invoice lines
6. **Manager vs Accountant**: MANAGER can create clients/batches/config, ACCOUNTANT cannot

---

## Suggested Adjustments to Consider

- Should MANAGER be able to delete invoices/batches?
- Should ACCOUNTANT be able to create clients/batches?
- Should MANAGER have any Xero read-only access?
- Should there be a distinction between "soft delete" and "hard delete"?
- Should ACCOUNTANT be able to update client configuration (tax types, chart of accounts)?

