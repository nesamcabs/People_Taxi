// Confirmation page after a booking request is saved.
// Shows the journey art, a printable ticket card with trip id, route, schedule and live status.
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useCustomerData } from '@/state/customer';
import { formatDate, formatTime } from '@core/utils/format';
import { Button, PageLoader } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { useBooking } from '@/state/Booking';
import type { TripRecord, TripType } from '@core/types';
import { BookingConfirmedOverlay } from '@/components/BookingConfirmedOverlay';
import { PayOnline } from '@/components/PayOnline';
import './done.css';

const BRAND_LOGO = { src: '/brand/peopletaxi-logo.webp', alt: 'People Taxi' };

function JourneyArt({ done }: { done: boolean }) {
  return (
    <div className={`journey-art ${done ? 'is-done' : ''}`} aria-hidden="true">
      <div className="journey-art__track">
        <span className="journey-art__start" />
        <span className="journey-art__line" />
        <span className="journey-art__car">
          <Icon name="car" size={26} />
        </span>
      </div>
      <div className="journey-art__badge">
        <Icon name={done ? 'check' : 'clock'} size={28} />
      </div>
    </div>
  );
}

const tripTypeLabel = (t: TripType): string => {
  if (t === 'One Way') return 'One Way Drop';
  if (t === 'Round Trip') return 'Round Trip';
  if (t === 'Local Rental') return 'Hourly Rental';
  return 'Airport Taxi';
};

const headline = (t: TripRecord): { title: string; text: string; tone: 'pending' | 'ok' | 'bad' } => {
  if (t.status === 'Cancelled' || t.status === 'Rejected') {
    return {
      title: 'Booking request cancelled',
      text: t.cancelReason || 'This booking has been cancelled.',
      tone: 'bad',
    };
  }
  if (t.status === 'Approved' || t.status === 'Assigned') {
    return {
      title: 'Your ride is confirmed',
      text: 'Our driver will arrive at your pickup location on time.',
      tone: 'ok',
    };
  }
  return {
    title: 'Booking confirmed',
    text: 'Your booking is confirmed. We will share the driver details before pickup.',
    tone: 'pending',
  };
};

const bookingRef = (t: TripRecord) => t.bookingId || `#${t.id.slice(-6).toUpperCase()}`;

