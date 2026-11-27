// This rider's notifications, subscribed once per session. Every new arrival (after the first load) is queued for the
// header popup (components/HeaderNotice), one at a time; nothing is invented to fill the list.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { subscribeToNotifications } from '@core/services/partnerNotifications';
import { isHoldingBookingConfirmed } from '@/lib/paymentHold';
import type { PartnerNotification } from '@core/types/notifications';

interface InboxValue {
  notifications: PartnerNotification[];
  loaded: boolean;
  unreadCount: number;
  /** The newest unseen arrival, shown in the header popup; null when there is nothing to show. */
  live: PartnerNotification | null;
  /** Hide the current popup (the next queued arrival, if any, follows). */
  dismissLive: () => void;
  /** Keep the "Booking confirmed" popup away until the returned release is called. */
  quietBookingConfirmed: () => () => void;
}

const Ctx = createContext<InboxValue | null>(null);

export function useInbox(): InboxValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('InboxProvider is missing');
  return v;
}

/**
 * While `active` (a cab is still being found), no "Booking confirmed" popup is shown: it would say the ride is settled
 * while the screen below is still looking for a driver. The notification stays on the Notifications page.
 */
export function useQuietBookingConfirmed(active: boolean): void {
  const { quietBookingConfirmed } = useInbox();
  useEffect(() => (active ? quietBookingConfirmed() : undefined), [active, quietBookingConfirmed]);
}

/** Where a notification's call-to-action leads (page keys come from the server's `cta.page`). */
export function pathForPage(page: string): string {
  switch (page) {
    case 'trip':
    case 'trips':
    case 'booking':
    case 'booking-detail':
      return '/trips';
    case 'book':
      return '/book';
    case 'support':
      return '/support';
    default:
      return '/notifications';
  }
}

export function InboxProvider({ userId, children }: { userId?: string | null; children: ReactNode }) {
  const [notifications, setNotifications] = useState<PartnerNotification[]>([]);
  const [loaded, setLoaded] = useState(false);
  const seen = useRef<Set<string> | null>(null);
  const [queue, setQueue] = useState<PartnerNotification[]>([]);
  const dismissLive = useCallback(() => setQueue((q) => q.slice(1)), []);

  useEffect(() => {
    seen.current = null;
    if (!userId) {
      setNotifications([]);
      setQueue([]);
      setLoaded(true);
      return undefined;
    }
    // This rider's own notifications, for this site only (the same login can also be a vendor or driver).
    return subscribeToNotifications(userId, (list) => {
      setNotifications(list);
      setLoaded(true);
      if (seen.current === null) {
        seen.current = new Set(list.map((n) => n.id));
        return;
      }
      const fresh: PartnerNotification[] = [];
      for (const n of list) {
        if (seen.current.has(n.id)) continue;
        seen.current.add(n.id);
        // Paying online right now: "Booking confirmed" is not shown until the payment is complete.
        if (!n.read && !(isHoldingBookingConfirmed() && n.title === 'Booking confirmed')) fresh.push(n);
      }
      // Oldest first, so the popups follow the order they arrived in.
      if (fresh.length) setQueue((q) => [...q, ...fresh.sort((a, b) => a.createdAtMs - b.createdAtMs)].slice(-10));
    }, { site: 'people_taxi' });
  }, [userId]);

  // Screens still finding a cab ask for no "Booking confirmed" popup; one already waiting is dropped, not shown later.
  const [quiet, setQuiet] = useState(0);
  const quietBookingConfirmed = useCallback(() => {
    setQuiet((n) => n + 1);
    return () => setQuiet((n) => n - 1);
  }, []);
  const muted = useCallback((n: PartnerNotification) => quiet > 0 && n.title === 'Booking confirmed', [quiet]);
  useEffect(() => {
    if (queue.some(muted)) setQueue((q) => q.filter((n) => !muted(n)));
  }, [queue, muted]);

  // A popup whose notification was read elsewhere (e.g. on the Notifications page) is skipped.
  const live = queue.find((q) => !muted(q) && !notifications.find((n) => n.id === q.id)?.read) ?? null;
  useEffect(() => {
    if (queue.length && queue[0] !== live) setQueue((q) => (live ? q.slice(q.indexOf(live)) : []));
  }, [queue, live]);
  const value = useMemo<InboxValue>(
    () => ({ notifications, loaded, unreadCount: notifications.filter((n) => !n.read).length, live, dismissLive, quietBookingConfirmed }),
    [notifications, loaded, live, dismissLive, quietBookingConfirmed],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
