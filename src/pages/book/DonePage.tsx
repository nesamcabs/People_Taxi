// Confirmation page after a booking request is saved.
// Shows the journey art, a printable ticket card with trip id, route, schedule and live status.
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useCustomerData } from '@/state/customer';
import { formatDate, formatPhone, formatTime, localMobile } from '@core/utils/format';
import { Avatar, Button, PageLoader } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { useBooking } from '@/state/Booking';
import type { TripRecord, TripType } from '@core/types';
import { BookingConfirmedOverlay } from '@/components/BookingConfirmedOverlay';
import { PayOnline } from '@/components/PayOnline';
import { driverNote } from '@/lib/driverNote';
import { tripCategoryName } from '@/lib/categories';
import './done.css';

import { msg, useT } from '@/i18n';

const BRAND_LOGO = { src: '/brand/peopletaxi-transparent.webp', alt: 'People Taxi' };

const tripTypeLabel = (t: TripType): string => {
  if (t === 'One Way') return msg('One Way Drop');
  if (t === 'Round Trip') return msg('Round Trip');
  if (t === 'Local Rental') return msg('Hourly Rental');
  return msg('Airport Taxi');
};

const headline = (t: TripRecord): { title: string; text: string; tone: 'pending' | 'ok' | 'bad' } => {
  if (t.status === 'Cancelled' || t.status === 'Rejected') {
    return {
      title: msg('Booking request cancelled'),
      text: t.cancelReason || msg('This booking has been cancelled.'),
      tone: 'bad',
    };
  }
  if (t.status === 'Approved' || t.status === 'Assigned') {
    return {
      title: msg('Your ride is confirmed'),
      text: msg('Our driver will arrive at your pickup location on time.'),
      tone: 'ok',
    };
  }
  return {
    title: msg('Booking confirmed'),
    text: msg('Your booking is confirmed. We will share the driver details before pickup.'),
    tone: 'pending',
  };
};

const bookingRef = (t: TripRecord) => t.bookingId || `#${t.id.slice(-6).toUpperCase()}`;

