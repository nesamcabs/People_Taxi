// The one-line note under a service's tabs (Customer UX 9.0) and its "Details" dialog: what the service includes, what it does not,
// and which charges are extra. The words live in `@/lib/serviceCopy`; no price is ever written here.
import { useState } from 'react';
import { SERVICE_COPY, type ServiceNoteKind } from '@/lib/serviceCopy';
import { Icon } from '@/components/Icon';
import { Dialog } from '@/components/ui';
import { useT } from '@/i18n';
import './serviceNote.css';

export function ServiceNote({ kind, className = '' }: { kind: ServiceNoteKind; className?: string }) {
  const [open, setOpen] = useState(false);
  const t = useT();
  const base = SERVICE_COPY[kind];
  // The words are kept in English in @/lib/serviceCopy and translated here (the Tamil keeps the ' · ' separators).
  const copy = { ...base, title: t(base.title), sub: t(base.sub), intro: t(base.intro), heading: t(base.heading) };
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
        aria-label={t('{title}. {sub}. Tap for {service} service details', { title: copy.title, sub: copy.sub, service: copy.heading })}
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
        <Dialog title={copy.heading} onClose={() => setOpen(false)} className="svc-dialog" footer={<button type="button" className="svc-dialog__ok" onClick={() => setOpen(false)}>{t('Understood')}</button>}>
          <div className="svc-dialog__intro">
            <small>{t('Trip summary')}</small>
            <p>{copy.intro}</p>
          </div>
          {/* A numbered terms sheet: each clause has a status tag; additional charges close it as a highlighted band */}
          <ol className="svc-dialog__list">
            {base.items.map(([label, text]) => {
              const band = label === 'Additional charges';
              const mark = label === 'Exclusions' ? 'no' : /additional|extra|waiting|time|morning/i.test(label) ? 'extra' : 'ok';
              const status = mark === 'no' ? 'Not covered' : mark === 'extra' ? 'Chargeable' : 'Covered';
              return (
                <li key={label} className={band ? 'is-band' : undefined}>
                  <div className="svc-dialog__row">
                    <strong>{t(label)}</strong>
                    {band ? null : <span className={`svc-dialog__mark is-${mark}`}>{t(status)}</span>}
                  </div>
                  <p>{t(text)}</p>
                </li>
              );
            })}
          </ol>
        </Dialog>
      ) : null}
    </>
  );
}
