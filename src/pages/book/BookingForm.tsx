// The booking form on the People Taxi home page: service, route, schedule and "Search Cabs".
// Places are real coordinates (search, device location, saved/recent places, map pin); the
// schedule follows the booking server's rules; fares are only ever priced by the server.
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { GeoPlace } from '@core/types';
import { useCustomerData } from '@/state/customer';
import { reverseGeocode } from '@core/services/geoService';
import { SUPPORT_PHONE, SUPPORT_PHONE_DISPLAY } from '@core/config/constants';
import { scheduleProblem } from '@core/utils/bookingRules';
import { haversineKm, isValidLatLng } from '@core/utils/geo';
import { Button, Tabs } from '@/components/ui';
import { Icon } from '@/components/Icon';
import type { PickerConfig } from '@/components/LocationPicker';
import { PlaceField } from '@/components/PlaceField';
import { TimePicker, formatTime12 } from '@/components/TimePicker';
import { useBooking } from '@/state/Booking';
import { UNAVAILABLE_TEXT, useServiceAvailability, type ServiceKey } from '@/lib/serviceAvailability';
import { useAuth } from '@/state/Auth';
import { setPendingReturn } from '@/lib/pendingReturn';
import { saveDraft, RENTAL_PACKAGE_HOURS } from '@/lib/draft';
import { useDeviceLocation, useLivePickupDefault, useOnline, useToday } from '@/lib/hooks';
import { ClockIcon, SwapIcon } from '@/shared/components/CabParts';
import { combineDateTime, defaultPickup, latestPickup, pickupDayFor, quickDaySwitch, timeForDay, toDateInput, toTimeInput } from '@/lib/schedule';
import { isOvernightPickup } from '@core/utils/timePackages';
import { ServiceNote } from '@/components/ServiceNote';
import { SERVICE_TITLE, isLocalRentals, type ServiceId } from '@/lib/services';
import { AIRPORTS, QUICK_CITIES, isAirportPlace } from './content';
import { MulticityForm } from './MulticityForm';
import { FindCabLabel } from './FindCabLabel';
import { SERVICE_BAR, isBarActive, useActiveService } from '@/components/serviceBar';

type Field = 'pickup' | 'drop' | 'stops' | 'hours' | 'date' | 'time' | 'retDate' | 'retTime' | 'form';
type Errors = Partial<Record<Field, string>>;
export type AirportDirection = 'to' | 'from';

const disposalFor = (pickup: GeoPlace): GeoPlace => ({
  id: 'place-local-disposal',
  name: 'Local City Disposal',
  address: `${pickup.name} & City Limits (Within city disposal)`,
  // A point a few hundred metres inland from the pickup: it only stands for "within the city" and is never priced by distance.
  lat: pickup.lat + 0.003,
  lng: pickup.lng - 0.003,
  type: 'other',
});

/** True when `drop` is the disposal placeholder built for this exact pickup (not one left over from an earlier pickup). */
const isDisposalFor = (drop: GeoPlace | null, pickup: GeoPlace): boolean => {
  if (!drop || drop.id !== 'place-local-disposal') return false;
  const want = disposalFor(pickup);
  return drop.lat === want.lat && drop.lng === want.lng && drop.address === want.address;
};

/** Airport direction follows the draft: whichever end is an airport. */
const directionOf = (pickup: GeoPlace | null, drop: GeoPlace | null): AirportDirection => (isAirportPlace(pickup) && !isAirportPlace(drop) ? 'from' : 'to');

/** "Today", "Tomorrow" or the weekday, shown on the date field so the chosen day is clear at a glance. */
const dayHint = (iso: string): string => {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  return diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : d.toLocaleDateString('en-IN', { weekday: 'long' });
};

/** No recent-place suggestions in the booking form (see `recent` below). */
const NO_RECENT: GeoPlace[] = [];

