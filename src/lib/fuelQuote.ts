// One fuel for the whole booking (draft.fuelType) and the quote each cab has for it. The booking server answers once with
// every cab's standard (Diesel) fare and, where the admin saved a CNG rate card, its CNG fare (`cng`), so changing the
// fuel never sends a new request and can never show an older answer. Nothing here prices anything: it only picks the
// server's own figures for the chosen fuel, or reports that the cab has none.
import type { FareBreakdown } from '@core/types';
import type { ServerCategoryQuote } from '@core/services/quoteService';
import type { FareBreakup } from '@core/utils/fareBreakup';

export type Fuel = 'diesel' | 'cng';

export const fuelOfDraft = (fuelType: '' | 'cng' | undefined): Fuel => (fuelType === 'cng' ? 'cng' : 'diesel');
export const draftFuelOf = (fuel: Fuel): '' | 'cng' => (fuel === 'cng' ? 'cng' : '');

export interface FuelQuote {
  fare: FareBreakdown;
  breakup: FareBreakup | null;
  /** Display only: a higher total to show struck out (0 when there is none). */
  strikeTotal: number;
  /** Kilometres this fare includes, as the server stated them; null when it did not say. */
  includedKm: number | null;
}

/** "378.9 KM included (minimum 130 KM)" on the distance line of the server's breakup → 378.9. Billable km are not included km. */
export function includedKmOf(breakup: FareBreakup | null | undefined): number | null {
  const line = breakup?.lines.find((l) => l.key === 'distance');
  const m = /([\d]+(?:\.\d+)?)\s*KM\s+included\b/i.exec(line?.detail ?? '');
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** The server's quote for this cab on this fuel, or null when the cab cannot be priced on it (not quoted, or no CNG rate card). */
export function quoteForFuel(entry: ServerCategoryQuote | undefined, fuel: Fuel): FuelQuote | null {
  if (!entry?.ok) return null;
  if (fuel === 'cng') {
    const c = entry.cng;
    if (!c?.fare) return null;
    return { fare: c.fare, breakup: c.breakup ?? null, strikeTotal: c.strikeTotal ?? 0, includedKm: includedKmOf(c.breakup) };
  }
  if (!entry.fare) return null;
  const km = typeof entry.includedKm === 'number' && entry.includedKm > 0 ? entry.includedKm : includedKmOf(entry.breakup);
  return { fare: entry.fare, breakup: entry.breakup ?? null, strikeTotal: entry.strikeTotal ?? 0, includedKm: km };
}

/** "Lowest fare" is only meaningful when at least two cabs have a quote on this fuel and they differ. */
export function lowestTaxable(quotes: Array<FuelQuote | null>): number | null {
  const amounts = quotes.map((q) => q?.fare.taxableAmount).filter((n): n is number => typeof n === 'number' && n > 0);
  return amounts.length > 1 && new Set(amounts).size > 1 ? Math.min(...amounts) : null;
}

/** Continue is allowed only when the booking's current quote is this cab's quote on the chosen fuel. */
export function quoteMatchesFuel(current: FareBreakdown | null | undefined, entry: ServerCategoryQuote | undefined, fuel: Fuel): boolean {
  const mine = quoteForFuel(entry, fuel);
  return !!current && !!mine && current.total === mine.fare.total && current.taxableAmount === mine.fare.taxableAmount;
}
