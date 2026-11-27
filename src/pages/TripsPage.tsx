import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { TripRecord } from '@core/types';
import { useCustomerData } from '@core/context/CustomerData';
import { cancellationQuote, subscribeToBoardingOtp } from '@core/services/rideService';
import { formatDate, formatINR, formatTime } from '@core/utils/format';
import { isValidLatLng } from '@core/utils/geo';
import { paymentLabel, tabOfTrip, tripStatusChip, type TripTab } from '@core/utils/tripView';
import { Button, EmptyState, LinkButton, Notice, PageHead } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { TourQuotes } from '@/components/TourQuotes';
import { tripCategoryName, tripCategoryPhoto } from '@/lib/categories';
import { statusTag } from '@/lib/driverNote';
import './trips-corp.css';
import { useSeo } from '@/lib/seo';
import { useAuth } from '@/state/Auth';
import { useBooking } from '@/state/Booking';
import { CancelDialog } from './ride/dialogs';

import { msg, useT } from '@/i18n';

const TABS: TripTab[] = ['Upcoming', 'Completed', 'Cancelled'];
const PAGE = 12;

const EMPTY: Record<TripTab, { title: string; text: string }> = {
  Upcoming: { title: msg('No upcoming bookings'), text: msg('New reservations appear here with their live status.') },
  Completed: { title: msg('No completed journeys'), text: msg('Completed journeys and invoices will be listed here.') },
  Cancelled: { title: msg('No cancelled bookings'), text: msg('Cancelled or declined reservations will be listed here.') },
};

/** The rider's boarding code for an open booking, once the booking has one (only the rider can read it). */
function BoardingOtp({ id }: { id: string }) {
  const [otp, setOtp] = useState<string | null>(null);
  const t = useT();
  useEffect(() => subscribeToBoardingOtp(id, setOtp), [id]);
  if (!otp) return null;
  return (
    <div className="bk__otp">
      <span>
        <strong>{t('Boarding OTP')}</strong>
        <small>{t('Share only after you board the cab')}</small>
      </span>
      <b className="num" aria-label={`${t('Boarding OTP')} ${otp.split('').join(' ')}`}>
        {otp}
      </b>
    </div>
  );
}

/** Corporate wording for what is still to be paid. */
const SETTLEMENT: Record<string, string> = { 'Pay at drop': 'Payable at drop', 'Pay by UPI': 'Payable via UPI' };

/** One booking, one card: date and status on top, the route, then vehicle and fare. The card opens the booking;
 *  the actions sit on their own line underneath. */
function TripRow({ trip, onCancel }: { trip: TripRecord; onCancel: (t: TripRecord) => void }) {
  const navigate = useNavigate();
  const t = useT();
  const { startFrom, categories } = useBooking();
  const chip = tripStatusChip(trip);
  const tag = statusTag(trip);
  const pay = paymentLabel(trip);
  const when = trip.scheduledAt ?? trip.completedAt ?? trip.cancelledAt ?? trip.createdAt;
  const canCancel = trip.status !== 'Ongoing' && ['Pending', 'Approved', 'Confirmed', 'Assigned'].includes(trip.status) && cancellationQuote(trip).allowed;
  const total = trip.status === 'Completed' ? (trip.fareBreakdown?.total ?? trip.fare) + trip.tollCharges + (trip.extraCharges ?? 0) : trip.status === 'Cancelled' || trip.status === 'Rejected' ? trip.cancellationFee : trip.fare;
  const unrated = trip.status === 'Completed' && trip.rating == null;
  const canRebook = trip.status === 'Completed' && isValidLatLng(trip.pickup) && isValidLatLng(trip.drop);
  const drop = trip.drop.id === 'place-local-disposal' ? t('Within the city') : trip.drop.name;

  return (
    <li className="bk">
      <Link className="bk__link" to={`/trips/${trip.id}`} aria-label={t('Booking from {from} to {to}, {status}', { from: trip.pickup.name, to: drop, status: t(tag) })}>
        <span className="bk__top">
          <span className="bk__when">{when ? `${formatDate(when)} · ${formatTime(when)}` : trip.date}</span>
          <span className="bk__tag" style={{ color: chip.fg, background: chip.bg }}>
            {t(tag)}
          </span>
        </span>
        <span className="bk__route">
          <span className="bk__from">{trip.pickup.name}</span>
          <span className="bk__to">{drop}</span>
        </span>
        <span className="bk__foot">
          <img className="bk__art" src={tripCategoryPhoto(categories, trip)} alt="" width={52} height={34} loading="lazy" decoding="async" />
          <span className="bk__cab">
            <strong>{tripCategoryName(categories, trip)}</strong>
            <small>{t(trip.tripType)}</small>
          </span>
          <span className="bk__fare">
            <strong className="num">{total > 0 || trip.status === 'Completed' ? formatINR(total) : ''}</strong>
            <small className={`pay-${pay.tone}`}>{t(SETTLEMENT[pay.text] ?? pay.text)}</small>
          </span>
        </span>
      </Link>
      {tabOfTrip(trip) === 'Upcoming' ? <BoardingOtp id={trip.id} /> : null}
      <div className="bk__actions">
        {canCancel ? (
          <button type="button" className="bk__act bk__act--danger" onClick={() => onCancel(trip)}>
            {t('Cancel booking')}
          </button>
        ) : null}
        {unrated ? (
          <Link className="bk__act" to={`/trips/${trip.id}`}>
            {t('Rate journey')}
          </Link>
        ) : null}
        {canRebook ? (
          <button
            type="button"
            className="bk__act"
            onClick={() => {
              startFrom(trip.pickup, trip.drop);
              navigate('/book');
            }}
          >
            {t('Rebook')}
          </button>
        ) : null}
        <Link className="bk__act bk__act--view" to={`/trips/${trip.id}`}>
          {t('View details')} <Icon name="arrow-right" size={13} />
        </Link>
      </div>
    </li>
  );
}

