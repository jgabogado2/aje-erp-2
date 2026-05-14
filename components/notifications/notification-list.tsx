'use client';

import Link from 'next/link';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { Check, Clock3 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageCard, PageEmptyState } from '@/components/layout';
import { ApiError } from '@/lib/api-client';
import { useMarkNotificationRead, useNotifications } from '@/hooks/use-notifications';
import type { NotificationEntry } from '@/types/domain';

const KIND_LABEL: Record<NotificationEntry['kind'], string> = {
  overdue: 'Overdue',
  upcoming: 'Upcoming',
  assigned: 'Assigned',
  status_changed: 'Status changed',
};

function notificationHref(notification: NotificationEntry) {
  const payload = notification.payload ?? {};
  if (payload.site_id && payload.site_tracker_id && payload.task_list_id) {
    return `/sites/${payload.site_id}/trackers/${payload.site_tracker_id}/tasks/${payload.task_list_id}`;
  }
  if (payload.site_id) return `/sites/${payload.site_id}`;
  return '/';
}

export function NotificationList() {
  const query = useNotifications({ limit: 50 });
  const markRead = useMarkNotificationRead();

  async function handleMarkRead(notification: NotificationEntry) {
    try {
      await markRead.mutateAsync({ id: notification.id, read: true });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to mark notification read');
    }
  }

  if (query.isLoading) {
    return <PageCard className="p-8 text-sm text-muted-foreground">Loading notifications...</PageCard>;
  }

  if (query.isError || !query.data) {
    return <PageCard className="p-8 text-sm text-destructive">Failed to load notifications.</PageCard>;
  }

  if (query.data.rows.length === 0) {
    return (
      <PageCard>
        <PageEmptyState
          icon={<Clock3 className="h-8 w-8" />}
          title="No notifications"
          description="Tracker reminders and daily digests will appear here."
        />
      </PageCard>
    );
  }

  return (
    <PageCard>
      <ul className="divide-y divide-border">
        {query.data.rows.map((notification) => {
          const isUnread = !notification.read_at;
          return (
            <li key={notification.id} className="flex gap-3 py-4 first:pt-0 last:pb-0">
              <div
                className={`mt-1 h-2.5 w-2.5 rounded-full ${
                  isUnread ? 'bg-primary' : 'bg-muted'
                }`}
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={isUnread ? 'default' : 'secondary'}>
                    {KIND_LABEL[notification.kind]}
                  </Badge>
                  {notification.site && (
                    <Badge variant="outline">{notification.site.name}</Badge>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(parseISO(notification.created_at), {
                      addSuffix: true,
                    })}
                  </span>
                </div>
                <Link
                  href={notificationHref(notification)}
                  className="mt-2 block font-medium hover:underline"
                >
                  {notification.title}
                </Link>
                {notification.body && (
                  <p className="mt-1 text-sm text-muted-foreground">{notification.body}</p>
                )}
              </div>
              {isUnread && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={markRead.isPending}
                  onClick={() => handleMarkRead(notification)}
                >
                  <Check className="mr-2 h-4 w-4" />
                  Read
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </PageCard>
  );
}
