import { useEffect, useId, useRef, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { playSuccessChime } from '@/lib/confirmChime';
import './bookingConfirmed.css';

// The full-screen "Booking confirmed" moment, shown right after a booking is made. A calm midnight backdrop with soft
// drifting light. A glowing ring draws itself while a small cab drives once around it; when the loop closes, the cab
// fades into the centre, a white disc with a green tick appears, a soft glow pulses out, tiny golden lights drift up
// and a gentle three-note chime plays. The headline comes into focus and a frosted ticket (booking ID, from → to,
// date and cab) slides up. With reduced motion everything is simply in place (the chime still plays once).

/** When the loop closes (ms): the tick appears and the chime plays. Matches the CSS timing. */
const LOOP_MS = 1600;
const LIGHTS = 14;

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
  /** Shown on the frosted ticket. */
  trip?: { from: string; to: string; when?: string; car?: string };
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel: string;
  onClose: () => void;
}) {
  const primary = useRef<HTMLButtonElement>(null);
  const uid = useId().replace(/:/g, '');

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

  // The chime, as the loop closes (right away when motion is reduced).
  useEffect(() => {
    const still = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const timer = window.setTimeout(playSuccessChime, still ? 150 : LOOP_MS);
    return () => window.clearTimeout(timer);
  }, []);

  return createPortal(
    <div className="bcx" role="dialog" aria-modal="true" aria-labelledby={`${uid}-title`}>
      {/* Midnight backdrop: soft drifting lights, a fine dot grid fading out from the centre, and faint gold and blue
          light trails gliding past at the top and bottom, like taxis on a road at night */}
      <div className="bcx__bg" aria-hidden="true">
        <i className="bcx__glow bcx__glow--a" />
        <i className="bcx__glow bcx__glow--b" />
        <i className="bcx__glow bcx__glow--c" />
        <i className="bcx__trail bcx__trail--1" />
        <i className="bcx__trail bcx__trail--2" />
        <i className="bcx__trail bcx__trail--3" />
        <i className="bcx__trail bcx__trail--4" />
      </div>

      <div className="bcx__stage">
        {logo ? (
          <div className="bcx__logo">
            <img src={logo.src} alt={logo.alt} height={46} />
          </div>
        ) : null}

        {/* The loop: ring + orbiting cab, then the tick */}
        <div className="bcx__loop" aria-hidden="true">
          <svg className="bcx__ring" viewBox="0 0 160 160" focusable="false">
            <defs>
              <linearGradient id={`${uid}-ring`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#60a5fa" />
                <stop offset="0.55" stopColor="#a78bfa" />
                <stop offset="1" stopColor="#fcd34d" />
              </linearGradient>
            </defs>
            <circle className="bcx__track" cx="80" cy="80" r="66" />
            <circle className="bcx__arc" cx="80" cy="80" r="66" stroke={`url(#${uid}-ring)`} pathLength="100" />
          </svg>
          <span className="bcx__orbit">
            {/* Seen from above (nose to the right), so it looks right at every point of the loop */}
            <span className="bcx__cab">
              <svg viewBox="0 0 52 26" focusable="false">
                <rect className="bcx__cab-body" x="2" y="3" width="48" height="20" rx="7" />
                <path className="bcx__cab-glass" d="M33 6.5l5.5 2.2v8.6L33 19.5z" />
                <path className="bcx__cab-glass" d="M13 6.5l-4.5 2.2v8.6l4.5 2.2z" />
                <rect className="bcx__cab-sign" x="20.5" y="10" width="8" height="6" rx="1.6" />
                <rect className="bcx__cab-lamp" x="47" y="5.5" width="2.6" height="3.6" rx="1" />
                <rect className="bcx__cab-lamp" x="47" y="16.9" width="2.6" height="3.6" rx="1" />
              </svg>
            </span>
          </span>
          <span className="bcx__pulse" />
          <span className="bcx__disc">
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="m6.2 12.6 3.8 3.8 7.8-8.6" pathLength="100" />
            </svg>
          </span>
          {Array.from({ length: LIGHTS }, (_, i) => (
            <i
              key={i}
              className="bcx__light"
              style={
                {
                  '--x': `${((i * 47) % 100) - 50}px`,
                  '--rise': `${70 + ((i * 29) % 60)}px`,
                  '--delay': `${1.6 + ((i * 13) % 10) / 14}s`,
                  '--size': `${3 + (i % 3)}px`,
                } as CSSProperties
              }
            />
          ))}
        </div>

        <h2 id={`${uid}-title`} className="bcx__title">
          {title}
        </h2>
        <p className="bcx__msg">{message}</p>

        {/* Frosted ticket */}
        <div className="bcx__card">
          {code ? (
            <div className="bcx__id">
              <small>Booking ID</small>
              <strong className="num">{code}</strong>
            </div>
          ) : null}
          {trip ? (
            <>
              <div className="bcx__trip">
                <span>
                  <small>From</small>
                  <b>{trip.from}</b>
                </span>
                <i className="bcx__trip-line" aria-hidden="true" />
                <span className="bcx__trip-to">
                  <small>To</small>
                  <b>{trip.to}</b>
                </span>
              </div>
              {trip.when || trip.car ? (
                <p className="bcx__meta">
                  {trip.when ? <span>{trip.when}</span> : null}
                  {trip.car ? <span>{trip.car}</span> : null}
                </p>
              ) : null}
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
