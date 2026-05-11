'use client';

import { useSession } from 'next-auth/react';
import { User, Building2 } from 'lucide-react';
import {
  PageContainer,
  PageSection,
  PageCard,
} from '@/components/layout';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import type { SystemRole } from '@/lib/auth.types';

const ROLE_LABEL: Record<SystemRole, string> = {
  SUPER_ADMIN: 'Super Admin',
  SITE_MANAGER: 'Site Manager',
  STAFF: 'Staff',
};

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right">{value}</span>
    </div>
  );
}

export default function SettingsPage() {
  const { data: session, status } = useSession();

  if (status === 'loading' || !session) return null;

  const user = session.user;
  const role = session.userRole?.role;
  const initials =
    user.name
      ?.split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0])
      .join('')
      .toUpperCase() ??
    user.email?.slice(0, 2).toUpperCase() ??
    'U';

  return (
    <PageContainer
      title="Settings"
      description="Your profile and account details."
      breadcrumbs={[{ label: 'Settings' }]}
      maxWidth="lg"
    >
      <div className="space-y-10">
        <PageSection
          title="Profile"
          description="Synced from your Google account. To change, update it in Google."
        >
          <PageCard>
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                {user.image && <AvatarImage src={user.image} alt={user.name ?? user.email ?? ''} />}
                <AvatarFallback className="text-lg">{initials}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold">{user.name ?? '—'}</p>
                <p className="truncate text-sm text-muted-foreground">{user.email}</p>
              </div>
              <div className="ml-auto">
                <User className="h-5 w-5 text-muted-foreground" />
              </div>
            </div>
          </PageCard>
        </PageSection>

        <PageSection
          title="Organization"
          description="Your membership and role."
        >
          <PageCard>
            <Field
              label="Organization"
              value={
                <span className="inline-flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  {session.userRole?.organization_id ? 'AJE' : '—'}
                </span>
              }
            />
            <Separator />
            <Field
              label="Role"
              value={
                role ? (
                  <Badge variant={role === 'SUPER_ADMIN' ? 'destructive' : 'default'}>
                    {ROLE_LABEL[role]}
                  </Badge>
                ) : (
                  '—'
                )
              }
            />
            <Separator />
            <Field
              label="Status"
              value={
                <Badge variant={session.userRole?.is_active ? 'default' : 'secondary'}>
                  {session.userRole?.is_active ? 'Active' : 'Inactive'}
                </Badge>
              }
            />
          </PageCard>
        </PageSection>
      </div>
    </PageContainer>
  );
}
