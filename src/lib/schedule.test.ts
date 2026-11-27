import { describe, expect, it } from 'vitest';
import { scheduleProblem } from '@core/utils/bookingRules';
import { combineDateTime, earliestPickup, earliestSlot, latestPickup, pickupDayFor, pickupTimeOptions, quickDaySwitch, timeForDay, toDateInput, toTimeInput } from './schedule';

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

describe('pickupDayFor: the date follows a picked time', () => {
  // 26 Nov 2026, 11:35 PM local time.
  const night = new Date(2026, 10, 26, 23, 35).getTime();
  // 26 Nov 2026, 2:00 PM local time.
  const noon = new Date(2026, 10, 26, 14, 0).getTime();

  it('moves a form-set day to the first day the time can be booked', () => {
    expect(pickupDayFor('2026-11-26', '00:05', false, night)).toBe('2026-11-27');
    expect(pickupDayFor('2026-11-27', '00:05', false, night)).toBe('2026-11-27');
    expect(pickupDayFor('2026-11-26', '09:00', false, noon)).toBe('2026-11-27');
    expect(pickupDayFor('2026-11-26', '20:00', false, noon)).toBe('2026-11-26');
    // Tomorrow set by the form, but the time still fits today: back to today.
    expect(pickupDayFor('2026-11-27', '20:00', false, noon)).toBe('2026-11-26');
  });

  it('keeps a day the rider picked, except today with a time already gone', () => {
    expect(pickupDayFor('2026-11-27', '20:00', true, noon)).toBe('2026-11-27');
    expect(pickupDayFor('2026-11-26', '09:00', true, noon)).toBe('2026-11-27');
    expect(pickupDayFor('2026-11-26', '20:00', true, noon)).toBe('2026-11-26');
    expect(pickupDayFor('2026-11-30', '09:00', true, noon)).toBe('2026-11-30');
  });

  it('treats a day left in the past as today', () => {
    expect(pickupDayFor('2026-11-25', '20:00', true, noon)).toBe('2026-11-26');
    expect(pickupDayFor('2026-11-25', '09:00', true, noon)).toBe('2026-11-27');
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
