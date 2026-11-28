// The pickup-date sheet, in place of the browser's own calendar: a strip of the next few bookable days to tap at once
// ("Today", "Tomorrow", then weekdays), and under it a month calendar for anything further ahead. Days outside the bookable
// range cannot be picked. One tap chooses the day.
import { useState, type KeyboardEvent, type MouseEvent } from 'react';
import { Dialog } from './ui';
import { Icon } from './Icon';
import { combineDateTime, toDateInput } from '@/lib/schedule';
import { dateLocale, useT } from '@/i18n';
import './datePicker.css';

const QUICK_DAYS = 7;
const pad = (n: number) => String(n).padStart(2, '0');
const isoOf = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const dateOf = (iso: string) => combineDateTime(iso, '12:00');
const addDays = (iso: string, n: number) => {
  const d = dateOf(iso);
  if (!d) return iso;
  d.setDate(d.getDate() + n);
  return toDateInput(d);
};

/**
 * Props for a native date <input> that opens this calendar instead: the field keeps its look, but is read-only so the
 * phone's own calendar never opens, and a tap (or Enter / Space) opens ours.
 */
export const opensDatePicker = (open: () => void) => ({
  readOnly: true,
  onClick: (e: MouseEvent<HTMLInputElement>) => {
    e.preventDefault();
    open();
  },
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    open();
  },
});

export function DatePicker({ title, value, min, max, onSelect, onClose }: { title: string; value: string; min: string; max: string; onSelect: (iso: string) => void; onClose: () => void }) {
  const t = useT();
  const locale = dateLocale();
  const today = toDateInput(new Date());
  const tomorrow = addDays(today, 1);
  const start = dateOf(value && value >= min && value <= max ? value : min) ?? new Date();
  const [view, setView] = useState({ y: start.getFullYear(), m: start.getMonth() });

  const ok = (iso: string) => iso >= min && iso <= max;
  const pick = (iso: string) => {
    if (ok(iso)) onSelect(iso);
  };

  const quick = Array.from({ length: QUICK_DAYS }, (_, i) => addDays(min, i)).filter(ok);
  const minAt = dateOf(min);
  const maxAt = dateOf(max);
  const canPrev = !!minAt && (view.y > minAt.getFullYear() || (view.y === minAt.getFullYear() && view.m > minAt.getMonth()));
  const canNext = !!maxAt && (view.y < maxAt.getFullYear() || (view.y === maxAt.getFullYear() && view.m < maxAt.getMonth()));
  const move = (by: number) => setView((v) => {
    const d = new Date(v.y, v.m + by, 1);
    return { y: d.getFullYear(), m: d.getMonth() };
  });

  const first = new Date(view.y, view.m, 1);
  const lead = first.getDay();
  const count = new Date(view.y, view.m + 1, 0).getDate();
  // Sunday first, named in the rider's language (2 Jan 2000 was a Sunday).
  const weekdays = Array.from({ length: 7 }, (_, i) => new Date(2000, 0, 2 + i).toLocaleDateString(locale, { weekday: 'short' }));
  const monthName = first.toLocaleDateString(locale, { month: 'long', year: 'numeric' });

  return (
    <Dialog title={title} onClose={onClose} className="dpk-dialog">
      <div className="dpk">
        <div className="dpk__quick" role="group" aria-label={title}>
          {quick.map((iso) => {
            const d = dateOf(iso) as Date;
            const name = iso === today ? t('Today') : iso === tomorrow ? t('Tomorrow') : d.toLocaleDateString(locale, { weekday: 'short' });
            return (
              <button key={iso} type="button" className="dpk__day" aria-pressed={iso === value} aria-label={d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })} onClick={() => pick(iso)}>
                <small>{name}</small>
                <b className="num">{d.getDate()}</b>
                <span>{d.toLocaleDateString(locale, { month: 'short' })}</span>
              </button>
            );
          })}
        </div>

        <div className="dpk__cal">
          <div className="dpk__head">
            <button type="button" className="dpk__nav" aria-label={t('Previous month')} disabled={!canPrev} onClick={() => move(-1)}>
              <Icon name="chevron-left" size={18} />
            </button>
            <strong aria-live="polite">{monthName}</strong>
            <button type="button" className="dpk__nav" aria-label={t('Next month')} disabled={!canNext} onClick={() => move(1)}>
              <Icon name="chevron-right" size={18} />
            </button>
          </div>
          <div className="dpk__grid">
            {weekdays.map((w) => (
              <span key={w} className="dpk__wd" aria-hidden="true">{w}</span>
            ))}
            {Array.from({ length: lead }, (_, i) => <span key={`b${i}`} aria-hidden="true" />)}
            {Array.from({ length: count }, (_, i) => {
              const iso = isoOf(view.y, view.m, i + 1);
              return (
                <button
                  key={iso}
                  type="button"
                  className={`dpk__date num${iso === today ? ' is-today' : ''}`}
                  aria-pressed={iso === value}
                  aria-current={iso === today ? 'date' : undefined}
                  aria-label={new Date(view.y, view.m, i + 1).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}
                  disabled={!ok(iso)}
                  onClick={() => pick(iso)}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
