// Step 3 — "Complete your booking": contact & passenger details, add-ons, payment, coupon, terms and submission.
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { FareBreakdown as Fare } from '@core/types';
import { useCustomerData } from '@/state/customer';
import { createRideRequest } from '@core/services/rideService';
import { breakupFromFare } from '@core/utils/fareBreakup';
import { packageClock, packageDay, requestedTripDays } from '@core/utils/timePackages';
import { scheduleProblem } from '@core/utils/bookingRules';
import { formatDate, formatDistance, formatDuration, formatINR, formatTime, isValidEmail, isValidIndianMobile } from '@core/utils/format';
import { describeError } from '@core/utils/retry';
import { BackButton, Button, Notice, PageHead } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { useBooking, useBookingQuote } from '@/state/Booking';
import { useAuth } from '@/state/Auth';
import { useOnline } from '@/lib/hooks';
import { composeNotes, notesRoom } from '@/lib/notes';
import { PolicyLinks } from '@/pages/PolicySections';
import { categoryName, categoryPhoto } from '@/lib/categories';
import { FareDialog } from './parts';
import { payBookingOnline, usePaymentChoices } from '@/lib/onlinePayment';
import { advanceOf, type PayChoiceId } from '@core/services/paymentService';
import { PaymentChoice } from './PaymentChoice';
import { holdBookingConfirmed } from '@/lib/paymentHold';
import { primeChime } from '@/lib/confirmChime';
import { DIAL_CODES, splitPhone } from '@/lib/countryCodes';
import { msg, richText, useT } from '@/i18n';
import './review.css';

const UNIQUE_DIAL_CODES = [...new Set(DIAL_CODES.map((item) => item.code))].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));

