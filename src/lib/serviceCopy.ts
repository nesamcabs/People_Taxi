// Front-screen service notes (Customer UX 9.0): one short line under each service's tabs, and a "Details" dialog that says what the
// service includes, what it does not, and which charges are extra. Shared by the app and the sites. The wording never states a
// price: the fares and rates always come from the server and are shown with each vehicle.

export type ServiceNoteKind = 'oneway' | 'roundtrip' | 'multicity' | 'local' | 'rental';

export interface ServiceCopy {
  /** The bold line of the note. */
  title: string;
  /** The grey line under it. */
  sub: string;
  /** The first paragraph of the Details dialog. */
  intro: string;
  /** Label + text rows of the Details dialog. A row labelled "Exclusions" is tagged "Not covered"; "Additional charges" is the highlighted band. */
  items: readonly (readonly [label: string, text: string])[];
  /** The Details dialog's heading. */
  heading: string;
}

export const SERVICE_COPY: Record<ServiceNoteKind, ServiceCopy> = {
  oneway: {
    heading: 'One Way',
    title: 'Direct pickup & drop',
    sub: 'Tea / food breaks allowed · No local sightseeing',
    intro: 'Point-to-point travel from your pickup to your destination.',
    items: [
      ['Inclusions', 'One pickup, one drop and refreshment breaks en route.'],
      ['Exclusions', 'Sightseeing and unscheduled local travel.'],
      ['Additional stops', 'A second pickup or drop within the same city is billed separately.'],
      ['Additional charges', 'Toll, Parking & State Tax Extra'],
    ],
  },
  roundtrip: {
    heading: 'Round Trip',
    title: 'Round trip · Return to pickup city',
    sub: 'Your cab stays with you · Booked itinerary only',
    intro: 'A return journey covering your scheduled stops, ending in your pickup city.',
    items: [
      ['Inclusions', 'Package distance, duration and driver allowance as selected.'],
      ['Itinerary', 'Travel is limited to the route and stops confirmed in this booking.'],
      ['Time & distance', 'Package upgrades and additional kilometres are billed at the selected vehicle tariff.'],
      ['Morning Return', 'Complete the trip by 9:00 AM the next day. Beyond this, Next-Day Return applies automatically.'],
      ['Additional charges', 'Toll, Parking & State Tax Extra'],
    ],
  },
  multicity: {
    heading: 'Multicity',
    title: 'Multiple cities · One booked route',
    sub: 'Stop at booked cities · No local sightseeing',
    intro: 'One dedicated cab across your selected cities to the final destination.',
    items: [
      ['Inclusions', 'Travel across the cities and stops in your confirmed itinerary.'],
      ['Exclusions', 'Sightseeing and unscheduled local travel at stop cities.'],
      ['Waiting at stops', 'Waiting time at via-stops is billed separately. Travel time is not counted as waiting.'],
      ['Additional stops', 'Any extra pickup or drop is billed separately.'],
      ['Additional charges', 'Toll, Parking & State Tax Extra'],
    ],
  },
  local: {
    heading: 'Pickup & Drop',
    title: 'Local pickup & drop',
    sub: 'Direct city ride · Now or Schedule',
    intro: 'Direct travel within your pickup city.',
    items: [
      ['Inclusions', 'Base distance and estimated trip time shown with your vehicle.'],
      ['Exclusions', 'Sightseeing, en-route stops and travel beyond city limits.'],
      ['Extra usage', 'Additional distance or time is billed separately.'],
      ['Additional charges', 'Toll, Parking & Permit Charges Extra'],
    ],
  },
  rental: {
    heading: 'Hourly Rental',
    title: 'Hourly city rental',
    sub: 'Multiple city stops · Now or Schedule',
    intro: 'A dedicated cab for your chosen duration, from 1 to 15 hours.',
    items: [
      ['Inclusions', 'Package hours and kilometres shown with your vehicle.'],
      ['Extra usage', 'Usage beyond the package is billed at the rates shown with your fare.'],
      ['Additional charges', 'Toll, Parking & State Tax Extra'],
    ],
  },
};
