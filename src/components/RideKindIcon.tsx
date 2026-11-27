// The vehicle on the "finding your ride" disc (drawn light, for a dark or blue background): a taxi front, an auto
// rickshaw or a bike, matching what the rider chose.
import type { RideKind } from '@/lib/rideKind';

export function RideKindIcon({ kind, size = 26 }: { kind: RideKind; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false" data-kind={kind}>
      {kind === 'bike' ? (
        <>
          <circle cx="5" cy="16.5" r="3.4" fill="none" stroke="#fff" strokeWidth="1.8" />
          <circle cx="19" cy="16.5" r="3.4" fill="none" stroke="#fff" strokeWidth="1.8" />
          <path d="M5 16.5l3.6-5h6.2l4.2 5M14.8 11.5l-3 5H5" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M8 9.6h4.2" stroke="#fcd34d" strokeWidth="2.4" strokeLinecap="round" />
          <path d="M16.9 16.4L14.2 7.2h-2" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="17.1" cy="9.4" r="1.2" fill="#fcd34d" />
        </>
      ) : kind === 'auto' ? (
        <>
          <path d="M4 17v-6.5C4 6.9 6.9 4.5 10.4 4.5h3.2c3.5 0 6.4 2.4 6.4 6V17z" fill="#fff" />
          <path d="M4 10c.3-3.4 3-5.5 6.4-5.5h3.2c3.4 0 6.1 2.1 6.4 5.5z" fill="#fcd34d" />
          <path d="M7.3 13.2l.6-2.6a.8.8 0 0 1 .8-.6h6.6a.8.8 0 0 1 .8.6l.6 2.6z" fill="#1665e8" />
          <circle cx="12" cy="15.4" r="1.1" fill="#fcd34d" />
          <path d="M5.2 17h2.6v2.2a.8.8 0 0 1-.8.8h-1a.8.8 0 0 1-.8-.8zM16.2 17h2.6v2.2a.8.8 0 0 1-.8.8h-1a.8.8 0 0 1-.8-.8zM10.7 17h2.6v2.6a.9.9 0 0 1-.9.9h-.8a.9.9 0 0 1-.9-.9z" fill="#a9c8fb" />
        </>
      ) : (
        <>
          <rect x="9.6" y="3.4" width="4.8" height="2.3" rx=".8" fill="#fcd34d" />
          <path d="M5.2 11.2l1.6-3.6a2 2 0 0 1 1.8-1.2h6.8a2 2 0 0 1 1.8 1.2l1.6 3.6a2.4 2.4 0 0 1 1.2 2.1V17a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-3.7a2.4 2.4 0 0 1 1.2-2.1z" fill="#fff" />
          <path d="M7.7 10.9l.9-2.3a.8.8 0 0 1 .7-.5h5.4a.8.8 0 0 1 .7.5l.9 2.3z" fill="#1665e8" />
          <circle cx="7.4" cy="14.3" r="1.15" fill="#fcd34d" />
          <circle cx="16.6" cy="14.3" r="1.15" fill="#fcd34d" />
          <path d="M10.2 15.1h3.6" stroke="#0c1b3d" strokeWidth="1.3" strokeLinecap="round" />
          <path d="M5.7 18v1.2a.9.9 0 0 0 .9.9h.8a.9.9 0 0 0 .9-.9V18zM15.7 18v1.2a.9.9 0 0 0 .9.9h.8a.9.9 0 0 0 .9-.9V18z" fill="#a9c8fb" />
        </>
      )}
    </svg>
  );
}
