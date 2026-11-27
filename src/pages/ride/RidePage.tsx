import { TripItinerary } from '@/shared/components/TripItinerary';
// Live ride and trip details: map, status timeline, driver and vehicle, boarding code,
// what to pay, support — then the receipt and rating once the trip is done. Everything
// shown comes from the booking document and the driver's own live location; nothing is
// estimated beyond the ETA the routing service computes from that location.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { LatLng, RouteInfo, TripRecord } from '@core/types';
import { useCustomerData } from '@core/context/CustomerData';
import { cancellationQuote, subscribeToBoardingOtp, subscribeToBooking } from '@core/services/rideService';
import { isLocalBooking } from '@core/utils/localTrip';
import { getRoute } from '@core/services/geoService';
import { PRESENCE_STALE_MS, SUPPORT_PHONE, SUPPORT_PHONE_DISPLAY } from '@core/config/constants';
import { formatDate, formatDateTime, formatDistance, formatDuration, formatINR, formatPhone, formatTime, localMobile, timeAgo } from '@core/utils/format';
import { haversineKm, isValidLatLng } from '@core/utils/geo';
import { describeError } from '@core/utils/retry';
import { paymentLabel } from '@core/utils/tripView';
import { Avatar, Badge, Button, IconButton, Notice, PageLoader } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { RoutePoints } from '@/components/RoutePoints';
import { RouteMap } from '@/components/RouteMap';
import { FareBreakdown } from '@/components/FareBreakdown';
import { tripFareLines } from '@/lib/fareLines';
import { amountDue, isPaid, payableAmount, upiLink } from '@/lib/tripMoney';
import { PayOnline } from '@/components/PayOnline';
import { buildTripShareText, shareText } from '@/lib/share';
import { printReceipt } from '@/lib/receipt';
import { useDeviceLocation, useOnline } from '@/lib/hooks';
import { useSeo } from '@/lib/seo';
import { useToasts } from '@/state/Toasts';
import { useBooking } from '@/state/Booking';
import { CancelDialog, SafetyDialog } from './dialogs';
import { RatingCard } from './Rating';
import { markRideDismissed, unmarkRideDismissed } from '@/state/rideFocus';
import { driverNote, statusTag } from '@/lib/driverNote';
import { tripCategoryName } from '@/lib/categories';
import '@/pages/book/done.css';
import { RideKindIcon } from '@/components/RideKindIcon';
import { forKind, rideKind } from '@/lib/rideKind';
import './findCab.css';

const PHASE_TITLE: Record<TripRecord['phase'], string> = {
  awaiting_review: 'Booking under review',
  arranging: 'Booking approved',
  partner_confirmed: 'Allocation in progress',
  driver_assigned: 'Driver and cab assigned',
  driver_en_route: 'Driver on the way',
  driver_arrived: 'Your driver has arrived',
  in_trip: 'On your way',
  completed: 'Trip completed',
  cancelled: 'Ride cancelled',
};

function titleOf(t: TripRecord): string {
  if (t.status === 'Pending') return 'Booking under review';
  if (t.status === 'Rejected') return 'Booking not accepted';
  return PHASE_TITLE[t.phase];
}

/** The four stages shown on the progress line. */
const STAGES = ['Booked', 'Approved', 'Driver', 'Journey'] as const;
/** How many stages are behind the booking. */
function stagesDone(t: TripRecord): number {
  if (t.status === 'Pending' || t.phase === 'awaiting_review') return 1;
  if (t.phase === 'arranging' || t.phase === 'partner_confirmed') return 2;
  if (t.phase === 'completed') return 4;
  return 3;
}
/**
 * Local Pickup & Drop or Hourly Rental (Ride now or scheduled). These get their own short, clean screen (Ola / Uber style)
 * instead of the full booking pass. Pickup & Drop is a One Way inside one city: the server's "Local" service, or (if it names
 * it differently) a short city trip.
 */
const isLocalTrip = (t: TripRecord): boolean => isLocalBooking(t);
/** Ride now: booked for the earliest pickup (within about 45 minutes of booking). While no driver has it, the radar "finding your cab" shows. */
function isRideNow(t: TripRecord): boolean {
  return isLocalTrip(t) && !!t.scheduledAt && !!t.createdAt && t.scheduledAt.getTime() - t.createdAt.getTime() <= 45 * 60 * 1000;
}
const FIND_COPY: Partial<Record<TripRecord['phase'], { title: string; note: (pickup: string) => string }>> = {
  awaiting_review: { title: 'Finding your cab…', note: (p) => `We’ve got your ride request from ${p}. Hang on while we find a cab near you.` },
  arranging: { title: 'Finding a driver near you…', note: (p) => `Your ride is confirmed. We’re finding the nearest driver to ${p}.` },
  partner_confirmed: { title: 'Almost there…', note: () => 'A cab has been found. Your driver will be assigned in a moment.' },
};

