"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Sidebar, MobileSidebar, type NavSection } from "./sidebar";
import { TopNav } from "./top-nav";

interface AppShellProps {
  /** Navigation sections for the sidebar */
  navigation?: NavSection[];
  /** Main page content */
  children: React.ReactNode;
  /** Additional classes for the main content area */
  className?: string;
  /** Default sidebar collapsed state */
  defaultCollapsed?: boolean;
  /** Callback when search is clicked */
  onSearchClick?: () => void;
  /** Callback when notifications is clicked */
  onNotificationsClick?: () => void;
  /** Callback when new button is clicked */
  onNewClick?: () => void;
}

export function AppShell({
  navigation,
  children,
  className,
  defaultCollapsed = false,
  onSearchClick,
  onNotificationsClick,
  onNewClick,
}: AppShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(defaultCollapsed);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  return (
    <div className="relative min-h-screen bg-background">
      {/* Desktop Sidebar */}
      <Sidebar
        navigation={navigation}
        collapsed={sidebarCollapsed}
        onCollapsedChange={setSidebarCollapsed}
      />

      {/* Top Navigation - now uses session data internally */}
      <TopNav
        sidebarCollapsed={sidebarCollapsed}
        onSearchClick={onSearchClick}
        onNotificationsClick={onNotificationsClick}
        onNewClick={onNewClick}
        leftSlot={
          <MobileSidebar
            navigation={navigation}
            open={mobileOpen}
            onOpenChange={setMobileOpen}
          />
        }
      />

      {/* Main Content Area */}
      <main
        className={cn(
          "min-h-screen pt-[var(--topnav-height)]",
          "transition-all duration-300 ease-in-out",
          sidebarCollapsed
            ? "md:pl-[var(--sidebar-width-collapsed)]"
            : "md:pl-[var(--sidebar-width)]",
          className
        )}
      >
        {/* Content wrapper with proper height calculation */}
        <div className="h-[calc(100vh-var(--topnav-height))]">
          {children}
        </div>
      </main>
    </div>
  );
}

// Context for accessing shell state from child components
interface AppShellContextValue {
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
}

const AppShellContext = React.createContext<AppShellContextValue | null>(null);

export function useAppShell() {
  const context = React.useContext(AppShellContext);
  if (!context) {
    throw new Error("useAppShell must be used within an AppShell");
  }
  return context;
}

// Provider version of AppShell that exposes context
export function AppShellProvider({
  navigation,
  children,
  className,
  defaultCollapsed = false,
  onSearchClick,
  onNotificationsClick,
  onNewClick,
}: AppShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(defaultCollapsed);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  return (
    <AppShellContext.Provider value={{ sidebarCollapsed, setSidebarCollapsed }}>
      <div className="relative min-h-screen bg-background">
        {/* Desktop Sidebar */}
        <Sidebar
          navigation={navigation}
          collapsed={sidebarCollapsed}
          onCollapsedChange={setSidebarCollapsed}
        />

        {/* Top Navigation - now uses session data internally */}
        <TopNav
          sidebarCollapsed={sidebarCollapsed}
          onSearchClick={onSearchClick}
          onNotificationsClick={onNotificationsClick}
          onNewClick={onNewClick}
          leftSlot={
            <MobileSidebar
              navigation={navigation}
              open={mobileOpen}
              onOpenChange={setMobileOpen}
            />
          }
        />

        {/* Main Content Area */}
        <main
          className={cn(
            "min-h-screen pt-[var(--topnav-height)]",
            "transition-all duration-300 ease-in-out",
            sidebarCollapsed
              ? "md:pl-[var(--sidebar-width-collapsed)]"
              : "md:pl-[var(--sidebar-width)]",
            className
          )}
        >
          {/* Content wrapper with proper height calculation */}
          <div className="h-[calc(100vh-var(--topnav-height))]">
            {children}
          </div>
        </main>
      </div>
    </AppShellContext.Provider>
  );
}
