/** Line icons for the side drawer (menu): one neat corporate set on a 24-unit grid, 1.8 stroke, round caps, drawn in
 *  currentColor so each row's tile sets the colour. Keys match the account rows' icon names. */
const PATHS = {
  // My bookings: a calendar with a confirmed tick.
  'trip-history': (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 9.6h17M8 3v4M16 3v4" />
      <path d="M9.2 14.6l2 2 3.8-4" />
    </>
  ),
  // Payments & refunds: a bank card.
  receipt: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
      <path d="M3 10h18M7 14.8h4" />
    </>
  ),
  // Offers & promotions: a price tag.
  offers: (
    <>
      <path d="M3.5 12.2V5A1.5 1.5 0 0 1 5 3.5h7.2l8.3 8.3a1.5 1.5 0 0 1 0 2.1l-6.6 6.6a1.5 1.5 0 0 1-2.1 0z" />
      <circle cx="8.2" cy="8.2" r="1.5" />
    </>
  ),
  // Customer support: a headset.
  support: (
    <>
      <path d="M4.5 14v-2a7.5 7.5 0 0 1 15 0v2" />
      <rect x="3" y="13" width="4" height="6" rx="1.6" />
      <rect x="17" y="13" width="4" height="6" rx="1.6" />
      <path d="M19 19c0 1.5-1.5 2.4-4 2.4h-2" />
    </>
  ),
  // About People Taxi: an office building.
  info: (
    <>
      <path d="M5 21V5a1.5 1.5 0 0 1 1.5-1.5h7A1.5 1.5 0 0 1 15 5v16M15 9.5h3.5A1.5 1.5 0 0 1 20 11v10M3 21h18" />
      <path d="M8.5 7.5h3M8.5 11h3M8.5 14.5h3M8.5 18h3" />
    </>
  ),
  // Terms & policies: a document with a folded corner.
  document: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M8.5 12.5h7M8.5 16h5" />
    </>
  ),
  // Emergency contact: a shield with a cross.
  emergency: (
    <>
      <path d="M12 3l7 2.8v5.6c0 4.4-3 8.1-7 9.6-4-1.5-7-5.2-7-9.6V5.8z" />
      <path d="M12 9v6M9 12h6" />
    </>
  ),
  // Log out: an open door frame with an arrow leaving it.
  logout: (
    <>
      <path d="M9.5 20.5H6A2 2 0 0 1 4 18.5v-13a2 2 0 0 1 2-2h3.5" />
      <path d="M15.5 16.5L20 12l-4.5-4.5M20 12H9.5" />
    </>
  ),
  // Verified badge: a tick.
  verified: <path d="M5 12.5l4.2 4.2L19 7" />,
  // Language: a globe.
  language: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.3 2.4 3.4 5.2 3.4 8.5s-1.1 6.1-3.4 8.5c-2.3-2.4-3.4-5.2-3.4-8.5S9.7 5.9 12 3.5z" />
    </>
  ),
} as const;

export type DrawerIconName = keyof typeof PATHS;
export const hasDrawerIcon = (name: string): name is DrawerIconName => name in PATHS;

export function DrawerIcon({ name, size = 20, strokeWidth = 1.8 }: { name: DrawerIconName; size?: number; strokeWidth?: number }) {
  return (
    <svg
      className="dicon"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