export function ReviewStep() {
  const navigate = useNavigate();
  const t = useT();
  const { profile } = useCustomerData();
  const { openLoginModal } = useAuth();
  const { draft, update, reset, route, adjustment } = useBooking();
  const liveQ = useBookingQuote();
  // Changing an add-on or coupon re-prices on the server, and the quote is empty while that loads. Keep showing the
  // last confirmed quote meanwhile (the form must not vanish); it is not authoritative, so booking stays blocked until the new fare arrives.
  const lastQ = useRef(liveQ);
  if (liveQ.quote) lastQ.current = liveQ;
  const q = !liveQ.quote && liveQ.quoteLoading && lastQ.current.quote ? { ...lastQ.current, quoteLoading: true, authoritative: false } : liveQ;
  const { online } = useOnline();
  const [submitting, setSubmitting] = useState(false);
  // What the rider may choose (pay later, a part now, all now) is the office's decision for this pickup district and date
  // (admin → Service & Fare Settings → Payment options); the server sends the list and checks the choice again when booking.
  const [payPick, setPayPick] = useState<PayChoiceId>('later');
  const [submitError, setSubmitError] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  // Morning Return: the strict 9:00 AM cutoff and the automatic upgrade are accepted on their own, per package.
  const [cutoffFor, setCutoffFor] = useState('');
  const [tried, setTried] = useState(false);
  const [serverQuote, setServerQuote] = useState<{ key: string; fare: Fare } | null>(null);
  const [showFare, setShowFare] = useState(false);
  const [justSignedIn, setJustSignedIn] = useState(false);
  const [couponText, setCouponText] = useState('');
  const initialPhone = splitPhone(profile?.phone ?? '');
  const [contactCode, setContactCode] = useState(initialPhone.code);
  const [contactNumber, setContactNumber] = useState(initialPhone.local);
  const submittingRef = useRef(false);
  const termsRef = useRef<HTMLDivElement>(null);

  const {
    pickup,
    drop,
    tripType,
    scheduledAt,
    tripEndAt,
    payment,
    notes,
    email,
    customerName,
    forOther,
    passengerName,
    passengerMobile,
    flight,
  } = draft;
  const category = q.category;
  const { choices: payChoices } = usePaymentChoices(!!profile, { pickup, scheduledAt });
  const payChoice = payChoices.find((c) => c.id === payPick) ?? payChoices.find((c) => c.id === 'later') ?? payChoices[0]!;
  const payOnline = payChoice.id !== 'later';

  // An add-on is offered only when this vehicle has a price for it (admin → Service & Fare Settings). No price, no option.
  const rates = q.category ? q.entries.get(q.category.id)?.addOnRates : undefined;
  const carrierCharge = rates?.carrierCharge ?? 0;
  const petCharge = rates?.petCharge ?? 0;
  const hasCarrier = carrierCharge > 0;
  const hasPets = petCharge > 0;
  useEffect(() => {
    if (!q.quote) return;
    const patch: { roofCarrier?: boolean; pets?: boolean } = {};
    if (!hasCarrier && draft.roofCarrier) patch.roofCarrier = false;
    if (!hasPets && draft.pets) patch.pets = false;
    if (patch.roofCarrier !== undefined || patch.pets !== undefined) update(patch);
  }, [hasCarrier, hasPets, !!q.quote]); // eslint-disable-line react-hooks/exhaustive-deps

  const hadProfile = useRef(!!profile);
  useEffect(() => {
    if (profile && !hadProfile.current) setJustSignedIn(true);
    hadProfile.current = !!profile;
  }, [profile]);
  // Prefill the name from the signed-in profile (never overwrites something the rider already typed).
  useEffect(() => {
    if (profile?.name && !draft.customerName) update({ customerName: profile.name });
  }, [profile?.name]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (profile?.email && !draft.email) update({ email: profile.email });
  }, [profile?.email]); // eslint-disable-line react-hooks/exhaustive-deps
  // One way to pay: book now, pay the driver at the end of the trip (recorded as Cash, whatever an older draft held).
  useEffect(() => {
    if (payment !== 'Cash') update({ payment: 'Cash' });
  }, [payment]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!profile?.phone) return;
    const phone = splitPhone(profile.phone);
    setContactCode(phone.code);
    setContactNumber(phone.local);
  }, [profile?.phone]);

  if (!pickup || !drop || !category || !q.quote) {
    return (
      <div className="flow-page">
        <div className="wrap flow-page__wrap review-missing">
          <PageHead
            back={<BackButton to="/book/ride" label={msg('Back to vehicles')} />}
            title={t('Review & Confirm')}
          />
          {q.quoteLoading ? (
            <Notice>{t('Confirming fare with People Taxi server…')}</Notice>
          ) : (
            <Notice
              variant="warning"
              action={
                <Button size="sm" variant="secondary" onClick={() => navigate('/book/ride')}>
                  {t('Choose your vehicle')}
                </Button>
              }
            >
              {t('Your trip details changed. Please go back and select your vehicle again.')}
            </Notice>
          )}
        </div>
      </div>
    );
  }

  // Display only: a higher struck-out price above the fare (set in admin → Pricing → Base rates).
  const strikeOf = (draft.fuelType === 'cng' ? q.entries.get(category.id)?.cng?.strikeTotal : q.entries.get(category.id)?.strikeTotal) ?? 0;
  const priceKey = JSON.stringify([
    pickup.lat,
    pickup.lng,
    drop.lat,
    drop.lng,
    tripType,
    scheduledAt?.toISOString() ?? null,
    category.id,
    draft.roofCarrier,
    draft.pets,
    q.coupon?.code,
    adjustment?.id,
    adjustment?.percent,
  ]);
  const quote = serverQuote?.key === priceKey ? serverQuote.fare : q.quote;
  const breakup = q.breakup ?? breakupFromFare(quote);
  const airport = tripType === 'Airport Taxi';

  const addOnsConfirmed = (!draft.roofCarrier || quote.addOns?.roofCarrier === true) && (!draft.pets || quote.addOns?.pets === true);
  const nameError = customerName.trim().length < 2 ? msg('Enter your name.') : '';
  // Sent in the notes only when it differs from the name on the signed-in profile (the server already has that one).
  const bookerNote = customerName.trim().toLowerCase() === (profile?.name ?? '').trim().toLowerCase() ? '' : customerName.trim();
  const emailError = email.trim() && !isValidEmail(email) ? msg('Enter a valid email address or leave it blank.') : '';
  const contactError = contactNumber.length < 6 || contactNumber.length > 14 ? msg('Enter a valid mobile number.') : '';
  const passengerError = forOther
    ? !passengerName.trim()
      ? msg('Enter the passenger’s name.')
      : !isValidIndianMobile(passengerMobile.replace(/\s+/g, ''))
        ? msg('Enter the passenger’s 10-digit mobile number.')
        : ''
    : '';
  const room = notesRoom({
    customerName: bookerNote,
    flight: airport ? flight : '',
    passengerName: forOther ? passengerName : '',
    passengerMobile: forOther ? passengerMobile : '',
  });
  const morning = tripType === 'Round Trip' && !draft.multicity && q.selectedPackage?.kind === 'morning' ? q.selectedPackage : null;
  const cutoffKey = morning ? `${morning.id}|${morning.endAt}` : '';
  const cutoffAccepted = !morning || cutoffFor === cutoffKey;
  const termsError = tried && !termsAccepted ? msg('Please accept the fare and cancellation terms to confirm.') : '';
  const cutoffError = tried && !cutoffAccepted ? msg('Please accept the 9:00 AM cutoff and the automatic upgrade to confirm.') : '';
  const blocker = !online
    ? msg('You’re offline. Reconnect to book.')
    : scheduleProblem(scheduledAt) ||
      (!q.authoritative
        ? q.quoteLoading
          ? msg('Confirming fare with People Taxi…')
          : q.quoteError || msg('Fare confirmation required.')
        : '') ||
      (!addOnsConfirmed ? msg('Confirming carrier and pet charges. Please retry if pricing is unavailable.') : nameError || contactError || emailError || passengerError ? msg('Check your contact details below.') : '');

  const submit = async () => {
    setTried(true);
    if (!termsAccepted || !cutoffAccepted) {
      termsRef.current?.querySelector<HTMLInputElement>(!cutoffAccepted && termsAccepted ? 'input[data-cutoff]' : 'input')?.focus();
      return;
    }
    if (!profile) {
      openLoginModal({
        title: msg('Sign in to complete booking'),
        subtitle: msg('Enter your mobile number to send your ride request.'),
      });
      return;
    }
    if (blocker || submittingRef.current) {
      return;
    }
    submittingRef.current = true;
    // Unlock audio inside this tap, so the "booking confirmed" chime can play on the next screen (iPhones need this).
    primeChime();
    setSubmitting(true);
    setSubmitError('');
    try {
      const fullNotes = composeNotes({
        customerName: bookerNote,
        flight: airport ? flight : '',
        passengerName: forOther ? passengerName : '',
        passengerMobile: forOther ? passengerMobile : '',
        notes,
      });
      // Paying online: hold the "Booking confirmed" popup until the payment is done, and tell the server to wait for it as well.
      holdBookingConfirmed(payOnline);
      const res = await createRideRequest({
        awaitPayment: payOnline,
        paymentOption: payChoice.id,
        fuelType: draft.fuelType === 'cng' ? 'cng' : undefined,
        profile,
        pickup,
        drop,
        stops: tripType === 'Round Trip' ? draft.stops : [],
        category,
        route: route ?? { distanceKm: q.trip?.distanceKm ?? 0, durationMin: q.trip?.durationMin ?? 0, path: [], estimated: false },
        fare: quote,
        tripType,
        multicity: draft.multicity && tripType === 'Round Trip',
        paymentMethod: payment,
        couponCode: q.coupon?.code ?? '',
        notes: fullNotes,
        scheduledAt,
        tripEndAt: tripType === 'Round Trip' ? tripEndAt : null,
        tripDays: tripType === 'Round Trip' && !draft.multicity ? requestedTripDays(draft) : null,
        timePackage: tripType === 'Round Trip' && !draft.multicity ? q.selectedPackage?.id ?? null : null,
        rentalHours: tripType === 'Local Rental' ? draft.rentalHours : null,
        termsAccepted,
        ...(morning ? { morningCutoffAccepted: true } : {}),
        addOns: { roofCarrier: draft.roofCarrier, pets: draft.pets },
        whatsapp: { sameAsMobile: false, countryCode: contactCode, number: contactNumber },
        email: email.trim(),
        source: 'people_taxi',
        bookingSource: 'peopletaxi',
        brand: 'peopletaxi',
      });
      // The confirmation page clears the draft once it is showing: clearing it here would make the booking page
      // redirect home before this navigation lands, and the confirmation would never appear.
      // Paying online: the booking exists now, so open Razorpay for its balance. Closing it or a failed payment never loses the booking.
      const payResult = payOnline
        ? await payBookingOnline(res.id, 'Ride booking', { name: customerName.trim(), contact: `${contactCode}${contactNumber}`, email: email.trim() || undefined }, undefined, payChoice.id === 'part')
        : null;
      navigate(`/book/done/${res.id}`, { replace: true, state: { confirmed: true, payment: payResult, online: payOnline } });
    } catch (e: unknown) {
      const err = e as { code?: string; fare?: Fare };
      if (err.code === 'fare-changed' && err.fare) {
        setServerQuote({ key: priceKey, fare: err.fare });
        setSubmitError(msg('The fare for this route has updated. Review the updated amount and tap Confirm Booking to proceed.'));
        return;
      }
      setSubmitError(describeError(e, msg('We couldn’t submit your booking request. Please check your connection and try again.')));
    } finally {
      holdBookingConfirmed(false);
      submittingRef.current = false;
      setSubmitting(false);
    }
  };


  const applied = quote.discount > 0 && !!draft.promoCode;
  const showBlocker = tried && !!blocker && !submitting;

  return (
    <div className="flow-page flow-page--review cb">
      <div className="cb__wrap">
        <h1 className="sr-only">{t('Complete your booking')}</h1>
        {tripType === 'Round Trip' && !draft.multicity && q.selectedPackage ? (
          <p className="cb-pkgline" role="note">
            <strong>{q.selectedPackage.label}</strong> · {t('{km} km included', { km: q.selectedPackage.includedKm })} · {q.selectedPackage.days === 1 ? t('1 calendar day') : t('{n} calendar days', { n: q.selectedPackage.days })} · {t('Return by {when}', { when: `${packageDay(new Date(q.selectedPackage.endAt))}, ${packageClock(new Date(q.selectedPackage.endAt))}` })} · {t('Extra')} {formatINR(q.selectedPackage.extraKmRate)}/km
          </p>
        ) : null}

        {/* What is being booked, as a boarding pass: from → to on top, date, time and cab on the stub */}
        <section className="cb-pass" aria-label={t('Booking summary')}>
          <div className="cb-pass__top">
            <div className="cb-pass__head">
              <img src="/brand/peopletaxi-transparent.webp" alt="People Taxi" width={76} height={25} />
              <span>{t('Booking summary')}</span>
            </div>
            <div className="cb-pass__route">
              <p>
                <small>{t('From')}</small>
                <strong>{pickup.name}</strong>
              </p>
              <span className="cb-pass__line" aria-hidden="true">
                <span>
                  <Icon name="car" size={16} />
                </span>
              </span>
              <p>
                <small>{t('To')}</small>
                <strong>{drop.id === 'place-local-disposal' ? t('Within the city') : drop.name}</strong>
              </p>
            </div>
          </div>
          <dl className="cb-pass__stub">
            <div>
              <dt>{t('Date')}</dt>
              <dd>{scheduledAt ? formatDate(scheduledAt) : '—'}</dd>
            </div>
            <div>
              <dt>{t('Time')}</dt>
              <dd>{scheduledAt ? formatTime(scheduledAt) : '—'}</dd>
            </div>
            <div>
              <dt>{t('Cab')}</dt>
              <dd>{categoryName(category)}</dd>
            </div>
          </dl>
        </section>

        <section className="cb__section" aria-label={t('Passenger & Contact Details')}>
          <h2 className="cb__h2">{t('Passenger information')}</h2>
          <div className={`cb-field${nameError && tried ? ' is-invalid' : ''}`}>
            <label className="cb-field__label" htmlFor="booking-name">{t('Full name')}</label>
            <input
              id="booking-name"
              className="cb-input"
              type="text"
              autoComplete="name"
              autoCapitalize="words"
              placeholder={t('Your full name')}
              maxLength={60}
              value={customerName}
              aria-invalid={!!nameError && tried}
              onChange={(e) => update({ customerName: e.target.value })}
            />
          </div>
          {tried && nameError ? <p className="cb-error">{t(nameError)}</p> : null}

          <div className={`cb-field${contactError && tried ? ' is-invalid' : ''}`}>
            <div className="cb-phone">
              <div className="cb-phone__cell cb-phone__cell--code">
                <label className="cb-field__label" htmlFor="booking-country-code">{t('Code')}</label>
                <div className="cb-phone__code">
                  <select id="booking-country-code" value={contactCode} onChange={(e) => setContactCode(e.target.value)}>
                    {UNIQUE_DIAL_CODES.map((code) => <option key={code} value={code}>{code}</option>)}
                  </select>
                  <Icon name="chevron-down" size={16} />
                </div>
              </div>
              <span className="cb-phone__sep" aria-hidden="true" />
              <div className="cb-phone__cell cb-phone__cell--num">
                <label className="cb-field__label" htmlFor="booking-mobile">{t('Contact number')}</label>
                <input
                  id="booking-mobile"
                  className="cb-input"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  placeholder={t('Mobile number')}
                  value={contactNumber}
                  aria-invalid={!!contactError && tried}
                  onChange={(e) => setContactNumber(e.target.value.replace(/\D/g, '').slice(0, 14))}
                />
              </div>
            </div>
          </div>
          {tried && contactError ? <p className="cb-error">{t(contactError)}</p> : null}

          <div className={`cb-field${emailError ? ' is-invalid' : ''}`}>
            <label className="cb-field__label" htmlFor="booking-email">{t('Email address (optional)')}</label>
            <input
              id="booking-email"
              className="cb-input"
              type="email"
              autoComplete="email"
              placeholder="name@example.com"
              value={email}
              aria-invalid={!!emailError}
              onChange={(e) => update({ email: e.target.value })}
            />
          </div>
          {emailError ? <p className="cb-error">{t(emailError)}</p> : null}

          <div className="cb-switch-row">
            <span id="cb-other-label">{t('Booking on behalf of another passenger')}</span>
            <button
              type="button"
              role="switch"
              aria-checked={forOther}
              aria-labelledby="cb-other-label"
              className="cb-switch"
              onClick={() => update({ forOther: !forOther })}
            >
              <span className="cb-switch__thumb" />
            </button>
          </div>

          {forOther ? (
            <div className="cb-other">
              <PolicyLinks lead={t('Add another passenger’s mobile number only with their permission.')} ids={['privacy']} newTab />
              <div className={`cb-field${tried && !passengerName.trim() ? ' is-invalid' : ''}`}>
                <label className="cb-field__label" htmlFor="booking-pax-name">{t('Passenger name')}</label>
                <input id="booking-pax-name" className="cb-input" placeholder={t('Full name')} value={passengerName} onChange={(e) => update({ passengerName: e.target.value })} />
              </div>
              <div className={`cb-field${tried && passengerError ? ' is-invalid' : ''}`}>
                <label className="cb-field__label" htmlFor="booking-pax-mobile">{t('Passenger 10-digit mobile')}</label>
                <input id="booking-pax-mobile" className="cb-input" type="tel" inputMode="numeric" placeholder="9876543210" value={passengerMobile} onChange={(e) => update({ passengerMobile: e.target.value })} />
              </div>
              {tried && passengerError ? <p className="cb-error">{t(passengerError)}</p> : null}
            </div>
          ) : null}

          {airport ? (
            <div className="cb-field">
              <label className="cb-field__label" htmlFor="booking-flight">{t('Flight number (optional)')}</label>
              <input id="booking-flight" className="cb-input" placeholder={t('e.g. 6E 214')} value={flight} onChange={(e) => update({ flight: e.target.value.toUpperCase() })} />
              <p className="cb-field__hint">{t('Our driver will track flight delays and adjust pickup time automatically.')}</p>
            </div>
          ) : null}
        </section>

        <hr className="cb__rule" />

        {hasCarrier || hasPets ? (
          <>
            <section className="cb__section cb__section--addons" aria-labelledby="cb-addons-head">
              <h2 id="cb-addons-head" className="cb__h2">{t('Optional services')}</h2>
              {hasCarrier ? (
                <label className="cb-addon">
                  <input type="checkbox" role="switch" className="cb-mini" checked={draft.roofCarrier} onChange={(e) => update({ roofCarrier: e.target.checked })} />
                  <span className="cb-addon__name">{t('Roof carrier')}</span>
                  <span className="cb-addon__price">+{formatINR(carrierCharge)}</span>
                </label>
              ) : null}
              {hasPets ? (
                <label className="cb-addon">
                  <input type="checkbox" role="switch" className="cb-mini" checked={draft.pets} onChange={(e) => update({ pets: e.target.checked })} />
                  <span className="cb-addon__name">{t('Pet travel')}</span>
                  <span className="cb-addon__price">+{formatINR(petCharge)}</span>
                </label>
              ) : null}
              <p className="cb__note">{t('Billed once per trip and reflected in your final invoice.')}</p>
            </section>

            <hr className="cb__rule" />
          </>
        ) : null}

        <section className="cb__section" aria-label={t('Payment')}>
          <PaymentChoice choices={payChoices} value={payChoice.id} onChange={setPayPick} total={quote.total} disabled={submitting} />

          {applied ? (
            <div className="cb-coupon cb-coupon--applied">
              <TicketIcon />
              <span className="cb-coupon__applied">{richText(t('{code} applied'), { code: <strong key="c">{draft.promoCode.toUpperCase()}</strong> })}</span>
              <button type="button" className="cb-coupon__btn" onClick={() => { update({ promoCode: '' }); setCouponText(''); }}>{t('Remove')}</button>
            </div>
          ) : (
            <form
              className="cb-coupon"
              onSubmit={(e) => {
                e.preventDefault();
                const code = couponText.trim();
                if (code) update({ promoCode: code });
              }}
            >
              <TicketIcon />
              <span className="cb-coupon__sep" aria-hidden="true" />
              <input className="cb-input cb-coupon__input" placeholder={t('Promotional code')} aria-label={t('Promotional code')} value={couponText} onChange={(e) => setCouponText(e.target.value.toUpperCase())} />
              <button type="submit" className="cb-coupon__btn" disabled={!couponText.trim()}>{t('Apply')}</button>
            </form>
          )}

          {draft.fuelType === 'cng' ? (
            <ul className="cb__notes">
              <li>{t('Fuel type: CNG')}</li>
            </ul>
          ) : null}

          {showBlocker ? <p className="cb-error cb-error--block" role="alert">{t(blocker)}</p> : null}
          {submitError ? (
            <Notice variant="error" icon="warning">
              {t(submitError)}
            </Notice>
          ) : null}
        </section>
      </div>

      <div className="cb-bar">
        <div className="cb-bar__in">
          <div className={`cb-terms${termsAccepted ? ' is-on' : ''}${termsError ? ' is-error' : ''}`} ref={termsRef}>
            <label className="cb-terms__row">
              <input type="checkbox" className="cb-tick" checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)} />
              <span className="cb-terms__text">
                {richText(t('I agree to the fare, additional charges and {policy}'), { policy: <Link key="p" to="/legal#terms" target="_blank" rel="noopener">{t('cancellation policy')}<span className="sr-only"> {t('(opens in a new tab)')}</span></Link> })}
              </span>
            </label>
            {termsError ? <p className="cb-error" role="alert">{t(termsError)}</p> : null}
            {morning ? (
              <label className="cb-terms__row cb-terms__row--cutoff">
                <input type="checkbox" className="cb-tick" data-cutoff="" checked={cutoffAccepted} onChange={(e) => setCutoffFor(e.target.checked ? cutoffKey : '')} />
                <span className="cb-terms__text">
                  {t('I accept the strict {time} cutoff on {day}.', { time: packageClock(new Date(morning.morningCutoffAt ?? morning.endAt)), day: packageDay(new Date(morning.morningCutoffAt ?? morning.endAt)) })}
                  {morning.upgrade ? ` ${t('A trip still running after it becomes {name} (+{amount}, {km} km included), with no grace period.', { name: morning.upgrade.label, amount: formatINR(morning.upgrade.increase), km: morning.upgrade.includedKm })}` : ''}
                </span>
              </label>
            ) : null}
            {cutoffError ? <p className="cb-error" role="alert">{t(cutoffError)}</p> : null}
          </div>
          <div className="cb-bar__row">
            <button type="button" className="cb-iconbtn" aria-label={t('Back to vehicles')} title={t('Back to vehicles')} onClick={() => navigate('/book/ride')}>
              <Icon name="arrow-left" size={22} />
            </button>
            <button type="button" className={`cb-total${q.quoteLoading ? ' is-loading' : ''}`} aria-busy={q.quoteLoading} onClick={() => setShowFare(true)} aria-label={t('Total {amount}. View fare details', { amount: formatINR(quote.total) })}>
              <small>{t('Total payable')} <Icon name="info" size={13} /></small>
              <strong key={quote.total} className="num">{formatINR(quote.total)}</strong>
              {strikeOf > 0 ? <s>{formatINR(strikeOf)}</s> : null}
            </button>
            <button type="button" className="cb-confirm" disabled={submitting} onClick={submit}>
              {submitting ? <span className="cb-confirm__spin" aria-hidden="true" /> : null}
              <span>{profile ? (payOnline ? t('Pay {amount} & confirm', { amount: formatINR(advanceOf(quote.total, payChoice.percent)) }) : t('Confirm booking')) : t('Sign in')}</span>
              <span className="cb-confirm__arrow" aria-hidden="true"><Icon name="arrow-right" size={20} /></span>
            </button>
          </div>
        </div>
      </div>

      {showFare ? <FareDialog fare={breakup} onClose={() => setShowFare(false)} /> : null}
    </div>
  );
}

const iconProps = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

function TicketIcon() {
  return (
    <svg className="cb-coupon__icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h15A1.5 1.5 0 0 1 21 8.5V10a2 2 0 0 0 0 4v1.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 15.5V14a2 2 0 0 0 0-4Z" />
      <path d="M14 7v2.5M14 14.5V17M14 11.5v1" />
    </svg>
  );
}
export default ReviewStep;
