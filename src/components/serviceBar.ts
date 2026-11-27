// The five ride services, in one place: Local Pickup & Drop · Hourly Rental · Outstation · Multicity · Airport Taxi.
// The phone bottom bar and the booking form's selector on tablets and desktops both read this list and this hook, so the
// order, the illustrated icons, the routes they open and the selected state are the same at every screen size.
import { useLocation, useSearchParams } from 'react-router-dom';
import { useBooking } from '@/state/Booking';
import { parseService, serviceHref, serviceOfTrip, type ServiceId } from '@/lib/services';
import { navIconSrc } from './BrandIcon';
import { msg } from '@/i18n';

export type BarId = 'pickup' | 'rental' | 'outstation' | 'multicity' | 'airport';

export const SERVICE_BAR: readonly { id: BarId; label: string; full: string; to: string; image: string; size: number; wide?: boolean }[] = [
  { id: 'pickup', label: msg('Local'), full: msg('Local Pickup & Drop'), to: '/local-rentals?mode=pickup', image: navIconSrc('local'), size: 44, wide: true },
  { id: 'rental', label: msg('Rental'), full: msg('Hourly Rental'), to: '/local-rentals?mode=hourly', image: navIconSrc('rental'), size: 44, wide: true },
  { id: 'outstation', label: msg('Outstation'), full: msg('Outstation'), to: serviceHref('outstation'), image: navIconSrc('outstation'), size: 46 },
  { id: 'multicity', label: msg('Multicity'), full: msg('Multicity'), to: serviceHref('multicity'), image: navIconSrc('multicity'), size: 44 },
  { id: 'airport', label: msg('Airport'), full: msg('Airport Taxi'), to: serviceHref('airport'), image: navIconSrc('airport'), size: 44 },
];

/** The service the rider is on, read from the page and its URL (so it survives a resize or a rotation), or null. */
export function useActiveService(): ServiceId | null {
  const location = useLocation();
  const [params] = useSearchParams();
  const { draft } = useBooking();
  const onHome = location.pathname === '/book' || location.pathname === '/';
  const onRentals = /^\/local-rentals(\/|$)/.test(location.pathname);
  if (onRentals) return params.get('mode') === 'hourly' ? 'rental' : 'pickup';
  if (onHome) return parseService(params.get('service')) ?? (location.pathname === '/' ? 'outstation' : serviceOfTrip(draft.tripType, draft.multicity));
  return null;
}

/** Whether a bar item is the selected one ("Local" also covers the older local-taxi id). */
export const isBarActive = (id: BarId, current: ServiceId | null): boolean => current === id || (id === 'pickup' && current === 'local');
