import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { markAllNotificationsRead } from '@core/services/userService';
import { markNotificationRead } from '@core/services/partnerNotifications';
import { CATEGORIES, CATEGORY_LABEL, toneOf } from '@core/utils/notificationModel';
import type { NotificationCategory, PartnerNotification } from '@core/types/notifications';
import { describeError } from '@core/utils/retry';
import { Button, EmptyState, LinkButton, Notice, PageHead } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { pathForPage, useInbox } from '@/state/Inbox';
import { useAuth } from '@/state/Auth';
import { useSeo } from '@/lib/seo';
import { dayLabel, parseBookingNotice } from '@/lib/notificationView';
import './notifications.css';

type Filter = 'all' | 'unread' | NotificationCategory;

const ICON: Record<NotificationCategory, string> = {
  bookings: 'booking',
  approvals: 'verified',
  trips: 'route',
  payments: 'wallet',
  penalties: 'warning',
  general: 'notifications',
};

export function NotificationsPage() {
  useSeo({ title: 'Notifications', noindex: true });
  const navigate = useNavigate();
  const { state, openLoginModal } = useAuth();
  const { notifications, loaded } = useInbox();
  const [filter, setFilter] = useState<Filter>('all');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (state.status !== 'ready') {
    return (
      <>
        <PageHead title="Notifications" />
        <div className="page">
          <div className="card card--center">
            <EmptyState
              art="welcome"
              title="Sign in to view notifications"
              action={
                <Button variant="primary" onClick={() => openLoginModal({ title: 'Sign in to view notifications' })}>
                  Sign in
                </Button>
              }
            >
            </EmptyState>
          </div>
        </div>
      </>
    );
  }

  const unread = notifications.filter((n) => !n.read);
  const present = CATEGORIES.filter((c) => notifications.some((n) => n.category === c));
  const shown = filter === 'all' ? notifications : filter === 'unread' ? unread : notifications.filter((n) => n.category === filter);

  // The list is already newest first, so each day's entries sit together.
  const now = new Date();
  const days: { label: string; items: PartnerNotification[] }[] = [];
  for (const n of shown) {
    const label = dayLabel(n.createdAtMs, now);
    const last = days[days.length - 1];
    if (last?.label === label) last.items.push(n);
    else days.push({ label, items: [n] });
  }

  const filters: { id: Filter; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: notifications.length },
    { id: 'unread', label: 'Unread', count: unread.length },
    ...present.map((c) => ({ id: c as Filter, label: CATEGORY_LABEL[c], count: notifications.filter((n) => n.category === c).length })),
  ];

  const markAll = async () => {
    setBusy(true);
    setError('');
    try {
      await markAllNotificationsRead(unread.map((n) => n.id));
    } catch (e) {
      setError(describeError(e, 'We couldn’t update your notifications.'));
    } finally {
      setBusy(false);
    }
  };

  const open = (n: PartnerNotification) => {
    if (!n.read) markNotificationRead(n.id).catch(() => undefined);
    const goesToTrip = n.bookingId && ['trips', 'booking-detail'].includes(n.ctaPage);
    if (goesToTrip) navigate(`/trips/${n.bookingId}`);
    else if (n.ctaPage && n.ctaPage !== 'notifications') navigate(pathForPage(n.ctaPage));
  };

  const card = (n: PartnerNotification) => {
    const booking = parseBookingNotice(n.message);
    const time = n.createdAtMs ? new Date(n.createdAtMs).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : n.time;
    const toBooking = Boolean(n.bookingId) && ['trips', 'booking-detail'].includes(n.ctaPage);
    const action = toBooking ? 'View booking' : n.ctaLabel && n.ctaPage !== 'notifications' ? n.ctaLabel : '';
    const code = booking?.code ?? n.bookingCode;
    return (
      <li key={n.id}>
        <button type="button" className={`nc-card tone-${toneOf(n)} ${n.read ? '' : 'is-unread'}`} onClick={() => open(n)}>
          <span className="nc-card__top">
            <span className="nc-card__icon">
              <Icon name={ICON[n.category]} size={18} />
            </span>
            <span className="nc-card__title">
              <strong>{n.title}</strong>
              {code ? <small>{code}</small> : null}
            </span>
            <time>{time}</time>
            {!n.read ? <span className="nc-card__dot" role="img" aria-label="Unread" /> : null}
          </span>

          {booking ? (
            <>
              <span className="nc-route">
                <span>{booking.from}</span>
                <i aria-hidden="true" />
                <span className="sr-only">to</span>
                <span>{booking.to}</span>
              </span>
              {booking.note ? <span className="nc-card__msg">{booking.note}</span> : null}
            </>
          ) : n.message ? (
            <span className="nc-card__msg">{n.message}</span>
          ) : null}

          {booking || action ? (
            <span className="nc-card__foot">
              {booking ? (
                <span className="nc-fact">
                  <small>Pickup</small>
                  <b>{booking.pickup}</b>
                </span>
              ) : null}
              {booking?.fare ? (
                <span className="nc-fact">
                  <small>Fare</small>
                  <b>{booking.fare}</b>
                </span>
              ) : null}
              {action ? <span className="nc-card__cta">{action} →</span> : null}
            </span>
          ) : null}
        </button>
      </li>
    );
  };

  return (
    <>
      <PageHead title="Notifications" />

      <div className="page nc">
        {error ? <Notice tone="error">{error}</Notice> : null}

        {!loaded ? (
          <div className="stack">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton" style={{ height: 112 }} />
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <div className="card card--center">
            <EmptyState
              art="no-notifications"
              title="You’re all caught up"
              action={
                <LinkButton variant="primary" to="/book" icon="car">
                  Book a ride
                </LinkButton>
              }
            >
            </EmptyState>
          </div>
        ) : (
          <>
            <section className="nc-head">
              <div>
                <h2>Notification centre</h2>
                <p>{unread.length > 0 ? `${unread.length} unread ${unread.length === 1 ? 'update' : 'updates'}` : 'All updates have been read'}</p>
              </div>
              {unread.length > 0 ? (
                <button type="button" className="nc-head__btn" disabled={busy} onClick={() => void markAll()}>
                  <Icon name="check" size={16} />
                  {busy ? 'Updating…' : 'Mark all as read'}
                </button>
              ) : null}
            </section>

            <nav className="nc-filters" aria-label="Filter notifications">
              {filters.map((f) => (
                <button key={f.id} type="button" className="nc-filter" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
                  <span>{f.label}</span>
                  <b>{f.count}</b>
                </button>
              ))}
            </nav>

            {shown.length === 0 ? (
              <div className="card card--center">
                <EmptyState
                  title={filter === 'unread' ? 'No unread notifications' : 'Nothing here'}
                  action={
                    <Button variant="secondary" onClick={() => setFilter('all')}>
                      Show all notifications
                    </Button>
                  }
                >
                </EmptyState>
              </div>
            ) : (
              days.map((d) => (
                <section key={d.label} className="nc-day" aria-label={d.label}>
                  <h3>{d.label}</h3>
                  <ul>{d.items.map(card)}</ul>
                </section>
              ))
            )}
          </>
        )}
      </div>
    </>
  );
}