export function TripsPage() {
  const tr = useT();
  useSeo({ title: tr('My Trips'), noindex: true });
  const { trips, tripsLoading, tripsError, retryTrips, profile } = useCustomerData();
  const { openLoginModal } = useAuth();
  const [tab, setTab] = useState<TripTab>('Upcoming');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [cancelTrip, setCancelTrip] = useState<TripRecord | null>(null);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = trips.filter((t) => tabOfTrip(t) === tab && (!q || [t.pickup.name, t.drop.name, t.bookingId, t.categoryName].some((s) => s.toLowerCase().includes(q))));
    // Upcoming: soonest pickup first. History: newest first.
    const pickupAt = (t: TripRecord) => (t.scheduledAt ?? t.createdAt)?.getTime() ?? 0;
    const closedAt = (t: TripRecord) => (t.completedAt ?? t.cancelledAt ?? t.createdAt)?.getTime() ?? 0;
    return tab === 'Upcoming' ? list.sort((a, b) => pickupAt(a) - pickupAt(b)) : list.sort((a, b) => closedAt(b) - closedAt(a));
  }, [trips, tab, query]);

  // Signed out: after the hooks above, so they run in the same order on every render.
  if (!profile) {
    return (
      <>
        <PageHead eyebrow="Your journeys" title={tr('My trips')}>
          {tr('Track what’s coming up and find receipts for what you’ve taken.')}
        </PageHead>
        <div className="page">
          <div className="card card--center">
            <EmptyState
              art="welcome"
              title={tr('Sign in to see your trips')}
              action={
                <Button variant="primary" onClick={() => openLoginModal({ title: msg('Sign in to see trips') })}>
                  {tr('Sign in')}
                </Button>
              }
            >
              {tr('Sign in with your mobile number to view upcoming bookings, trip history and receipts.')}
            </EmptyState>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHead
        eyebrow="Your journeys"
        title={tr('My trips')}
      >
        {tr('Track what’s coming up and find receipts for what you’ve taken.')}
      </PageHead>

      <div className="page page--bookings">
        <TourQuotes brand="people_taxi" />
        <div className="toolbar">
          <div className="tabs tabs--trips" role="tablist" aria-label={tr('Trip status')}>
            {TABS.map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                className="tab"
                onClick={() => {
                  setTab(t);
                  setLimit(PAGE);
                }}
              >
                {tr(t)}
              </button>
            ))}
          </div>
          <div className="search">
            <Icon name="search" size={18} />
            <label className="sr-only" htmlFor="trip-search">
              {tr('Search trips')}
            </label>
            <input id="trip-search" type="search" placeholder={tr('Search by location or reference')} value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </div>

        {tripsError ? (
          <Notice
            tone="error"
            action={
              <Button size="sm" variant="secondary" onClick={retryTrips}>
                {tr('Try again')}
              </Button>
            }
          >
            {tr(tripsError)}
          </Notice>
        ) : null}

        <div role="tabpanel" aria-label={tr(tab)}>
          {tripsLoading ? (
            <div className="trip-list" aria-busy="true">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="skeleton" style={{ height: 84, borderRadius: 0 }} />
              ))}
            </div>
          ) : shown.length === 0 ? (
            <div className="card card--center">
              {query ? (
                <EmptyState
                  title={tr('No trips match your search')}
                  action={
                    <Button variant="secondary" onClick={() => setQuery('')}>
                      {tr('Clear search')}
                    </Button>
                  }
                >
                  {tr('Try a different place name or booking ID.')}
                </EmptyState>
              ) : (
                <EmptyState
                  art="no-trips"
                  title={EMPTY[tab].title}
                  action={
                    tab === 'Upcoming' ? (
                      <LinkButton variant="primary" to="/book">
                        {tr('Book a ride')}
                      </LinkButton>
                    ) : undefined
                  }
                >
                  {EMPTY[tab].text}
                </EmptyState>
              )}
            </div>
          ) : (
            <>
              <ul className="bk-list">
                {shown.slice(0, limit).map((t) => (
                  <TripRow key={t.id} trip={t} onCancel={setCancelTrip} />
                ))}
              </ul>
              {shown.length > limit ? (
                <div className="more">
                  <Button variant="secondary" onClick={() => setLimit((n) => n + PAGE)}>
                    {tr('Show more ({n} left)', { n: shown.length - limit })}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>

      {cancelTrip ? <CancelDialog key={cancelTrip.id} trip={cancelTrip} onClose={() => setCancelTrip(null)} /> : null}
    </>
  );
}
