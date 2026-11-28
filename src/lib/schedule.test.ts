import { describe, expect, it } from 'vitest';
import { scheduleProblem } from '@core/utils/bookingRules';
import { combineDateTime, earliestPickup, earliestSlot, latestPickup, pickerSlots, pickupTimeOptions, quickDaySwitch, leadMinutesFrom, ridenowBookingTime, ridenowPickup, ridenowStale, timeForDay, toDateInput, toTimeInput } from './schedule';

describe('pickup scheduling', () => {
  it('round-trips the date and time inputs', () => {
    const d = combineDateTime('2026-10-20', '06:35')!;
    expect(toDateInput(d)).toBe('2026-10-20');
    expect(toTimeInput(d)).toBe('06:35');
    expect(combineDateTime('', '06:35')).toBeNull();
    expect(combineDateTime('2026-10-20', '')).toBeNull();
  });

  it('offers a default pickup the booking server accepts', () => {
    const now = Date.UTC(2026, 9, 14, 10, 7, 31);
    const at = earliestPickup(now);
    expect(scheduleProblem(at, now)).toBe('');
    expect(at.getMinutes() % 5).toBe(0);
    expect(scheduleProblem(latestPickup(now), now)).toBe('');
    expect(scheduleProblem(new Date(now + 31 * 86400000), now)).toMatch(/30 days/);
  });
});

describe('pickup time options', () => {
  const SLOTS = ['05:00', '05:30', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '23:30'];
  const at = (y: number, mo: number, d: number, h: number, mi: number, sec = 0) => new Date(y, mo - 1, d, h, mi, sec).getTime();

  it('starts 30 minutes after now, rounded up to the next 5 minutes', () => {
    expect(toTimeInput(earliestSlot(at(2026, 11, 10, 18, 5)))).toBe('18:35');
    expect(toTimeInput(earliestSlot(at(2026, 11, 10, 18, 6)))).toBe('18:40');
    expect(toTimeInput(earliestSlot(at(2026, 11, 10, 18, 5, 30)))).toBe('18:40');
    expect(scheduleProblem(earliestSlot(at(2026, 11, 10, 18, 6)), at(2026, 11, 10, 18, 6))).toBe('');
  });

  it('offers only times from the earliest slot onward for today', () => {
    const now = at(2026, 11, 10, 18, 5);
    expect(pickupTimeOptions('2026-11-10', SLOTS, now)).toEqual(['18:35', '19:00', '19:30', '23:30']);
  });

  it('offers every slot on a later day', () => {
    const now = at(2026, 11, 10, 18, 5);
    expect(pickupTimeOptions('2026-11-11', SLOTS, now)).toEqual(SLOTS);
  });

  it('has nothing left today late at night, and the earliest slot falls on the next day', () => {
    const now = at(2026, 11, 10, 23, 50);
    expect(pickupTimeOptions('2026-11-10', SLOTS, now)).toEqual([]);
    expect(toDateInput(earliestSlot(now))).toBe('2026-11-11');
    expect(pickupTimeOptions('2026-11-11', SLOTS, now)[0]).toBe('00:20');
  });
});

describe('pickerSlots: the times the picker offers', () => {
  // 28 Nov 2026, 1:49 PM local time.
  const now = new Date(2026, 10, 28, 13, 49).getTime();

  it('offers only PM times today once the morning has gone', () => {
    const slots = pickerSlots('2026-11-28', now);
    expect(slots[0]).toBe('14:20');
    expect(slots[1]).toBe('14:25');
    expect(slots.at(-1)).toBe('23:55');
    expect(slots.every((s) => s >= '12:00')).toBe(true);
  });

  it('offers the whole day, AM and PM, tomorrow', () => {
    const slots = pickerSlots('2026-11-29', now);
    expect(slots).toHaveLength(288);
    expect(slots[0]).toBe('00:00');
  });

  it('has nothing late at night or on a day that has passed', () => {
    expect(pickerSlots('2026-11-28', new Date(2026, 10, 28, 23, 40).getTime())).toEqual([]);
    expect(pickerSlots('2026-11-27', now)).toEqual([]);
  });
});

