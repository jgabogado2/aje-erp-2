import type { SystemRole } from '@/lib/auth.types';

// Single source of truth for navigation/UI visibility. Components read these
// flags instead of hardcoding role checks, so adding a role or moving a
// capability is a one-line change here rather than a hunt across the tree.
//
// This stays role-derived (the app has no permissions table) but is shaped
// like a capability map so callers express intent — `canViewTrackers` — not
// role trivia. Server-side auth gates (rbac.ts) remain the security boundary;
// these flags only drive what the UI offers.

export interface NavCapabilities {
  /** Can reach the tracker hub and per-site tracker pages. */
  canViewTrackers: boolean;
  /** Can manage tracker category templates (admin config). */
  canManageTrackers: boolean;
  canManageSites: boolean;
  canManageUsers: boolean;
  canManageHolidays: boolean;
  canViewAudit: boolean;
}

export function getNavCapabilities(role: SystemRole | undefined | null): NavCapabilities {
  const isSuperAdmin = role === 'SUPER_ADMIN';

  return {
    // Any provisioned member can view trackers; per-site access is still
    // enforced server-side. Users with no site assignment get a graceful
    // empty state rather than a hidden module.
    canViewTrackers: !!role,
    canManageTrackers: isSuperAdmin,
    canManageSites: isSuperAdmin,
    canManageUsers: isSuperAdmin,
    canManageHolidays: isSuperAdmin,
    canViewAudit: isSuperAdmin,
  };
}
