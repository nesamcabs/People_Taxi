import { describe, expect, it } from 'vitest';
import { dayLabel, parseBookingNotice } from './notificationView';

describe('parseBookingNotice', () => {
  it('splits a confirmation into its facts', () => {
    expect(
      parseBookingNotice('Your booking NTT-2026-000033 for 27 Nov 2026, 06:00 PM (Koduvilarpatty → Chennai) is confirmed. Fare ₹7,017.'),
    ).toEqual({ code: 'NTT-2026-000033', pickup: '27 Nov 2026, 06:00 PM', from: 'Koduvilarpatty', to: 'Chennai', fare: '₹7,017', note: '' });
  });

  it('keeps the text after the fare, and brackets inside a place name', () => {
    const n = parseBookingNotice(
      'Your booking A1 for 28 Nov 2026, 02:30 PM (Chennai Airport (MAA) → Pondicherry) is confirmed. Fare ₹3,200. Pay the driver.',
    );
    expect(n).toMatchObject({ from: 'Chennai Airport (MAA)', to: 'Pondicherry', fare: '₹3,200', note: 'Pay the driver.' });
  });

  it('keeps another status as a sentence', () => {
    expect(parseBookingNotice('Your booking A1 for 28 Nov 2026, 02:30 PM (A → B) has been cancelled.')?.note).toBe(
      'Your booking has been cancelled.',
    );
  });

  it('leaves any other message alone', () => {
    expect(parseBookingNotice('Your driver has arrived.')).toBeNull();
  });
});

describe('dayLabel', () => {
  const now = new Date(2026, 10, 27, 9, 0);
  it('names today, yesterday and older days', () => {
    expect(dayLabel(new Date(2026, 10, 27, 0, 5).getTime(), now)).toBe('Today');
    expect(dayLabel(new Date(2026, 10, 26, 23, 55).getTime(), now)).toBe('Yesterday');
    expect(dayLabel(new Date(2026, 10, 20, 12, 0).getTime(), now)).toBe('20 Nov 2026');
    expect(dayLabel(0, now)).toBe('Earlier');
  });
});
