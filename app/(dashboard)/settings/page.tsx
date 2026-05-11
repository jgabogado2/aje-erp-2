"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  PageContainer,
  PageSection,
  PageCard,
} from "@/components/layout";
import { Separator } from "@/components/ui/separator";

const Icons = {
  user: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  bell: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  ),
  shield: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  creditCard: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
      <line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  ),
  globe: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  ),
  chevronRight: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  ),
};

const settingsSections = [
  {
    title: "Account",
    description: "Manage your account settings and preferences",
    icon: Icons.user,
    items: [
      { label: "Profile Information", description: "Update your name, email, and profile picture" },
      { label: "Password", description: "Change your password and security settings" },
      { label: "Two-Factor Authentication", description: "Add an extra layer of security", badge: "Recommended" },
    ],
  },
  {
    title: "Notifications",
    description: "Choose what notifications you receive",
    icon: Icons.bell,
    items: [
      { label: "Email Notifications", description: "Configure which emails you receive" },
      { label: "Push Notifications", description: "Manage browser and mobile notifications" },
      { label: "Notification Schedule", description: "Set quiet hours and notification timing" },
    ],
  },
  {
    title: "Privacy & Security",
    description: "Control your privacy and security preferences",
    icon: Icons.shield,
    items: [
      { label: "Privacy Settings", description: "Manage who can see your activity" },
      { label: "Connected Apps", description: "Review and manage third-party access" },
      { label: "Login History", description: "View recent login activity" },
    ],
  },
  {
    title: "Billing",
    description: "Manage your subscription and payment methods",
    icon: Icons.creditCard,
    items: [
      { label: "Current Plan", description: "Pro Plan - $29/month", badge: "Active" },
      { label: "Payment Methods", description: "Update your payment information" },
      { label: "Billing History", description: "View past invoices and receipts" },
    ],
  },
  {
    title: "Language & Region",
    description: "Customize your language and regional preferences",
    icon: Icons.globe,
    items: [
      { label: "Language", description: "English (US)" },
      { label: "Timezone", description: "Pacific Time (PT)" },
      { label: "Date Format", description: "MM/DD/YYYY" },
    ],
  },
];

function SettingsSection({ section }: { section: typeof settingsSections[0] }) {
  const Icon = section.icon;

  return (
    <PageSection
      title={section.title}
      description={section.description}
    >
      <PageCard className="divide-y divide-border p-0">
        {section.items.map((item, index) => (
          <button
            key={index}
            className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-muted/50"
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium">{item.label}</span>
                {item.badge && (
                  <Badge variant="secondary" className="text-xs">
                    {item.badge}
                  </Badge>
                )}
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {item.description}
              </p>
            </div>
            <Icons.chevronRight className="h-5 w-5 text-muted-foreground" />
          </button>
        ))}
      </PageCard>
    </PageSection>
  );
}

export default function SettingsPage() {
  return (
    <PageContainer
      title="Settings"
      description="Manage your account settings and preferences."
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Settings" },
      ]}
      maxWidth="lg"
    >
      <div className="space-y-10">
        {settingsSections.map((section) => (
          <SettingsSection key={section.title} section={section} />
        ))}

        {/* Danger Zone */}
        <PageSection
          title="Danger Zone"
          description="Irreversible and destructive actions"
        >
          <PageCard className="border-destructive/50 bg-destructive/5">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium text-destructive">Delete Account</h4>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Permanently delete your account and all associated data.
                </p>
              </div>
              <Button variant="destructive" size="sm">
                Delete Account
              </Button>
            </div>
          </PageCard>
        </PageSection>
      </div>
    </PageContainer>
  );
}

