// Multicity tour form for People Taxi: pickup, any number of cities along the way, the final drop, and the departure and
// return schedule. "Find Cab" turns it into a booking draft (a Round Trip through those cities, priced from the Multicity
// rates) and opens the normal flow: cabs with their fares, review, then Confirm booking.
import { FindCabLabel } from './FindCabLabel';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ClockIcon } from '@/shared/components/CabParts';
import { useNavigate } from 'react-router-dom';
import type { GeoPlace } from '@core/types';
import { scheduleProblem } from '@core/utils/bookingRules';
import { newId } from '@core/services/callables';
import { useCustomerData } from '@/state/customer';
import { useAuth } from '@/state/Auth';
import { useBooking } from '@/state/Booking';
import { setPendingReturn } from '@/lib/pendingReturn';
import { saveDraft } from '@/lib/draft';
import { loadMulticityDraft, multicityInstant, validMulticityDate, validMulticityPlace, type MulticityDraft } from '@core/utils/multicityDraft';
import { useDeviceLocation, useLivePickupDefault, useOnline, useToday } from '@/lib/hooks';
import { reverseGeocode } from '@core/services/geoService';
import { combineDateTime, defaultPickup, latestPickup, quickDaySwitch, timeForDay, toDateInput } from '@/lib/schedule';
import { Button } from '@/components/ui';
import { Icon } from '@/components/Icon';
import type { PickerConfig } from '@/components/LocationPicker';
import { PlaceField } from '@/components/PlaceField';
import { TimePicker, formatTime12 } from '@/components/TimePicker';
import { DatePicker, opensDatePicker } from '@/components/DatePicker';
import { QUICK_CITIES } from './content';
import { msg, useT } from '@/i18n';

type StoredMulticityState = MulticityDraft;

const STORAGE_KEY = 'peopletaxi.multicity.v1';

function loadStoredState(): StoredMulticityState {
  try { return loadMulticityDraft(sessionStorage.getItem(STORAGE_KEY)); }
  catch { return loadMulticityDraft(null); }
}

const MAX_CITIES = 10;

function saveStoredState(state: StoredMulticityState) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage write issues
  }
}

/** Every time the form opens the pickup starts at today, 30 minutes from now (a time from an earlier visit is not kept). */
function withDefaultSchedule(s: StoredMulticityState): StoredMulticityState {
  const next = defaultPickup();
  return { ...s, date: next.date, time: next.time };
}

/** No recent-place suggestions in the booking form. One stable empty list. */
const NO_RECENT: GeoPlace[] = [];

