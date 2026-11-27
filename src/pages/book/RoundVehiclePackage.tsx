// "Choose vehicle & package" for a Round Trip (Customer UX 9.0): a banner, vehicle tiles (Hatchback · Sedan · SUV · …), the chosen vehicle's
// line, then that vehicle's packages as colourful cards (icon tile, name, price, what is included, the car). The server prices every
// package for every vehicle, so picking a vehicle or a package only changes the choice; the fare in force always comes from the server's answer.
import type { ReactNode } from 'react';
import type { RideCategory } from '@core/types';
import type { ServerCategoryQuote, ServerTimePackage } from '@core/services/quoteService';
import { formatINR } from '@core/utils/format';
import { Icon } from '@/components/Icon';
import { ChooseHero } from './parts';
import './roundVehicle.css';
import { categoryName, categoryPhoto } from '@/lib/categories';
import { FuelPick, type FuelChoice } from '@/shared/components/CabParts';
import { packageClock, packageDay, packageRuleText } from '@core/utils/timePackages';
import { msg, useT, type Translate } from '@/i18n';

/** The short class name on a vehicle tab: "Sedan", "SUV", "Innova", "Crysta". */
export function vehicleTabLabel(name: string): string {
  const n = name.trim();
  if (/crysta/i.test(n)) return 'Crysta';
  return n.replace(/\s*(or|\/)\s*similar$/i, '').replace(/^toyota\s+/i, '') || n;
}

/** Card colours, in order: every package gets its own, so neighbouring cards never look alike. */
export const ACCENTS = ['blue', 'green', 'orange', 'purple', 'teal', 'pink'] as const;

interface Props {
  categories: RideCategory[];
  selected: RideCategory | null;
  entries: Map<string, ServerCategoryQuote>;
  unavailable: Map<string, string>;
  packages: ServerTimePackage[];
  selectedPackage: ServerTimePackage | null;
  autoDays: boolean;
  fuel: FuelChoice;
  hasCng: boolean;
  scheduledAt: Date | null;
  loading: boolean;
  /** The booking server is still pricing this trip. */
  quoteLoading?: boolean;
  onPickVehicle: (c: RideCategory) => void;
  onPickPackage: (id: string) => void;
  onFuel: (c: RideCategory, f: FuelChoice) => void;
  onFareDetails: (c: RideCategory) => void;
}

/** The picture on a package card: a short word for the kind of trip it suits. */
const iconOf = (x: ServerTimePackage): string => {
  if (x.kind === 'morning') return 'sunrise';
  if (x.kind === 'next_day') return 'moon';
  if (x.hours == null) return 'calendar-check';
  if (x.hours <= 5) return 'zap';
  if (x.hours < 8) return 'calendar';
  return 'map-pin';
};

/** The one-line description under a package name. */
const taglineOf = (x: ServerTimePackage, t: Translate): string => {
  if (x.kind === 'morning') return t('Back by the next morning');
  if (x.kind === 'next_day') {
    if (x.dayKm && x.dayKm.length > 1) return t('{n} calendar days · {a} km on day 1, then {b} km a day', { n: x.days, a: x.dayKm[0]!, b: x.dayKm[1]! });
    return t('{n} calendar days of travel', { n: x.days });
  }
  if (x.hours == null) return t('Complete day, complete flexibility');
  if (x.hours <= 5) return t('A short & quick round trip');
  if (x.hours < 8) return t('More time, more freedom');
  if (x.hours === 8) return t('Ideal for city & nearby trips');
  return t('Extra hours for a relaxed trip');
};

/** The package name split so the hours / days can be shown in the card's colour: "Quick Return (4 Hrs)", "5-Hour Return". */
const nameParts = (x: ServerTimePackage, t: Translate): { pre: string; hl: string; post: string } => {
  const m = /(\d+\s*-?\s*(?:hours?|hrs?|days?))/i.exec(x.label);
  if (m && m.index !== undefined) return { pre: x.label.slice(0, m.index), hl: m[1], post: x.label.slice(m.index + m[1].length) };
  const hl = x.kind === 'morning' ? t('Overnight') : x.kind === 'next_day' ? t('{n} Days', { n: x.days }) : x.hours == null ? t('All Day') : t('{n} Hrs', { n: x.hours });
  return { pre: `${x.label} (`, hl, post: ')' };
};

