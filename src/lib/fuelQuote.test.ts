import { describe, expect, it } from 'vitest';
import type { ServerCategoryQuote } from '@core/services/quoteService';
import { fuelOfDraft, includedKmOf, lowestTaxable, quoteForFuel, quoteMatchesFuel } from './fuelQuote';

const fare = (taxable: number) => ({ baseFare: 0, distanceFare: taxable, timeFare: 0, nightCharge: 0, driverAllowance: 0, minimumFareAdjustment: 0, subtotal: taxable, discount: 0, taxableAmount: taxable, gstRate: 5, gst: taxable * 0.05, total: taxable * 1.05, distanceKm: 379, durationMin: 393 }) as never;
const breakup = (detail: string) => ({ lines: [{ key: 'distance', label: 'Distance charge', amount: 1, treatment: 'included' as const, detail }], packageTotal: 1 });
const both: ServerCategoryQuote = { categoryId: 'hatch', ok: true, fare: fare(5072), breakup: breakup('378.9 KM included (minimum 130 KM) at ₹13/KM'), includedKm: 378.9, cng: { fare: fare(4700), breakup: breakup('378.9 KM included (minimum 150 KM)'), extraKmRate: 11 } };
const dieselOnly: ServerCategoryQuote = { categoryId: 'crysta', ok: true, fare: fare(8100), includedKm: 400 };
const refused: ServerCategoryQuote = { categoryId: 'tempo', ok: false, error: 'Not available for this route' };

describe('shared fuel → each cab\'s own server quote', () => {
  it('reads the draft fuel without inventing a default', () => {
    expect(fuelOfDraft('')).toBe('diesel');
    expect(fuelOfDraft('cng')).toBe('cng');
  });
  it('uses the Diesel fare and the server\'s included km for Diesel', () => {
    const q = quoteForFuel(both, 'diesel')!;
    expect(q.fare.taxableAmount).toBe(5072);
    expect(q.includedKm).toBe(378.9);
  });
  it('uses the CNG rate card (never the Diesel fare) for CNG', () => {
    const q = quoteForFuel(both, 'cng')!;
    expect(q.fare.taxableAmount).toBe(4700);
    expect(q.includedKm).toBe(378.9);
  });
  it('reports no quote, instead of falling back to Diesel, when a cab has no CNG rate card', () => {
    expect(quoteForFuel(dieselOnly, 'cng')).toBeNull();
    expect(quoteForFuel(refused, 'diesel')).toBeNull();
  });
  it('never treats billable km as included km', () => {
    expect(includedKmOf(breakup('412 KM billable (minimum 130 KM)'))).toBeNull();
    expect(includedKmOf(null)).toBeNull();
  });
  it('shows Lowest fare only when two or more different quotes exist on the chosen fuel', () => {
    expect(lowestTaxable([quoteForFuel(both, 'cng'), quoteForFuel(dieselOnly, 'cng')])).toBeNull();
    expect(lowestTaxable([quoteForFuel(both, 'diesel'), quoteForFuel(dieselOnly, 'diesel')])).toBe(5072);
  });
  it('allows Continue only when the current booking quote is this cab\'s quote on the chosen fuel', () => {
    expect(quoteMatchesFuel(fare(5072), both, 'diesel')).toBe(true);
    expect(quoteMatchesFuel(fare(5072), both, 'cng')).toBe(false); // an older Diesel quote must not pass as CNG
    expect(quoteMatchesFuel(fare(8100), dieselOnly, 'cng')).toBe(false);
    expect(quoteMatchesFuel(null, both, 'diesel')).toBe(false);
  });
});
