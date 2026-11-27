import { describe, expect, it } from 'vitest';
import { isLocalBooking, localCancellation } from './localTrip';

describe('local trips', () => {
  it('tells Local Pickup & Drop and Hourly Rental apart from the other services', () => {
    expect(isLocalBooking({ tripType: 'Local Rental', service: 'Rental', distanceKm: 0 })).toBe(true);
    expect(isLocalBooking({ tripType: 'One Way', service: 'Local', distanceKm: 12 })).toBe(true);
    // A short city trip the server named differently still counts.
    expect(isLocalBooking({ tripType: 'One Way', service: 'City', distanceKm: 18 })).toBe(true);
    expect(isLocalBooking({ tripType: 'One Way', service: 'Outstation', distanceKm: 120 })).toBe(false);
    expect(isLocalBooking({ tripType: 'One Way', service: 'Airport', distanceKm: 20 })).toBe(false);
    expect(isLocalBooking({ tripType: 'Round Trip', service: 'Local', distanceKm: 10 })).toBe(false);
  });

  it('is free while a cab is found and while the driver is on the way', () => {
    expect(localCancellation({ status: 'Pending', phase: 'awaiting_review' }).fee).toBe(0);
    expect(localCancellation({ status: 'Approved', phase: 'arranging' }).fee).toBe(0);
    expect(localCancellation({ status: 'Assigned', phase: 'driver_assigned' }).fee).toBe(0);
    expect(localCancellation({ status: 'Assigned', phase: 'driver_en_route' }).fee).toBe(0);
  });

  it('charges ₹50 once the driver has reached the pickup', () => {
    const q = localCancellation({ status: 'Assigned', phase: 'driver_arrived' });
    expect(q.allowed).toBe(true);
    expect(q.fee).toBe(50);
    expect(q.explanation).toContain('₹50');
  });
});
