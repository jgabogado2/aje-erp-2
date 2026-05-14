"use client";

import { useMemo } from "react";
import { useSession } from "next-auth/react";
import { AppShell } from "@/components/layout";
import type { NavSection, NavItem } from "@/components/layout";
import { getNavCapabilities } from "@/lib/nav";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session } = useSession();
  const role = session?.userRole?.role;

  // Navigation is built from capabilities, not raw roles. Every authorized
  // user gets a "Trackers" entry point — per-site access is still enforced
  // server-side, so this only controls discoverability, not security.
  const navigation = useMemo<NavSection[]>(() => {
    const caps = getNavCapabilities(role);

    const primary: NavItem[] = [
      { title: "Home", href: "/", icon: "home" },
    ];
    if (caps.canViewTrackers) {
      primary.push({ title: "Trackers", href: "/trackers", icon: "tasks" });
    }
    primary.push({ title: "Notifications", href: "/notifications", icon: "analytics" });

    const sections: NavSection[] = [{ items: primary }];

    const adminItems: NavItem[] = [];
    if (caps.canManageSites) adminItems.push({ title: "Sites", href: "/admin/sites", icon: "projects" });
    if (caps.canManageTrackers) adminItems.push({ title: "Tracker templates", href: "/admin/trackers", icon: "tasks" });
    if (caps.canManageUsers) adminItems.push({ title: "Users", href: "/admin/users", icon: "team" });
    if (caps.canManageHolidays) adminItems.push({ title: "Holidays", href: "/admin/holidays", icon: "analytics" });
    if (caps.canViewAudit) adminItems.push({ title: "Audit log", href: "/admin/audit", icon: "analytics" });

    if (adminItems.length > 0) {
      sections.push({ title: "Administration", items: adminItems });
    }

    return sections;
  }, [role]);

  return <AppShell navigation={navigation}>{children}</AppShell>;
}
