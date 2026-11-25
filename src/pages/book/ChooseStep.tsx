// Step 2 — choose your cab: every vehicle category priced with the server's authoritative fare.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { RideCategory } from '@core/types';
import { SUPPORT_PHONE, SUPPORT_PHONE_DISPLAY } from '@core/config/constants';
import { breakupFromFare } from '@core/utils/fareBreakup';
import { formatDate, formatDistance, formatDuration, formatINR, formatTime } from '@core/utils/format';
import { BackButton, Badge, Button, EmptyState, Notice } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { useBooking, useBookingQuote } from '@/state/Booking';
import { useOnline } from '@/lib/hooks';
import { categoryGroup, categoryName, categoryPhoto, type CategoryGroup } from '@/lib/categories';
import { tripTypeLabel } from '@/lib/services';
import type { FuelChoice } from '@/shared/components/CabParts';
import { draftFuelOf, fuelOfDraft, lowestTaxable, quoteForFuel, quoteMatchesFuel, type Fuel } from '@/lib/fuelQuote';
import { FareDialog, FlowBar, PromoControl } from './parts';
import { ACCENTS, RoundVehiclePackage, vehicleTabLabel } from './RoundVehiclePackage';
import { EditTripDialog } from './EditTripDialog';
import './tripSummary.css';
import './choosePage.css';
import './cabSelect.css';
import { packageClock, packageDay } from '@core/utils/timePackages';

const TOO_FAR_KM = 1500;
type Sort = 'recommended' | 'low' | 'high';

/** Crisp 1.75px outline glyphs for this screen only (pencil, fuel pump, leaf, road). */
const LINE_GLYPHS = {
  pencil: <path d="M4 20h4L18.5 9.5a2.83 2.83 0 0 0-4-4L4 16v4ZM13.5 6.5l4 4" />,
  pump: <path d="M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M3 21h12M7 8h4M14 10h2a2 2 0 0 1 2 2v4.5a1.5 1.5 0 0 0 3 0V8.5L18 5.5" />,
  leaf: <path d="M5 19c0-8 5.5-13 15-14-.5 9.5-6 15-14 15M5 19c2.5-4 5.5-6.5 9-8.5" />,
  road: <path d="M8 3 4 21M16 3l4 18M12 4v2.5M12 10.5v3M12 17.5V20" />,
  calendar: <path d="M5 5h14a1.5 1.5 0 0 1 1.5 1.5V19a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19V6.5A1.5 1.5 0 0 1 5 5ZM3.5 10h17M8 3v4M16 3v4" />,
  clock: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7.5V12l3 2" />,
  pin: <path d="M12 21.5s-6.5-6.2-6.5-11.5a6.5 6.5 0 0 1 13 0c0 5.3-6.5 11.5-6.5 11.5ZM12 12.25a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5Z" />,
} as const;
function LineIcon({ name, size = 16 }: { name: keyof typeof LINE_GLYPHS; size?: number }) {
  return (
    <svg className="cs-ico" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {LINE_GLYPHS[name]}
    </svg>
  );
}

