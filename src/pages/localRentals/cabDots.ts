// The nearby drivers drawn on the Local Rentals map: a small top-down car, auto or bike (fixed artwork, no rider data in it),
// turned to a steady angle worked out from its position so the map looks like traffic rather than a grid.
import type { NearbyDot, NearbyKind } from '@/lib/nearbyDrivers';

const SVG: Record<NearbyKind, string> = {
  cab:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 36" width="17" height="31" aria-hidden="true">' +
    '<rect x="1.5" y="1.5" width="17" height="33" rx="6" fill="#fff" stroke="#0f172a" stroke-width="1.4"/>' +
    '<path d="M4 10.5Q10 7 16 10.5L15 15Q10 13.4 5 15Z" fill="#1e293b"/>' +
    '<rect x="5" y="16.5" width="10" height="9" rx="2" fill="#dbe6f7"/>' +
    '<path d="M5 28Q10 30 15 28L15.6 31Q10 33 4.4 31Z" fill="#1e293b"/>' +
    '<rect x="3.2" y="2.6" width="3" height="1.6" rx=".8" fill="#fcd34d"/><rect x="13.8" y="2.6" width="3" height="1.6" rx=".8" fill="#fcd34d"/>' +
    '</svg>',
  auto:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 32" width="17" height="27" aria-hidden="true">' +
    '<path d="M10 1.5c4 0 7 3 7 7V28a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 3 28V8.5c0-4 3-7 7-7z" fill="#facc15" stroke="#0f172a" stroke-width="1.3"/>' +
    '<rect x="4.6" y="11" width="10.8" height="17" rx="2.5" fill="#1e293b"/>' +
    '<path d="M6 8Q10 5.5 14 8L13.5 10.5Q10 9.2 6.5 10.5Z" fill="#bfdbfe"/>' +
    '<rect x="4.6" y="25" width="10.8" height="3" fill="#16a34a"/>' +
    '</svg>',
  bike:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 30" width="11" height="27" aria-hidden="true">' +
    '<rect x="4.5" y=".8" width="3" height="6" rx="1.5" fill="#0f172a"/><rect x="4.5" y="23" width="3" height="6.2" rx="1.5" fill="#0f172a"/>' +
    '<path d="M1 7.5h10" stroke="#0f172a" stroke-width="1.6" stroke-linecap="round"/>' +
    '<rect x="3" y="6.5" width="6" height="17" rx="3" fill="#1665e8" stroke="#0f172a" stroke-width="1"/>' +
    '<circle cx="6" cy="13.5" r="2.6" fill="#fcd34d" stroke="#0f172a" stroke-width=".8"/>' +
    '</svg>',
};

/** A steady angle for a dot (the same place always faces the same way). */
const angleOf = (d: NearbyDot) => Math.abs(Math.round((d.lat * 7919 + d.lng * 104729) * 1000)) % 360;

export const cabDotKey = (cabs: NearbyDot[]) => cabs.map((d) => `${d.kind}:${d.lat},${d.lng}`).join('|');

/** The marker's inner HTML: fixed artwork only. */
export const cabDotHtml = (d: NearbyDot) => `<span class="lr-cabdot lr-cabdot--${d.kind}" style="transform:rotate(${angleOf(d)}deg)">${SVG[d.kind]}</span>`;
