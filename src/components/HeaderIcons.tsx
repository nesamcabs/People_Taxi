import { useId } from 'react';

/** Full-colour flat icons for the phone header buttons (Help, My trips, Notifications), in the same two-tone style as the map
 *  icon on the location buttons: each shape is split into a lighter left half and a deeper right half. Fixed colours. */
type P = { size?: number };
const base = (size: number, cls: string, viewBox = '0 0 24 24') => ({ viewBox, width: size, height: size, className: `hdr-icon ${cls}`, 'aria-hidden': true, focusable: false });

/** Support: a blue headset with cushioned ear cups and a red-tipped microphone. */
export function HeadsetIcon({ size = 22 }: P) {
  return (
    <svg {...base(size, 'hdr-icon--headset')}>
      <path d="M4.6 14v-2.4a7.4 7.4 0 0 1 14.8 0V14" fill="none" stroke="#0b3a94" strokeWidth="2.1" strokeLinecap="round" />
      <rect x="2.6" y="12.4" width="4.8" height="7.2" rx="2.1" fill="#3b8bff" />
      <rect x="16.6" y="12.4" width="4.8" height="7.2" rx="2.1" fill="#1451d6" />
      <rect x="5.7" y="13.6" width="1.7" height="4.8" rx="0.85" fill="#cfe2ff" />
      <rect x="16.6" y="13.6" width="1.7" height="4.8" rx="0.85" fill="#9cc2ff" />
      <path d="M19 19.6c0 1.6-1.6 2.5-4 2.5h-1.4" fill="none" stroke="#0b3a94" strokeWidth="1.6" strokeLinecap="round" />
      <rect x="10.6" y="20.9" width="3.4" height="2.4" rx="1.2" fill="#ef4444" />
    </svg>
  );
}

/** My trips: a yellow ride ticket with notched sides, a perforated stub and a little route (green start, red drop) printed on it. */
export function TicketIcon({ size = 22 }: P) {
  return (
    <svg {...base(size, 'hdr-icon--ticket', '1.6 2.6 20.8 18.8')}>
      <path d="M2.5 6.2H15v11.6H2.5v-3.4a2.4 2.4 0 0 0 0-4.8z" fill="#fcc419" />
      <path d="M15 6.2h6.5v3.4a2.4 2.4 0 0 0 0 4.8v3.4H15z" fill="#f59f00" />
      <path d="M15 7.4v1.6M15 11.2v1.6M15 15v1.6" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M6.3 10c2.3 0 1.9 4.2 5 4.2" fill="none" stroke="#1665e8" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="6.1" cy="10" r="1.35" fill="#16a34a" />
      <circle cx="11.4" cy="14.2" r="1.35" fill="#ef4444" />
      <path d="M18.3 10.1l.6 1.3 1.4.2-1 1 .2 1.4-1.2-.7-1.2.7.2-1.4-1-1 1.4-.2z" fill="#fff" />
    </svg>
  );
}

/** Notifications: a two-tone gold bell with a darker rim and clapper. The `.hdr-icon__bell` group swings when something is unread. */
export function BellIcon({ size = 22 }: P) {
  return (
    <svg {...base(size, 'hdr-icon--bell')}>
      <g className="hdr-icon__bell">
        <path d="M12 2.6a1.5 1.5 0 0 0-1.5 1.5v.6A6.2 6.2 0 0 0 5.8 10.8v4.5L4.2 17.6H12z" fill="#fcc419" />
        <path d="M12 2.6a1.5 1.5 0 0 1 1.5 1.5v.6a6.2 6.2 0 0 1 4.7 6.1v4.5l1.6 2.3H12z" fill="#f59f00" />
        <rect x="3.4" y="16.9" width="17.2" height="2.2" rx="1.1" fill="#e67700" />
        <path d="M9.6 19.4a2.4 2.4 0 0 0 4.8 0z" fill="#b35c00" />
        <ellipse cx="9.2" cy="9.6" rx="1" ry="2.2" fill="#fff" opacity="0.45" transform="rotate(18 9.2 9.6)" />
      </g>
    </svg>
  );
}