/** Round trips are booked for up to this many days (the server's roundTrip.maxDays). */
const RT_MAX_DAYS = 30;
/** The calendar date `n` days after a YYYY-MM-DD date (plain calendar arithmetic). */
const addDaysISO = (iso: string, n: number): string => {
  const [y, m, d] = iso.split('-').map(Number);
  return toDateInput(new Date(y!, m! - 1, d! + n));
};

export function BookingForm({
  service,
  outstationTrip,
  onOutstationTrip,
}: {
  service: ServiceId;
  outstationTrip: 'One Way' | 'Round Trip';
  onOutstationTrip: (t: 'One Way' | 'Round Trip') => void;
}) {
  const navigate = useNavigate();
  const { draft, update } = useBooking();
  const { state: auth, openLoginModal } = useAuth();
  const { savedPlaces } = useCustomerData();
  const { position } = useDeviceLocation(true, true);
  const { online } = useOnline();
  // The selected service for the five-service selector (the same reading the phone bottom bar uses).
  const activeService = useActiveService();
  const avail = useServiceAvailability();
  const { pickup, drop, scheduledAt, tripEndAt, tripType } = draft;
  const isRound = service === 'outstation' && tripType === 'Round Trip';
  // Services the admin has switched off (Admin → Services) show as "Currently unavailable" and cannot be searched.
  const keyOf = (id: ServiceId, trip: 'One Way' | 'Round Trip' = tripType === 'Round Trip' ? 'Round Trip' : 'One Way'): ServiceKey | null =>
    id === 'outstation' ? trip : id === 'airport' ? 'Airport Taxi' : id === 'rental' ? 'Local Rental' : id === 'pickup' ? 'Pickup & Drop' : id === 'multicity' ? 'Multicity' : null;
  const serviceOff = (id: ServiceId): boolean => {
    if (id === 'outstation') return avail.off('One Way') && avail.off('Round Trip');
    if (id === 'rental') return avail.off('Local Rental') && avail.off('Pickup & Drop');
    const k = keyOf(id);
    return !!k && avail.off(k);
  };
  const currentKey = keyOf(service);
  const currentOff = currentKey ? avail.off(currentKey) : false;

  const [addingStop, setAddingStop] = useState(false);
  const [timeFor, setTimeFor] = useState<'pickup' | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [direction, setDirection] = useState<AirportDirection>(() => directionOf(pickup, drop));
  const refs = useRef<Partial<Record<Field, HTMLElement | null>>>({});
  const pickupFromGps = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // A device location the rider already allowed becomes the pickup, unless they chose one.
  useEffect(() => {
    if (!position || pickupFromGps.current || pickup || service === 'airport') return;
    pickupFromGps.current = true;
    void reverseGeocode(position).then((p) => {
      if (mounted.current) update((d) => (d.pickup ? {} : { pickup: { ...p, type: 'current' } }));
    });
  }, [position, pickup, update, service]);

  // Rentals drive within the pickup city: the destination is the city-disposal placeholder, rebuilt whenever the pickup changes.
  useEffect(() => {
    if (service === 'rental' && pickup && isValidLatLng(pickup) && !isDisposalFor(drop, pickup)) update({ drop: disposalFor(pickup) });
  }, [service, pickup?.lat, pickup?.lng, pickup?.name, drop?.id, drop?.lat, drop?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Schedule (local date + time inputs mirrored into the draft) ─────────
  // By default: today, 30 minutes from now. A time already chosen earlier is kept while it can still be booked.
  const keptSchedule = scheduledAt && !scheduleProblem(scheduledAt) ? scheduledAt : null;
  const scheduleTouched = useRef(keptSchedule !== null);
  // True once the rider picks the date themselves (or a schedule they chose earlier is kept). Until then, picking a time
  // also moves the date to the first day that time can be booked (a time already gone today means tomorrow).
  const datePicked = useRef(keptSchedule !== null);
  // Re-renders at midnight, so the "Today" / "Tomorrow" tag on the date follows the calendar.
  useToday();
  const [date, setDate] = useState(() => (keptSchedule ? toDateInput(keptSchedule) : defaultPickup().date));
  const [time, setTime] = useState(() => (keptSchedule ? toTimeInput(keptSchedule) : defaultPickup().time));
  // The quick day button above the date, and what it does: move the date only (the time is kept while it can be booked).
  const quickDay = date ? quickDaySwitch(date) : null;
  const switchDay = (to: string) => {
    scheduleTouched.current = true;
    datePicked.current = true;
    setDate(to);
    setTime((t) => timeForDay(to, t));
    setErrors((x) => ({ ...x, date: '', time: '' }));
  };
  // Until the rider picks a date or time, the default keeps following the clock (always 30 minutes from now).
  useLivePickupDefault(scheduleTouched, (next) => {
    setDate(next.date);
    setTime(next.time);
  });
  useEffect(() => {
    const d = combineDateTime(date, time);
    if ((d?.getTime() ?? null) !== (scheduledAt?.getTime() ?? null)) update({ scheduledAt: d });
  }, [date, time]); // eslint-disable-line react-hooks/exhaustive-deps
  // Round trip: the customer chooses how many days the trip lasts. It ends on the last day, at the pickup time.
  const [days, setDays] = useState<number>(() => {
    if (!tripEndAt || !scheduledAt) return 1;
    const n = Math.round((Date.parse(toDateInput(tripEndAt)) - Date.parse(toDateInput(scheduledAt))) / 86400000) + 1;
    return n >= 1 && n <= RT_MAX_DAYS ? n : 1;
  });
  // A pickup from 6:46 PM to 12:59 AM cannot finish a same-day package (they all end at 11:45 PM; the shortest runs 5 hours), so the trip
  // becomes an overnight 2-day trip by itself and the stepper cannot go below 2 days. Moving the pickup earlier again returns it to 1 day.
  const overnight = isRound && isOvernightPickup(combineDateTime(date, time));
  const minDays = overnight ? 2 : 1;
  const [autoOvernight, setAutoOvernight] = useState(false);
  useEffect(() => {
    if (!isRound) return;
    if (overnight && days < 2) { setDays(2); setAutoOvernight(true); }
    else if (!overnight && autoOvernight) { setDays(1); setAutoOvernight(false); }
  }, [overnight, isRound]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const end = isRound && date && time ? combineDateTime(addDaysISO(date, days - 1), time) : null;
    const tripDays = isRound ? days : 1;
    const patch: Partial<typeof draft> = {};
    if ((end?.getTime() ?? null) !== (tripEndAt?.getTime() ?? null)) patch.tripEndAt = end;
    // The package list depends on the days; a package picked for other days no longer applies.
    if (tripDays !== draft.tripDays) { patch.tripDays = tripDays; patch.daysAuto = false; patch.timePackage = ''; }
    if (Object.keys(patch).length) update(patch);
  }, [date, time, days, isRound]); // eslint-disable-line react-hooks/exhaustive-deps

  // Recent places (from past trips) are not suggested in the booking form: the place list shows saved places,
  // popular cities and what the rider types. The constant keeps one stable empty list across renders.
  const recent = NO_RECENT;

  const airportField: 'pickup' | 'drop' = direction === 'to' ? 'drop' : 'pickup';
  const pickerConfig = (f: 'pickup' | 'drop'): PickerConfig => {
    const airportOnly = service === 'airport' && f === airportField;
    return {
      title: f === 'pickup' ? (service === 'rental' ? 'Choose your pickup location' : 'Pickup location') : 'Drop location',
      allowCurrent: !airportOnly,
      popular: airportOnly ? AIRPORTS : QUICK_CITIES,
      popularLabel: airportOnly ? 'Airports' : service === 'rental' && f === 'pickup' ? 'Your city' : 'Popular locations',
      near: f === 'drop' ? (pickup ?? position) : position,
      pinMode: airportOnly ? undefined : f,
      ...(airportOnly ? { resultFilter: isAirportPlace, subtitle: 'Search for an airport.', placeholder: 'Search airport', emptyText: 'No airports found. Try the airport or city name.' } : {}),
      check: airportOnly ? (p) => (isAirportPlace(p) ? '' : 'Choose an airport for this transfer.') : service === 'airport' ? (p) => (isAirportPlace(p) ? 'The other end of an airport transfer should be your city address, not an airport.' : '') : undefined,
    };
  };

  const setField = (f: 'pickup' | 'drop', p: GeoPlace) => {
    if (f === 'pickup') pickupFromGps.current = true;
    update({ [f]: p } as Partial<typeof draft>);
    setErrors((e) => ({ ...e, [f]: '', form: '' }));
  };

  const changeDirection = (d: AirportDirection) => {
    if (d === direction) return;
    setDirection(d);
    update({ pickup: drop, drop: pickup });
    setErrors({});
  };

  // ── Validation ──────────────────────────────────────────────────────────
  const validate = (): Errors => {
    const e: Errors = {};
    if (!online) e.form = 'You’re offline. Reconnect to see fares.';
    else if (currentOff) e.form = `${currentKey} is currently unavailable. Please choose another service.`;
    if (!pickup) e.pickup = service === 'airport' && airportField === 'pickup' ? 'Choose the airport.' : 'Choose your pickup location.';
    else if (!isValidLatLng(pickup)) e.pickup = 'We couldn’t read this pickup’s position. Please choose it again.';
    if (service !== 'rental' && !drop) e.drop = service === 'airport' && airportField === 'drop' ? 'Choose the airport.' : 'Choose your drop location.';
    else if (service !== 'rental' && drop && !isValidLatLng(drop)) e.drop = 'We couldn’t read this drop’s position. Please choose it again.';
    if (isRound && draft.stops.some((st) => !isValidLatLng(st))) e.stops = 'A stop’s position couldn’t be read. Please choose it again.';
    // Distance rules only run on real coordinates.
    const pickupOk = !!pickup && isValidLatLng(pickup);
    const dropOk = !!drop && isValidLatLng(drop);
    if (service === 'rental' && !draft.rentalHours) e.hours = 'Select the rental hours.';
    if (service === 'pickup' && pickupOk && dropOk && haversineKm(pickup, drop) > 40) e.drop = 'Pickup & Drop is for trips inside one city. For a longer trip choose Outstation.';
    if (service === 'airport') {
      const ap = airportField === 'pickup' ? pickup : drop;
      if (ap && !isAirportPlace(ap)) e[airportField] = 'Choose an airport for this transfer.';
    }
    if (pickupOk && dropOk && service !== 'rental' && !(service === 'outstation' && tripType === 'Round Trip') && haversineKm(pickup, drop) < 0.2) e.drop = 'Pickup and drop are too close together.';
    if (tripType === 'Round Trip' && service === 'outstation') {
      const points = [pickup, ...draft.stops, drop].filter((p): p is GeoPlace => p !== null && isValidLatLng(p));
      if (points.some((p, index) => index > 0 && haversineKm(points[index - 1]!, p) < 0.2)) e.stops = 'Consecutive itinerary locations cannot be the same.';
    }
    if (isRound && (!days || days < 1 || days > RT_MAX_DAYS)) e.retDate = `Choose 1 to ${RT_MAX_DAYS} days.`;
    const at = combineDateTime(date, time);
    if (!date) e.date = 'Choose a pickup date.';
    else if (!time) e.time = 'Choose a pickup time.';
    else {
      const p = scheduleProblem(at);
      if (p) e.time = p;
    }
    return e;
  };

  const search = () => {
    if (service === 'rental' && pickup && isValidLatLng(pickup) && !isDisposalFor(drop, pickup)) update({ drop: disposalFor(pickup) });
    const e = validate();
    setErrors(e);
    const first = (['pickup', 'stops', 'drop', 'hours', 'date', 'time', 'retDate', 'retTime'] as Field[]).find((f) => e[f]);
    if (first) {
      refs.current[first]?.focus();
      refs.current[first]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    if (e.form) return;
    // City pickup & drop is priced per city, on its own page.
    if (service === 'local') {
      update({ tripType: 'One Way', multicity: false });
      navigate('/local-rentals?mode=pickup');
      return;
    }
    // A normal search is never a Multicity tour (that flag is set only by the Multicity form).
    if (draft.multicity) update({ multicity: false });
    if (auth.status !== 'ready') {
      // Account/profile loading can remount the form. Persist before opening phone sign-in;
      // PendingReturn resumes selection after authentication and the existing legal gate.
      saveDraft({ ...draft, multicity: false });
      setPendingReturn('/book/ride');
      openLoginModal({
        title: 'Sign in to compare fares',
        subtitle: 'Verify your mobile number to continue with your saved trip.',
      });
      return;
    }
    navigate('/book/ride');
  };

  const title = service === 'outstation' ? `${outstationTrip} Outstation` : SERVICE_TITLE[service];
  const fieldErr = (f: Field) =>
    errors[f] ? (
      <p className="bf-error" id={`bf-${f}-err`} role="alert">
        {errors[f]}
      </p>
    ) : null;

  const locationField = (f: 'pickup' | 'drop', label: string) => {
    const p = f === 'pickup' ? pickup : drop;
    return (
      <div className={`bf-field ${errors[f] ? 'is-invalid' : ''}`} data-pf-anchor>
        <span className={`bf-pin bf-pin--${f}`} aria-hidden="true" />
        <div className="bf-field__main">
          <label className="bf-label" id={`bf-${f}-label`} htmlFor={`bf-${f}-input`}>
            {label}
          </label>
          <PlaceField
            inputId={`bf-${f}-input`}
            inputClassName="bf-trigger"
            inputRef={(el) => {
              refs.current[f] = el;
            }}
            value={p}
            config={pickerConfig(f)}
            saved={savedPlaces}
            recent={recent}
            onSelect={(place) => setField(f, place)}
            ariaDescribedBy={errors[f] ? `bf-${f}-err` : undefined}
            invalid={!!errors[f]}
          />
          {p && p.address !== p.name && p.id !== 'place-local-disposal' ? <small className="bf-addr">{p.address}</small> : null}
        </div>
      </div>
    );
  };

  const stopConfig = (title: string): PickerConfig => ({ title, allowCurrent: true, popular: QUICK_CITIES, popularLabel: 'Popular locations', near: pickup ?? position, pinMode: 'drop' });
  const putStop = (index: number | 'new', place: GeoPlace) => {
    update((d) => ({ stops: index === 'new' ? [...d.stops, place] : d.stops.map((stop, n) => (n === index ? place : stop)) }));
    setErrors((e) => ({ ...e, stops: '', form: '' }));
    setAddingStop(false);
  };
  const stopRow = (stop: GeoPlace | null, index: number | 'new') => {
    const n = index === 'new' ? draft.stops.length + 1 : index + 1;
    const id = `bf-stop-${index}`;
    return (
      <div className="bf-field bf-stop-field" key={index === 'new' ? 'new-stop' : `${stop?.id}-${index}`} data-pf-anchor>
        <div className="bf-field__main">
          <label className="bf-label" id={`${id}-label`} htmlFor={`${id}-input`}>Stop {n}</label>
          <PlaceField inputId={`${id}-input`} inputClassName="bf-trigger" value={stop} config={{ ...stopConfig(`Stop ${n}`), placeholder: 'Add an itinerary stop' }} saved={savedPlaces} recent={recent} onSelect={(place) => putStop(index, place)} />
        </div>
        <button type="button" className="bf-stop-remove" aria-label={`Delete stop ${n}`} title={`Delete stop ${n}`} onClick={() => (index === 'new' ? setAddingStop(false) : update((d) => ({ stops: d.stops.filter((_, i) => i !== index) })))}><Icon name="trash" size={17} /></button>
      </div>
    );
  };
  const stopField = (stop: GeoPlace, index: number) => stopRow(stop, index);

  return (
    <section className="bf" id="book-console" aria-labelledby="bf-title">
      <div className="bf-head">
        <h2 id="bf-title">{title}</h2>
        <p>{service === 'multicity' ? 'Plan multi-stop itineraries with transparent upfront package quotes.' : 'Verified drivers. Upfront fares. Pay at drop.'}</p>
      </div>

      {/* Tablets and desktops (900px and wider; phones use the bottom bar instead, so only one selector shows): the same
          five services as the phone bottom bar, in its order, with its illustrated icons, routes and selected state. */}
      <nav className="bf-services bf-services--five" aria-label="Services">
        {SERVICE_BAR.map((s) => {
          const active = isBarActive(s.id, activeService);
          const key = keyOf(s.id);
          const off = s.id === 'outstation' ? serviceOff('outstation') : !!key && avail.off(key);
          const face = (
            <>
              <span className="bf-service__icon">
                <img src={s.image} alt="" width={s.size} height={s.size} draggable={false} />
              </span>
              <span>{s.label}</span>
              {off ? <small className="bf-service__off">{UNAVAILABLE_TEXT}</small> : null}
            </>
          );
          return off ? (
            <span key={s.id} className="bf-service is-off" aria-disabled="true" title={`${s.full}: ${UNAVAILABLE_TEXT}`}>
              {face}
            </span>
          ) : (
            <Link key={s.id} to={s.to} className={`bf-service ${active ? 'is-active' : ''}`} aria-label={s.full} aria-current={active ? 'page' : undefined} title={s.full}>
              {face}
            </Link>
          );
        })}
      </nav>

      {/* The running service note sits above the trip switch (One Way / Round Trip). Local and Rental are picked in the selector above. */}
      {service === 'outstation' ? (
        <ServiceNote kind={outstationTrip === 'Round Trip' ? 'roundtrip' : 'oneway'} />
      ) : service === 'multicity' ? (
        <ServiceNote kind="multicity" />
      ) : isLocalRentals(service) ? (
        <ServiceNote kind={service === 'rental' ? 'rental' : 'local'} />
      ) : null}

      {service === 'outstation' ? (
        <Tabs
          className="bf-journey"
          active={outstationTrip}
          onChange={(v) => {
            onOutstationTrip(v as 'One Way' | 'Round Trip');
            setErrors({});
          }}
          items={[
            { id: 'One Way', label: 'One Way', disabled: avail.off('One Way'), note: UNAVAILABLE_TEXT },
            { id: 'Round Trip', label: 'Round Trip', disabled: avail.off('Round Trip'), note: UNAVAILABLE_TEXT },
          ]}
        />
      ) : service === 'airport' ? (
        <Tabs
          className="bf-journey"
          active={direction}
          onChange={(v) => changeDirection(v as AirportDirection)}
          items={[
            { id: 'to', label: 'To airport' },
            { id: 'from', label: 'From airport' },
          ]}
        />
      ) : null}

      {service === 'multicity' ? (
        <MulticityForm />
      ) : (
        <form
          id="bf-form"
          className="bf-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            search();
          }}
        >
          <div className={`bf-route ${service === 'rental' ? 'bf-route--single' : ''} ${service === 'outstation' && outstationTrip === 'Round Trip' ? 'bf-route--round' : ''}`}>
            <div className="bf-route__cell">
              {locationField('pickup', service === 'rental' ? 'Pickup location' : service === 'airport' && direction === 'from' ? 'Pickup airport' : 'Pickup location')}
              {fieldErr('pickup')}
            </div>
            {(service === 'outstation' && outstationTrip !== 'Round Trip') || service === 'local' || service === 'pickup' ? (
              <button
                type="button"
                className="bf-swap"
                aria-label="Swap pickup and drop"
                title="Swap route"
                disabled={!pickup && !drop}
                onClick={() => {
                  update((d) => ({ pickup: d.drop, drop: d.pickup, stops: d.tripType === 'Round Trip' ? [...d.stops].reverse() : d.stops }));
                  setErrors((e) => ({ ...e, pickup: '', drop: '' }));
                }}
              >
                <SwapIcon size={22} />
              </button>
            ) : null}
            {service === 'outstation' && outstationTrip === 'Round Trip' ? <>{draft.stops.map(stopField)}{addingStop ? stopRow(null, 'new') : null}
                <div className="bf-route__tools">
                  {draft.stops.length < 8 && !addingStop ? <button type="button" className="bf-round-stop-add" onClick={() => setAddingStop(true)}><Icon name="plus" size={16} /> Add stop</button> : null}
                  <button
                    type="button"
                    className="bf-swap"
                    aria-label="Swap pickup and drop"
                    title="Swap route"
                    disabled={!pickup && !drop}
                    onClick={() => {
                      update((d) => ({ pickup: d.drop, drop: d.pickup, stops: d.tripType === 'Round Trip' ? [...d.stops].reverse() : d.stops }));
                      setErrors((e) => ({ ...e, pickup: '', drop: '' }));
                    }}
                  >
                    <SwapIcon size={22} />
                  </button>
                </div>
                {fieldErr('stops')}</> : null}
            {service !== 'rental' ? (
              <div className="bf-route__cell">
                {locationField('drop', service === 'airport' && direction === 'to' ? 'Drop airport' : 'Drop location')}
                {fieldErr('drop')}
                {service === 'local' ? <p className="bf-hint">Local Taxi is for a pickup and drop inside the same city.</p> : null}
              </div>
            ) : null}
          </div>
          {service === 'rental' ? (
            <>
          <div className="bf-row bf-row--single">
            <div className="bf-cell">
              <label className="bf-label bf-label--out" htmlFor="bf-rental-hours">Rental hours</label>
              <select id="bf-rental-hours" className="input bf-input" value={draft.rentalHours ?? ''} onChange={(e) => update({ rentalHours: e.target.value ? Number(e.target.value) : null })}>
                <option value="">Select hours</option>
                {RENTAL_PACKAGE_HOURS.map((h) => <option key={h} value={h}>{h} hours</option>)}
              </select>
              {fieldErr('hours')}
            </div>
          </div>
            </>
          ) : null}

          <div className={isRound ? 'bf-row bf-row--round-schedule' : 'bf-row'}>
            <div className="bf-cell bf-cell--schedule">
              <label className="bf-label bf-label--out" htmlFor="bf-date">
                Pickup date
              </label>
              <div className="bf-datewrap">
                <input
                  ref={(el) => {
                    refs.current.date = el;
                  }}
                  id="bf-date"
                  className="input bf-input"
                  type="date"
                  autoComplete="off"
                  value={date}
                  min={toDateInput(new Date())}
                  max={toDateInput(latestPickup())}
                  aria-invalid={!!errors.date || undefined}
                  aria-describedby={errors.date ? 'bf-date-err' : undefined}
                  onClick={(e) => {
                    // With the native arrow gone, tapping anywhere on the field opens the calendar.
                    try {
                      e.currentTarget.showPicker?.();
                    } catch {
                      /* the browser opens it itself */
                    }
                  }}
                  onChange={(e) => {
                    scheduleTouched.current = true;
                    datePicked.current = true;
                    setDate(e.target.value);
                    setErrors((x) => ({ ...x, date: '', time: '' }));
                  }}
                />
                {/* Quick day button: "Tomorrow" (or "Today" when the date is tomorrow). It changes only the date; the
                    calendar opens only from the date box itself. */}
                {quickDay ? (
                  <button type="button" className="bf-chip bf-chip--switch" aria-label={`Change the pickup date to ${quickDay.label.toLowerCase()}`} onClick={() => switchDay(quickDay.to)}>
                    {quickDay.label}
                  </button>
                ) : null}
              </div>
              {fieldErr('date')}
            </div>
            <div className="bf-cell bf-cell--schedule">
              <span className="bf-label bf-label--out" id="bf-time-label">
                Pickup time
              </span>
              <button
                ref={(el) => {
                  refs.current.time = el;
                }}
                type="button"
                className={`bf-time ${time ? '' : 'is-empty'}`}
                aria-labelledby="bf-time-label bf-time-value"
                aria-invalid={!!errors.time || undefined}
                aria-describedby={errors.time ? 'bf-time-err' : undefined}
                onClick={() => setTimeFor('pickup')}
              >
                <span id="bf-time-value">{time ? formatTime12(time) : ''}</span>
                <ClockIcon size={26} />
              </button>
              {fieldErr('time')}
            </div>
            {isRound ? (
              <div className="bf-cell bf-round-days">
                <label className="bf-label bf-label--out" htmlFor="bf-days">
                  {overnight ? 'Trip days' : 'Days'}{overnight ? <small className="bf-days__tag">Overnight</small> : null}
                </label>
                <div className="bf-duration-stepper" role="group" aria-label="Trip duration">
                  <button type="button" aria-label="Decrease trip days" disabled={days <= minDays} onClick={() => { setAutoOvernight(false); setDays((n) => Math.max(minDays, n - 1)); setErrors((x) => ({ ...x, retDate: '' })); }}>−</button>
                <select
                  id="bf-days"
                  className="bf-days__input"
                  value={days}
                  aria-invalid={!!errors.retDate || undefined}
                  onChange={(e) => {
                    setAutoOvernight(false);
                    setDays(Math.max(minDays, Number(e.target.value)));
                    setErrors((x) => ({ ...x, retDate: '' }));
                  }}
                >
                  {Array.from({ length: RT_MAX_DAYS - minDays + 1 }, (_, i) => i + minDays).map((n) => (
                    <option key={n} value={n}>
                      {n} {n === 1 ? 'day' : 'days'}
                    </option>
                  ))}
                </select>
                  <button type="button" aria-label="Increase trip days" disabled={days >= RT_MAX_DAYS} onClick={() => { setAutoOvernight(false); setDays((n) => Math.min(RT_MAX_DAYS, n + 1)); setErrors((x) => ({ ...x, retDate: '' })); }}>+</button>
                </div>
                <span className="bf-days__end">{date ? `${days === 1 ? 'Same day' : `Last day ${dayHint(addDaysISO(date, days - 1))}`}` : 'Pick a date'}</span>
                {fieldErr('retDate')}
              </div>
            ) : null}
          </div>


          {errors.form ? (
            <p className="bf-error bf-error--form" role="alert">
              {errors.form}
            </p>
          ) : null}
          <Button type="submit" size="lg" block className={`bf-submit ${service === 'local' ? '' : 'bf-submit--findcab'}`}>
            {service === 'local' ? 'See fares' : <FindCabLabel />}
          </Button>
        </form>
      )}

      {timeFor ? (
        <TimePicker
          title="Pickup time"
          date={date}
          value={time}
          validate="pickup"
          notBefore={null}
          resolveDate={(t) => pickupDayFor(date, t, datePicked.current)}
          onClose={() => setTimeFor(null)}
          onConfirm={(t, day) => {
            scheduleTouched.current = true;
            if (day && day !== date) setDate(day);
            setTime(t);
            setErrors((x) => ({ ...x, date: '', time: '' }));
            setTimeFor(null);
          }}
        />
      ) : null}
    </section>
  );
}
