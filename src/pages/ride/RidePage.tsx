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
import { msg, useT } from '@/i18n';
import './findCab.css';

const PHASE_TITLE: Record<TripRecord['phase'], string> = {
  awaiting_review: msg('Booking under review'),
  arranging: msg('Booking approved'),
  partner_confirmed: msg('Allocation in progress'),
  driver_assigned: msg('Driver and cab assigned'),
  driver_en_route: msg('Driver on the way'),
  driver_arrived: msg('Your driver has arrived'),
  in_trip: msg('On your way'),
  completed: msg('Trip completed'),
  cancelled: msg('Ride cancelled'),
};

function titleOf(t: TripRecord): string {
  if (t.status === 'Pending') return 'Booking under review';
  if (t.status === 'Rejected') return msg('Booking not accepted');
  return PHASE_TITLE[t.phase];
}

/** The four stages shown on the progress line. */
const STAGES = [msg('Booked'), msg('Approved'), msg('Driver'), msg('Journey')] as const;
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
  awaiting_review: { title: msg('Finding your cab…'), note: (p) => `We’ve got your ride request from ${p}. Hang on while we find a cab near you.` },
  arranging: { title: msg('Finding a driver near you…'), note: (p) => `Your ride is confirmed. We’re finding the nearest driver to ${p}.` },
  partner_confirmed: { title: msg('Almost there…'), note: () => msg('A cab has been found. Your driver will be assigned in a moment.') },
};

/** One line about what happens now; never repeats what is already on the page. */
function stageNote(t: TripRecord, now: number): string {
  if (t.status === 'Pending' || t.phase === 'awaiting_review') return `Our team is reviewing your booking. ${driverNote(t, now)}`;
  if (t.phase === 'driver_assigned') return msg('Your driver and cab are confirmed for your pickup.');
  if (t.phase === 'driver_en_route') return msg('Your driver is on the way.');
  if (t.phase === 'driver_arrived') return msg('Your driver is at the pickup point.');
  if (t.phase === 'in_trip') return msg('Your trip is underway.');
  return driverNote(t, now);
}