describe('quick day button above the pickup date', () => {
  const noon = new Date(2026, 10, 26, 14, 0).getTime();
  const night = new Date(2026, 10, 26, 23, 50).getTime();

  it('offers Tomorrow, and Today back while today can still be booked', () => {
    expect(quickDaySwitch('2026-11-26', noon)).toEqual({ label: 'Tomorrow', to: '2026-11-27' });
    expect(quickDaySwitch('2026-11-27', noon)).toEqual({ label: 'Today', to: '2026-11-26' });
    expect(quickDaySwitch('2026-11-30', noon)).toEqual({ label: 'Tomorrow', to: '2026-11-27' });
    // 11:50 PM: nothing can be booked today any more, so a date of tomorrow gets no button.
    expect(quickDaySwitch('2026-11-27', night)).toBeNull();
  });

  it('keeps the time when it fits the new day, else uses the earliest slot that day', () => {
    expect(timeForDay('2026-11-27', '09:00', noon)).toBe('09:00');
    expect(timeForDay('2026-11-26', '18:00', noon)).toBe('18:00');
    // 9:00 AM today has gone at 2 PM: the earliest slot today (2:30 PM).
    expect(timeForDay('2026-11-26', '09:00', noon)).toBe('14:30');
  });
});

describe('ride now (Local / Rental)', () => {
  const now = new Date(2026, 10, 27, 18, 2, 0).getTime();

  it('books the earliest slot, a minute clear of the 30-minute minimum, on a 5-minute step', () => {
    const at = ridenowPickup(now);
    const leadMin = (at.getTime() - now) / 60000;
    expect(leadMin).toBeGreaterThanOrEqual(31);
    expect(leadMin).toBeLessThan(36);
    expect(at.getMinutes() % 5).toBe(0);
    expect(scheduleProblem(at, now)).toBe('');
  });

  it('is fresh when just set, and stale once it drifts under the margin or is missing', () => {
    const at = ridenowPickup(now);
    expect(ridenowStale(at, now)).toBe(false);
    expect(ridenowStale(null, now)).toBe(true);
    // Five minutes later the same pickup is under 31 minutes away: it must move to the next slot.
    expect(ridenowStale(at, now + 5 * 60000)).toBe(true);
    expect(ridenowStale(ridenowPickup(now + 5 * 60000), now + 5 * 60000)).toBe(false);
  });
});

describe('ride now follows the server minimum notice', () => {
  const now = new Date(2026, 10, 27, 19, 21, 30).getTime();

  it('reads settings/operations the way the server does', () => {
    expect(leadMinutesFrom({ bookingMinLeadMinutes: 0 })).toBe(0);
    expect(leadMinutesFrom({ bookingMinLeadMinutes: 15 })).toBe(15);
    expect(leadMinutesFrom({ bookingMinLeadMinutes: -5 })).toBe(30);
    expect(leadMinutesFrom({ bookingMinLeadMinutes: '0' })).toBe(30);
    expect(leadMinutesFrom(null)).toBe(30);
  });

  it('with no minimum notice, prices a steady slot a few minutes ahead and books the current time', () => {
    const priced = ridenowPickup(now, 0);
    const ahead = priced.getTime() - now;
    expect(ahead).toBeGreaterThanOrEqual(60000);
    expect(ahead).toBeLessThanOrEqual(6 * 60000);
    expect(priced.getMinutes() % 5).toBe(0);
    expect(ridenowStale(priced, now, 0)).toBe(false);
    // Booked at 7:21:30 PM → pickup 7:23 PM: the next minute after a one-minute margin, so it is still in the future at the server.
    const booked = ridenowBookingTime(priced, now, 0);
    expect(booked.getHours()).toBe(19);
    expect(booked.getMinutes()).toBe(23);
    expect(booked.getSeconds()).toBe(0);
  });

  it('with a minimum notice, books the priced earliest pickup', () => {
    const priced = ridenowPickup(now, 30);
    expect(ridenowBookingTime(priced, now, 30)).toBe(priced);
    expect((priced.getTime() - now) / 60000).toBeGreaterThanOrEqual(31);
  });
});
