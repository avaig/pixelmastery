import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { sdk } from '@/services/sdk';
import { useFetch } from '@/hooks/useFetch';
import ApperIcon from '@/components/ApperIcon';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { formatRelativeTime } from '@/utils/date';

const { eq } = window.ApperSDK.CoreSDK;
const NOTIFICATION_PAGE_SIZE = 100;

export const route = {
  path: '/notifications',
  layout: 'owner',
  access: "profile === 'Customer_c' || profile === 'ServiceProvider_c'",
};

export const nav = {
  to: '/notifications',
  label: 'Notifications',
  icon: 'Bell',
  order: 2,
  section: 'Account',
  profiles: ['Customer_c', 'ServiceProvider_c'],
};

const TYPE_ICONS = {
  Request: 'ClipboardList',
  Booking: 'CalendarCheck',
  Provider: 'UserRoundCheck',
  Job: 'Wrench',
  Payment: 'CreditCard',
  Cancellation: 'CalendarX',
  Announcement: 'Megaphone',
};

export default function Notifications() {
  const user = useSelector((state) => state.user.user);
  const navigate = useNavigate();
  const [filter, setFilter] = useState('All');
  const { data, loading, error, run } = useFetch(async () => {
    if (!user?.userId) return [];
    const result = await sdk.table('notifications_c')
      .select(['Id', 'Name', 'message_c', 'notification_type_c', 'is_read_c', 'action_url_c', 'related_record_id_c', 'related_type_c', 'CreatedOn'])
      .where(eq('recipient_user_c', user.userId))
      .orderByDesc('CreatedOn')
      .page(1, NOTIFICATION_PAGE_SIZE)
      .fetch();
    if (!result.success) throw new Error(result.message || 'Notifications could not be loaded.');
    return result.data ?? [];
  }, [user?.userId]);

  const notifications = data ?? [];
  const unreadCount = notifications.filter((item) => !item.is_read_c).length;
  const visibleNotifications = filter === 'Unread'
    ? notifications.filter((item) => !item.is_read_c)
    : notifications;

  async function markAsRead(notification) {
    if (notification.is_read_c) return;
    try {
      const result = await sdk.table('notifications_c').update({ Id: notification.Id, is_read_c: true });
      if (!result.data?.length) throw new Error(result.messages?.[0] || 'Could not update this notification.');
      await run();
      window.dispatchEvent(new CustomEvent('local-notifications-changed'));
    } catch (err) {
      toast.error(err.message || 'Could not update this notification.');
    }
  }

  async function openNotification(notification) {
    await markAsRead(notification);
    const target = String(notification.action_url_c ?? '');
    if (target.startsWith('/') && !target.startsWith('//')) navigate(target);
  }

  async function markAllAsRead() {
    const unread = notifications.filter((item) => !item.is_read_c);
    if (!unread.length) return;
    try {
      const result = await sdk.table('notifications_c').update(unread.map((item) => ({ Id: item.Id, is_read_c: true })));
      if (!result.data?.length) throw new Error(result.messages?.[0] || 'Notifications could not be updated.');
      toast.success(`${result.data.length} notification${result.data.length === 1 ? '' : 's'} marked as read.`);
      await run();
      window.dispatchEvent(new CustomEvent('local-notifications-changed'));
    } catch (err) {
      toast.error(err.message || 'Could not mark notifications as read.');
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">LOCAL · Account</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground">Notifications</h1>
          <p className="mt-2 text-sm text-muted-foreground">Booking updates and important activity from LOCAL.</p>
        </div>
        <Button variant="outline" onClick={markAllAsRead} disabled={unreadCount === 0}>
          <ApperIcon name="CheckCheck" size={16} />
          Mark all as read
        </Button>
      </div>

      <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex gap-2">
          {['All', 'Unread'].map((value) => (
            <Button key={value} size="sm" variant={filter === value ? 'default' : 'ghost'} onClick={() => setFilter(value)}>
              {value}
              {value === 'Unread' && unreadCount > 0 && <span className="ml-1 rounded-full bg-background/20 px-1.5 text-xs">{unreadCount}</span>}
            </Button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">{notifications.length} total</span>
      </div>

      {loading && !data && (
        <div className="space-y-3" aria-label="Loading notifications">
          {[1, 2, 3].map((item) => <div key={item} className="h-24 animate-pulse rounded-xl border border-border bg-muted/50" />)}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5">
          <p className="font-medium">Notifications could not be loaded.</p>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          <Button className="mt-3" variant="outline" onClick={run}>Try again</Button>
        </div>
      )}

      {!loading && !error && visibleNotifications.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border px-5 py-12 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <ApperIcon name="BellRing" size={22} />
          </div>
          <h2 className="mt-4 text-lg font-semibold">{filter === 'Unread' ? 'You are all caught up' : 'No notifications yet'}</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">When there is an update about your requests, bookings, service progress or payments, it will appear here.</p>
          <Link to={user?.profile === 'ServiceProvider_c' ? '/service-provider' : '/customer'} className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline">
            Back to dashboard <ApperIcon name="ArrowRight" size={15} />
          </Link>
        </div>
      )}

      <div className="space-y-3" aria-busy={loading}>
        {visibleNotifications.map((notification) => (
          <article key={notification.Id} className={`rounded-xl border p-4 transition-colors sm:p-5 ${notification.is_read_c ? 'border-border bg-card' : 'border-primary/30 bg-primary/[0.035]'}`}>
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl ${notification.is_read_c ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary'}`}>
                <ApperIcon name={TYPE_ICONS[notification.notification_type_c] ?? 'Bell'} size={19} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold text-foreground">{notification.Name || 'LOCAL update'}</h2>
                  {!notification.is_read_c && <span className="size-2 rounded-full bg-primary" aria-label="Unread" />}
                </div>
                <p className="mt-1 whitespace-pre-line text-sm leading-6 text-muted-foreground">{notification.message_c}</p>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <span className="text-xs text-muted-foreground">{notification.CreatedOn ? formatRelativeTime(notification.CreatedOn) : 'Recently'}</span>
                  <div className="flex items-center gap-3">
                    {notification.action_url_c && (
                      <Button size="sm" variant="outline" onClick={() => openNotification(notification)}>
                        View update <ApperIcon name="ArrowUpRight" size={14} />
                      </Button>
                    )}
                    {!notification.is_read_c && (
                      <Button size="sm" variant="ghost" onClick={() => markAsRead(notification)}>Mark read</Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}