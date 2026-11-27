// The line about driver and cab details, shared by the "Booking confirmed" page and the booking details page.
import type { TripRecord } from '@core/types';
import { formatDate, formatTime } from '@core/utils/format';

/** Driver and cab details are promised this long before a scheduled pickup. */
const DETAILS_LEAD_MS = 4 * 60 * 60 * 1000;

/** A pickup less than four hours away (an immediate booking) gets no "4 hours" promise. Once a driver is assigned the
 *  details themselves are shown, whenever that happens. */
export function driverNote(t: Pick<TripRecord, 'driver' | 'scheduledAt'>, now = Date.now()): string {
  if (t.driver) return 'Your driver and cab have been assigned. Details are shown below.';
  const at = t.scheduledAt;
  if (!at || at.getTime() - now <= DETAILS_LEAD_MS) return 'Driver and cab details will be shared before your pickup.';
  const by = new Date(at.getTime() - DETAILS_LEAD_MS);
  return `Driver and cab details will be shared 4 hours before your pickup, by ${formatTime(by)} on ${formatDate(by)}.`;
}

/** Short status words for the tag on a booking (the list and the details page). */
const STATUS_TAG: Record<TripRecord['phase'], string> = {
  awaiting_review: 'Under review',
  arranging: 'Approved',
  partner_confirmed: 'Allocating',
  driver_assigned: 'Assigned',
  driver_en_route: 'En route',
  driver_arrived: 'At pickup',
  in_trip: 'On trip',
  completed: 'Completed',
  cancelled: 'Cancelled',
};
export const statusTag = (t: Pick<TripRecord, 'phase' | 'status'>): string => (t.status === 'Rejected' ? 'Not accepted' : STATUS_TAG[t.phase]);
