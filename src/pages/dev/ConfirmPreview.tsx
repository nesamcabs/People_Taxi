// Development only (/dev/booking-confirmed; not part of the production build): plays the "Booking confirmed" moment
// with sample trip details, so its look and sound can be checked without making a booking. Tapping "Play" is the tap
// browsers need before they allow sound.
import { useState } from 'react';
import { BookingConfirmedOverlay } from '@/components/BookingConfirmedOverlay';
import { primeChime } from '@/lib/confirmChime';

export default function ConfirmPreview() {
  const [run, setRun] = useState(0);
  const [open, setOpen] = useState(false);
  const play = () => {
    primeChime();
    setRun((n) => n + 1);
    setOpen(true);
  };
  return (
    <div style={{ display: 'grid', placeItems: 'center', gap: 12, minHeight: '60vh', padding: 24, textAlign: 'center' }}>
      <h1 style={{ margin: 0, fontSize: '1.2rem' }}>Booking confirmed: preview</h1>
      <p style={{ margin: 0, color: '#64748b', fontSize: '.9rem' }}>Sample trip. Turn the sound on, then tap Play.</p>
      <button type="button" className="btn btn--primary" onClick={play} style={{ minWidth: 200 }}>
        ▶ Play
      </button>
      {open ? (
        <BookingConfirmedOverlay
          key={run}
          logo={{ src: '/brand/peopletaxi-logo.webp', alt: 'People Taxi' }}
          code="PT-2611-4827"
          message="We will share the driver details before pickup."
          trip={{ from: 'Koduvilarpatty', to: 'Chennai', when: 'Fri, 27 Nov · 10:25 AM', car: 'Dzire / Etios Or Similar' }}
          primaryLabel="Play again"
          onPrimary={play}
          secondaryLabel="Close"
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}
