// The one-line note under a service's tabs (Customer UX 9.0) and its "Details" dialog: what the service includes, what it does not,
// and which charges are extra. The words live in `@/lib/serviceCopy`; no price is ever written here.
import { useState } from 'react';
import { SERVICE_COPY, type ServiceNoteKind } from '@/lib/serviceCopy';
import { Icon } from '@/components/Icon';
import { Dialog } from '@/components/ui';
import './serviceNote.css';

export function ServiceNote({ kind, className = '' }: { kind: ServiceNoteKind; className?: string }) {
  const [open, setOpen] = useState(false);
  const copy = SERVICE_COPY[kind];
  // The note runs as a ticker: every point (title first, then the short lines) in one row that scrolls across the strip.
  // Two copies of the row sit side by side so the loop never shows a gap. Tapping the strip still opens the full details.
  const points = [...copy.title.split(' · '), ...copy.sub.split(' · ')].map((p) => p.trim()).filter(Boolean);
  const run = (copyNo: number) => (
    <span className="svc-tick__run" key={copyNo}>
      {points.map((p, i) => (
        <span key={i} className={`svc-tick__item ${i === 0 ? 'is-lead' : ''}`}>
          <i className="svc-tick__dot" aria-hidden="true" />
          {p}
        </span>
      ))}
    </span>
  );
  return (
    <>
      <button
        type="button"
        className={`svc-note svc-note--ticker ${className}`}
        aria-haspopup="dialog"
        aria-label={`${copy.title}. ${copy.sub}. Tap for ${copy.heading} service details`}
        onClick={() => setOpen(true)}
      >
        <span className="svc-tick__view" aria-hidden="true">
          <span className="svc-tick__track" style={{ animationDuration: `${Math.max(10, points.join('').length * 0.32)}s` }}>
            {run(0)}
            {run(1)}
          </span>
        </span>
      </button>
      {open ? (
        <Dialog title={copy.heading} onClose={() => setOpen(false)} className="svc-dialog" footer={<button type="button" className="svc-dialog__ok" onClick={() => setOpen(false)}>Got it</button>}>
          <p className="svc-dialog__intro">{copy.intro}</p>
          <ul className="svc-dialog__list">
            {copy.items.map(([label, text]) => {
              const no = label === 'Not included';
              return (
                <li key={label}>
                  <span className={`svc-dialog__mark ${no ? 'is-no' : ''}`} aria-hidden="true">
                    <Icon name={no ? 'cross' : 'check'} size={13} />
                  </span>
                  <div>
                    <strong>{label}</strong>
                    <p>{text}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </Dialog>
      ) : null}
    </>
  );
}
