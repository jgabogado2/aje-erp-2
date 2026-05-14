'use client';

import { PageContainer } from '@/components/layout';
import { NotificationList } from '@/components/notifications/notification-list';

export default function NotificationsPage() {
  return (
    <PageContainer
      title="Notifications"
      description="Your recent tracker reminders and daily digests."
      breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Notifications' }]}
    >
      <NotificationList />
    </PageContainer>
  );
}
