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

/* ── Glossy sticker icons for the phone header ─────────────────────────────────────────────────────────────────
   One set in the same style: a thick navy outline, a glossy blue body (light top-left to deep bottom-right, with a
   white shine) and warm cream accents. Drawn on a 48-unit grid so the detail stays crisp at header size. */
const NAVY = '#1b2a6b';
const BlueFill = ({ id }: { id: string }) => (
  <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stopColor="#6a96ff" />
    <stop offset="0.5" stopColor="#2a58e4" />
    <stop offset="1" stopColor="#1638a8" />
  </linearGradient>
);
const CreamFill = ({ id }: { id: string }) => (
  <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stopColor="#fffaf0" />
    <stop offset="1" stopColor="#f0e0bd" />
  </linearGradient>
);

/** Help: a cream chat bubble with three dots, and a glossy blue phone handset in front of it. */
export function SupportChatIcon({ size = 34 }: P) {
  return (
    <svg {...base(size, 'hdr-icon--support', '0 0 48 48')}>
      <defs>
        <BlueFill id="hi-sup-b" />
        <CreamFill id="hi-sup-c" />
      </defs>
      <path d="M25 7.5h11a9.5 9.5 0 0 1 0 19h-5l-6.6 5.4.7-5.5A9.5 9.5 0 0 1 25 7.5z" fill="url(#hi-sup-c)" stroke={NAVY} strokeWidth="2.2" strokeLinejoin="round" />
      <circle cx="25" cy="17" r="2" fill={NAVY} />
      <circle cx="30.5" cy="17" r="2" fill={NAVY} />
      <circle cx="36" cy="17" r="2" fill={NAVY} />
      <g transform="translate(-1 17) scale(1.25)">
        <path
          d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"
          fill="url(#hi-sup-b)"
          stroke={NAVY}
          strokeWidth="1.76"
          strokeLinejoin="round"
        />
        <ellipse cx="5.4" cy="5.6" rx="0.9" ry="1.9" fill="#fff" opacity="0.6" transform="rotate(-24 5.4 5.6)" />
        <path d="M6.6 11.6c1.4 2.4 3.4 4.4 5.8 5.8" fill="none" stroke="#fff" strokeOpacity="0.35" strokeWidth="1.1" strokeLinecap="round" />
      </g>
    </svg>
  );
}

/** My trips: a glossy blue taxi (cream roof sign) in front of a cream ride ticket with a blue tick. */
export function TaxiTicketIcon({ size = 34 }: P) {
  return (
    <svg {...base(size, 'hdr-icon--taxi', '0 0 48 48')}>
      <defs>
        <BlueFill id="hi-taxi-b" />
        <CreamFill id="hi-taxi-c" />
      </defs>
      <g transform="rotate(10 34 18)">
        <path d="M23 6h20a2 2 0 0 1 2 2v6a3 3 0 0 0 0 6v6a2 2 0 0 1-2 2H23a2 2 0 0 1-2-2v-6a3 3 0 0 0 0-6V8a2 2 0 0 1 2-2z" fill="url(#hi-taxi-c)" stroke={NAVY} strokeWidth="2.2" strokeLinejoin="round" />
        <path d="M28 17.2l3.6 3.6 7.4-8" fill="none" stroke="#2453e0" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <g transform="translate(-3 4)">
        <rect x="17.5" y="9.6" width="9" height="4.6" rx="1.6" fill="url(#hi-taxi-c)" stroke={NAVY} strokeWidth="2" />
        <rect x="8.5" y="34.5" width="6" height="5.5" rx="1.8" fill={NAVY} />
        <rect x="29.5" y="34.5" width="6" height="5.5" rx="1.8" fill={NAVY} />
        <path d="M5 34v-6.5c0-1.2.6-2.3 1.6-3l3.4-2.4 3-6.2c.6-1.2 1.8-1.9 3.1-1.9h11.8c1.3 0 2.5.7 3.1 1.9l3 6.2 3.4 2.4c1 .7 1.6 1.8 1.6 3V34c0 1.1-.9 2-2 2H7c-1.1 0-2-.9-2-2z" fill="url(#hi-taxi-b)" stroke={NAVY} strokeWidth="2.2" strokeLinejoin="round" />
        <path d="M14.5 21.5l2.2-4.6c.3-.6.9-1 1.6-1h9.4c.7 0 1.3.4 1.6 1l2.2 4.6z" fill="#dce8ff" stroke={NAVY} strokeWidth="1.8" strokeLinejoin="round" />
        <circle cx="10.6" cy="28.6" r="2.2" fill="url(#hi-taxi-c)" stroke={NAVY} strokeWidth="1.4" />
        <circle cx="33.4" cy="28.6" r="2.2" fill="url(#hi-taxi-c)" stroke={NAVY} strokeWidth="1.4" />
        <rect x="17.5" y="27.2" width="9" height="3.2" rx="1.6" fill={NAVY} />
        <path d="M9 25.2h6" stroke="#fff" strokeOpacity="0.45" strokeWidth="1.4" strokeLinecap="round" />
      </g>
    </svg>
  );
}

/** Notifications: a glossy blue bell with a coral clapper and cream "ringing" marks. The `.hdr-icon__bell` group swings
 *  when something is unread. */
export function BellRingIcon({ size = 34 }: P) {
  return (
    <svg {...base(size, 'hdr-icon--bell', '0 0 48 48')}>
      <defs>
        <BlueFill id="hi-bell-b" />
      </defs>
      <g className="hdr-icon__bell">
        <g transform="rotate(16 22 22)">
          <circle cx="22" cy="39.4" r="3.9" fill="#ff6b5e" stroke={NAVY} strokeWidth="2" />
          <path d="M22 5.5a3 3 0 0 0-3 3v1.1C13.2 11 10 16.2 10 22v7.6l-3.4 4.1c-.7.9-.1 2.2 1 2.2h28.8c1.1 0 1.7-1.3 1-2.2L34 29.6V22c0-5.8-3.2-11-9-12.4V8.5a3 3 0 0 0-3-3z" fill="url(#hi-bell-b)" stroke={NAVY} strokeWidth="2.2" strokeLinejoin="round" />
          <path d="M10.5 31.2h23" stroke="#fff" strokeOpacity="0.35" strokeWidth="1.6" strokeLinecap="round" />
          <ellipse cx="16" cy="19" rx="1.9" ry="5.4" fill="#fff" opacity="0.5" transform="rotate(16 16 19)" />
        </g>
      </g>
      <path d="M37.2 9.6l3.4-3.8M40.6 15.6l4.4-1.6" stroke={NAVY} strokeWidth="4.6" strokeLinecap="round" />
      <path d="M37.2 9.6l3.4-3.8M40.6 15.6l4.4-1.6" stroke="#f6e7c4" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