export function RidePage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const t = useT();
  /** A message made of whole sentences (some built elsewhere with values in them), translated one sentence at a time. */
  const ts = (s: string) => s.split(/(?<=[.!?])\s+/).map((x) => t(x)).join(' ');
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

  useSeo({ title: t(trip ? titleOf(trip) : 'Your ride'), noindex: true });

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
      (e) => setLoadError(describeError(e, msg('We couldn’t load this ride.'))),
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
              {t('Try again')}
            </Button>
          }
        >
          {t(loadError)}
        </Notice>
        <p className="page__after">
          <Link className="btn btn--secondary" to="/trips">
            {t('Back to my trips')}
          </Link>
        </p>
      </div>
    );
  }
  if (vanished) {
    return (
      <div className="page">
        <Notice tone="warning">
          {t('This ride is no longer available. If you just requested it, our servers did not accept the request and nothing was charged — please try again, or contact support if it keeps happening.')}
        </Notice>
        <p className="page__after">
          <Link className="btn btn--primary" to="/book">
            {t('Back to booking')}
          </Link>
        </p>
      </div>
    );
  }
  if (!trip) return <PageLoader label={t(pending ? 'Sending your ride request…' : 'Loading your ride…')} />;

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
  const streamingNote = tracking && driverLoc && !driverFresh ? t('Driver location last updated {ago}.', { ago: timeAgo(driverLoc.updatedAt, now) }) : '';

  const doShare = async () => {
    const r = await shareText(`People Taxi ride ${trip.bookingId}`, buildTripShareText(trip, sharePoint));
    if (r === 'copied') push({ title: msg('Trip details copied'), message: msg('Paste them into a message to share.'), tone: 'success' });
  };
  const bookAgain = () => {
    if (isValidLatLng(trip.pickup) && isValidLatLng(trip.drop)) startFrom(trip.pickup, trip.drop);
    navigate('/book');
  };
  const doPrint = () => {
    try {
      printReceipt(trip, profile?.name || 'Customer');
    } catch {
      setPrinting(msg('We couldn’t open the print dialog. Please try again.'));
    }
  };

  const hero =
    phase === 'driver_en_route' && tracking
      ? { big: minutesAway != null ? t('{m} min', { m: minutesAway }) : '—', small: t('until your driver arrives') }
      : phase === 'in_trip'
        ? { big: minutesAway != null ? formatDuration(minutesAway) : '—', small: t('until you reach {place}', { place: trip.drop.name }) }
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
  /** "cab" becomes "auto" / "bike" for those rides, then the line is translated. */
  const fk = (s: string) => t(forKind(s, kind));
  const findCard = waiting ? (
    <section className={`find-cab ${rideNow ? '' : 'find-cab--scheduled'}`} aria-live="polite" aria-label={rideNow ? fk('Finding your cab') : t('Ride scheduled')}>
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
      <h2>{pending ? t('Sending your ride request…') : rideNow ? fk(findCopy?.title ?? 'Finding your cab…') : t('Ride scheduled')}</h2>
      <p>
        {rideNow
          ? fk(findCopy ? findCopy.note(trip.pickup.name) : 'Hang on while we find a cab near you.')
          : t('Pickup {when} from {place}. Your driver’s details will appear here once a driver accepts.', { when: scheduledFor, place: trip.pickup.name })}
      </p>
      <ol className="find-cab__steps">
        <li className="is-done">{t(rideNow ? 'Ride requested' : 'Ride booked')}</li>
        <li className={trip.status === 'Pending' ? 'is-now' : 'is-done'}>{rideNow ? fk('Finding a cab') : t('Confirming')}</li>
        <li className={trip.status === 'Pending' ? '' : 'is-now'}>{t('Driver accepts')}</li>
      </ol>
      {canCancel ? (
        <Button variant="secondary" size="sm" onClick={() => setShowCancel(true)}>
          {t('Cancel ride')}
        </Button>
      ) : null}
    </section>
  ) : null;

  const mapCard = hasMap ? (
    <section className="rcard rcard--map" aria-label={t('Route map')}>
      <div className="rmap">
        <RouteMap
          label={t('Ride map')}
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
      <summary>{t(trip.notes ? 'Addresses and instructions' : 'Addresses')}</summary>
      <div>
        <RoutePoints pickup={trip.pickup.name} drop={trip.drop.name} pickupAddress={trip.pickup.address} dropAddress={trip.drop.address} />
        <TripItinerary trip={trip} />
        {trip.notes ? <p className="rd-note">{t('Special instructions:')} {trip.notes}</p> : null}
      </div>
    </details>
  );

  // Before the trip ends the fare is on the pass already; only the ways to pay are offered here.
  const payNow =
    !closed && phase !== 'completed' && trip.status !== 'Pending' && !isPaid(trip) ? (
      <>
        {trip.paymentMethod === 'UPI' && upiLink(trip) ? (
          <a className="btn btn--secondary" href={upiLink(trip)!}>
            {t('Open UPI app')}
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
            <strong>{t('Paid {amount}', { amount: formatINR(trip.paid?.totalPaid || payableAmount(trip)) })}</strong>
            <small>{t('via {method}. Thank you!', { method: t(trip.paymentMethod) })}</small>
          </div>
        </div>
      ) : (
        <>
        <div className="pay-box">
          <div>
            <small className="eyebrow">{t(trip.paymentMethod === 'UPI' ? 'Pay by UPI' : 'Pay your driver in cash')}</small>
            <strong className="num pay-box__amount">{formatINR(due)}</strong>
            <small>
              {trip.paid && trip.paid.totalPaid > 0 ? `${t('Balance after {amount} paid.', { amount: formatINR(trip.paid.totalPaid) })} ` : ''}
              {t(phase === 'completed' ? 'Your driver confirms the payment once collected.' : 'Collected by your driver at the end of the trip. Tolls and parking, if any, are added at actuals.')}
            </small>
          </div>
          {trip.paymentMethod === 'UPI' && upiLink(trip) ? (
            <a className="btn btn--secondary btn--sm" href={upiLink(trip)!}>
              {t('Open UPI app')}
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
        <h2 id="fare-h">{t(phase === 'completed' ? 'Invoice and payment' : 'Fare summary')}</h2>
        {phase === 'completed' ? (
          <Button size="sm" variant="secondary" icon="download" onClick={doPrint}>
            {t('Save or print')}
          </Button>
        ) : null}
      </header>
      {phase !== 'completed' ? (
        <p className="fare-total">
          <span>{t(closed ? 'Booking fare' : 'Total payable')}</span>
          <strong className="num">{formatINR(total)}</strong>
        </p>
      ) : null}
      <dl className="facts">
        <div>
          <dt>{t('Settlement mode')}</dt>
          <dd>{t(trip.paymentMethod)}</dd>
        </div>
        <div>
          <dt>{t('Payment status')}</dt>
          <dd>{t(paymentState)}</dd>
        </div>
      </dl>
      {moneyBox}
      {phase === 'completed' ? (
        <>
          {printing ? <Notice tone="error">{t(printing)}</Notice> : null}
          <FareBreakdown lines={tripFareLines(trip)} total={total} tolls={trip.tollCharges} policies={['payment', 'refund']} />
          {trip.paid && trip.paid.totalPaid > 0 ? (
            <p className="muted small">
              {t('Paid so far {paid} · Balance {due}', { paid: formatINR(trip.paid.totalPaid), due: formatINR(trip.paid.balanceDue) })}
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );

  const actions = (
    <section className="rcard rcard--actions" aria-labelledby="actions-h">
      <header>
        <h2 id="actions-h">{t('Assistance')}</h2>
      </header>
      {finished ? (
        <Button size="lg" block onClick={bookAgain}>
          {t(phase === 'completed' ? 'Rebook this journey' : 'Book another journey')}
        </Button>
      ) : null}
      {/* One list: icon, label, arrow; Call support shows the number. Cancel sits apart, under the list, in red. */}
      <ul className="assist">
        {!finished ? (
          <li>
            <button type="button" className="assist__row" onClick={() => void doShare()}>
              <span className="assist__icon" aria-hidden="true"><Icon name="share" size={17} /></span>
              <span className="assist__label">{t('Share itinerary')}</span>
              <Icon name="chevron-right" size={16} />
            </button>
          </li>
        ) : null}
        <li>
          <Link className="assist__row" to={`/support?booking=${encodeURIComponent(trip.bookingId)}`}>
            <span className="assist__icon" aria-hidden="true"><Icon name="support" size={17} /></span>
            <span className="assist__label">{t('Get support')}</span>
            <Icon name="chevron-right" size={16} />
          </Link>
        </li>
        <li>
          <a className="assist__row" href={`tel:${SUPPORT_PHONE}`}>
            <span className="assist__icon" aria-hidden="true"><Icon name="phone" size={17} /></span>
            <span className="assist__label">{t('Call support')}</span>
            <span className="assist__value num">{SUPPORT_PHONE_DISPLAY}</span>
            <Icon name="chevron-right" size={16} />
          </a>
        </li>
        {tracking ? (
          <li>
            <button type="button" className="assist__row is-danger" onClick={() => setShowSafety(true)}>
              <span className="assist__icon" aria-hidden="true"><Icon name="emergency" size={17} /></span>
              <span className="assist__label">{t('Safety centre · SOS')}</span>
              <Icon name="chevron-right" size={16} />
            </button>
          </li>
        ) : null}
      </ul>
      {canCancel ? (
        <button type="button" className="assist__cancel" onClick={() => setShowCancel(true)}>
          <Icon name="cancellation" size={16} /> {t('Cancel booking')}
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
    const firstName = trip.driver?.name.split(' ')[0] || t('Your driver');
    const driverLine =
      phase === 'driver_assigned' ? t('{name} accepted your ride', { name: firstName })
      : phase === 'driver_en_route' ? (minutesAway != null ? t('{name} is {m} min away', { name: firstName, m: minutesAway }) : t('{name} is on the way', { name: firstName }))
      : phase === 'driver_arrived' ? t('{name} has arrived at your pickup', { name: firstName })
      : minutesAway != null ? t('{time} to {place}', { time: formatDuration(minutesAway), place: trip.drop.name }) : t('On your way');

    return (
      <div className="page ride ride--corp ride--local">
        <header className={`ride-head${headStuck ? ' is-stuck' : ''}`} ref={headRef}>
          <div className="ride-head__bar">
            <IconButton icon="arrow-left" label={t('Back')} outline onClick={() => ((window.history.state as { idx?: number } | null)?.idx ? navigate(-1) : navigate('/trips'))} />
            <h1>{t('Your ride')}</h1>
            <span className="ride-head__spacer" aria-hidden="true" />
          </div>
        </header>

        <div className="lride">
          {findCard}

          {withDriver && trip.driver ? (
            <section className="lride-card lride-driver" aria-label={t('Your driver')}>
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
                    <strong>{t('Ride OTP')}</strong>
                    <small>{t(phase === 'driver_arrived' ? 'Share it with your driver to start the ride.' : 'Share it with your driver after you board.')}</small>
                  </span>
                  <span className="lride-otp__code num" aria-label={`${t('Ride OTP')} ${otp ? otp.split('').join(' ') : t('not available yet')}`}>{otp ?? '····'}</span>
                </div>
              ) : null}
              {driverPhone && phase !== 'in_trip' ? (
                <div className="lride-driver__actions">
                  <a className="btn btn--primary btn--sm" href={`tel:+91${driverPhone}`}>
                    <Icon name="phone" /> {t('Call')}
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
              <strong>{t(trip.status === 'Rejected' ? 'This ride was not accepted.' : trip.cancelledBy === 'customer' ? 'You cancelled this ride.' : 'This ride was cancelled.')}</strong>{' '}
              {trip.cancellationFee > 0 ? t('A cancellation fee of {amount} applies.', { amount: formatINR(trip.cancellationFee) }) : t('No cancellation fee was charged.')}
              {trip.refund && trip.refund.amount > 0 ? ` ${t('Refund {status}: {amount}', { status: t(trip.refund.status.toLowerCase()), amount: formatINR(trip.refund.amount) })}.` : ''}
            </Notice>
          ) : null}

          {phase === 'completed' ? (
            <>
              <section className="lride-card lride-done">
                <Icon name="check-circle" size={28} />
                <div>
                  <h2>{rental ? t('You’ve arrived') : t('You’ve arrived at {place}', { place: trip.drop.name })}</h2>
                  <p className="muted small">{formatDateTime(trip.completedAt)}</p>
                </div>
              </section>
              {profile ? <RatingCard trip={trip} profile={profile} /> : null}
            </>
          ) : null}

          {/* The trip: where, when, which cab, what to pay. */}
          <section className="lride-card lride-trip" aria-label={t('Trip details')}>
            <div className="lride-trip__head">
              <span className="lride-trip__tag">{t(chipLabel)}</span>
              <span className="lride-trip__ref num">{trip.bookingId}</span>
            </div>
            <ol className="lride-trip__route">
              <li>
                <i className="lride-dot lride-dot--from" aria-hidden="true" />
                <span><small>{t('Pickup')}{scheduledFor ? ` · ${scheduledFor}` : ''}</small><strong>{trip.pickup.name}</strong></span>
              </li>
              <li>
                <i className="lride-dot lride-dot--to" aria-hidden="true" />
                <span><small>{t(rental ? 'Hourly rental' : 'Drop')}</small><strong>{rental ? t('Within the city') : trip.drop.name}</strong></span>
              </li>
            </ol>
            <dl className="lride-trip__facts">
              <div><dt>{t('Cab')}</dt><dd>{tripCategoryName(categories, trip)}</dd></div>
              <div><dt>{t('Fare')}</dt><dd className="num">{formatINR(total)}</dd></div>
              <div><dt>{t('Payment')}</dt><dd>{t(closed || isPaid(trip) ? paymentState : trip.paymentMethod === 'UPI' ? 'UPI to driver' : 'Cash to driver')}</dd></div>
            </dl>
          </section>

          {mapCard}

          {phase === 'completed' ? fareCard : null}

          {/* Help, in one quiet row. Cancel sits on the "finding" card while it shows, otherwise as a link under the row. */}
          <nav className="lride-help" aria-label={t('Help')}>
            {!finished ? (
              <button type="button" onClick={() => void doShare()}>
                <Icon name="share" size={18} /> <span>{t('Share')}</span>
              </button>
            ) : null}
            <Link to={`/support?booking=${encodeURIComponent(trip.bookingId)}`}>
              <Icon name="support" size={18} /> <span>{t('Support')}</span>
            </Link>
            <a href={`tel:${SUPPORT_PHONE}`}>
              <Icon name="phone" size={18} /> <span>{t('Call us')}</span>
            </a>
            {tracking ? (
              <button type="button" className="is-danger" onClick={() => setShowSafety(true)}>
                <Icon name="emergency" size={18} /> <span>SOS</span>
              </button>
            ) : null}
          </nav>
          {canCancel && !waiting ? (
            <button type="button" className="lride-cancel" onClick={() => setShowCancel(true)}>
              {t('Cancel ride')}
            </button>
          ) : null}
          {finished ? (
            <Button size="lg" block onClick={() => navigate(`/local-rentals?mode=${rental ? 'hourly' : 'pickup'}`)}>
              {t(phase === 'completed' ? 'Book another ride' : 'Book a new ride')}
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
          <IconButton icon="arrow-left" label={t('Back')} outline onClick={() => ((window.history.state as { idx?: number } | null)?.idx ? navigate(-1) : navigate('/trips'))} />
          <h1>{t('Booking details')}</h1>
          <span className="ride-head__spacer" aria-hidden="true" />
        </div>
      </header>

      <div className="ride__grid">
        <div className="ride__main">
          {/* The booking at a glance: status, reference, route, and the trip facts on the stub */}
          <div className="dn">
            <section className={`dn-card${closed ? ' dn-card--bad' : ''}`} aria-label={t('Booking summary')}>
              <div className="dn-card__top">
                <div className="dn-card__head">
                  <img src="/brand/peopletaxi-transparent.webp" alt="People Taxi" width={92} height={30} />
                  <span className="dn-card__tag">{t(chipLabel)}</span>
                </div>
                <p className="dn-card__ref">
                  <small>{t('Booking reference')}</small>
                  <strong className="num">{trip.bookingId}</strong>
                  {pending ? <small>{t('Sending…')}</small> : fromCache && !online ? <small>{t('Offline')}</small> : null}
                </p>
                <div className="dn-card__route">
                  <p>
                    <small>{t('From')}</small>
                    <strong>{trip.pickup.name}</strong>
                  </p>
                  <span className="dn-card__line" aria-hidden="true">
                    <span>
                      <Icon name="car" size={15} />
                    </span>
                  </span>
                  <p>
                    <small>{t('To')}</small>
                    <strong>{trip.drop.id === 'place-local-disposal' ? t('Within the city') : trip.drop.name}</strong>
                  </p>
                </div>
              </div>
              <dl className="dn-card__stub">
                <div>
                  <dt>{t('Pickup')}</dt>
                  <dd className="num">{trip.scheduledAt ? `${formatDate(trip.scheduledAt)}, ${formatTime(trip.scheduledAt)}` : '—'}</dd>
                </div>
                <div>
                  <dt>{t('Vehicle')}</dt>
                  <dd>{tripCategoryName(categories, trip)}</dd>
                </div>
                <div>
                  <dt>{t('Service')}</dt>
                  <dd>
                    {t(trip.tripType)}
                    {trip.distanceKm ? ` · ${formatDistance(trip.distanceKm)}` : ''}
                  </dd>
                </div>
                <div>
                  <dt>{t(closed ? 'Booking fare' : 'Total payable')}</dt>
                  <dd className="num">{formatINR(total)}</dd>
                  <dd className="rd-pay">{closed || isPaid(trip) ? t(paymentState) : trip.paid && trip.paid.totalPaid > 0 ? t('Balance {amount}', { amount: formatINR(due) }) : t(trip.paymentMethod === 'UPI' ? 'UPI to driver' : 'Cash to driver')}</dd>
                </div>
              </dl>
            </section>

            {!closed && phase !== 'completed' ? (
              <section className="rd-status" aria-label={t('Trip status')}>
                <ol>
                  {STAGES.map((label, i) => (
                    <li key={label} className={i < stagesDone(trip) ? 'is-done' : i === stagesDone(trip) ? 'is-now' : ''} aria-current={i === stagesDone(trip) ? 'step' : undefined}>
                      {t(label)}
                    </li>
                  ))}
                </ol>
                <p>{pending ? t('Sending your request…') : ts(stageNote(trip, now))}</p>
                {!isPaid(trip) ? <small>{t('Tolls and parking, if any, are billed at actuals.')}</small> : null}
              </section>
            ) : null}
          </div>

          {/* Live: ETA, code, driver */}
          {tracking && hero ? (
            <div className="eta">
              <span className="eta__big num">{hero.big}</span>
              <span className="eta__small">{hero.small}</span>
              {phase === 'driver_en_route' && straightKm != null && !eta ? <span className="eta__small">{t('Driver is {km} from your pickup.', { km: formatDistance(straightKm) })}</span> : null}
            </div>
          ) : null}
          {streamingNote ? <p className="muted small">{streamingNote}</p> : null}
          {tracking && !driverLoc ? <p className="muted small">{t('Live location appears once your driver’s app shares it.')}</p> : null}

          {((phase === 'driver_assigned' || phase === 'driver_en_route' || phase === 'driver_arrived') && trip.driver) || (otp && !closed && phase !== 'completed' && phase !== 'in_trip') ? (
            <div className={`otp-card ${phase === 'driver_arrived' ? 'is-arrived' : ''}`}>
              <div>
                <strong>{t(phase === 'driver_arrived' ? 'Share your boarding OTP to start' : 'Boarding OTP')}</strong>
                <small>
                  {phase === 'driver_arrived' ? t('Meet your driver at {place}. Only share the code once you’re in the car.', { place: trip.pickup.name }) : t('Share it with your driver only after you board the cab.')}
                </small>
              </div>
              <span className="otp-card__code num" aria-label={`${t('Ride code')} ${otp ? otp.split('').join(' ') : t('unavailable')}`}>
                {otp ?? '····'}
              </span>
            </div>
          ) : null}

          {showDriver && trip.driver ? (
            <section className="driver-card" aria-label={t('Your driver')}>
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
                    <Icon name="phone" /> {t('Call {name}', { name: trip.driver.name.split(' ')[0] || t('driver') })}
                  </a>
                  <a className="btn btn--secondary btn--sm" href={`https://wa.me/91${driverPhone}`} target="_blank" rel="noopener noreferrer">
                    <Icon name="chat" /> WhatsApp
                  </a>
                  <p className="muted small driver-actions__note">{t('Calls go to {phone}.', { phone: formatPhone(driverPhone) })}</p>
                </div>
              ) : (
                <div className="driver-actions">
                  <Badge>{t('No phone number on file for this driver')}</Badge>
                </div>
              )}
            </section>
          ) : null}

          {/* Cancelled */}
          {phase === 'cancelled' ? (
            <Notice tone={trip.cancellationFee > 0 ? 'warning' : 'info'}>
              <strong>
                {t(trip.status === 'Rejected' ? 'This booking was not accepted' : trip.cancelledBy === 'customer' ? 'You cancelled this ride' : 'This ride was cancelled')}
                {trip.cancelReason ? ` — “${trip.cancelReason}”` : ''}.
              </strong>{' '}
              {trip.cancellationFee > 0 ? t('A cancellation fee of {amount} applies per our policy.', { amount: formatINR(trip.cancellationFee) }) : t('No cancellation fee was charged.')}
              {trip.refund && trip.refund.amount > 0 ? ` ${t('Refund {status}: {amount}', { status: t(trip.refund.status.toLowerCase()), amount: formatINR(trip.refund.amount) })}.` : ''}
              {trip.cancellationFee > 0 || (trip.refund && trip.refund.amount > 0) ? (
                <>
                  {' '}
                  <Link to="/legal#refund">{t('Refund Policy')}</Link>
                </>
              ) : null}
            </Notice>
          ) : null}

          {phase === 'completed' ? (
            <>
              <section className="done-card">
                <img src="/art/trip-completed.webp" alt="" width={120} height={120} />
                <div>
                  <h2>{t('You’ve arrived at {place}', { place: trip.drop.name })}</h2>
                  <p className="muted">{formatDateTime(trip.completedAt)}</p>
                </div>
              </section>
              {profile ? <RatingCard trip={trip} profile={profile} /> : null}
            </>
          ) : null}

          {mapCard}
          {details}
        </div>

        <aside className="ride__side" aria-label={t('Fare, payment and actions')}>
          {phase === 'completed' ? fareCard : payNow}
          {actions}
        </aside>
      </div>

      {showCancel ? <CancelDialog trip={trip} onClose={() => setShowCancel(false)} /> : null}
      {showSafety && profile ? <SafetyDialog trip={trip} profile={profile} location={sharePoint} onClose={() => setShowSafety(false)} /> : null}
    </div>
  );
}