export function DonePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const t = useT();
  const location = useLocation();
  // What the review page handed over: a snapshot, because this page clears the router state once it has been read. When the rider chose
  // "Pay online now", the booking is confirmed only after the payment is complete.
  const [handover] = useState(() => (location.state as { confirmed?: boolean; online?: boolean; payment?: { status: string; message: string } | null } | null) ?? {});
  const payState = handover.payment ?? null;
  const { trips } = useCustomerData();
  const trip = trips.find((t) => t.id === id);
  const { reset, categories } = useBooking();
  const [booked, setBooked] = useState(() => handover.confirmed === true && !(handover.online === true && handover.payment?.status !== 'paid'));

  // The flag is consumed: reloading or coming back to this page never shows the celebration again. Arriving straight
  // from "Confirm booking", the draft has done its job and is cleared here.
  useEffect(() => {
    if (handover.confirmed === true) {
      reset();
      navigate(location.pathname, { replace: true, state: null });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!trip) return <PageLoader label={t('Loading your booking details…')} />;

  const paidInFull = !!trip.paid && trip.paid.totalPaid > 0 && trip.paid.balanceDue < 1;
  const awaitingPayment = handover.online === true && payState?.status !== 'paid' && !paidInFull;
  const h = awaitingPayment
    ? payState?.status === 'pending'
      ? { title: msg('Confirming your payment'), text: msg('We are confirming your payment. Your booking is confirmed as soon as it is received.'), tone: 'pending' as const }
      : { title: msg('Complete your payment to confirm'), text: msg('Your booking is saved. It is confirmed once your online payment is completed.'), tone: 'pending' as const }
    : headline(trip);
  const at = trip.scheduledAt;
  const dropName = trip.drop.id === 'place-local-disposal' ? t('Within the city') : trip.drop.name;
  const cancelled = h.tone === 'bad';
  // The trip list is live, so the driver card appears here the moment a driver is assigned.
  const driver = cancelled ? null : trip.driver;
  const driverPhone = driver ? localMobile(driver.phone) : '';
  const note = t(driverNote(trip));
  const title = t(cancelled || awaitingPayment ? h.title : driver ? 'Driver assigned' : 'Booking confirmed');
  const tag = t(cancelled ? 'Cancelled' : awaitingPayment ? 'Payment pending' : 'Confirmed');

  return (
    <div className="flow-page flow-page--done">
      <div className="wrap flow-page__wrap">
        <div className="dn">
          {/* Confirmation pass: brand and status, the reference, the route; the stub holds the trip facts */}
          <section className={`dn-card dn-card--${h.tone}`} aria-label={t('Trip summary')}>
            <div className="dn-card__top">
              <div className="dn-card__head">
                <img src="/brand/peopletaxi-transparent.webp" alt="People Taxi" width={92} height={30} />
                <span className="dn-card__tag">
                  <Icon name={cancelled ? 'cross' : awaitingPayment ? 'clock' : 'check'} size={13} /> {tag}
                </span>
              </div>
              <h1>{title}</h1>
              {cancelled || awaitingPayment ? <p className="dn-card__text">{t(h.text)}</p> : null}
              <p className="dn-card__ref">
                <small>{t('Booking reference')}</small>
                <strong className="num">{bookingRef(trip)}</strong>
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
                  <strong>{dropName}</strong>
                </p>
              </div>
            </div>
            <dl className="dn-card__stub">
              <div>
                <dt>{t('Pickup date')}</dt>
                <dd>{at ? formatDate(at) : '—'}</dd>
              </div>
              <div>
                <dt>{t('Pickup time')}</dt>
                <dd className="num">{at ? formatTime(at) : '—'}</dd>
              </div>
              <div>
                <dt>{t('Vehicle class')}</dt>
                <dd>{tripCategoryName(categories, trip)}</dd>
              </div>
              <div>
                <dt>{t('Service · Settlement')}</dt>
                <dd>
                  {t(tripTypeLabel(trip.tripType))} · {t(trip.paymentMethod === 'UPI' ? 'UPI to driver' : 'Cash to driver')}
                </dd>
              </div>
            </dl>
          </section>

          {/* What happens next: booked → driver & cab → pickup */}
          {cancelled ? null : (
            <section className="dn-next" aria-label={t('Driver and cab details')}>
              <h2>{t(driver ? 'Your driver and cab' : 'What happens next')}</h2>
              <ol>
                <li className={awaitingPayment ? 'is-now' : 'is-done'}>
                  <strong>{t(awaitingPayment ? 'Payment to be completed' : 'Booking confirmed')}</strong>
                  <p>{t('Your trip is saved in My Bookings.')}</p>
                </li>
                <li className={driver ? 'is-done' : awaitingPayment ? '' : 'is-now'}>
                  <strong>{t(driver ? 'Driver and cab assigned' : 'Driver and cab allocation')}</strong>
                  <p>{note}</p>
                  {driver ? (
                    <div className="dn-driver">
                      <Avatar name={driver.name} photoUrl={driver.photoUrl} size={48} />
                      <div className="dn-driver__who">
                        <strong>{driver.name}</strong>
                        <small>
                          {driver.rating != null ? `★ ${driver.rating.toFixed(1)} · ` : ''}
                          {driver.vehicleModel || tripCategoryName(categories, trip)}
                        </small>
                      </div>
                      {driver.vehicleNumber ? <span className="dn-driver__plate">{driver.vehicleNumber}</span> : null}
                      {driverPhone ? (
                        <div className="dn-driver__actions">
                          <a href={`tel:+91${driverPhone}`}>
                            <Icon name="phone" size={15} /> {t('Call {phone}', { phone: formatPhone(driverPhone) })}
                          </a>
                          <a href={`https://wa.me/91${driverPhone}`} target="_blank" rel="noopener noreferrer">
                            <Icon name="chat" size={15} /> WhatsApp
                          </a>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </li>
                <li>
                  <strong>{t('Pickup')}</strong>
                  <p>
                    {trip.pickup.name}
                    {at ? `, ${t('{time} on {date}', { time: formatTime(at), date: formatDate(at) })}` : ''}
                  </p>
                </li>
              </ol>
            </section>
          )}

          {trip.status !== 'Cancelled' && trip.status !== 'Rejected' ? (
            <section className="dn-pay" aria-label={t('Payment')}>
              {payState ? <p className={`payon__note payon__note--${payState.status}`} role={payState.status === 'error' ? 'alert' : 'status'}>{t(payState.message)}</p> : null}
              <PayOnline trip={trip} />
            </section>
          ) : null}
        </div>
      </div>
      <div className="done-actions">
        <Button icon="home" onClick={() => navigate('/book')}>
          {t('Home')}
        </Button>
        <Link className="btn btn--secondary" to={`/trips/${trip.id}`}>
          <Icon name="arrow-right" size={15} /> {t('View Booking')}
        </Link>
      </div>
      {booked && h.tone !== 'bad' ? (
        <BookingConfirmedOverlay
          logo={BRAND_LOGO}
          code={bookingRef(trip)}
          message={note}
          trip={{ from: trip.pickup.name, to: dropName, when: at ? `${formatDate(at)} · ${formatTime(at)}` : undefined, car: tripCategoryName(categories, trip) }}
          title={t('Booking confirmed')}
          primaryLabel={t('View booking')}
          onPrimary={() => navigate(`/trips/${trip.id}`)}
          secondaryLabel={t('Done')}
          onClose={() => setBooked(false)}
        />
      ) : null}
    </div>
  );
}
export default DonePage;
