import { useEffect, useState } from 'react';
import type { LatLng, TripRecord, UserProfile } from '@core/types';
import { cancelRide, cancellationQuote, raiseSos } from '@core/services/rideService';
import { getCurrentPosition } from '@core/services/geoService';
import { CANCEL_REASONS, EMERGENCY_NUMBER, SUPPORT_PHONE, SUPPORT_PHONE_DISPLAY } from '@core/config/constants';
import { formatPhone, localMobile } from '@core/utils/format';
import { describeError } from '@core/utils/retry';
import { Button, Dialog, Notice, TextArea } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { buildTripShareText, shareText } from '@/lib/share';
import { useToasts } from '@/state/Toasts';
import { PolicyLinks } from '@/pages/PolicySections';
import { msg, useT } from '@/i18n';
import './cancel.css';

/** Cancel with a reason and the live fee quote (the fee depends on elapsed time, so it ticks). */
export function CancelDialog({ trip, onClose }: { trip: TripRecord; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const [other, setOther] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [, tick] = useState(0);
  const { push } = useToasts();
  const t = useT();

  useEffect(() => {
    const timer = window.setInterval(() => tick((n) => n + 1), 15000);
    return () => window.clearInterval(timer);
  }, []);

  const quote = cancellationQuote(trip);
  const finalReason = reason === 'Other' ? other.trim() : reason;

  const confirm = async () => {
    if (!finalReason) {
      setError(msg('Please tell us why you’re cancelling.'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      await cancelRide(trip, finalReason);
      push({ title: msg('Ride cancelled'), message: quote.fee ? `A ₹${quote.fee} cancellation fee applies.` : msg('No cancellation fee was charged.'), tone: 'info' });
      onClose();
    } catch (e) {
      setError(e instanceof Error && !('code' in e) ? e.message : describeError(e, msg('We couldn’t cancel this ride. Please try again or call support.')));
    } finally {
      setBusy(false);
    }
  };

  // The line under the fee says only what the heading does not ("Free cancellation — no charge applies." → "No charge applies.").
  const stripped = quote.fee ? quote.explanation : quote.explanation.replace(/^free cancellation\s*[—–-]\s*/i, '');
  const feeNote = stripped ? stripped.charAt(0).toUpperCase() + stripped.slice(1) : '';
  // The route under the title (an hourly rental has no drop to name).
  const route = trip.tripType === 'Local Rental' || trip.drop.id === 'place-local-disposal' ? `${trip.pickup.name} · ${t('Hourly rental')}` : `${trip.pickup.name} → ${trip.drop.name}`;

  return (
    <Dialog
      title={t('Cancel this ride?')}
      subtitle={<><span className="num">{trip.bookingId}</span> · {route}</>}
      className="cx-sheet"
      onClose={onClose}
      dismissible={!busy}
      footer={
        quote.allowed ? (
          <>
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              {t('Keep ride')}
            </Button>
            <Button variant="danger" className="cx-confirm" loading={busy} disabled={!finalReason} onClick={() => void confirm()}>
              {t('Cancel ride')}
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={onClose}>
            {t('Close')}
          </Button>
        )
      }
    >
      {!quote.allowed ? (
        <p className="cx-locked">{t(quote.explanation)}</p>
      ) : (
        <div className="cx">
          {/* What cancelling costs right now, in one line (it can change as time passes, so it ticks). */}
          <div className={`cx-fee ${quote.fee ? 'is-fee' : 'is-free'}`} role="status">
            <Icon name={quote.fee ? 'alert' : 'check-circle'} size={18} />
            <span className="cx-fee__text">
              <strong>{quote.fee ? t('₹{fee} cancellation fee', { fee: quote.fee }) : t('Free cancellation')}</strong>
              {feeNote ? <small>{t(feeNote)}</small> : null}
            </span>
          </div>

          {/* Reasons: one list, equal rows, a radio on the right. */}
          <fieldset className="cx-reasons">
            <legend>{t('Why are you cancelling?')}</legend>
            <div className="cx-list">
              {CANCEL_REASONS.map((r) => (
                <label key={r} className={`cx-row ${reason === r ? 'is-on' : ''}`}>
                  <input type="radio" name="cancel-reason" className="sr-only" checked={reason === r} onChange={() => { setReason(r); setError(''); }} />
                  <span className="cx-row__label">{t(r)}</span>
                  <span className="cx-row__radio" aria-hidden="true" />
                </label>
              ))}
            </div>
          </fieldset>
          {reason === 'Other' ? <TextArea label={t('Tell us more')} value={other} onChange={(e) => setOther(e.target.value.slice(0, 200))} /> : null}
          {error ? <Notice tone="error">{t(error)}</Notice> : null}
          <div className="cx-policies">
            <PolicyLinks ids={['cancellation', 'refund']} newTab />
          </div>
        </div>
      )}
    </Dialog>
  );
}

/** Safety centre: call, text, share and alert NESAM operations. */
export function SafetyDialog({ trip, profile, location, onClose }: { trip: TripRecord; profile: UserProfile; location: LatLng | null; onClose: () => void }) {
  const [alerting, setAlerting] = useState(false);
  const [state, setState] = useState<'idle' | 'sent' | 'failed'>('idle');
  const [error, setError] = useState('');
  const { push } = useToasts();
  const emergencyLocal = localMobile(profile.emergencyContact);
  const t = useT();

  const sendAlert = async () => {
    setAlerting(true);
    setError('');
    try {
      const where = location ?? (await getCurrentPosition(8000).catch(() => null));
      await raiseSos(trip, profile, where);
      setState('sent');
    } catch (e) {
      setState('failed');
      setError(`${t(describeError(e, 'The alert could not be sent.'))} ${t('Call {number} or People Taxi support now.', { number: EMERGENCY_NUMBER })}`);
    } finally {
      setAlerting(false);
    }
  };

  const share = async () => {
    const result = await shareText(`People Taxi ride ${trip.bookingId}`, buildTripShareText(trip, location));
    if (result === 'copied') push({ title: msg('Trip details copied'), message: msg('Paste them into a message to share.'), tone: 'success' });
  };

  const sms = `sms:+91${emergencyLocal}?body=${encodeURIComponent(`EMERGENCY — I need help.\n${buildTripShareText(trip, location)}`)}`;

  return (
    <Dialog title={t('Safety centre')} onClose={onClose}>
      <div className="stack">
        <a className="btn btn--primary btn--lg btn--block" href={`tel:${EMERGENCY_NUMBER}`}>
          <Icon name="emergency" /> {t('Call emergency ({number})', { number: EMERGENCY_NUMBER })}
        </a>
        <a className="btn btn--secondary btn--block" href={`tel:${SUPPORT_PHONE}`}>
          <Icon name="phone" /> {t('Call People Taxi support ({number})', { number: SUPPORT_PHONE_DISPLAY })}
        </a>
        {emergencyLocal ? (
          <a className="btn btn--secondary btn--block" href={sms}>
            <Icon name="chat" /> {t('Text emergency contact ({number})', { number: formatPhone(emergencyLocal) })}
          </a>
        ) : null}
        <Button variant="secondary" block icon="share" onClick={() => void share()}>
          {t('Share trip details')}
        </Button>
        <div className="sos">
          <h3>{t('Alert the People Taxi safety team')}</h3>
          <p className="muted small">{t('Sends your booking, driver, vehicle and location to People Taxi operations.')}</p>
          {state === 'sent' ? <Notice tone="success">{t('Alert sent. The People Taxi team has your trip and location.')}</Notice> : null}
          {error ? <Notice tone="error">{error}</Notice> : null}
          <Button variant="dark" block loading={alerting} onClick={() => void sendAlert()}>
            {t(state === 'sent' ? 'Send again' : 'Send SOS alert')}
          </Button>
        </div>
        {trip.driver ? (
          <p className="muted small">
            {t('Your ride:')} {trip.driver.name} · {trip.driver.vehicleNumber || trip.categoryName} · {t('Booking')} {trip.bookingId}
          </p>
        ) : null}
        <PolicyLinks ids={['safety']} newTab />
      </div>
    </Dialog>
  );
}
