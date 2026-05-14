import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { NotificationEntry, NotificationPage } from '@/types/domain';

export const notificationsKey = ['notifications'] as const;
export const unreadNotificationsKey = ['notifications', 'unread-count'] as const;

function toQueryString(input?: { cursor?: string; limit?: number; unread_only?: boolean }) {
  const params = new URLSearchParams();
  if (input?.cursor) params.set('cursor', input.cursor);
  if (input?.limit) params.set('limit', String(input.limit));
  if (input?.unread_only) params.set('unread_only', 'true');
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function useNotifications(input?: { limit?: number; unread_only?: boolean }) {
  return useQuery({
    queryKey: [...notificationsKey, input ?? {}],
    queryFn: () =>
      apiClient.get<NotificationPage>(`/api/notifications${toQueryString(input)}`),
  });
}

export function useUnreadCount() {
  return useQuery({
    queryKey: unreadNotificationsKey,
    queryFn: () =>
      apiClient
        .get<NotificationPage>('/api/notifications?limit=1')
        .then((page) => page.unread_count),
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ id, read = true }: { id: string; read?: boolean }) =>
      apiClient.patch<NotificationEntry>(`/api/notifications/${id}`, { read }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: notificationsKey });
      qc.invalidateQueries({ queryKey: unreadNotificationsKey });
    },
  });
}