/** The booking's one fuel: Diesel / CNG as a compact segmented control (radio buttons), above the cab list. */
function SharedFuel({ value, onChange }: { value: Fuel; onChange: (v: Fuel) => void }) {
  const opts: { id: Fuel; label: string; icon: keyof typeof LINE_GLYPHS }[] = [
    { id: 'diesel', label: 'Diesel', icon: 'pump' },
    { id: 'cng', label: 'CNG', icon: 'leaf' },
  ];
  return (
    <div className="cs-sfuel">
      <span className="cs-sfuel__label" id="cs-fuel-label"><LineIcon name="pump" size={18} /> Fuel</span>
      <span className="cs-sfuel__sep" aria-hidden="true" />
      <div className="cs-sfuel__seg" role="radiogroup" aria-labelledby="cs-fuel-label">
        {opts.map((o) => (
          <label key={o.id} className={`cs-sfuel__opt cs-sfuel__opt--${o.id} ${value === o.id ? 'is-on' : ''}`}>
            <input type="radio" name="booking-fuel" value={o.id} checked={value === o.id} onChange={() => onChange(o.id)} />
            <LineIcon name={o.icon} size={18} />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

export function ChooseStep() {
  const navigate = useNavigate();
  const { draft, update, route, routeStatus, retryRoute, categories, categoryStatus, adjustment } = useBooking();
  const q = useBookingQuote();
  const { online } = useOnline();
  const [fareFor, setFareFor] = useState<RideCategory | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [group, setGroup] = useState<'All' | CategoryGroup>('All');
  const [sort, setSort] = useState<Sort>('recommended');
  // The fuel chosen on each card (CNG is offered only on vehicles whose CNG rates the admin has saved).
  // The fuel chosen on each card. CNG is offered only on the cab types the admin enabled it for (and that have CNG rates saved).
  const [fuelPick, setFuelPick] = useState<Record<string, FuelChoice>>({});
  const { pickup, drop, tripType, scheduledAt, categoryId } = draft;
  // A Round Trip always ends back at the pickup: the drop is simply the last place visited.
  const sameAsPickup = !!pickup && !!drop && Math.abs(pickup.lat - drop.lat) < 0.0001 && Math.abs(pickup.lng - drop.lng) < 0.0001;
  // A Multicity tour does not return to the pickup: it ends at its own final drop.
  const returnsToPickup = tripType === 'Round Trip' && !draft.multicity;
  const roundVia = draft.multicity ? draft.stops : returnsToPickup ? [...draft.stops, ...(sameAsPickup || !drop ? [] : [drop])] : [];

  // A cab type the office turned off for this location is left out completely: no card, no tab.
  const visible = useMemo(() => categories.filter((c) => !q.hidden.has(c.id)), [categories, q.hidden]);
  const groups = useMemo(() => {
    const present = new Set(visible.map(categoryGroup));
    return (['Sedan', 'SUV', 'Innova', 'Van & bus'] as CategoryGroup[]).filter((g) => present.has(g));
  }, [visible]);

  const shown = useMemo(() => {
    const list = visible.filter((c) => group === 'All' || categoryGroup(c) === group);
    if (sort === 'recommended') return list;
    const price = (c: RideCategory) => q.quotes.get(c.id)?.total ?? (sort === 'low' ? Infinity : -Infinity);
    return [...list].sort((a, b) => (sort === 'low' ? price(a) - price(b) : price(b) - price(a)));
  }, [visible, group, sort, q.quotes]);

  // If the chosen cab type is one that is now hidden, move to the first one still offered.
  useEffect(() => {
    if (!categoryId || !q.hidden.has(categoryId)) return;
    const next = visible.find((c) => !q.unavailable.has(c.id)) ?? visible[0];
    if (next) update({ categoryId: next.id });
  }, [categoryId, q.hidden, q.unavailable, visible, update]);

  if (!pickup || !drop) return null;

  const tooFar = !!route && route.distanceKm > TOO_FAR_KM;
  const selected = q.category;
  const quote = q.quote;
  const roundPick = tripType === 'Round Trip' && !draft.multicity;
  const cngOf = (c: RideCategory) => q.entries.get(c.id)?.cng ?? null;
  // One fuel for the whole booking (draft.fuelType). Every cab card shows the server's quote on that fuel; a cab without a
  // quote on it (e.g. no CNG rate card) is shown as not offered on that fuel, never priced with the other fuel's fare.
  const sharedFuel: Fuel = fuelOfDraft(draft.fuelType);
  const fuelQuote = (c: RideCategory) => quoteForFuel(q.entries.get(c.id), sharedFuel);
  const offersCng = sharedFuel === 'cng' || visible.some((c) => !!cngOf(c));
  const chooseSharedFuel = (f: Fuel) => update({ fuelType: draftFuelOf(f) });
  // Continue: a quoted cab, and the booking's current quote must be that cab's quote on the chosen fuel.
  const canContinue = q.authoritative && !!quote && !tooFar && !!selected && !q.unavailable.has(selected.id) && (roundPick || quoteMatchesFuel(quote, q.entries.get(selected.id), sharedFuel));
  const selectedFuelMissing = !roundPick && !!selected && !q.unavailable.has(selected.id) && !!q.entries.get(selected.id)?.ok && !fuelQuote(selected);
  // Round trips keep their own per-vehicle fuel choice inside the Vehicle & Package view (package fares are per vehicle).
  const fuelOf = (c: RideCategory): FuelChoice => (cngOf(c) ? fuelPick[c.id] ?? (c.id === categoryId && draft.fuelType === 'cng' ? 'cng' : 'diesel') : 'diesel');
  const chooseCategory = (c: RideCategory) => (roundPick ? update({ categoryId: c.id, fuelType: fuelOf(c) === 'cng' ? 'cng' : '' }) : update({ categoryId: c.id }));
  const chooseFuel = (c: RideCategory, f: FuelChoice) => {
    setFuelPick((p) => ({ ...p, [c.id]: f }));
    update({ categoryId: c.id, fuelType: f === 'cng' ? 'cng' : '' });
  };
  const breakupFor = (c: RideCategory) => {
    if (!roundPick) return fuelQuote(c)?.breakup ?? (fuelQuote(c) ? breakupFromFare(fuelQuote(c)!.fare) : null);
    const alt = fuelOf(c) === 'cng' ? cngOf(c) : null;
    if (alt) return alt.breakup;
    // The server's own breakup for this vehicle: it carries the night allowance and the platform fee when they apply.
    const own = q.entries.get(c.id);
    if (own?.ok && own.breakup) return own.breakup;
    if (c.id === selected?.id && q.breakup) return q.breakup;
    const f = q.quotes.get(c.id);
    return f ? breakupFromFare(f) : null;
  };

  // "Lowest fare": only among the cabs quoted on the chosen fuel, and only when there is a real difference.
  const lowestFare = lowestTaxable(shown.filter((c) => !q.unavailable.has(c.id)).map(fuelQuote)) ?? -1;

  const handleNext = () => {
    if (canContinue) navigate('/book/confirm');
  };

  return (
    <div className="flow-page flow-page--choose flow-page--cabs">
      <div className="wrap flow-page__wrap">
        <div className="choose">
          <div className="choose__main">
            <section className="trip-sum trip-sum--compact" aria-label="Trip summary">
              <h1 className="sr-only">Choose your vehicle</h1>
              <div className="trip-sum__body ts2">
                {scheduledAt ? (
                  <div className="ts2__when">
                    <span><LineIcon name="calendar" size={18} /> {formatDate(scheduledAt)}</span>
                    <span><LineIcon name="clock" size={18} /> {formatTime(scheduledAt)}</span>
                  </div>
                ) : null}
                <div className="ts2__mid">
                  <div className="ts2__route">
                    <p className="ts2__stop ts2__stop--from"><span className="ts2__dot" aria-hidden="true" /><span className="sr-only">From </span><strong>{pickup.name}</strong></p>
                    <span className="ts2__line" aria-hidden="true" />
                    <p className="ts2__stop ts2__stop--to"><span className="ts2__pin" aria-hidden="true"><LineIcon name="pin" size={18} /></span><span className="sr-only">To </span><strong>{returnsToPickup ? pickup.name : drop.id === 'place-local-disposal' ? 'Local City Disposal' : drop.name}</strong></p>
                    {roundVia.length ? <p className="trip-sum__via ts2__via"><LineIcon name="road" size={14} /> Via {roundVia.map((stop) => stop.name).join(' → ')}</p> : null}
                    {roundPick && q.selectedPackage ? (
                      <p className="trip-sum__via ts2__via"><LineIcon name="clock" size={14} /> {q.selectedPackage.days} calendar {q.selectedPackage.days === 1 ? 'day' : 'days'} · Return by {packageDay(new Date(q.selectedPackage.endAt))}, {packageClock(new Date(q.selectedPackage.endAt))}</p>
                    ) : null}
                  </div>
                  {tripType !== 'Local Rental' ? (
                    <button type="button" className="trip-sum__edit ts2__edit" onClick={() => setEditOpen(true)} aria-label="Modify pickup date, time and trip days">
                      <LineIcon name="pencil" size={16} /> Modify
                    </button>
                  ) : null}
                </div>
                <div className="ts2__strip">
                  <span className="ts2__type">{tripTypeLabel(draft.multicity ? 'Multicity' : tripType)}</span>
                  {route && tripType !== 'Local Rental' ? (
                    <>
                      <span className="ts2__sep" aria-hidden="true" />
                      <span className="ts2__fact ts2__fact--km"><LineIcon name="road" size={16} /> <b>{formatDistance(q.trip?.distanceKm ?? route.totalDistanceKm ?? route.distanceKm)}</b></span>
                      <span className="ts2__sep" aria-hidden="true" />
                      <span className="ts2__fact ts2__fact--time"><LineIcon name="clock" size={16} /> <span>about {formatDuration(q.trip?.durationMin ?? route.totalDurationMin ?? route.durationMin)}</span></span>
                    </>
                  ) : null}
                </div>
              </div>
            </section>
            {editOpen ? <EditTripDialog onClose={() => setEditOpen(false)} /> : null}

            {q.hillStations.length ? (
              <aside className="hillnote" role="status">
                <span className="hillnote__icon" aria-hidden="true"><Icon name="mountain" size={20} /></span>
                <div className="hillnote__text">
                  <strong>Hill station · {q.hillStations.map((h) => h.name).join(', ')}</strong>
                  <span>A hill station charge is added to your fare{q.breakup?.lines.some((l) => l.key === 'hillStation') ? '.' : ' and confirmed by our team.'}</span>
                  {tripType === 'Round Trip' ? <span>5-hour and 8-hour packages do not apply.</span> : null}
                </div>
              </aside>
            ) : null}

            <div className="choose__notices">
              {!online ? (
                <Notice variant="error" icon="warning">
                  You are offline right now. Vehicle prices will update automatically once connection is restored.
                </Notice>
              ) : null}

              {routeStatus === 'error' ? (
                <Notice
                  variant="warning"
                  icon="warning"
                  action={
                    <Button variant="secondary" size="sm" onClick={retryRoute}>
                      Retry Route
                    </Button>
                  }
                >
                  We couldn't get highway routing right now. Fares use direct distance until road routing reconnects.
                </Notice>
              ) : null}

              {tooFar ? (
                <Notice variant="warning" icon="warning">
                  Journeys over {TOO_FAR_KM} km require a custom multi-day itinerary.{' '}
                  <a href={`tel:${SUPPORT_PHONE}`}>Call {SUPPORT_PHONE_DISPLAY}</a> to plan with dispatch.
                </Notice>
              ) : null}

              {categoryStatus === 'error' ? (
                <Notice variant="error" icon="warning">
                  We couldn't load the available vehicles. Please check your connection and refresh the page.
                </Notice>
              ) : categoryStatus === 'unavailable' ? (
                <Notice variant="warning" icon="warning">
                  No vehicles are configured for online booking right now. Please call <a href={`tel:${SUPPORT_PHONE}`}>{SUPPORT_PHONE_DISPLAY}</a>.
                </Notice>
              ) : null}

              {q.quoteError ? (
                <Notice
                  variant="error"
                  icon="warning"
                  action={<Button variant="secondary" size="sm" onClick={q.retryQuote}>Retry Fare</Button>}
                >
                  {q.quoteError}
                </Notice>
              ) : null}
            </div>


            {q.customQuote ? (
              <Notice variant="warning" icon="info">
                Round trips of {draft.tripDays} days are quoted individually, so the fare is not shown here. Please{' '}
                <a href={`tel:${SUPPORT_PHONE}`}>call {SUPPORT_PHONE_DISPLAY}</a> for a custom quote, or choose fewer days.
              </Notice>
            ) : null}

            {roundPick ? (
              <RoundVehiclePackage
                categories={visible}
                selected={selected}
                entries={q.entries}
                unavailable={q.unavailable}
                packages={q.packages}
                selectedPackage={q.selectedPackage}
                autoDays={q.autoDays}
                fuel={selected ? fuelOf(selected) : 'diesel'}
                hasCng={!!selected && !!cngOf(selected)}
                scheduledAt={scheduledAt}
                loading={categoryStatus === 'loading'}
                quoteLoading={q.quoteLoading}
                onPickVehicle={chooseCategory}
                onPickPackage={(id) => update({ timePackage: id })}
                onFuel={chooseFuel}
                onFareDetails={setFareFor}
              />
            ) : null}

            {roundPick || !offersCng ? null : <SharedFuel value={sharedFuel} onChange={chooseSharedFuel} />}

            {roundPick ? null : <div className="fcabs" role="radiogroup" aria-label="Available cabs">
              {categoryStatus === 'loading' && categories.length === 0 ? (
                <>
                  <div className="skeleton fcab-skel" />
                  <div className="skeleton fcab-skel" />
                  <div className="skeleton fcab-skel" />
                </>
              ) : null}

              {shown.map((c, index) => {
                const isSelected = c.id === categoryId;
                const fq = fuelQuote(c);
                const fare = fq?.fare;
                const unavailable = q.unavailable.has(c.id);
                // Quoted by the server, but not on the chosen fuel (no CNG rate card for this cab).
                const fuelMissing = !unavailable && !!q.entries.get(c.id)?.ok && !fq;
                const disabled = unavailable || fuelMissing || tooFar;
                const photo = categoryPhoto(c);
                const name = categoryName(c);
                const entry = q.entries.get(c.id);
                const strikeTotal = fq?.strikeTotal ?? 0;
                const strike = fare && strikeTotal > 0 && fare.total > 0 ? Math.round((fare.taxableAmount * strikeTotal) / fare.total) : 0;
                const cheapest = !!fare && fare.taxableAmount === lowestFare;
                // The kilometres this fare includes, as the server quoted them for this fuel (never the route estimate).
                const includedKm = fq?.includedKm ?? 0;

                return (
                  <div
                    key={c.id}
                    className={`fcab ${isSelected ? 'is-on' : ''} ${disabled ? 'is-disabled' : ''}`}
                    data-acc={ACCENTS[index % ACCENTS.length]}
                    onClick={() => !disabled && chooseCategory(c)}
                    role="radio"
                    aria-checked={isSelected}
                    aria-disabled={disabled || undefined}
                    tabIndex={disabled ? -1 : 0}
                    onKeyDown={(e) => {
                      if ((e.key === ' ' || e.key === 'Enter') && !disabled && e.target === e.currentTarget) {
                        e.preventDefault();
                        chooseCategory(c);
                      }
                    }}
                  >
                    {cheapest ? <span className="fcab__badge"><Icon name="star" size={11} /> Lowest fare</span> : null}
                    <div className="fcab__top">
                      <span className="fcab__photo">
                        <img src={photo} alt={c.name} loading={index < 4 ? 'eager' : 'lazy'} decoding="async" fetchPriority={index < 2 ? 'high' : 'auto'} />
                      </span>
                      <span className="fcab__ttl">
                        <strong>{c.iconUrl ? <img className="fcab__icon" src={c.iconUrl} alt="" width={22} height={22} loading="lazy" /> : null}{name}</strong>
                        <small>{vehicleTabLabel(c.name)}</small>
                      </span>
                      <span className="fcab__tick" aria-hidden="true">{isSelected ? <Icon name="check" size={14} /> : null}</span>
                    </div>

                    <ul className="fcab__facts">
                      <li><Icon name="seats" size={14} /> <span><b>{c.seats}</b> seats</span></li>
                      <li><Icon name="snowflake" size={14} /> <span><b>AC</b> cab</span></li>
                      <li><Icon name="luggage" size={14} /> <span><b>{(c as any).luggage ?? (c.seats >= 6 ? 4 : 2)}</b> bags</span></li>
                    </ul>

                    {fq ? (
                      <p className="cs-strip">
                        <span className={`cs-strip__fuel cs-strip__fuel--${sharedFuel}`}>
                          <span className="cs-well"><LineIcon name={sharedFuel === 'cng' ? 'leaf' : 'pump'} size={14} /></span>
                          {sharedFuel === 'cng' ? 'CNG' : 'Diesel'}
                        </span>
                        {includedKm ? (
                          <>
                            <span className="cs-strip__sep" aria-hidden="true" />
                            <span className="cs-strip__km">
                              <span className="cs-well cs-well--blue"><LineIcon name="road" size={14} /></span>
                              <b>{+includedKm.toFixed(1)} km</b> <small>included</small>
                            </span>
                          </>
                        ) : null}
                      </p>
                    ) : null}

                    <div className="fcab__foot">
                      <div className="fcab__foot-price">
                          <span className="fcab__price">
                            {fare ? (
                              <>
                                {strike > 0 ? <s>{formatINR(strike)}</s> : null}
                                <b>{formatINR(fare.taxableAmount)}</b>
                                {fare.gst > 0 ? <small>+ {formatINR(fare.gst)} GST</small> : null}
                              </>
                            ) : unavailable ? (
                              <span className="fcab__na">{q.unavailable.get(c.id) || 'Unavailable for this route'}</span>
                            ) : fuelMissing ? (
                              <span className="fcab__na">CNG is not offered for this cab. Switch to Diesel to book it.</span>
                            ) : (
                              <span className="fcab__price-skel skeleton" />
                            )}
                          </span>
                        {fare && fare.discount > 0 ? <span className="fcab__saving"><Icon name="tag" size={13} /> Save {formatINR(fare.discount)}</span> : null}
                      </div>
                      {fare ? (
                        <button
                          type="button"
                          className="fcab__details"
                          onClick={(e) => {
                            e.stopPropagation();
                            setFareFor(c);
                          }}
                        >
                          <Icon name="receipt" size={14} /> Fare details
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}

              {shown.length === 0 && categoryStatus === 'ready' ? (
                <EmptyState
                  title="No vehicles match this filter"
                  action={
                    <Button variant="secondary" onClick={() => setGroup('All')}>
                      Show All Vehicles
                    </Button>
                  }
                >
                  Try selecting "All Vehicles" to browse our complete driver fleet.
                </EmptyState>
              ) : null}
            </div>}
          </div>

          <aside className="choose__aside">
            <div className="sel-card">
              <div className="sel-card__top">
                <span className="sel-card__eyebrow">Trip Summary</span>
                <Badge variant="blue">{tripTypeLabel(draft.multicity ? 'Multicity' : tripType)}</Badge>
              </div>

              {selected ? (
                <div className="sel-card__car">
                  <div>
                    <strong>{categoryName(selected)}</strong>
                    <small className="muted">{selected.seats} seats · AC</small>
                  </div>
                  <img src={categoryPhoto(selected)} alt={selected.name} decoding="async" />
                </div>
              ) : (
                <div className="sel-card__placeholder muted">Please choose a vehicle category from the list.</div>
              )}

              <dl className="sel-card__trip">
                <div>
                  <dt>Pickup Point</dt>
                  <dd>{pickup.name}</dd>
                </div>
                <div>
                  <dt>Destination</dt>
                  <dd>{drop.id === 'place-local-disposal' ? 'Within City Disposal' : drop.name}</dd>
                </div>
                {scheduledAt ? (
                  <div>
                    <dt>Pickup Schedule</dt>
                    <dd>{formatDate(scheduledAt)}, {formatTime(scheduledAt)}</dd>
                  </div>
                ) : null}
              </dl>

              <PromoControl
                code={draft.promoCode}
                applied={!!quote && quote.discount > 0}
                onApply={(code) => update({ promoCode: code })}
                onRemove={() => update({ promoCode: '' })}
              />

              {quote ? (
                <>
                  <div className="sel-card__total">
                    <div>
                      <span>Estimated Upfront Fare</span>
                      {quote.discount > 0 ? (
                        <p className="sel-card__saving">Promo applied: -{formatINR(quote.discount)}</p>
                      ) : null}
                    </div>
                    <strong>{formatINR(quote.total)}</strong>
                  </div>

                  <p className="sel-card__fine">
                    
                  </p>

                  <Button
                    variant="primary"
                    size="lg"
                    block
                    disabled={!canContinue}
                    onClick={handleNext}
                    iconTrailing="arrow-right"
                  >
                    Book Now
                  </Button>
                </>
              ) : (
                <Button variant="primary" size="lg" block disabled>
                  Select a Cab
                </Button>
              )}
            </div>
          </aside>
        </div>
      </div>

      <FlowBar
        onNext={handleNext}
        nextLabel="Continue"
        nextIcon="arrow-right"
        nextDisabled={!canContinue}
        total={quote?.total}
        hideFare
        onBack={() => navigate(tripType === 'Local Rental' ? '/local-rentals?mode=hourly' : draft.multicity ? '/book?service=multicity' : '/book')}
        backLabel="Back"
        backText
      />

      {fareFor && breakupFor(fareFor) ? (
        <FareDialog fare={breakupFor(fareFor)!} onClose={() => setFareFor(null)} />
      ) : null}
    </div>
  );
}
export default ChooseStep;
