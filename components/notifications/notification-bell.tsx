'use client';

import Link from 'next/link';
import * as React from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUnreadCount } from '@/hooks/use-notifications';

type NotificationBellProps = Omit<
  React.ComponentPropsWithoutRef<typeof Button>,
  'asChild' | 'children'
> & {
  onClick?: () => void;
};

export const NotificationBell = React.forwardRef<HTMLElement, NotificationBellProps>(
  function NotificationBell({ onClick, ...props }, ref) {
  const unread = useUnreadCount();
  const count = unread.data ?? 0;
  const badge = count > 99 ? '99+' : String(count);

  const content = (
    <>
      <Bell className="h-4 w-4" />
      {count > 0 && (
        <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground">
          {badge}
        </span>
      )}
    </>
  );

  if (onClick) {
    return (
      <Button
        ref={ref as React.Ref<HTMLButtonElement>}
        variant="ghost"
        size="icon"
        className="relative h-8 w-8"
        onClick={onClick}
        aria-label="View notifications"
        {...props}
      >
        {content}
      </Button>
    );
  }

  return (
    <Button
      ref={ref as React.Ref<HTMLButtonElement>}
      asChild
      variant="ghost"
      size="icon"
      className="relative h-8 w-8"
      {...props}
    >
      <Link href="/notifications" aria-label="View notifications">
        {content}
      </Link>
    </Button>
  );
});