export function MulticityForm() {
  const { state: auth, openLoginModal } = useAuth();
  const { savedPlaces } = useCustomerData();
  const { online } = useOnline();
  const navigate = useNavigate();
  const { draft, update } = useBooking();
  const t = useT();

  const [state, setState] = useState<StoredMulticityState>(() => withDefaultSchedule(loadStoredState()));
  // Until the rider picks a date or time, the default keeps following the clock (always 30 minutes from now).
  const scheduleTouched = useRef(false);
  // Re-renders at midnight, so the "Today" / "Tomorrow" button on the date follows the calendar.
  useToday();
  // The quick day button above the date: moves the date only (the time is kept while it can be booked).
  const switchDay = (to: string) => {
    scheduleTouched.current = true;
    setState((s) => ({ ...s, date: to, time: timeForDay(to, s.time) }));
    setErrors((x) => ({ ...x, date: '', time: '' }));
  };
  const quickDay = state.date ? quickDaySwitch(state.date) : null;
  useLivePickupDefault(scheduleTouched, (next) => {
    setState((s) => (s.date === next.date && s.time === next.time ? s : { ...s, date: next.date, time: next.time }));
  });
  // The device location becomes the pickup by default, unless one was chosen.
  const { position } = useDeviceLocation(true, true);
  const pickupFromGps = useRef(false);
  useEffect(() => {
    if (!position || pickupFromGps.current || state.pickup) return;
    pickupFromGps.current = true;
    void reverseGeocode(position).then((p) => {
      setState((s) => (s.pickup ? s : { ...s, pickup: { ...p, type: 'current' } }));
    });
  }, [position, state.pickup]);
  const [addingStop, setAddingStop] = useState(false);
  const [timeFor, setTimeFor] = useState<'pickup' | 'return' | null>(null);
  const [dateOpen, setDateOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Synchronize draft changes into sessionStorage
  useEffect(() => {
    saveStoredState(state);
  }, [state]);

  // Recent places (from past trips) are not suggested in the booking form, same as the main form.
  const recentPlaces = NO_RECENT;

  const scheduled = useMemo(() => {
    if (!state.date || !state.time) return null;
    const instant = multicityInstant(state.date, state.time);
    return instant ? new Date(instant) : null;
  }, [state.date, state.time]);

  // Only chosen cities are shown; "Add city" opens the picker for the next one.
  const cities = useMemo(() => state.stops.filter((s) => s.place), [state.stops]);

  const todayStr = useMemo(() => toDateInput(new Date()), []);
  // Worked out on every render: the office's advance-booking limit can arrive after the form opens.
  const maxDateStr = toDateInput(latestPickup());

  const removeStop = (id: string) => {
    setState((s) => ({ ...s, stops: s.stops.filter((st) => st.id !== id) }));
  };

  const onPickPlace = (pickerTarget: 'pickup' | 'drop' | string, p: GeoPlace) => {
    if (pickerTarget === 'pickup') {
      setState((s) => ({ ...s, pickup: p }));
      setErrors((e) => {
        const next = { ...e };
        delete next.pickup;
        delete next.itinerary;
        return next;
      });
    } else if (pickerTarget === 'drop') {
      setState((s) => ({ ...s, drop: p }));
      setErrors((e) => {
        const next = { ...e };
        delete next.drop;
        delete next.itinerary;
        return next;
      });
    } else if (pickerTarget) {
      setState((s) => ({
        ...s,
        stops: pickerTarget === 'new'
          ? [...s.stops.filter((st) => st.place), { id: newId('stop'), place: p }]
          : s.stops.map((st) => (st.id === pickerTarget ? { ...st, place: p } : st)),
      }));
      setErrors((e) => {
        const next = { ...e };
        delete next[`stop_${pickerTarget}`];
        delete next.stops;
        delete next.itinerary;
        return next;
      });
    }
    setAddingStop(false);
  };

  const configFor = (pickerTarget: 'pickup' | 'drop' | string): PickerConfig => {
    if (pickerTarget === 'pickup') {
      return {
        title: t('Choose Pickup Location'),
        allowCurrent: true,
        popular: QUICK_CITIES,
        popularLabel: t('Major Cities'),
        pinMode: 'pickup',
      };
    }
    if (pickerTarget === 'drop') {
      return {
        title: t('Choose Drop Location'),
        allowCurrent: true,
        popular: QUICK_CITIES,
        popularLabel: t('Popular Destinations'),
        pinMode: 'drop',
      };
    }
    const found = state.stops.filter((s) => s.place).findIndex((s) => s.id === pickerTarget);
    const idx = found < 0 ? cities.length : found;
    return {
      title: t('Choose City {n}', { n: idx + 1 }),
      allowCurrent: true,
      popular: QUICK_CITIES,
      popularLabel: t('Popular Cities'),
      pinMode: 'drop',
    };
  };

  const validate = (): boolean => {
    const err: Record<string, string> = {};
    if (!validMulticityPlace(state.pickup)) {
      err.pickup = msg('Please select a starting pickup location.');
    }
    if (!validMulticityPlace(state.drop)) {
      err.drop = msg('Please select a final destination drop point.');
    }

    const filledStops = state.stops.filter((s) => s.place !== null);
    if (filledStops.length === 0) {
      err.stops = msg('Add at least one city between pickup and drop.');
    }

    // Verify consecutive duplicates across the ordered itinerary
    const allPoints = [state.pickup, ...filledStops.map((s) => s.place), state.drop].filter(Boolean) as GeoPlace[];
    for (let i = 0; i < allPoints.length - 1; i++) {
      if (allPoints[i].name.trim().toLowerCase() === allPoints[i + 1].name.trim().toLowerCase()) {
        err.itinerary = `Consecutive stop duplicate: "${allPoints[i].name}" cannot immediately follow itself.`;
        break;
      }
    }

    if (!validMulticityDate(state.date)) err.date = msg('Select a valid pickup date.');
    if (!scheduled) err.time = msg('Select a valid pickup date and time.');

    if (scheduled) {
      const prob = scheduleProblem(scheduled);
      if (prob) err.time = prob;
    }

    if (filledStops.some((stop) => !validMulticityPlace(stop.place))) err.stops = msg('Choose a valid location for every city.');

    if (!online) {
      err.form = msg('You are currently offline. Please check your internet connection.');
    }

    setErrors(err);
    return Object.keys(err).length === 0;
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate() || !scheduled) return;
    // The tour becomes the booking draft: a Round Trip through these cities, priced from the Multicity rates.
    const filledStops = state.stops.filter((s) => s.place !== null).map((s) => ({ ...s.place!, id: s.place!.id }));
    const next = {
      ...draft,
      pickup: state.pickup!,
      drop: state.drop!,
      stops: filledStops,
      tripType: 'Round Trip' as const,
      multicity: true,
      scheduledAt: scheduled,
      scheduleByRider: scheduleTouched.current,
      // No return date is asked: the tour is quoted from the pickup instant.
      tripEndAt: scheduled,
      promoCode: '',
    };
    update(next);
    if (auth.status !== 'ready') {
      // Persist before opening sign-in; the booking resumes at the cab list once the rider is signed in.
      saveDraft(next);
      setPendingReturn('/book/ride');
      openLoginModal({
        title: msg('Sign in to see cabs and fares'),
        subtitle: msg('Verify your mobile number to continue with your tour.'),
      });
      return;
    }
    navigate('/book/ride');
  };

  return (
    <form className="bf-multicity" onSubmit={onSubmit} noValidate>
      <fieldset className="bf-fieldset">
      {/* ── Route & Stops Section ── */}
      <div className="bf-section" role="group" aria-label={t('Route and stops')}>
        {/* 1. Starting Pickup Point */}
        <div className={`bf-field ${errors.pickup ? 'is-invalid' : ''}`} data-pf-anchor>
          <span className="bf-pin" aria-hidden="true" />
          <div className="bf-field__main">
            <label className="bf-label" id="mc-pickup-label" htmlFor="mc-pickup-input">
              {t('Pickup location')}
            </label>
            <PlaceField inputId="mc-pickup-input" inputClassName="bf-trigger" value={state.pickup} config={configFor('pickup')} saved={savedPlaces} recent={recentPlaces} onSelect={(p) => onPickPlace('pickup', p)} invalid={!!errors.pickup} />
            {state.pickup?.address && state.pickup.address !== state.pickup.name ? (
              <small className="bf-addr">{state.pickup.address}</small>
            ) : null}
          </div>
        </div>
        {errors.pickup ? <p className="bf-error">{t(errors.pickup)}</p> : null}

        {/* 2. Cities along the way: only the chosen ones show, then a plain "Add city" button */}
        {cities.map((stop, index) => (
          <div key={stop.id} className="bf-field" data-pf-anchor>
            <span className="bf-pin bf-pin--stop" aria-hidden="true" />
            <div className="bf-field__main">
              <label className="bf-label" id={`mc-city-${index}-label`} htmlFor={`mc-city-${index}-input`}>
                {t('Stop {n}', { n: index + 1 })}
              </label>
              <PlaceField inputId={`mc-city-${index}-input`} inputClassName="bf-trigger" value={stop.place} config={configFor(stop.id)} saved={savedPlaces} recent={recentPlaces} onSelect={(p) => onPickPlace(stop.id, p)} />
              {stop.place?.address && stop.place.address !== stop.place.name ? <small className="bf-addr">{stop.place.address}</small> : null}
            </div>
            <button type="button" className="bf-stop-remove" aria-label={t('Delete stop {n}', { n: index + 1 })} onClick={() => removeStop(stop.id)}>
              <Icon name="trash" size={16} />
            </button>
          </div>
        ))}
        {addingStop ? (
          <div className="bf-field" data-pf-anchor>
            <span className="bf-pin bf-pin--stop" aria-hidden="true" />
            <div className="bf-field__main">
              <label className="bf-label" htmlFor="mc-city-new-input">
                {t('Stop {n}', { n: cities.length + 1 })}
              </label>
              <PlaceField inputId="mc-city-new-input" inputClassName="bf-trigger" value={null} config={{ ...configFor('new'), placeholder: t('Add a city or stop') }} saved={savedPlaces} recent={recentPlaces} onSelect={(p) => onPickPlace('new', p)} />
            </div>
            <button type="button" className="bf-stop-remove" aria-label={t('Cancel new stop')} onClick={() => setAddingStop(false)}>
              <Icon name="trash" size={16} />
            </button>
          </div>
        ) : null}
        {cities.length < MAX_CITIES && !addingStop ? (
          <div className="bf-route__tools">
            <button type="button" className={`bf-round-stop-add ${errors.stops ? 'is-invalid' : ''}`} onClick={() => setAddingStop(true)}>
              <Icon name="plus" size={16} /> {t('Add stop')}
            </button>
          </div>
        ) : null}
        {errors.stops ? <p className="bf-error">{t(errors.stops)}</p> : null}

        {/* 3. Final Drop Point */}
        <div className={`bf-field ${errors.drop ? 'is-invalid' : ''}`} data-pf-anchor>
          <span className="bf-pin bf-pin--drop" aria-hidden="true" />
          <div className="bf-field__main">
            <label className="bf-label" id="mc-drop-label" htmlFor="mc-drop-input">
              {t('Drop location')}
            </label>
            <PlaceField inputId="mc-drop-input" inputClassName="bf-trigger" value={state.drop} config={configFor('drop')} saved={savedPlaces} recent={recentPlaces} onSelect={(p) => onPickPlace('drop', p)} invalid={!!errors.drop} />
            {state.drop?.address && state.drop.address !== state.drop.name ? (
              <small className="bf-addr">{state.drop.address}</small>
            ) : null}
          </div>
        </div>
        {errors.drop ? <p className="bf-error">{t(errors.drop)}</p> : null}
        {errors.itinerary ? <p className="bf-error">{t(errors.itinerary)}</p> : null}

      </div>

      {/* ── Schedule Section ── */}
      <div className="bf-section" role="group" aria-label={t('Trip schedule')}>
        <div className="bf-row">
          <div className="bf-cell bf-cell--schedule">
            <label className="bf-label bf-label--out" htmlFor="mc-date">
              {t('Pickup date')}
            </label>
            <div className="bf-datewrap">
              <input
                id="mc-date"
                type="date"
                autoComplete="off"
                className="input bf-input"
                min={todayStr}
                max={maxDateStr}
                value={state.date}
                {...opensDatePicker(() => setDateOpen(true))}
                required
              />
              {/* Quick day button: "Tomorrow" (or "Today" when the date is tomorrow). It changes only the date; the
                  calendar opens only from the date box itself. */}
              {quickDay ? (
                <button type="button" className="bf-chip bf-chip--switch" aria-label={t('Change the pickup date to {day}', { day: t(quickDay.label) })} onClick={() => switchDay(quickDay.to)}>
                  {t(quickDay.label)}
                </button>
              ) : null}
            </div>
            {errors.date ? <p className="bf-error">{t(errors.date)}</p> : null}
          </div>

          <div className="bf-cell bf-cell--schedule">
            <span className="bf-label bf-label--out" id="mc-time-label">
              {t('Pickup time')}
            </span>
            <button
              id="mc-time-btn"
              type="button"
              className={`bf-time ${state.time ? '' : 'is-empty'}`}
              aria-labelledby="mc-time-label mc-time-val"
              onClick={() => setTimeFor('pickup')}
            >
              <span id="mc-time-val">{state.time ? formatTime12(state.time) : ''}</span>
              <ClockIcon size={26} />
            </button>
            {errors.time ? <p className="bf-error">{t(errors.time)}</p> : null}
          </div>
        </div>
      </div>

      {errors.form ? (
        <p className="bf-error bf-error--form" role="alert">
          {t(errors.form)}
        </p>
      ) : null}

      {/* ── Action Buttons ── */}
      <div className="bf-actions">
        <Button
          type="submit"
          variant="primary"
          size="lg"
          block
          className="bf-submit bf-submit--findcab"
        >
          <FindCabLabel />
        </Button>
      </div>

      {dateOpen ? (
        <DatePicker
          title={t('Pickup date')}
          value={state.date}
          min={todayStr}
          max={maxDateStr}
          onClose={() => setDateOpen(false)}
          onSelect={(iso) => {
            scheduleTouched.current = true;
            setState((s) => ({ ...s, date: iso }));
            setErrors((x) => ({ ...x, date: '', time: '' }));
            setDateOpen(false);
          }}
        />
      ) : null}
      {/* ── Time Picker Modal ── */}
      {timeFor ? (
        <TimePicker
          title={t('Pickup time')}
          date={state.date}
          value={state.time}
          validate="pickup"
          notBefore={null}
          onClose={() => setTimeFor(null)}
          onConfirm={(t, day) => {
            scheduleTouched.current = true;
            setState((s) => ({ ...s, time: t, date: day || s.date }));
            setErrors((x) => ({ ...x, date: '', time: '' }));
            setTimeFor(null);
          }}
        />
      ) : null}
      </fieldset>
    </form>
  );
}

