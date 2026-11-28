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
 * The pickup times the picker offers for `day`: every 5 minutes that can still be booked. Today that starts at the
 * minimum notice from now (with a minute to spare, so the first one is still valid at Confirm); a later day has them all.
 * Empty when nothing is left on the day.
 */
export function pickerSlots(day: string, now = Date.now()): string[] {
  const soonest = now + (SCHEDULE_MIN_LEAD_MIN + 1) * 60000;
  return Array.from({ length: 288 }, (_, i) => `${pad(Math.floor(i / 12))}:${pad((i % 12) * 5)}`).filter((hhmm) => {
    const at = combineDateTime(day, hhmm);
    return !!at && at.getTime() >= soonest;
  });
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

// ── Ride now (Local / Rental) ──
// The booking server's own minimum notice (admin → Settings → Operations & Security → "Minimum notice before pickup", saved as
// settings/operations.bookingMinLeadMinutes) decides how soon "Ride now" can be. At 0 it is the current time.

/** "Ride now" keeps this much clear of the minimum notice, so the pickup is still valid when the booking reaches the server. */
const NOW_MARGIN_MS = 60000;
const MAX_LEAD_MIN = 7 * 24 * 60;

/** The server's minimum notice from settings/operations, read exactly as the server reads it (missing or out of range → 30). */
export function leadMinutesFrom(settings: unknown): number {
  const v = settings && typeof settings === 'object' ? (settings as Record<string, unknown>).bookingMinLeadMinutes : undefined;
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= MAX_LEAD_MIN ? Math.round(v) : SCHEDULE_MIN_LEAD_MIN;
}
/**
 * The pickup "Ride now" is priced for: the minimum notice plus a minute, rounded up to 5 minutes so the fares on screen stay
 * steady (with no notice it is the current time, a few minutes at most ahead).
 */
export function ridenowPickup(now = Date.now(), leadMin = SCHEDULE_MIN_LEAD_MIN): Date {
  return new Date(Math.ceil((now + Math.max(0, leadMin) * 60000 + NOW_MARGIN_MS) / 300000) * 300000);
}
/** Whether a "Ride now" pickup has drifted too close to now (or is missing) and must move to the next slot. */
export function ridenowStale(at: Date | null, now = Date.now(), leadMin = SCHEDULE_MIN_LEAD_MIN): boolean {
  return !at || at.getTime() - now < Math.max(0, leadMin) * 60000 + NOW_MARGIN_MS;
}
/**
 * The pickup a "Ride now" booking is sent with. With no minimum notice it is the current time (the next minute, so it is still
 * in the future when the server checks it); otherwise the priced pickup, which is already the earliest the server accepts.
 */
export function ridenowBookingTime(priced: Date, now = Date.now(), leadMin = SCHEDULE_MIN_LEAD_MIN): Date {
  return leadMin <= 0 ? new Date(Math.ceil((now + NOW_MARGIN_MS) / 60000) * 60000) : priced;
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