export function DonePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  // What the review page handed over: a snapshot, because this page clears the router state once it has been read. When the rider chose
  // "Pay online now", the booking is confirmed only after the payment is complete.
  const [handover] = useState(() => (location.state as { confirmed?: boolean; online?: boolean; payment?: { status: string; message: string } | null } | null) ?? {});
  const payState = handover.payment ?? null;
  const { trips } = useCustomerData();
  const trip = trips.find((t) => t.id === id);
  const { reset } = useBooking();
  const [booked, setBooked] = useState(() => handover.confirmed === true && !(handover.online === true && handover.payment?.status !== 'paid'));

  // The flag is consumed: reloading or coming back to this page never shows the celebration again. Arriving straight
  // from "Confirm booking", the draft has done its job and is cleared here.
  useEffect(() => {
    if (handover.confirmed === true) {
      reset();
      navigate(location.pathname, { replace: true, state: null });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!trip) return <PageLoader label="Loading your booking details…" />;

  const paidInFull = !!trip.paid && trip.paid.totalPaid > 0 && trip.paid.balanceDue < 1;
  const awaitingPayment = handover.online === true && payState?.status !== 'paid' && !paidInFull;
  const h = awaitingPayment
    ? payState?.status === 'pending'
      ? { title: 'Confirming your payment', text: 'We are confirming your payment. Your booking is confirmed as soon as it is received.', tone: 'pending' as const }
      : { title: 'Complete your payment to confirm', text: 'Your booking is saved. It is confirmed once your online payment is completed.', tone: 'pending' as const }
    : headline(trip);
  const at = trip.scheduledAt;
  const dropName = trip.drop.id === 'place-local-disposal' ? 'Within the city' : trip.drop.name;
  // The seal on the hero: a tick once the booking stands, a clock while a payment is still awaited, a cross if cancelled.
  const seal = h.tone === 'bad' ? 'circle-xmark' : awaitingPayment ? 'clock' : 'check';

  return (
    <div className="flow-page flow-page--done">
      <div className="wrap flow-page__wrap">
        <div className="dn">
          {/* Hero: corporate navy with a seal, the headline and a reassurance line */}
          <section className={`dn-hero dn-hero--${h.tone}`}>
            <span className={`dn-hero__seal dn-hero__seal--${seal}`} aria-hidden="true">
              <Icon name={seal} size={26} />
            </span>
            <h1>{h.title}</h1>
            <p className="dn-hero__text">{h.text}</p>
            <p className="dn-hero__saved">
              <Icon name="shield-check" size={14} /> Your trip is saved in My Bookings
            </p>
          </section>

          {/* Ride pass: booking ID, pickup → drop side by side, a tear line, then the trip facts and the status */}
          <section className="dn-pass" aria-label="Trip summary">
            <header className="dn-pass__head">
              <span className="dn-pass__brand">People Taxi · Ride pass</span>
              <span className="dn-pass__id">
                <small>Booking ID</small>
                <strong className="num">{bookingRef(trip)}</strong>
              </span>
            </header>

            <div className="dn-pass__route">
              <div className="dn-pass__end">
                <small>Pickup</small>
                <strong>{trip.pickup.name}</strong>
              </div>
              <div className="dn-pass__line" aria-hidden="true">
                <i />
                <span className="dn-pass__cab">
                  <Icon name="car" size={16} />
                </span>
                <i />
              </div>
              <div className="dn-pass__end dn-pass__end--to">
                <small>Drop</small>
                <strong>{dropName}</strong>
              </div>
            </div>

            <span className="dn-pass__tear" aria-hidden="true" />

            <dl className="dn-pass__facts">
              <div>
                <dt>Pickup date</dt>
                <dd>{at ? formatDate(at) : '—'}</dd>
              </div>
              <div>
                <dt>Pickup time</dt>
                <dd className="num">{at ? formatTime(at) : '—'}</dd>
              </div>
              <div>
                <dt>Cab</dt>
                <dd>{trip.categoryName}</dd>
              </div>
              <div>
                <dt>Trip · Payment</dt>
                <dd>
                  {tripTypeLabel(trip.tripType)} · {trip.paymentMethod === 'UPI' ? 'UPI to driver' : 'Cash to driver'}
                </dd>
              </div>
            </dl>

            <p className={`dn-status dn-status--${h.tone}`}>
              <Icon name={h.tone === 'ok' ? 'check' : h.tone === 'bad' ? 'circle-xmark' : 'clock'} size={15} />
              <span>
                <small>Status</small> {h.tone === 'pending' ? 'Awaiting dispatch review' : h.title}
              </span>
            </p>
          </section>

          {trip.status !== 'Cancelled' && trip.status !== 'Rejected' ? (
            <section className="dn-pay" aria-label="Payment">
              {payState ? <p className={`payon__note payon__note--${payState.status}`} role={payState.status === 'error' ? 'alert' : 'status'}>{payState.message}</p> : null}
              <PayOnline trip={trip} />
            </section>
          ) : null}
        </div>
      </div>
      <div className="done-actions">
        <Button icon="home" onClick={() => navigate('/book')}>
          Home
        </Button>
        <Link className="btn btn--secondary" to={`/trips/${trip.id}`}>
          <Icon name="arrow-right" size={15} /> View Booking
        </Link>
      </div>
      {booked && h.tone !== 'bad' ? (
        <BookingConfirmedOverlay
          logo={BRAND_LOGO}
          code={bookingRef(trip)}
          message="We will share the driver details before pickup."
          trip={{ from: trip.pickup.name, to: dropName, when: at ? `${formatDate(at)} · ${formatTime(at)}` : undefined, car: trip.categoryName }}
          primaryLabel="View booking"
          onPrimary={() => navigate(`/trips/${trip.id}`)}
          secondaryLabel="Done"
          onClose={() => setBooked(false)}
        />
      ) : null}
    </div>
  );
}
export default DonePage;
