import { describe, expect, it } from 'vitest';
import { forKind, rideKind } from './rideKind';

describe('rideKind', () => {
  it('reads the vehicle type from the category names', () => {
    expect(rideKind('Bike')).toBe('bike');
    expect(rideKind('AUTO', 'Auto Rickshaw')).toBe('auto');
    expect(rideKind('Hatchback', 'Wagon R Or Similar')).toBe('cab');
    expect(rideKind('Sedan', 'Automatic Dzire')).toBe('cab');
    expect(rideKind(undefined, '')).toBe('cab');
  });
});

describe('forKind', () => {
  it('rewrites cab wording for a bike or an auto', () => {
    expect(forKind('Finding your cab…', 'bike')).toBe('Finding your bike…');
    expect(forKind('Matching you with a cab nearby', 'auto')).toBe('Matching you with an auto nearby');
    expect(forKind('A cab is on the way to accept your ride', 'auto')).toBe('An auto is on the way to accept your ride');
    expect(forKind('Cab found', 'bike')).toBe('Bike found');
    expect(forKind('Finding your cab', 'cab')).toBe('Finding your cab');
  });
});
