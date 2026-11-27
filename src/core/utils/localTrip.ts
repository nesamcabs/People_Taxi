// Local Pickup & Drop and Hourly Rental: how to tell them apart from the other services, and their cancellation rule.
// Pure (no Firebase), so the rule is tested on its own and the ride screens and the cancel flow share it.
import { LOCAL_ARRIVED_CANCELLATION_FEE } from '../config/constants';
import type { TripRecord } from '../types';

/**
 * Local Pickup & Drop or Hourly Rental. Pickup & Drop is a One Way inside one city: the server's "Local" service, or
 * (if it names it differently) a short city trip of 40 km or less that is not Outstation or Airport.
 */
export function isLocalBooking(t: Pick<TripRecord, 'tripType' | 'service' | 'distanceKm'>): boolean {
  if (t.tripType === 'Local Rental') return true;
  return t.tripType === 'One Way' && t.service !== 'Outstation' && t.service !== 'Airport' && (t.service === 'Local' || (t.distanceKm > 0 && t.distanceKm <= 40));
}

export interface LocalCancellation {
  allowed: true;
  fee: number;
  explanation: string;
}

/**
 * Cancelling a Local / Rental ride that can still be cancelled (not started): free while a cab is found and while the driver
 * is on the way; once the driver has reached the pickup (booking still Assigned, the rider not yet on board) a ₹50 fee applies.
 */
export function localCancellation(t: Pick<TripRecord, 'status' | 'phase'>, fee = LOCAL_ARRIVED_CANCELLATION_FEE): LocalCancellation {
  if (t.status === 'Assigned' && t.phase === 'driver_arrived') {
    return { allowed: true, fee, explanation: `Your driver has reached the pickup, so a ₹${fee} cancellation fee applies.` };
  }
  const onTheWay = t.phase === 'driver_assigned' || t.phase === 'driver_en_route';
  return {
    allowed: true,
    fee: 0,
    explanation: onTheWay ? `Free until your driver reaches the pickup (₹${fee} after that).` : 'Free until your driver reaches the pickup.',
  };
}