export function RoundVehiclePackage(p: Props) {
  const { selected, packages } = p;
  const t = useT();
  const entry = selected ? p.entries.get(selected.id) : undefined;
  const standard = packages.find((x) => x.id === 'same:full') ?? packages.find((x) => x.id === 'next');
  /** The package that costs least for every km it includes: only meaningful when there is a choice. */
  const bestValue = (() => {
    if (packages.length < 2) return null;
    const perKm = packages.filter((x) => x.includedKm > 0).map((x) => ({ x, r: x.fare.total / x.includedKm })).sort((a, b) => a.r - b.r);
    return perKm.length > 1 && perKm[0].r < perKm[1].r ? perKm[0].x : null;
  })();
  /** The small tag on a package card's top edge: Best Value (honestly: the lowest price per included km), the early-return option, or the standard package. */
  const badge = (x: ServerTimePackage): { text: string; tone: 'best' | 'std' | 'early'; icon: string } | null => {
    if (x === bestValue) return { text: t('Best Value'), tone: 'best', icon: 'star' };
    if (x.kind === 'morning') return { text: t('Early Return'), tone: 'early', icon: 'sunrise' };
    if (x.id === standard?.id) return { text: t('Standard'), tone: 'std', icon: 'check' };
    return null;
  };
  const savingText = (x: ServerTimePackage) => {
    const save = standard && standard !== x ? standard.fare.total - x.fare.total : 0;
    return save > 0 ? t('{amount} less than {name}', { amount: formatINR(save), name: standard!.label }) : undefined;
  };
  const endParts = (x: ServerTimePackage) => {
    const end = new Date(x.endAt);
    const same = p.scheduledAt ? packageDay(end) === packageDay(p.scheduledAt) : true;
    return same ? packageClock(end) : `${packageDay(end)}, ${packageClock(end)}`;
  };
  const upgradeNote = (x: ServerTimePackage) =>
    x.upgrade ? (
      <span className="rvp__note">
        <Icon name="info" size={14} />
        <span>{t('Still running after {time}? It upgrades to {name} (+{amount}, {km} km included).', { time: packageClock(new Date(x.morningCutoffAt ?? x.endAt)), name: x.upgrade.label, amount: formatINR(x.upgrade.increase), km: x.upgrade.includedKm })}</span>
      </span>
    ) : null;
  const photo = selected ? categoryPhoto(selected) : '';
  /** The lowest package fare a vehicle has for this trip (what "From ₹…" on its tile shows). */
  const from = (c: RideCategory): number | null => {
    const e = p.entries.get(c.id);
    if (!e?.ok) return null;
    const list = e.packages?.length ? e.packages.map((x) => x.fare.taxableAmount) : e.fare ? [e.fare.taxableAmount] : [];
    return list.length ? Math.min(...list) : null;
  };
  const reason = selected ? p.unavailable.get(selected.id) : '';
  const fare = selected && entry?.ok ? entry.fare : undefined;
  const extraKm = p.selectedPackage?.extraKmRate ?? packages[0]?.extraKmRate ?? entry?.extraKmRate;

  const stat = (icon: string, top: ReactNode, bottom: ReactNode) => (
    <span className="rvp__stat">
      <Icon name={icon} size={16} />
      <span><b>{top}</b><small>{bottom}</small></span>
    </span>
  );

  return (
    <section className="rvp" aria-labelledby="rvp-title">
      <ChooseHero id="rvp-title" title={[msg('Choose '), msg('Vehicle'), msg(' & Package')]} sub={msg('Round Trip · Flexible Hours · Transparent Kms')} photo={photo} />

      <div className="rvp__tabs" role="radiogroup" aria-label={t('Vehicle')}>
        {p.categories.map((c) => {
          const on = selected?.id === c.id;
          const off = p.unavailable.has(c.id);
          const f = from(c);
          return (
            <button key={c.id} type="button" role="radio" aria-checked={on} disabled={off} className={`rvp__tab ${on ? 'is-on' : ''}`} onClick={() => p.onPickVehicle(c)} title={off ? t(p.unavailable.get(c.id) ?? '') : undefined}>
              <img src={categoryPhoto(c)} alt="" loading="lazy" decoding="async" />
              <span className="rvp__tabname">{vehicleTabLabel(c.name)}</span>
              {f ? <small className="rvp__from">{t('From {amount}', { amount: formatINR(f) })}</small> : null}
            </button>
          );
        })}
        {p.loading && p.categories.length === 0 ? <span className="skeleton rvp__tab-skel" /> : null}
      </div>

      {selected ? (
        <button type="button" className="rvp__vrow" aria-live="polite" onClick={() => p.onFareDetails(selected)} aria-label={`${vehicleTabLabel(selected.name)}, ${categoryName(selected)}. ${t('Open fare details')}`}>
          <Icon name="car" size={18} />
          <span className="rvp__vline">
            <b>{vehicleTabLabel(selected.name)}</b>
            <span>{categoryName(selected)}</span>
            <span>{t('{n} seats', { n: selected.seats })}</span>
            <span>AC</span>
          </span>
          <Icon name="chevron-right" size={18} />
        </button>
      ) : null}

      {p.autoDays && packages[0] ? (
        <p className="pkgs__auto"><Icon name="clock" size={15} /> {t('No same-day package fits this pickup time and trip, so it is planned as a {n}-day trip.', { n: packages[0].days })}</p>
      ) : null}
      {reason ? <p className="rvp__na" role="alert">{t(reason)}</p> : null}
      {!packages.length && !fare && !reason && selected ? (
        p.quoteLoading || p.entries.size === 0 ? (
          <div className="rvp__wait" aria-busy="true" aria-label={t('Getting packages and fares')}>
            <span className="skeleton rvp__skel" />
            <span className="skeleton rvp__skel" />
          </div>
        ) : (
          <p className="rvp__na" role="status">{t('Packages and fares for {name} are not available for this trip right now. Please choose another vehicle or call us to book.', { name: vehicleTabLabel(selected.name) })}</p>
        )
      ) : null}

      {packages.length ? (
        <div className="rvp__list" role="radiogroup" aria-label={t('Round-trip packages')}>
          {packages.map((x, i) => {
            const on = x.id === p.selectedPackage?.id;
            const tag = badge(x);
            const nm = nameParts(x, t);
            return (
              <button key={x.id} type="button" role="radio" aria-checked={on} data-acc={ACCENTS[i % ACCENTS.length]} title={savingText(x)} className={`rvp__pkg ${on ? 'is-on' : ''} ${tag ? 'has-tag' : ''}`} onClick={() => p.onPickPackage(x.id)}>
                {tag ? <span className={`rvp__badge rvp__badge--${tag.tone}`}><Icon name={tag.icon} size={11} /> {tag.text}</span> : null}
                <span className="rvp__top">
                  <span className="rvp__icon" aria-hidden="true"><Icon name={iconOf(x)} size={26} /></span>
                  <span className="rvp__ttl">
                    <strong className="rvp__name">{nm.pre}<em>{nm.hl}</em>{nm.post}</strong>
                    <small className="rvp__tag">{taglineOf(x, t)}</small>
                  </span>
                  <b className="rvp__price">{formatINR(x.fare.total)}</b>
                  <span className="rvp__tick" aria-hidden="true">{on ? <Icon name="check" size={14} /> : null}</span>
                </span>
                <span className="rvp__body">
                  <span className="rvp__stats">
                    {stat('route', `${x.includedKm} km`, t('included'))}
                    {stat('steering', t('Driver bata'), t(x.days > 1 ? (x.days === 2 ? 'for both days' : 'for all days') : 'included'))}
                    {stat('clock', t('Return by'), endParts(x))}
                    {stat('coins', t('Extra'), `${formatINR(x.extraKmRate)}/km`)}
                  </span>
                  {photo ? <img className="rvp__car" src={photo} alt="" loading="lazy" decoding="async" /> : null}
                </span>
                {on ? upgradeNote(x) : null}
              </button>
            );
          })}
        </div>
      ) : fare && selected ? (
        <div className="rvp__pkg rvp__pkg--static is-on" data-acc="blue" role="status">
          <span className="rvp__top">
            <span className="rvp__icon" aria-hidden="true"><Icon name="calendar-check" size={26} /></span>
            <span className="rvp__ttl">
              <strong className="rvp__name">{t('Round Trip')}{entry?.days ? <> · <em>{entry.days === 1 ? t('1 Day') : t('{n} Days', { n: entry.days })}</em></> : null}</strong>
              <small className="rvp__tag">{t('Fare confirmed by quote')}</small>
            </span>
            <b className="rvp__price">{formatINR(fare.total)}</b>
          </span>
          <span className="rvp__body">
            <span className="rvp__stats">
              {stat('route', entry?.includedKm ? `${entry.includedKm} km` : t('Distance'), t(entry?.includedKm ? 'included' : 'per quote'))}
              {stat('steering', t('Driver bata'), t('included'))}
              {entry?.extraKmRate ? stat('coins', t('Extra'), `${formatINR(entry.extraKmRate)}/km`) : null}
            </span>
            {photo ? <img className="rvp__car" src={photo} alt="" loading="lazy" decoding="async" /> : null}
          </span>
        </div>
      ) : null}

      {packages.length && extraKm ? (
        <p className="rvp__infobar">
          <span className="rvp__infoicon" aria-hidden="true"><Icon name="info" size={15} /></span>
          <span>{t('Extra km:')} <b>{formatINR(extraKm)}/km</b></span>
          <i aria-hidden="true" />
          <span>{t('Return time as per package duration')}</span>
        </p>
      ) : null}

      {packages.length ? (
        <div className="rvp__rule">
          <span className="rvp__ruleicon" aria-hidden="true"><Icon name="clock" size={16} /></span>
          <div className="rvp__ruletext">
            <strong>{t('How your package works')}</strong>
            {packageRuleText(packages, packageClock).split(/(?<=\.)\s+/).filter(Boolean).map((line) => <span key={line}>{t(line)}</span>)}
          </div>
        </div>
      ) : null}

      {selected && p.hasCng ? <FuelPick name={`fuel-${selected.id}`} value={p.fuel} onChange={(f) => p.onFuel(selected, f)} /> : null}

      <div className="pkgs__fine">
        <ul>
          <li><Icon name="info" size={14} /> <span>{t('Toll, parking & state permit tax extra.')}</span></li>
          <li><Icon name="info" size={14} /> <span>{t('Your package is the minimum charge; a longer or farther trip moves to the next package.')}</span></li>
        </ul>
        {selected ? (
          <button type="button" className="rvp__details" onClick={() => p.onFareDetails(selected)}>
            <Icon name="receipt" size={16} /> {t('Fare details & exclusions')} <Icon name="arrow-right" size={14} />
          </button>
        ) : null}
      </div>
    </section>
  );
}
