"use client";

import { useMemo } from "react";
import { useSession } from "next-auth/react";
import { AppShell } from "@/components/layout";
import type { NavSection } from "@/components/layout";

// Base navigation for every signed-in user. Trackers/Calendar are stubs that
// will be wired up in Phase 2 — leaving them out until then keeps the nav
// honest. Settings stays in the bottom group via the default AppShell footer.
const baseNavigation: NavSection[] = [
  {
    items: [
      { title: "Home", href: "/", icon: "home" as const },
      { title: "Notifications", href: "/notifications", icon: "analytics" as const },
    ],
  },
];

const adminNavigation: NavSection = {
  title: "Administration",
  items: [
    { title: "Sites", href: "/admin/sites", icon: "projects" as const },
    { title: "Trackers", href: "/admin/trackers", icon: "tasks" as const },
    { title: "Users", href: "/admin/users", icon: "team" as const },
    { title: "Holidays", href: "/admin/holidays", icon: "analytics" as const },
    { title: "Audit log", href: "/admin/audit", icon: "analytics" as const },
  ],
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session } = useSession();
  const isSuperAdmin = session?.userRole?.role === "SUPER_ADMIN";

  const navigation = useMemo<NavSection[]>(
    () => (isSuperAdmin ? [...baseNavigation, adminNavigation] : baseNavigation),
    [isSuperAdmin]
  );

  return <AppShell navigation={navigation}>{children}</AppShell>;
}
