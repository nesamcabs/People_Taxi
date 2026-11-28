// The pickup-time sheet: three scrolling wheels — hour, minutes (every 5: 00, 05 … 55) and AM/PM. For a pickup the wheels
// hold only times that can still be booked, so this afternoon offers PM alone and tomorrow offers both. The picker never
// changes the date. The chosen time is checked again when confirmed, so a time that became too soon while the sheet was
// open is refused.
import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { scheduleProblem } from '@core/utils/bookingRules';
import { Button, Dialog } from './ui';
import { combineDateTime, pickerSlots, toDateInput } from '@/lib/schedule';
import { msg, useT } from '@/i18n';

const ALL_SLOTS = Array.from({ length: 288 }, (_, i) => `${String(Math.floor(i / 12)).padStart(2, '0')}:${String((i % 12) * 5).padStart(2, '0')}`);
const HOURS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const ITEM_H = 44;
const isPm = (hhmm: string) => hhmm >= '12:00';
const hour12 = (hhmm: string) => Number(hhmm.slice(0, 2)) % 12 || 12;
const minuteOf = (hhmm: string) => hhmm.slice(3);

export const formatTime12 = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  if (!Number.isFinite(h) || !Number.isFinite(m)) return '';
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

/** One vertically scrolling column; the item snapped to the centre band is the selected value. */
function Wheel<T extends string | number>({ label, items, value, format = String, onChange }: { label: string; items: T[]; value: T; format?: (item: T) => string; onChange: (item: T) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const at = items.indexOf(value);

  // Opens on the chosen item, and follows it when it changes from elsewhere (another wheel narrowed this one's list).
  // While the rider scrolls this wheel it is already in place, so nothing moves under them.
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && at >= 0 && Math.round(el.scrollTop / ITEM_H) !== at) el.scrollTo({ top: at * ITEM_H });
  }, [at, items.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    const next = items[Math.min(items.length - 1, Math.max(0, Math.round(el.scrollTop / ITEM_H)))] as T;
    if (next !== value) onChange(next);
  };

  // Keyboard: arrows step by one, Page Up / Down by five, Home / End jump to the ends.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const steps: Record<string, number | undefined> = { ArrowDown: 1, ArrowUp: -1, PageDown: 5, PageUp: -5 };
    const step = steps[e.key];
    const to = step !== undefined ? at + step : e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : null;
    if (to === null) return;
    e.preventDefault();
    const i = Math.min(items.length - 1, Math.max(0, to));
    ref.current?.scrollTo({ top: i * ITEM_H, behavior: 'smooth' });
    onChange(items[i] as T);
  };

  return (
    <div ref={ref} className="timepick__wheel" role="listbox" aria-label={label} tabIndex={0} onScroll={onScroll} onKeyDown={onKeyDown}>
      {items.map((item, i) => (
        <div key={item} role="option" aria-selected={item === value} className={item === value ? 'is-on' : ''} onClick={() => ref.current?.scrollTo({ top: i * ITEM_H, behavior: 'smooth' })}>
          {format(item)}
        </div>
      ))}
    </div>
  );
}

export function TimePicker({
  title = 'Pickup time',
  date,
  value,
  onConfirm,
  onClose,
  validate = 'pickup',
  notBefore,
}: {
  title?: string;
  date: string;
  value: string;
  /** Called with the time and the day it is for: the `date` prop (today, if that day has already passed). */
  onConfirm: (hhmm: string, date: string) => void;
  onClose: () => void;
  validate?: 'pickup' | 'after';
  notBefore?: Date | null;
}) {
  const t = useT();
  const [error, setError] = useState('');
  // A day left in the past (the page stayed open over midnight) counts as today.
  const today = toDateInput(new Date());
  const day = date && date < today ? today : date;
  const slots = validate === 'pickup'
    ? day ? pickerSlots(day) : ALL_SLOTS
    : ALL_SLOTS.filter((s) => {
        const when = day ? combineDateTime(day, s) : null;
        return !notBefore || !when || when.getTime() > notBefore.getTime();
      });
  // The choice starts at the form's time (30 minutes from now unless the rider changed it), or the first offered time after it.
  const [picked, setPicked] = useState(() => slots.find((s) => s >= value) ?? slots[0] ?? '');
  // The list moves on with the clock: a choice that has dropped off it becomes the first one left.
  const chosen = slots.includes(picked) ? picked : slots[0] ?? '';
  const showPm = isPm(chosen);
  const chosenHour = chosen ? hour12(chosen) : 0;
  const chosenMinute = chosen ? minuteOf(chosen) : '';

  // What each wheel offers: only the halves of the day, hours and quarters that still have a bookable time.
  const periods = (['AM', 'PM'] as const).filter((p) => slots.some((s) => isPm(s) === (p === 'PM')));
  const shown = slots.filter((s) => isPm(s) === showPm);
  const hours = HOURS.filter((h) => shown.some((s) => hour12(s) === h));
  const ofHour = shown.filter((s) => hour12(s) === chosenHour);
  const minutes = ofHour.map(minuteOf);

  const choose = (hhmm: string | undefined) => {
    if (!hhmm) return;
    setPicked(hhmm);
    setError('');
  };
  // An hour keeps the chosen minutes when it can, else takes its first bookable quarter.
  const chooseHour = (h: number) => {
    const list = shown.filter((s) => hour12(s) === h);
    choose(list.find((s) => minuteOf(s) === chosenMinute) ?? list[0]);
  };
  // AM / PM keeps the same clock time when it can, else takes that half's first bookable time.
  const choosePeriod = (p: string) => {
    const list = slots.filter((s) => isPm(s) === (p === 'PM'));
    choose(list.find((s) => hour12(s) === chosenHour && minuteOf(s) === chosenMinute) ?? list[0]);
  };

  const confirm = () => {
    const at = day && chosen ? combineDateTime(day, chosen) : null;
    if (at) {
      const problem = validate === 'pickup' ? scheduleProblem(at) : notBefore && at.getTime() <= notBefore.getTime() ? msg('The return must be after the pickup.') : '';
      if (problem) {
        setError(problem);
        return;
      }
    }
    onConfirm(chosen, day);
  };

  return (
    <Dialog
      title={t(title)}
      subtitle={t('Times are in IST.')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('Close')}
          </Button>
          <Button icon="check" onClick={confirm} disabled={!chosen}>
            {t('Confirm time')}
          </Button>
        </>
      }
    >
      <div className="timepick">
        {chosen ? (
          <>
            <p className="timepick__now num" aria-live="polite">
              {chosenHour}:{chosenMinute} <span>{showPm ? 'PM' : 'AM'}</span>
            </p>
            <div className="timepick__wheels">
              <Wheel label={t('Hour')} items={hours} value={chosenHour} onChange={chooseHour} />
              <Wheel label={t('Minutes')} items={minutes} value={chosenMinute} onChange={(m) => choose(ofHour.find((s) => minuteOf(s) === m))} />
              <Wheel label={t('AM or PM')} items={periods as unknown as string[]} value={showPm ? 'PM' : 'AM'} onChange={choosePeriod} />
            </div>
          </>
        ) : (
          <p className="timepick__note" role="status">
            {t('No pickup times left on this day. Please choose another date.')}
          </p>
        )}
        {error ? (
          <p className="field__error" role="alert">
            {t(error)}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