/* ── Sticker icons for the header (Help, My bookings, Notifications) ─────────────────────────────────────────────
   One set in the app theme: the brand blue gradient (--brand-gradient) for the main shape, a dark ink outline (--ink) so
   each shape stands out clearly on the white header, white / light brand-tint details, and the brand blue (--brand) for
   accents. Drawn on a 48-unit grid so the detail stays crisp at header size.
   Gradient ids are unique per copy: the header renders a desktop copy too (hidden on phones, and first in the page), and a
   shared id would point the phone copy at that hidden gradient, which does not paint, so the shape would show empty. */
const INK = '#0c1b3d';
const BRAND = '#1665e8';
const BrandFill = ({ id }: { id: string }) => (
  <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stopColor="#2a7bff" />
    <stop offset="0.55" stopColor="#1451d6" />
    <stop offset="1" stopColor="#0d3aa8" />
  </linearGradient>
);
const TintFill = ({ id }: { id: string }) => (
  <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stopColor="#ffffff" />
    <stop offset="1" stopColor="#d6e6ff" />
  </linearGradient>
);

/** Help: a white chat bubble with three brand-blue dots, and a brand-blue phone handset in front of it. */
export function SupportChatIcon({ size = 34 }: P) {
  const uid = useId();
  const b = `${uid}sup-b`;
  const t = `${uid}sup-t`;
  return (
    <svg {...base(size, 'hdr-icon--support', '0 0 48 48')}>
      <defs>
        <BrandFill id={b} />
        <TintFill id={t} />
      </defs>
      <path d="M25 7.5h11a9.5 9.5 0 0 1 0 19h-5l-6.6 5.4.7-5.5A9.5 9.5 0 0 1 25 7.5z" fill={`url(#${t})`} stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
      <circle cx="25" cy="17" r="2.1" fill={BRAND} />
      <circle cx="30.5" cy="17" r="2.1" fill={BRAND} />
      <circle cx="36" cy="17" r="2.1" fill={BRAND} />
      <g transform="translate(-1 17) scale(1.25)">
        <path
          d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"
          fill={`url(#${b})`}
          stroke={INK}
          strokeWidth="1.76"
          strokeLinejoin="round"
        />
        <ellipse cx="5.4" cy="5.6" rx="0.9" ry="1.9" fill="#fff" opacity="0.65" transform="rotate(-24 5.4 5.6)" />
        <path d="M6.6 11.6c1.4 2.4 3.4 4.4 5.8 5.8" fill="none" stroke="#fff" strokeOpacity="0.4" strokeWidth="1.1" strokeLinecap="round" />
      </g>
    </svg>
  );
}

/** My bookings: a corporate look — a brand-blue executive sedan (side view, light glass, white trim) in front of a booking
 *  calendar with a brand-blue header band and a confirmed tick. */
