import type { RideCategory } from '@core/types';
import { isOutstation } from '@core/services/pricingService';
import { vehicleArtFor } from './vehicleArt';

export type CategoryGroup = 'Sedan' | 'SUV' | 'Innova' | 'Van & bus';

export function categoryGroup(c: Pick<RideCategory, 'name' | 'seats'>): CategoryGroup {
  const n = c.name.toLowerCase();
  if (/innova|crysta|hycross/.test(n)) return 'Innova';
  const art = vehicleArtFor(c);
  if (art === 'passenger-van' || art === 'minibus' || art === 'tourist-coach') return 'Van & bus';
  if (art === 'suv' || art === 'mpv') return 'SUV';
  return 'Sedan';
}

export function categoryPhoto(c: Pick<RideCategory, 'name' | 'seats'> & { imageUrl?: string }): string {
  if (c.imageUrl) return c.imageUrl;
  if (isLocalOnlyCategory(c)) return `/vehicles/${/auto|rickshaw/i.test(c.name) ? 'auto' : 'bike'}.svg`;
  const art = vehicleArtFor(c);
  return `/vehicles/${art}.webp`;
}

/**
 * The admin-uploaded picture for the cab type a booking was made with. A booking only carries the category id and name,
 * so the live category list is matched by id first, then by name (ignoring the " (CNG)" suffix); with no match the
 * built-in illustration for that kind of car is used.
 */
export function tripCategoryPhoto(cats: RideCategory[], trip: { categoryId?: string; categoryName: string }): string {
  const bare = (s: string) => s.replace(/\s*\(cng\)\s*$/i, '').trim().toLowerCase();
  const match = cats.find((c) => trip.categoryId && c.id === trip.categoryId) ?? cats.find((c) => bare(c.name) === bare(trip.categoryName));
  return categoryPhoto(match ?? { name: trip.categoryName, seats: 4 });
}

/**
 * The vehicle name the admin gave the cab type a booking was made with ("Wagon R or similar"), not the stored type word
 * ("HATCHBACK"). Matched like the picture: by id, then by name; with no match the stored name stands. CNG stays marked.
 */
export function tripCategoryName(cats: RideCategory[], trip: { categoryId?: string; categoryName: string }): string {
  const cng = /\s*\(cng\)\s*$/i;
  const bare = (s: string) => s.replace(cng, '').trim().toLowerCase();
  const match = cats.find((c) => trip.categoryId && c.id === trip.categoryId) ?? cats.find((c) => bare(c.name) === bare(trip.categoryName));
  return match ? categoryName(match) + (cng.test(trip.categoryName) ? ' (CNG)' : '') : trip.categoryName;
}

/** Longest admin-written display text that is used as the main text; a longer description is treated as marketing copy. */
const MAX_DISPLAY_TEXT = 48;

/**
 * The main text customers see for a category: the example cars ("Dzire / Etios or similar"), never the generic
 * "Sedan" / "SUV" label. It is the admin's display text (the category description) when that is a short line,
 * otherwise the example cars for the category, otherwise the category name without its "6+1" / "7+1" seat suffix.
 */
export function categoryName(c: Pick<RideCategory, 'name'> & { seats?: number; description?: string }): string {
  const own = (c.description ?? '').trim();
  if (own && own.length <= MAX_DISPLAY_TEXT) return own;
  const models = typeof c.seats === 'number' ? categoryModels({ name: c.name, seats: c.seats }) : '';
  if (models) return models;
  return c.name.replace(/\s*\d+\s*\+\s*\d+\s*$/, '').trim() || c.name;
}

/** The example cars shown under a category name: "Dzire / Etios or similar". Only the Crysta is named exactly. */
export function categoryModels(c: Pick<RideCategory, 'name' | 'seats'>): string {
  const n = c.name.toLowerCase();
  if (/crysta/.test(n)) return 'Toyota Innova Crysta';
  if (/innova|hycross/.test(n)) return 'Toyota Innova or similar';
  const group = categoryGroup(c);
  if (group === 'SUV') return 'Ertiga or similar';
  if (group === 'Sedan') return 'Dzire / Etios or similar';
  return '';
}

/** Auto and Bike: local rides and hourly rental only. The same names the booking server recognises. */
export function isLocalOnlyCategory(c: { name: string }): boolean {
  const n = c.name.trim().toLowerCase();
  return /(^|[^a-z])(bike|scooter|scooty|motor ?cycle|two[- ]?wheeler)s?([^a-z]|$)/.test(n) || /^(e[- ]?|electric |cng )?auto(?![a-z])|rickshaw/.test(n);
}

/**
 * Whether Auto / Bike may be offered for this trip: an hourly rental, or a One Way ride inside the local distance. Outstation,
 * round trip, airport and multicity trips never list them, even when an older booking server prices them.
 */
export function localOnlyTrip(t: { tripType: string; multicity?: boolean; distanceKm?: number | null }): boolean {
  if (t.multicity) return false;
  if (t.tripType === 'Local Rental') return true;
  return t.tripType === 'One Way' && typeof t.distanceKm === 'number' && !isOutstation(t.distanceKm);
}
