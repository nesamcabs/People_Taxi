// The word and picture a ride's progress screens use, from the vehicle type the rider chose: a bike ride says "bike", an
// auto ride "auto", every car type "cab".

export type RideKind = 'bike' | 'auto' | 'cab';

/** Pass every name known for the type (the stored category name and the admin's display text). */
export function rideKind(...names: (string | null | undefined)[]): RideKind {
  const n = names.filter(Boolean).join(' ').toLowerCase();
  if (/\b(bike|moto|scooter|two[- ]?wheeler)\b/.test(n)) return 'bike';
  if (/\bauto\b|rickshaw/.test(n)) return 'auto';
  return 'cab';
}

/** Rewrites a sentence written for a cab: "a cab" → "a bike" / "an auto", "Cab found" → "Bike found". */
export function forKind(text: string, kind: RideKind): string {
  if (kind === 'cab') return text;
  const cased = (found: string, word: string) => (found[0] === found[0]!.toUpperCase() ? word[0]!.toUpperCase() + word.slice(1) : word);
  return text
    .replace(/\b(a)( )(?=cab\b)/gi, (all, a: string) => (kind === 'auto' ? `${a}n ` : all))
    .replace(/\bcab\b/gi, (found) => cased(found, kind));
}