export function BookingCarIcon({ size = 34 }: P) {
  const uid = useId();
  const body = `${uid}car-body`;
  const glass = `${uid}car-glass`;
  return (
    <svg {...base(size, 'hdr-icon--booking', '0 0 48 48')}>
      <defs>
        <BrandFill id={body} />
        <linearGradient id={glass} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#a9c8fb" />
        </linearGradient>
      </defs>
      <g transform="translate(0 2.5)">
        {/* Booking calendar: white card, brand-blue header band, white binder rings, brand-blue tick. */}
        <rect x="22" y="4.5" width="22" height="20" rx="3" fill="#fff" stroke={INK} strokeWidth="2.2" />
        <path d="M23.1 11.5v-4a1.9 1.9 0 0 1 1.9-1.9h16a1.9 1.9 0 0 1 1.9 1.9v4z" fill={BRAND} />
        <path d="M22 11.5h22" stroke={INK} strokeWidth="1.6" />
        <rect x="26.6" y="2" width="2.6" height="5.4" rx="1.3" fill="#fff" stroke={INK} strokeWidth="1.4" />
        <rect x="36.8" y="2" width="2.6" height="5.4" rx="1.3" fill="#fff" stroke={INK} strokeWidth="1.4" />
        <path d="M29 15.8l2.5 2.5 5-5.2" fill="none" stroke={BRAND} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {/* Executive sedan, facing right. */}
        <path
          d="M3 34v-2.6c0-1.2.8-2.2 2-2.5l6-1.3 4.4-5.2c.8-.9 1.9-1.4 3.1-1.4h10.1c1.2 0 2.3.5 3.1 1.4l4.5 5 5.6 1.2c1.3.3 2.2 1.4 2.2 2.8V34c0 1.1-.9 2-2 2h-1.8a5.2 5.2 0 0 0-10.4 0H17.2a5.2 5.2 0 0 0-10.4 0H5c-1.1 0-2-.9-2-2z"
          fill={`url(#${body})`}
          stroke={INK}
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <path d="M15.9 27l3-3.6c.3-.4.8-.6 1.3-.6H28c.5 0 1 .2 1.3.6l3.3 3.6z" fill={`url(#${glass})`} stroke={INK} strokeWidth="1.4" strokeLinejoin="round" />
        <path d="M24.4 22.8V27" stroke={INK} strokeWidth="1.8" />
        <path d="M6.5 29.7H40.5" stroke="#fff" strokeOpacity="0.6" strokeWidth="1.1" strokeLinecap="round" />
        <path d="M19.6 31.6h2.4M27.4 31.6h2.4" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" />
        <rect x="40.8" y="30.2" width="2.6" height="1.6" rx="0.8" fill="#fff6d9" />
        <rect x="3.6" y="30.4" width="1.8" height="1.6" rx="0.6" fill="#ff6b5e" />
        <circle cx="12" cy="36" r="3.9" fill={INK} />
        <circle cx="35" cy="36" r="3.9" fill={INK} />
        <circle cx="12" cy="36" r="1.6" fill="#fff" />
        <circle cx="35" cy="36" r="1.6" fill="#fff" />
      </g>
    </svg>
  );
}

/** Notifications: an upright brand-blue bell with a white band, a light clapper and brand-blue sound waves either side.
 *  The `.hdr-icon__bell` group swings when something is unread (the waves stay still). */
export function BellRingIcon({ size = 34 }: P) {
  const uid = useId();
  const body = `${uid}bell-body`;
  const t = `${uid}bell-t`;
  return (
    <svg {...base(size, 'hdr-icon--bell', '0 0 48 48')}>
      <defs>
        <BrandFill id={body} />
        <TintFill id={t} />
      </defs>
      <path d="M9.2 10.8C7.4 12.8 6.4 15.6 6.4 18.6M38.8 10.8c1.8 2 2.8 4.8 2.8 7.8" fill="none" stroke={BRAND} strokeWidth="2.8" strokeLinecap="round" />
      <g className="hdr-icon__bell">
        <circle cx="24" cy="38.2" r="3.4" fill={`url(#${t})`} stroke={INK} strokeWidth="2" />
        <circle cx="24" cy="7.6" r="2.6" fill={`url(#${body})`} stroke={INK} strokeWidth="2" />
        <path
          d="M24 9.6c-6.6 0-11 5-11 11.6v7.4l-3.2 4c-.7.9-.1 2.2 1 2.2h26.4c1.1 0 1.7-1.3 1-2.2l-3.2-4v-7.4c0-6.6-4.4-11.6-11-11.6z"
          fill={`url(#${body})`}
          stroke={INK}
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <path d="M13.8 29.4h20.4" stroke="#fff" strokeOpacity="0.75" strokeWidth="1.4" strokeLinecap="round" />
        <ellipse cx="18.6" cy="19.4" rx="1.5" ry="4.4" fill="#fff" opacity="0.5" transform="rotate(14 18.6 19.4)" />
      </g>
    </svg>
  );
}

/** Menu (opens the side drawer): three crisp left-aligned bars in ink, the middle one shorter and in the brand blue.
 *  On hover the middle bar slides out to full length (header-icons.css). */
export function MenuIcon({ size = 26 }: P) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className="menu-icon" aria-hidden="true" focusable="false" fill="none" strokeWidth="2.3" strokeLinecap="round">
      <path d="M4 6.5h16" stroke={INK} />
      <path className="menu-icon__mid" d="M4 12h10" stroke={BRAND} />
      <path d="M4 17.5h13" stroke={INK} />
    </svg>
  );
}
