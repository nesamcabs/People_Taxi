import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useCustomerData } from '@core/context/CustomerData';

/** The ride in progress, the next booking, or a trip waiting for a rating: one small chip in the middle of the header.
 *  The label has a long and a short form, and a route that is wider than the chip slowly scrolls so all of it can be read. */
export function RideBanner() {
  const { liveRide, unratedTrip } = useCustomerData();
  const trip = liveRide ?? unratedTrip;
  const route = trip ? `${trip.pickup.name} → ${trip.drop.name}` : '';
  const boxRef = useRef<HTMLElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [shift, setShift] = useState(0);

  // Measure the route against the room it has; when it does not fit, the track scrolls by exactly its own width.
  useLayoutEffect(() => {
    const box = boxRef.current;
    const text = textRef.current;
    if (!box || !text) return;
    const measure = () => setShift(text.scrollWidth > box.clientWidth + 1 ? text.scrollWidth + 28 : 0);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    ro.observe(text); // also when only the text changes width (the web font arriving), so the loop never jumps
    return () => ro.disconnect();
  }, [route]);

  if (!trip) return null;
  const live = !!liveRide;
  const ongoing = trip.status === 'Ongoing';
  const longLabel = live ? (ongoing ? 'Trip in progress' : 'Upcoming booking') : 'How was your journey?';
  const shortLabel = live ? (ongoing ? 'On trip' : 'Upcoming') : 'Rate trip';
  return (
    <Link
      className={`ride-chip ${live ? '' : 'ride-chip--soft'} ${ongoing ? 'ride-chip--ongoing' : ''}`}
      to={`/ride/${trip.id}`}
      title={`${longLabel} · ${route}`}
      aria-label={`${longLabel}: ${route}. ${live ? 'View booking' : 'Rate trip'}`}
    >
      <span className="ride-chip__text">
        <strong>
          <span className="ride-chip__long">{longLabel}</span>
          <span className="ride-chip__short">{shortLabel}</span>
        </strong>
        <small ref={boxRef} className="ride-chip__route">
          <span className={`ride-chip__track ${shift ? 'is-scroll' : ''}`} style={shift ? ({ '--ride-shift': `${shift}px` } as CSSProperties) : undefined}>
            <span ref={textRef}>{route}</span>
            {shift ? <span aria-hidden="true">{route}</span> : null}
          </span>
        </small>
      </span>
    </Link>
  );
}
