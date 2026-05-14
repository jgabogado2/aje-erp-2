'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PageContainer, PageSection, PageCard } from '@/components/layout';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { apiClient } from '@/lib/api-client';

interface NotificationPrefs {
  user_id: string;
  channels: Record<string, string>;
  digest: 'immediate' | 'daily' | 'off';
}

const KINDS = [
  { key: 'overdue', label: 'Overdue entries' },
  { key: 'upcoming', label: 'Upcoming deadlines' },
  { key: 'assigned', label: 'Assigned to me' },
  { key: 'status_changed', label: 'Status changes' },
] as const;

export default function NotificationPreferencesPage() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['notification-preferences'],
    queryFn: () => apiClient.get<NotificationPrefs>('/api/notifications/preferences'),
  });

  const mutation = useMutation({
    mutationFn: (data: Partial<NotificationPrefs>) =>
      apiClient.patch<NotificationPrefs>('/api/notifications/preferences', data),
    onSuccess: (updated) => {
      qc.setQueryData(['notification-preferences'], updated);
      toast.success('Preferences saved');
    },
    onError: () => toast.error('Failed to save preferences'),
  });

  const prefs = query.data;

  function patchChannel(kind: string, value: string) {
    if (!prefs) return;
    mutation.mutate({ channels: { ...prefs.channels, [kind]: value } });
  }

  function patchDigest(value: string) {
    mutation.mutate({ digest: value as NotificationPrefs['digest'] });
  }

  return (
    <PageContainer
      title="Notification preferences"
      description="Choose how and when you receive notifications."
      breadcrumbs={[{ label: 'Notifications', href: '/notifications' }, { label: 'Preferences' }]}
    >
      {query.isLoading ? (
        <PageCard>
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-md" />
            ))}
          </div>
        </PageCard>
      ) : (
        <>
          <PageSection title="Notification channels">
            <PageCard>
              <div className="divide-y divide-border">
                {KINDS.map(({ key, label }) => (
                  <div key={key} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                    <Label className="text-sm font-medium">{label}</Label>
                    <Select
                      value={prefs?.channels?.[key] ?? 'off'}
                      onChange={(e) => patchChannel(key, e.target.value)}
                      disabled={mutation.isPending}
                      className="w-40"
                    >
                      <option value="email">Email</option>
                      <option value="in_app">In-app only</option>
                      <option value="off">Off</option>
                    </Select>
                  </div>
                ))}
              </div>
            </PageCard>
          </PageSection>

          <PageSection
            title="Email digest"
            description="When email is enabled above, how often should emails be sent?"
          >
            <PageCard>
              <div className="flex items-center justify-between gap-4">
                <Label className="text-sm font-medium">Send email</Label>
                <Select
                  value={prefs?.digest ?? 'daily'}
                  onChange={(e) => patchDigest(e.target.value)}
                  disabled={mutation.isPending}
                  className="w-48"
                >
                  <option value="immediate">Immediately</option>
                  <option value="daily">Daily digest</option>
                  <option value="off">Off (no emails)</option>
                </Select>
              </div>
            </PageCard>
          </PageSection>
        </>
      )}
    </PageContainer>
  );
}
