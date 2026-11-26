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
