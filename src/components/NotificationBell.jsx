import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { sdk } from '@/services/sdk';
import { useFetch } from '@/hooks/useFetch';
import ApperIcon from '@/components/ApperIcon';

const { eq } = window.ApperSDK.CoreSDK;

export default function NotificationBell({ userId }) {
  const { data: unreadCount, run } = useFetch(async () => {
    if (!userId) return 0;
    const result = await sdk.table('notifications_c')
      .select(['Id'])
      .where(eq('recipient_user_c', userId))
      .where(eq('is_read_c', false))
      .page(1, 100)
      .fetch();
    if (!result.success) throw new Error(result.message || 'Notifications could not be loaded.');
    return Number(result.total ?? result.data?.length ?? 0);
  }, [userId]);

  useEffect(() => {
    const refresh = () => run();
    window.addEventListener('local-notifications-changed', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener('local-notifications-changed', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [run]);

  return (
    <Link
      to="/notifications"
      aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
      title="Notifications"
      className="relative inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-background text-foreground transition hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
    >
      <ApperIcon name="Bell" size={19} />
      {Number(unreadCount ?? 0) > 0 && (
        <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full border-2 border-background bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </Link>
  );
}