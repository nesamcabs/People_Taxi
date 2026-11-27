import { useEffect, useId, useRef, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { playChime } from '@/lib/confirmChime';
import './bookingConfirmed.css';

// The full-screen "Booking confirmed" moment shown right after a booking is made, in the site's corporate ticket style:
// the screen fades to deep navy, a road draws from the pickup dot to the drop pin and a cab drives along it; when it
// arrives the pin turns into a green "confirmed" seal with a small burst of gold sparks and a soft two-note chime;
// the headline rises, and a ride ticket (booking ID, from → to, date and cab) slides up from below.
// With reduced motion everything simply appears, already in place.

const SPARKS = 10;
/** When the cab reaches the pin (ms): the seal appears and the chime plays. Matches the CSS timing. */
const ARRIVE_MS = 1450;

export function BookingConfirmedOverlay({
  logo,
  code,
  title = 'Booking confirmed',
  message,
  trip,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onClose,
}: {
  logo?: { src: string; alt: string };
  code?: string;
  title?: string;
  message: string;
  /** Shown on the ride ticket. */
  trip?: { from: string; to: string; when?: string; car?: string };
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel: string;
  onClose: () => void;
}) {
  const primary = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    primary.current?.focus({ preventScroll: true });
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  // The chime, at the moment the seal appears (right away when motion is reduced).
  useEffect(() => {
    const still = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const timer = window.setTimeout(playChime, still ? 150 : ARRIVE_MS);
    return () => window.clearTimeout(timer);
  }, []);

  return createPortal(
    <div className="bcx" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="bcx__bg" aria-hidden="true" />

      <div className="bcx__stage">
        {logo ? (
          <div className="bcx__logo">
            <img src={logo.src} alt={logo.alt} height={30} />
          </div>
        ) : null}

        {/* Pickup dot → road → drop pin, which becomes the confirmed seal */}
        <div className="bcx__route" aria-hidden="true">
          <span className="bcx__start" />
          <span className="bcx__road">
            <span className="bcx__road-fill" />
          </span>
          <span className="bcx__cab">
            <svg viewBox="0 0 120 52" focusable="false">
              <path className="bcx__cab-body" d="M6 36c0-4 2-6 6-7l14-3 14-14c2-2 4-3 7-3h26c4 0 7 1 9 4l11 13 12 3c4 1 6 3 6 7v4c0 2-2 4-4 4h-8a11 11 0 0 0-22 0H46a11 11 0 0 0-22 0H10c-2 0-4-2-4-4Z" />
              <path className="bcx__cab-glass" d="M40 26l9-10c1-1 2-2 4-2h22c2 0 3 1 4 2l8 10Z" />
              <circle className="bcx__cab-wheel" cx="35" cy="42" r="8.5" />
              <circle className="bcx__cab-wheel" cx="95" cy="42" r="8.5" />
              <circle className="bcx__cab-hub" cx="35" cy="42" r="3" />
              <circle className="bcx__cab-hub" cx="95" cy="42" r="3" />
            </svg>
          </span>
          <span className="bcx__goal">
            <span className="bcx__pin" />
            <span className="bcx__ring" />
            <span className="bcx__seal">
              <svg viewBox="0 0 24 24" focusable="false">
                <path d="m6.5 12.5 3.6 3.6 7.4-8" pathLength="100" />
              </svg>
            </span>
            {Array.from({ length: SPARKS }, (_, i) => (
              <i key={i} className="bcx__spark" style={{ '--a': `${(360 / SPARKS) * i}deg`, '--d': `${30 + (i % 3) * 8}px` } as CSSProperties} />
            ))}
          </span>
        </div>

        <h2 id={titleId} className="bcx__title">
          {title}
        </h2>
        <p className="bcx__msg">{message}</p>

        {/* The ride ticket */}
        <div className="bcx__ticket">
          {code ? (
            <div className="bcx__ticket-id">
              <span>Booking ID</span>
              <strong className="num">{code}</strong>
            </div>
          ) : null}
          {trip ? (
            <>
              <span className="bcx__tear" aria-hidden="true" />
              <div className="bcx__ticket-route">
                <span>
                  <small>From</small>
                  <b>{trip.from}</b>
                </span>
                <i className="bcx__ticket-arrow" aria-hidden="true" />
                <span>
                  <small>To</small>
                  <b>{trip.to}</b>
                </span>
              </div>
              {trip.when || trip.car ? <p className="bcx__ticket-meta">{[trip.when, trip.car].filter(Boolean).join(' · ')}</p> : null}
            </>
          ) : null}
        </div>
      </div>

      <div className="bcx__actions">
        <button ref={primary} type="button" className="bcx__btn bcx__btn--primary" onClick={onPrimary}>
          {primaryLabel}
        </button>
        <button type="button" className="bcx__btn bcx__btn--ghost" onClick={onClose}>
          {secondaryLabel}
        </button>
      </div>
    </div>,
    document.body,
  );
}
