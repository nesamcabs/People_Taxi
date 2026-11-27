import { SCHEDULE_MAX_DAYS, SCHEDULE_MIN_LEAD_MIN } from '@core/config/constants';
import type { LocationErrorKind } from '@core/services/geoService';
import { scheduleProblem } from '@core/utils/bookingRules';

const pad = (n: number) => String(n).padStart(2, '0');

/** yyyy-mm-dd in the browser's zone, for <input type="date">. */
export const toDateInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** hh:mm in the browser's zone, for <input type="time">. */
export const toTimeInput = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

export function combineDateTime(date: string, time: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const [hh, mm] = time.split(':').map(Number) as [number, number];
  const out = new Date(y, m - 1, d, hh, mm, 0, 0);
  return Number.isNaN(out.getTime()) ? null : out;
}

/**
 * The pickup day for a time picked on the clock wheel, so the rider never has to fix the date by hand:
 * - A day the form filled in itself (the default, or an earlier automatic move) becomes the first of today and tomorrow on
 *   which that time can still be booked: 9:00 AM picked in the evening is tomorrow morning, 8:00 PM picked at noon stays today.
 * - A day the rider picked is kept, except today with a time that has already gone (or is under the minimum lead away):
 *   that time tomorrow instead.
 * A day left in the past (the page stayed open over midnight) counts as today. Any other case keeps the date, and the
 * picker's usual check explains what is wrong.
 */
export function pickupDayFor(date: string, time: string, riderPickedDay: boolean, now = Date.now()): string {
  const base = new Date(now);
  const today = toDateInput(base);
  const tomorrow = toDateInput(new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1));
  const day = date && date < today ? today : date;
  const bookable = (d: string) => !scheduleProblem(combineDateTime(d, time), now);
  if (!riderPickedDay && (day === today || day === tomorrow)) return bookable(today) ? today : bookable(tomorrow) ? tomorrow : day;
  if (day === today && !bookable(today) && bookable(tomorrow)) return tomorrow;
  return day;
}

/**
 * The quick day button above the pickup date. "Tomorrow" moves the date to tomorrow; once the date is tomorrow it offers
 * "Today" instead, but only while a pickup can still be booked today (late at night there is none, so no button).
 */
export function quickDaySwitch(date: string, now = Date.now()): { label: 'Today' | 'Tomorrow'; to: string } | null {
  const base = new Date(now);
  const today = toDateInput(base);
  const tomorrow = toDateInput(new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1));
  if (date !== tomorrow) return { label: 'Tomorrow', to: tomorrow };
  return toDateInput(earliestSlot(now)) === today ? { label: 'Today', to: today } : null;
}

/** The pickup time to keep when the day is switched: the same time when it can still be booked on that day, otherwise the
 *  earliest slot when that falls on the day, otherwise unchanged (the usual check then explains what is wrong). */
export function timeForDay(day: string, time: string, now = Date.now()): string {
  const at = combineDateTime(day, time);
  if (at && !scheduleProblem(at, now)) return time;
  const first = earliestSlot(now);
  return toDateInput(first) === day ? toTimeInput(first) : time;
}

/** The earliest pickup the booking server accepts, rounded up to the next 5 minutes. */
export function earliestPickup(now = Date.now()): Date {
  const t = new Date(now + (SCHEDULE_MIN_LEAD_MIN + 5) * 60000);
  t.setSeconds(0, 0);
  t.setMinutes(Math.ceil(t.getMinutes() / 5) * 5);
  return t;
}

/** The earliest pickup a rider can choose: the minimum lead time (30 min) after now, rounded up to the next 5 minutes. */
export function earliestSlot(now = Date.now()): Date {
  return new Date(Math.ceil((now + SCHEDULE_MIN_LEAD_MIN * 60000) / 300000) * 300000);
}

/** The default pickup: today, 30 minutes from now (rounded up to the next 5 minutes). Past midnight it is the next day's date. */
export function defaultPickup(now = Date.now()): { date: string; time: string } {
  const at = earliestSlot(now);
  return { date: toDateInput(at), time: toTimeInput(at) };
}

/**
 * The pickup times worth offering for a day: for today only times from the earliest slot onward (the first entry is the
 * earliest itself, for example 6:35 PM, then the usual half-hour slots after it); other days get every slot.
 */
export function pickupTimeOptions(date: string, slots: readonly string[], now = Date.now()): string[] {
  const first = earliestSlot(now);
  const out: string[] = [];
  if (date === toDateInput(first)) out.push(toTimeInput(first));
  for (const t of slots) {
    const at = combineDateTime(date, t);
    if (!at || at.getTime() <= first.getTime() || at.getTime() > now + SCHEDULE_MAX_DAYS * 86400000) continue;
    out.push(t);
  }
  return out;
}

export const latestPickup = (now = Date.now()) => new Date(now + SCHEDULE_MAX_DAYS * 86400000);

/** Location problems explained for a browser (the shared texts talk about phone settings). */
export const LOCATION_HELP: Record<LocationErrorKind, string> = {
  denied: 'Location permission was not granted. Allow it in your browser, or search for your pickup.',
  blocked: 'Location is blocked for this site. Allow it from the address bar’s site settings, or search for your pickup.',
  disabled: 'Your device’s location is switched off. Turn it on, or search for your pickup.',
  unavailable: 'We couldn’t get a location fix. Search for your pickup instead.',
  timeout: 'Getting your location is taking too long. Try again or search for your pickup.',
};