/** One line about what happens now; never repeats what is already on the page. */
function stageNote(t: TripRecord, now: number): string {
  if (t.status === 'Pending' || t.phase === 'awaiting_review') return `Our team is reviewing your booking. ${driverNote(t, now)}`;
  if (t.phase === 'driver_assigned') return 'Your driver and cab are confirmed for your pickup.';
  if (t.phase === 'driver_en_route') return 'Your driver is on the way.';
  if (t.phase === 'driver_arrived') return 'Your driver is at the pickup point.';
  if (t.phase === 'in_trip') return 'Your trip is underway.';
  return driverNote(t, now);
}

export function RidePage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { profile } = useCustomerData();
  const { startFrom, categories } = useBooking();
  const { push } = useToasts();
  const { online } = useOnline();
  const { position } = useDeviceLocation(true);

  const [trip, setTrip] = useState<TripRecord | null>(null);
  const [pending, setPending] = useState(false);
  const [fromCache, setFromCache] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [vanished, setVanished] = useState(false);
  const [subKey, setSubKey] = useState(0);
  const [otp, setOtp] = useState<string | null>(null);
  // The ETA is tagged with its target so a stale one never shows after a phase change.
  const [etaState, setEtaState] = useState<{ target: string; info: RouteInfo } | null>(null);
  const [showCancel, setShowCancel] = useState(false);
  const [showSafety, setShowSafety] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [printing, setPrinting] = useState('');
  const [tripRoute, setTripRoute] = useState<{ key: string; info: RouteInfo } | null>(null);

  useSeo({ title: trip ? titleOf(trip) : 'Your ride', noindex: true });

  // Leaving this page (back, minimise) stops it re-opening automatically.
  useEffect(() => {
    unmarkRideDismissed(id);
    return () => markRideDismissed(id);
  }, [id]);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(t);
  }, []);

  // The booking document is the source of truth for every phase.
  useEffect(() => {
    setTrip(null);
    setVanished(false);
    return subscribeToBooking(
      id,
      (s) => {
        setPending(s.pending);
        setFromCache(s.fromCache);
        if (s.trip) {
          setTrip(s.trip);
          setVanished(false);
        } else if (!s.fromCache) {
          // Gone on the server: a rejected request or a booking removed by an admin.
          setVanished(true);
          setTrip(null);
        }
      },
      (e) => setLoadError(describeError(e, 'We couldn’t load this ride.')),
    );
  }, [id, subKey]);

  // The whole pickup → destination route, for the map (same cached lookup the booking used).
  const routeKey = trip && isValidLatLng(trip.pickup) && isValidLatLng(trip.drop) ? (trip.itinerary?.length ? trip.itinerary : [trip.pickup, trip.drop]).map(p => p.lat + ',' + p.lng).join('>') : '';
  useEffect(() => {
    if (!trip || !routeKey) return undefined;
    const controller = new AbortController();
    Promise.all((trip.itinerary?.length ? trip.itinerary : [trip.pickup, trip.drop]).slice(1).map((point, index) => getRoute((trip.itinerary?.length ? trip.itinerary : [trip.pickup, trip.drop])[index], point, controller.signal))).then(legs => ({ distanceKm: legs.reduce((n, leg) => n + leg.distanceKm, 0), durationMin: legs.reduce((n, leg) => n + leg.durationMin, 0), estimated: legs.some(leg => leg.estimated), path: legs.flatMap(leg => leg.path) }))
      .then((info) => !controller.signal.aborted && setTripRoute({ key: routeKey, info }))
      .catch(() => undefined);
    return () => controller.abort();
  }, [routeKey]); // eslint-disable-line react-hooks/exhaustive-deps -- endpoints are encoded in the key

  // The boarding code lives in booking_secrets, readable only by the rider who booked.
  useEffect(() => subscribeToBoardingOtp(id, setOtp), [id]);

  const tracking = !!trip && ['driver_en_route', 'driver_arrived', 'in_trip'].includes(trip.phase);
  const driverLoc = tracking ? (trip?.driverLocation ?? null) : null;
  const driverFresh = !!driverLoc?.updatedAt && now - driverLoc.updatedAt.getTime() < PRESENCE_STALE_MS;

  // ETA: driver → pickup before the trip, driver → drop during it. Re-routed when the
  // driver has moved ~150 m or every 45 s, whichever comes first.
  const etaAnchor = useRef<{ at: number; from: LatLng | null; target: string }>({ at: 0, from: null, target: '' });
  useEffect(() => {
    if (!trip || !driverLoc) return undefined;
    const target = trip.phase === 'in_trip' ? trip.drop : trip.pickup;
    if (!isValidLatLng(target)) return undefined;
    const key = trip.phase === 'in_trip' ? 'drop' : 'pickup';
    const a = etaAnchor.current;
    const moved = a.from ? haversineKm(a.from, driverLoc) : Infinity;
    if (a.target === key && moved < 0.15 && Date.now() - a.at < 45000) return undefined;
    etaAnchor.current = { at: Date.now(), from: driverLoc, target: key };
    const controller = new AbortController();
    getRoute(driverLoc, target, controller.signal)
      .then((r) => !controller.signal.aborted && setEtaState({ target: key, info: r }))
      .catch(() => undefined);
    return () => controller.abort();
  }, [driverLoc?.lat, driverLoc?.lng, trip?.phase]); // eslint-disable-line react-hooks/exhaustive-deps -- throttled on position/phase

  const etaTarget = trip?.phase === 'in_trip' ? 'drop' : 'pickup';
  const eta = driverLoc && etaState?.target === etaTarget ? etaState.info : null;

  // The heading bar (Back + title) sticks under the site header while the page scrolls (ride-corp.css), so Back is always
  // one tap away. Once it is stuck it gets a white band and a soft shadow, to stand clear of the content passing under it.
  const headRef = useRef<HTMLElement>(null);
  const [headStuck, setHeadStuck] = useState(false);
  const hasTrip = trip != null;
  useEffect(() => {
    const el = headRef.current;
    if (!el) return undefined;
    let frame = 0;
    const check = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const stickAt = parseFloat(getComputedStyle(el).top) || 0;
        setHeadStuck(window.scrollY > 0 && el.getBoundingClientRect().top <= stickAt + 1);
      });
    };
    check();
    window.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
    };
  }, [hasTrip]);


  if (loadError && !trip) {
    return (
      <div className="page">
        <Notice
          tone="error"
          action={
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setLoadError('');
                setSubKey((k) => k + 1);
              }}
            >
              Try again
            </Button>
          }
        >
          {loadError}
        </Notice>
        <p className="page__after">
          <Link className="btn btn--secondary" to="/trips">
            Back to my trips
          </Link>
        </p>
      </div>
    );
  }
  if (vanished) {
    return (
      <div className="page">
        <Notice tone="warning">
          This ride is no longer available. If you just requested it, our servers did not accept the request and nothing was charged — please try again, or contact support if it keeps happening.
        </Notice>
        <p className="page__after">
          <Link className="btn btn--primary" to="/book">
            Back to booking
          </Link>
        </p>
      </div>
    );
  }
  if (!trip) return <PageLoader label={pending ? 'Sending your ride request…' : 'Loading your ride…'} />;

  const phase = trip.phase;
  const canCancel = cancellationQuote(trip).allowed;
  const minutesAway = eta ? Math.max(1, Math.round(eta.durationMin)) : null;
  const straightKm = driverLoc && isValidLatLng(trip.pickup) ? haversineKm(driverLoc, trip.pickup) : null;
  const sharePoint: LatLng | null = phase === 'in_trip' && driverLoc ? driverLoc : position;
  const driverPhone = trip.driver ? localMobile(trip.driver.phone) : '';
  const chipLabel = statusTag(trip);
  const finished = phase === 'completed' || phase === 'cancelled';
  const due = amountDue(trip);
  const mapPickup = phase === 'in_trip' ? null : trip.pickup;
  const streamingNote = tracking && driverLoc && !driverFresh ? `Driver location last updated ${timeAgo(driverLoc.updatedAt, now)}.` : '';

  const doShare = async () => {
    const r = await shareText(`People Taxi ride ${trip.bookingId}`, buildTripShareText(trip, sharePoint));
    if (r === 'copied') push({ title: 'Trip details copied', message: 'Paste them into a message to share.', tone: 'success' });
  };
  const bookAgain = () => {
    if (isValidLatLng(trip.pickup) && isValidLatLng(trip.drop)) startFrom(trip.pickup, trip.drop);
    navigate('/book');
  };
  const doPrint = () => {
    try {
      printReceipt(trip, profile?.name || 'Customer');
    } catch {
      setPrinting('We couldn’t open the print dialog. Please try again.');
    }
  };

  const hero =
    phase === 'driver_en_route' && tracking
      ? { big: minutesAway != null ? `${minutesAway} min` : '—', small: 'until your driver arrives' }
      : phase === 'in_trip'
        ? { big: minutesAway != null ? formatDuration(minutesAway) : '—', small: `until you reach ${trip.drop.name}` }
        : null;

  // The driver's leg is drawn over the whole trip, which stays quietly underneath.
  const legPath = tracking && eta ? eta.path : null;
  const wholePath = tripRoute?.key === routeKey ? tripRoute.info.path : null;

  const total = trip.fareBreakdown?.total ?? trip.fare;
  const arranging = phase === 'awaiting_review' || phase === 'arranging' || phase === 'partner_confirmed';
  const showDriver = !!trip.driver && (tracking || phase === 'driver_assigned');
  const closed = phase === 'cancelled' || trip.status === 'Rejected';
  const paymentState = closed ? paymentLabel(trip).text : isPaid(trip) ? 'Paid' : trip.paymentStatus;
  const hasMap = phase !== 'cancelled' && isValidLatLng(trip.pickup) && isValidLatLng(trip.drop);
  const localTrip = isLocalTrip(trip);
  const rideNow = isRideNow(trip);
  // Local / Rental with no driver yet: Ride now shows the radar ("finding your cab"); a scheduled ride shows when it is booked for.
  const waiting = localTrip && arranging && !closed;
  const findCopy = FIND_COPY[trip.status === 'Pending' ? 'awaiting_review' : phase];
  const scheduledFor = trip.scheduledAt ? `${formatDate(trip.scheduledAt)}, ${formatTime(trip.scheduledAt)}` : '';

  const kind = rideKind(trip.categoryName, tripCategoryName(categories, trip));
  const findCard = waiting ? (
    <section className={`find-cab ${rideNow ? '' : 'find-cab--scheduled'}`} aria-live="polite" aria-label={rideNow ? forKind('Finding your cab', kind) : 'Ride scheduled'}>
      {rideNow ? (
        <div className="find-cab__radar" aria-hidden="true">
          <span className="find-cab__ring" />
          <span className="find-cab__ring find-cab__ring--2" />
          <span className="find-cab__ring find-cab__ring--3" />
          <span className="find-cab__car">{kind === 'cab' ? <Icon name="car" size={26} /> : <RideKindIcon kind={kind} size={28} />}</span>
        </div>
      ) : (
        <span className="find-cab__cal" aria-hidden="true"><Icon name="calendar" size={24} /></span>
      )}
      <h2>{pending ? 'Sending your ride request…' : rideNow ? forKind(findCopy?.title ?? 'Finding your cab…', kind) : 'Ride scheduled'}</h2>
      <p>
        {rideNow
          ? forKind(findCopy ? findCopy.note(trip.pickup.name) : 'Hang on while we find a cab near you.', kind)
          : `Pickup ${scheduledFor} from ${trip.pickup.name}. Your driver’s details will appear here once a driver accepts.`}
      </p>
      <ol className="find-cab__steps">
        <li className="is-done">{rideNow ? 'Ride requested' : 'Ride booked'}</li>
        <li className={trip.status === 'Pending' ? 'is-now' : 'is-done'}>{rideNow ? forKind('Finding a cab', kind) : 'Confirming'}</li>
        <li className={trip.status === 'Pending' ? '' : 'is-now'}>Driver accepts</li>
      </ol>
      {canCancel ? (
        <Button variant="secondary" size="sm" onClick={() => setShowCancel(true)}>
          Cancel ride
        </Button>
      ) : null}
    </section>
  ) : null;

  const mapCard = hasMap ? (
    <section className="rcard rcard--map" aria-label="Route map">
      <div className="rmap">
        <RouteMap
          label="Ride map"
          pickup={mapPickup}
          drop={trip.drop}
          driver={driverLoc ? { lat: driverLoc.lat, lng: driverLoc.lng, label: trip.driver?.name, stale: !driverFresh } : null}
          userLocation={position}
          path={legPath ?? wholePath}
          basePath={legPath ? wholePath : null}
          padding={{ top: 48, right: 48, bottom: 48, left: 48 }}
        />
      </div>
    </section>
  ) : null;

  const details = (
    <details className="rd-more">
      <summary>Addresses{trip.notes ? ' and instructions' : ''}</summary>
      <div>
        <RoutePoints pickup={trip.pickup.name} drop={trip.drop.name} pickupAddress={trip.pickup.address} dropAddress={trip.drop.address} />
        <TripItinerary trip={trip} />
        {trip.notes ? <p className="rd-note">Special instructions: {trip.notes}</p> : null}
      </div>
    </details>
  );

  // Before the trip ends the fare is on the pass already; only the ways to pay are offered here.
  const payNow =
    !closed && phase !== 'completed' && trip.status !== 'Pending' && !isPaid(trip) ? (
      <>
        {trip.paymentMethod === 'UPI' && upiLink(trip) ? (
          <a className="btn btn--secondary" href={upiLink(trip)!}>
            Open UPI app
          </a>
        ) : null}
        <PayOnline trip={trip} />
      </>
    ) : null;

  const moneyBox =
    !closed && trip.status !== 'Pending' ? (
      isPaid(trip) ? (
        <div className="pay-box pay-box--paid">
          <Icon name="success" size={24} />
          <div>
            <strong>Paid {formatINR(trip.paid?.totalPaid || payableAmount(trip))}</strong>
            <small>via {trip.paymentMethod}. Thank you!</small>
          </div>
        </div>
      ) : (
        <>
        <div className="pay-box">
          <div>
            <small className="eyebrow">{trip.paymentMethod === 'UPI' ? 'Pay by UPI' : 'Pay your driver in cash'}</small>
            <strong className="num pay-box__amount">{formatINR(due)}</strong>
            <small>
              {trip.paid && trip.paid.totalPaid > 0 ? `Balance after ${formatINR(trip.paid.totalPaid)} paid. ` : ''}
              {phase === 'completed' ? 'Your driver confirms the payment once collected.' : 'Collected by your driver at the end of the trip. Tolls and parking, if any, are added at actuals.'}
            </small>
          </div>
          {trip.paymentMethod === 'UPI' && upiLink(trip) ? (
            <a className="btn btn--secondary btn--sm" href={upiLink(trip)!}>
              Open UPI app
            </a>
          ) : null}
        </div>
        <PayOnline trip={trip} />
        </>
      )
    ) : null;

  const fareCard = (
    <section className="rcard" aria-labelledby="fare-h">
      <header>
        <h2 id="fare-h">{phase === 'completed' ? 'Invoice and payment' : 'Fare summary'}</h2>
        {phase === 'completed' ? (
          <Button size="sm" variant="secondary" icon="download" onClick={doPrint}>
            Save or print
          </Button>
        ) : null}
      </header>
      {phase !== 'completed' ? (
        <p className="fare-total">
          <span>{closed ? 'Booking fare' : 'Total payable'}</span>
          <strong className="num">{formatINR(total)}</strong>
        </p>
      ) : null}
      <dl className="facts">
        <div>
          <dt>Settlement mode</dt>
          <dd>{trip.paymentMethod}</dd>
        </div>
        <div>
          <dt>Payment status</dt>
          <dd>{paymentState}</dd>
        </div>
      </dl>
      {moneyBox}
      {phase === 'completed' ? (
        <>
          {printing ? <Notice tone="error">{printing}</Notice> : null}
          <FareBreakdown lines={tripFareLines(trip)} total={total} tolls={trip.tollCharges} policies={['payment', 'refund']} />
          {trip.paid && trip.paid.totalPaid > 0 ? (
            <p className="muted small">
              Paid so far {formatINR(trip.paid.totalPaid)} · Balance {formatINR(trip.paid.balanceDue)}
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );

  const actions = (
    <section className="rcard rcard--actions" aria-labelledby="actions-h">
      <header>
        <h2 id="actions-h">Assistance</h2>
      </header>
      {finished ? (
        <Button size="lg" block onClick={bookAgain}>
          {phase === 'completed' ? 'Rebook this journey' : 'Book another journey'}
        </Button>
      ) : null}
      {/* One list: icon, label, arrow; Call support shows the number. Cancel sits apart, under the list, in red. */}
      <ul className="assist">
        {!finished ? (
          <li>
            <button type="button" className="assist__row" onClick={() => void doShare()}>
              <span className="assist__icon" aria-hidden="true"><Icon name="share" size={17} /></span>
              <span className="assist__label">Share itinerary</span>
              <Icon name="chevron-right" size={16} />
            </button>
          </li>
        ) : null}
        <li>
          <Link className="assist__row" to={`/support?booking=${encodeURIComponent(trip.bookingId)}`}>
            <span className="assist__icon" aria-hidden="true"><Icon name="support" size={17} /></span>
            <span className="assist__label">Get support</span>
            <Icon name="chevron-right" size={16} />
          </Link>
        </li>
        <li>
          <a className="assist__row" href={`tel:${SUPPORT_PHONE}`}>
            <span className="assist__icon" aria-hidden="true"><Icon name="phone" size={17} /></span>
            <span className="assist__label">Call support</span>
            <span className="assist__value num">{SUPPORT_PHONE_DISPLAY}</span>
            <Icon name="chevron-right" size={16} />
          </a>
        </li>
        {tracking ? (
          <li>
            <button type="button" className="assist__row is-danger" onClick={() => setShowSafety(true)}>
              <span className="assist__icon" aria-hidden="true"><Icon name="emergency" size={17} /></span>
              <span className="assist__label">Safety centre · SOS</span>
              <Icon name="chevron-right" size={16} />
            </button>
          </li>
        ) : null}
      </ul>
      {canCancel ? (
        <button type="button" className="assist__cancel" onClick={() => setShowCancel(true)}>
          <Icon name="cancellation" size={16} /> Cancel booking
        </button>
      ) : null}
    </section>
  );

  // ── Local / Rental: one short, clean screen (Ola / Uber style) ──
  // Status first (finding your cab, or your driver with the OTP once a driver has accepted), then the trip, the map and help.
  if (localTrip) {
    const rental = trip.tripType === 'Local Rental';
    const withDriver = !!trip.driver && (phase === 'driver_assigned' || phase === 'driver_en_route' || phase === 'driver_arrived' || phase === 'in_trip');
    // The boarding OTP only once a driver has accepted the ride, and until the ride starts.
    const showOtp = !!trip.driver && (phase === 'driver_assigned' || phase === 'driver_en_route' || phase === 'driver_arrived');
    const firstName = trip.driver?.name.split(' ')[0] || 'Your driver';
    const driverLine =
      phase === 'driver_assigned' ? `${firstName} accepted your ride`
      : phase === 'driver_en_route' ? (minutesAway != null ? `${firstName} is ${minutesAway} min away` : `${firstName} is on the way`)
      : phase === 'driver_arrived' ? `${firstName} has arrived at your pickup`
      : minutesAway != null ? `${formatDuration(minutesAway)} to ${trip.drop.name}` : 'On your way';

    return (
      <div className="page ride ride--corp ride--local">
        <header className={`ride-head${headStuck ? ' is-stuck' : ''}`} ref={headRef}>
          <div className="ride-head__bar">
            <IconButton icon="arrow-left" label="Back" outline onClick={() => ((window.history.state as { idx?: number } | null)?.idx ? navigate(-1) : navigate('/trips'))} />
            <h1>Your ride</h1>
            <span className="ride-head__spacer" aria-hidden="true" />
          </div>
        </header>

        <div className="lride">
          {findCard}

          {withDriver && trip.driver ? (
            <section className="lride-card lride-driver" aria-label="Your driver">
              <p className={`lride-driver__status ${phase === 'driver_arrived' ? 'is-arrived' : ''}`} role="status">
                <Icon name={phase === 'in_trip' ? 'navigation' : 'check-circle'} size={18} /> {driverLine}
              </p>
              <div className="lride-driver__row">
                <Avatar name={trip.driver.name} photoUrl={trip.driver.photoUrl} size={52} />
                <div className="lride-driver__who">
                  <strong>{trip.driver.name}</strong>
                  <small>
                    {trip.driver.rating != null ? `★ ${trip.driver.rating.toFixed(1)} · ` : ''}
                    {trip.driver.vehicleModel || tripCategoryName(categories, trip)}
                  </small>
                </div>
                {trip.driver.vehicleNumber ? <span className="plate">{trip.driver.vehicleNumber}</span> : null}
              </div>
              {showOtp ? (
                <div className={`lride-otp ${phase === 'driver_arrived' ? 'is-arrived' : ''}`}>
                  <span>
                    <strong>Ride OTP</strong>
                    <small>{phase === 'driver_arrived' ? 'Share it with your driver to start the ride.' : 'Share it with your driver after you board.'}</small>
                  </span>
                  <span className="lride-otp__code num" aria-label={`Ride OTP ${otp ? otp.split('').join(' ') : 'not available yet'}`}>{otp ?? '····'}</span>
                </div>
              ) : null}
              {driverPhone && phase !== 'in_trip' ? (
                <div className="lride-driver__actions">
                  <a className="btn btn--primary btn--sm" href={`tel:+91${driverPhone}`}>
                    <Icon name="phone" /> Call
                  </a>
                  <a className="btn btn--secondary btn--sm" href={`https://wa.me/91${driverPhone}`} target="_blank" rel="noopener noreferrer">
                    <Icon name="chat" /> WhatsApp
                  </a>
                </div>
              ) : null}
              {streamingNote ? <p className="muted small">{streamingNote}</p> : null}
            </section>
          ) : null}

          {phase === 'cancelled' ? (
            <Notice tone={trip.cancellationFee > 0 ? 'warning' : 'info'}>
              <strong>{trip.status === 'Rejected' ? 'This ride was not accepted' : trip.cancelledBy === 'customer' ? 'You cancelled this ride' : 'This ride was cancelled'}.</strong>{' '}
              {trip.cancellationFee > 0 ? `A cancellation fee of ${formatINR(trip.cancellationFee)} applies.` : 'No cancellation fee was charged.'}
              {trip.refund && trip.refund.amount > 0 ? ` Refund ${trip.refund.status.toLowerCase()}: ${formatINR(trip.refund.amount)}.` : ''}
            </Notice>
          ) : null}

          {phase === 'completed' ? (
            <>
              <section className="lride-card lride-done">
                <Icon name="check-circle" size={28} />
                <div>
                  <h2>You’ve arrived{rental ? '' : ` at ${trip.drop.name}`}</h2>
                  <p className="muted small">{formatDateTime(trip.completedAt)}</p>
                </div>
              </section>
              {profile ? <RatingCard trip={trip} profile={profile} /> : null}
            </>
          ) : null}

          {/* The trip: where, when, which cab, what to pay. */}
          <section className="lride-card lride-trip" aria-label="Trip details">
            <div className="lride-trip__head">
              <span className="lride-trip__tag">{chipLabel}</span>
              <span className="lride-trip__ref num">{trip.bookingId}</span>
            </div>
            <ol className="lride-trip__route">
              <li>
                <i className="lride-dot lride-dot--from" aria-hidden="true" />
                <span><small>Pickup{scheduledFor ? ` · ${scheduledFor}` : ''}</small><strong>{trip.pickup.name}</strong></span>
              </li>
              <li>
                <i className="lride-dot lride-dot--to" aria-hidden="true" />
                <span><small>{rental ? 'Hourly rental' : 'Drop'}</small><strong>{rental ? 'Within the city' : trip.drop.name}</strong></span>
              </li>
            </ol>
            <dl className="lride-trip__facts">
              <div><dt>Cab</dt><dd>{tripCategoryName(categories, trip)}</dd></div>
              <div><dt>Fare</dt><dd className="num">{formatINR(total)}</dd></div>
              <div><dt>Payment</dt><dd>{closed || isPaid(trip) ? paymentState : trip.paymentMethod === 'UPI' ? 'UPI to driver' : 'Cash to driver'}</dd></div>
            </dl>
          </section>

          {mapCard}

          {phase === 'completed' ? fareCard : null}

          {/* Help, in one quiet row. Cancel sits on the "finding" card while it shows, otherwise as a link under the row. */}
          <nav className="lride-help" aria-label="Help">
            {!finished ? (
              <button type="button" onClick={() => void doShare()}>
                <Icon name="share" size={18} /> <span>Share</span>
              </button>
            ) : null}
            <Link to={`/support?booking=${encodeURIComponent(trip.bookingId)}`}>
              <Icon name="support" size={18} /> <span>Support</span>
            </Link>
            <a href={`tel:${SUPPORT_PHONE}`}>
              <Icon name="phone" size={18} /> <span>Call us</span>
            </a>
            {tracking ? (
              <button type="button" className="is-danger" onClick={() => setShowSafety(true)}>
                <Icon name="emergency" size={18} /> <span>SOS</span>
              </button>
            ) : null}
          </nav>
          {canCancel && !waiting ? (
            <button type="button" className="lride-cancel" onClick={() => setShowCancel(true)}>
              Cancel ride
            </button>
          ) : null}
          {finished ? (
            <Button size="lg" block onClick={() => navigate(`/local-rentals?mode=${rental ? 'hourly' : 'pickup'}`)}>
              {phase === 'completed' ? 'Book another ride' : 'Book a new ride'}
            </Button>
          ) : null}
        </div>

        {showCancel ? <CancelDialog trip={trip} onClose={() => setShowCancel(false)} /> : null}
        {showSafety && profile ? <SafetyDialog trip={trip} profile={profile} location={sharePoint} onClose={() => setShowSafety(false)} /> : null}
      </div>
    );
  }

  return (
    <div className="page ride ride--corp">
      <header className={`ride-head${headStuck ? ' is-stuck' : ''}`} ref={headRef}>
        <div className="ride-head__bar">
          <IconButton icon="arrow-left" label="Back" outline onClick={() => ((window.history.state as { idx?: number } | null)?.idx ? navigate(-1) : navigate('/trips'))} />
          <h1>Booking details</h1>
          <span className="ride-head__spacer" aria-hidden="true" />
        </div>
      </header>

      <div className="ride__grid">
        <div className="ride__main">
          {/* The booking at a glance: status, reference, route, and the trip facts on the stub */}
          <div className="dn">
            <section className={`dn-card${closed ? ' dn-card--bad' : ''}`} aria-label="Booking summary">
              <div className="dn-card__top">
                <div className="dn-card__head">
                  <img src="/brand/peopletaxi-transparent.webp" alt="People Taxi" width={92} height={30} />
                  <span className="dn-card__tag">{chipLabel}</span>
                </div>
                <p className="dn-card__ref">
                  <small>Booking reference</small>
                  <strong className="num">{trip.bookingId}</strong>
                  {pending ? <small>Sending…</small> : fromCache && !online ? <small>Offline</small> : null}
                </p>
                <div className="dn-card__route">
                  <p>
                    <small>From</small>
                    <strong>{trip.pickup.name}</strong>
                  </p>
                  <span className="dn-card__line" aria-hidden="true">
                    <span>
                      <Icon name="car" size={15} />
                    </span>
                  </span>
                  <p>
                    <small>To</small>
                    <strong>{trip.drop.id === 'place-local-disposal' ? 'Within the city' : trip.drop.name}</strong>
                  </p>
                </div>
              </div>
              <dl className="dn-card__stub">
                <div>
                  <dt>Pickup</dt>
                  <dd className="num">{trip.scheduledAt ? `${formatDate(trip.scheduledAt)}, ${formatTime(trip.scheduledAt)}` : '—'}</dd>
                </div>
                <div>
                  <dt>Vehicle</dt>
                  <dd>{tripCategoryName(categories, trip)}</dd>
                </div>
                <div>
                  <dt>Service</dt>
                  <dd>
                    {trip.tripType}
                    {trip.distanceKm ? ` · ${formatDistance(trip.distanceKm)}` : ''}
                  </dd>
                </div>
                <div>
                  <dt>{closed ? 'Booking fare' : 'Total payable'}</dt>
                  <dd className="num">{formatINR(total)}</dd>
                  <dd className="rd-pay">{closed || isPaid(trip) ? paymentState : trip.paid && trip.paid.totalPaid > 0 ? `Balance ${formatINR(due)}` : `${trip.paymentMethod === 'UPI' ? 'UPI' : 'Cash'} to driver`}</dd>
                </div>
              </dl>
            </section>

            {!closed && phase !== 'completed' ? (
              <section className="rd-status" aria-label="Trip status">
                <ol>
                  {STAGES.map((label, i) => (
                    <li key={label} className={i < stagesDone(trip) ? 'is-done' : i === stagesDone(trip) ? 'is-now' : ''} aria-current={i === stagesDone(trip) ? 'step' : undefined}>
                      {label}
                    </li>
                  ))}
                </ol>
                <p>{pending ? 'Sending your request…' : stageNote(trip, now)}</p>
                {!isPaid(trip) ? <small>Tolls and parking, if any, are billed at actuals.</small> : null}
              </section>
            ) : null}
          </div>

          {/* Live: ETA, code, driver */}
          {tracking && hero ? (
            <div className="eta">
              <span className="eta__big num">{hero.big}</span>
              <span className="eta__small">{hero.small}</span>
              {phase === 'driver_en_route' && straightKm != null && !eta ? <span className="eta__small">Driver is {formatDistance(straightKm)} from your pickup.</span> : null}
            </div>
          ) : null}
          {streamingNote ? <p className="muted small">{streamingNote}</p> : null}
          {tracking && !driverLoc ? <p className="muted small">Live location appears once your driver’s app shares it.</p> : null}

          {((phase === 'driver_assigned' || phase === 'driver_en_route' || phase === 'driver_arrived') && trip.driver) || (otp && !closed && phase !== 'completed' && phase !== 'in_trip') ? (
            <div className={`otp-card ${phase === 'driver_arrived' ? 'is-arrived' : ''}`}>
              <div>
                <strong>{phase === 'driver_arrived' ? 'Share your boarding OTP to start' : 'Boarding OTP'}</strong>
                <small>
                  {phase === 'driver_arrived' ? `Meet your driver at ${trip.pickup.name}. Only share the code once you’re in the car.` : 'Share it with your driver only after you board the cab.'}
                </small>
              </div>
              <span className="otp-card__code num" aria-label={`Ride code ${otp ? otp.split('').join(' ') : 'unavailable'}`}>
                {otp ?? '····'}
              </span>
            </div>
          ) : null}

          {showDriver && trip.driver ? (
            <section className="driver-card" aria-label="Your driver">
              <Avatar name={trip.driver.name} photoUrl={trip.driver.photoUrl} size={60} />
              <div className="driver-card__text">
                <strong>{trip.driver.name}</strong>
                <small className="muted">
                  {trip.driver.rating != null ? `★ ${trip.driver.rating.toFixed(1)} · ` : ''}
                  {trip.driver.vehicleModel || tripCategoryName(categories, trip)}
                </small>
              </div>
              {trip.driver.vehicleNumber ? <span className="plate">{trip.driver.vehicleNumber}</span> : null}
              {driverPhone ? (
                <div className="driver-actions">
                  <a className="btn btn--primary btn--sm" href={`tel:+91${driverPhone}`}>
                    <Icon name="phone" /> Call {trip.driver.name.split(' ')[0] || 'driver'}
                  </a>
                  <a className="btn btn--secondary btn--sm" href={`https://wa.me/91${driverPhone}`} target="_blank" rel="noopener noreferrer">
                    <Icon name="chat" /> WhatsApp
                  </a>
                  <p className="muted small driver-actions__note">Calls go to {formatPhone(driverPhone)}.</p>
                </div>
              ) : (
                <div className="driver-actions">
                  <Badge>No phone number on file for this driver</Badge>
                </div>
              )}
            </section>
          ) : null}

          {/* Cancelled */}
          {phase === 'cancelled' ? (
            <Notice tone={trip.cancellationFee > 0 ? 'warning' : 'info'}>
              <strong>
                {trip.status === 'Rejected' ? 'This booking was not accepted' : trip.cancelledBy === 'customer' ? 'You cancelled this ride' : 'This ride was cancelled'}
                {trip.cancelReason ? ` — “${trip.cancelReason}”` : ''}.
              </strong>{' '}
              {trip.cancellationFee > 0 ? `A cancellation fee of ${formatINR(trip.cancellationFee)} applies per our policy.` : 'No cancellation fee was charged.'}
              {trip.refund && trip.refund.amount > 0 ? ` Refund ${trip.refund.status.toLowerCase()}: ${formatINR(trip.refund.amount)}.` : ''}
              {trip.cancellationFee > 0 || (trip.refund && trip.refund.amount > 0) ? (
                <>
                  {' '}
                  <Link to="/legal#refund">Refund Policy</Link>
                </>
              ) : null}
            </Notice>
          ) : null}

          {phase === 'completed' ? (
            <>
              <section className="done-card">
                <img src="/art/trip-completed.webp" alt="" width={120} height={120} />
                <div>
                  <h2>You’ve arrived at {trip.drop.name}</h2>
                  <p className="muted">{formatDateTime(trip.completedAt)}</p>
                </div>
              </section>
              {profile ? <RatingCard trip={trip} profile={profile} /> : null}
            </>
          ) : null}

          {mapCard}
          {details}
        </div>

        <aside className="ride__side" aria-label="Fare, payment and actions">
          {phase === 'completed' ? fareCard : payNow}
          {actions}
        </aside>
      </div>

      {showCancel ? <CancelDialog trip={trip} onClose={() => setShowCancel(false)} /> : null}
      {showSafety && profile ? <SafetyDialog trip={trip} profile={profile} location={sharePoint} onClose={() => setShowSafety(false)} /> : null}
    </div>
  );
}
