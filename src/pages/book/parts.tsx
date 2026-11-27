import { useState, type ReactNode } from 'react';
import type { FareBreakdown as Fare, FareLine } from '@core/types';
import type { FareBreakup } from '@core/utils/fareBreakup';
import { formatINR } from '@core/utils/format';
import { Button, Dialog } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { FareBreakdown } from '@/components/FareBreakdown';

export function PromoControl({
  code,
  applied,
  onApply,
  onRemove,
  disabled,
}: {
  code: string;
  applied: boolean;
  onApply: (code: string) => void;
  onRemove: () => void;
  disabled?: boolean;
}) {
  const [val, setVal] = useState(code);
  const [open, setOpen] = useState(false);

  if (applied && code) {
    return (
      <div className="promo">
        <span className="promo-chip">
          <Icon name="tag" size={14} />
          <strong>{code.toUpperCase()}</strong> applied
          <button type="button" onClick={onRemove} disabled={disabled} aria-label="Remove coupon">
            <Icon name="close" size={12} />
          </button>
        </span>
      </div>
    );
  }

  return (
    <div className="promo">
      {!open ? (
        <button type="button" className="btn btn--text" onClick={() => setOpen(true)} disabled={disabled}>
          <Icon name="tag" size={14} /> Have a coupon code?
        </button>
      ) : (
        <form
          className="promo-form"
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = val.trim();
            if (trimmed) onApply(trimmed);
          }}
        >
          <input
            type="text"
            className="input"
            placeholder="Enter promo code"
            value={val}
            onChange={(e) => setVal(e.target.value.toUpperCase())}
            autoFocus
          />
          <Button type="submit" variant="secondary" size="sm" disabled={!val.trim() || disabled}>
            Apply
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </form>
      )}
    </div>
  );
}

export function FareDialog({
  title = 'Fare Breakup & Exclusions',
  lines,
  total,
  fare,
  estimated,
  note,
  onClose,
}: {
  title?: string;
  lines?: FareLine[];
  total?: number;
  fare?: FareBreakup | Fare | null;
  estimated?: boolean;
  note?: ReactNode;
  onClose: () => void;
}) {
  const finalLines: FareLine[] = lines ?? ((fare as any)?.lines ?? []);
  const finalTotal: number = total ?? ((fare as any)?.packageTotal ?? (fare as any)?.total ?? 0);
  return (
    <Dialog title={title} onClose={onClose} variant="sheet" className="fare-sheet">
      {note ? <p className="fare-note">{note}</p> : null}
      <FareBreakdown lines={finalLines} total={finalTotal} estimated={estimated} />
    </Dialog>
  );
}

export function FlowBar({
  onBack,
  onNext,
  backLabel = 'Back',
  nextLabel = 'Book Now',
  nextDisabled = false,
  nextLoading = false,
  total,
  secondary,
  showBack = false,
  hideFare = false,
  onHome,
  above,
  nextIcon,
  backText = false,
}: {
  onBack?: () => void;
  onNext?: () => void;
  backLabel?: string;
  nextLabel?: string;
  nextDisabled?: boolean;
  nextLoading?: boolean;
  total?: number;
  secondary?: React.ReactNode;
  showBack?: boolean;
  /** Keep the button, drop the fare text: used where each card already shows its own price. */
  hideFare?: boolean;
  /** Adds a Home icon button to the right of the main button (with onBack, a Back icon button to its left). */
  onHome?: () => void;
  /** Shown directly above the main button, inside the bar (the terms checkbox). */
  above?: ReactNode;
  /** An icon after the main button's label (for example an arrow on Continue). */
  nextIcon?: string;
  /** Show the Back label next to its arrow (the icon-only Back stays the default). */
  backText?: boolean;
}) {
  return (
    <div className="flow-bar">
      {above}
      {total !== undefined && onNext ? (
        <div className={`flow-bar__total ${hideFare ? 'flow-bar__total--solo' : ''} ${hideFare && (onBack || onHome) ? 'flow-bar__total--with-icons' : ''}`}>
          {hideFare && onBack ? (
            <button type="button" className={`flow-bar__icon ${backText ? 'flow-bar__icon--text' : ''}`} aria-label={backText ? undefined : backLabel} title={backText ? undefined : backLabel} onClick={onBack}>
              <Icon name="arrow-left" size={20} />
              {backText ? <span>{backLabel}</span> : null}
            </button>
          ) : null}
          {hideFare ? null : (
            <div>
              <small>Estimated Fare</small>
              <strong>{formatINR(total)}</strong>
            </div>
          )}
          <Button
            variant="primary"
            size="lg"
            disabled={nextDisabled}
            loading={nextLoading}
            onClick={onNext}
            iconTrailing={nextIcon}
          >
            {nextLabel}
          </Button>
          {hideFare && onHome ? (
            <button type="button" className="flow-bar__icon" aria-label="Home" title="Home" onClick={onHome}>
              <Icon name="home" size={20} />
            </button>
          ) : null}
        </div>
      ) : null}

      {(showBack && onBack) || (total === undefined && onBack) || secondary ? (
        <div className="flow-bar__nav">
          {onBack ? (
            <Button variant="secondary" size="md" onClick={onBack} icon="arrow-left">
              {backLabel}
            </Button>
          ) : null}
          {secondary}
          {total === undefined && onNext ? (
            <Button
              variant="primary"
              size="md"
              disabled={nextDisabled}
              loading={nextLoading}
              onClick={onNext}
              iconTrailing="arrow-right"
            >
              {nextLabel}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** The blue banner at the top of every "choose your fare" screen: a headline with its middle words in yellow, a line under it, and the car. */
export function ChooseHero({ title, sub, photo, id }: { title: [string, string, string]; sub: string; photo?: string; id?: string }) {
  return (
    <header className="chero">
      <div className="chero__text">
        <h2 id={id} className="chero__title">{title[0]}<em>{title[1]}</em>{title[2]}</h2>
        <p>{sub}</p>
      </div>
      {photo ? <img className="chero__img" src={photo} alt="" decoding="async" /> : null}
    </header>
  );
}
