"use client";

import { useSession } from "next-auth/react";
import { AppShell } from "@/components/layout";

// Custom navigation for the dashboard
const navigation = [
  {
    items: [
      { title: "Home", href: "/", icon: "home" as const },
      { title: "Projects", href: "/projects", icon: "projects" as const, badge: "12" },
      { title: "Tasks", href: "/tasks", icon: "tasks" as const },
    ],
  },
  {
    title: "Workspace",
    items: [
      { title: "Calendar", href: "/calendar", icon: "calendar" as const },
      { title: "Team", href: "/team", icon: "team" as const },
      { title: "Analytics", href: "/analytics", icon: "analytics" as const },
    ],
  },
];

// Admin navigation section - only shown to admins
const adminNavigation = {
  title: "Administration",
  items: [
    { title: "User Management", href: "/admin/users", icon: "team" as const },
  ],
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session } = useSession();
  const isAdmin = session?.userRole?.role === "admin";

  // Build navigation based on user role
  const fullNavigation = isAdmin
    ? [...navigation, adminNavigation]
    : navigation;

  return (
    <AppShell
      navigation={fullNavigation}
      onSearchClick={() => console.log("Search clicked")}
      onNotificationsClick={() => console.log("Notifications clicked")}
      onNewClick={() => console.log("New clicked")}
    >
      {children}
    </AppShell>
  );
}
