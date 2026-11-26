// "Choose on map": a fixed pin over a moving map, with the address under it.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { GeoPlace, LatLng } from '@core/types';
import { reverseGeocode } from '@core/services/geoService';
import { haversineKm, isValidLatLng } from '@core/utils/geo';
import { Button, Dialog } from './ui';
import { Icon } from './Icon';
import { RouteMap } from './RouteMap';
import { useDeviceLocation } from '@/lib/hooks';
import { LOCATION_HELP } from '@/lib/schedule';

/** Within this distance of the field's selection the map still "is" that place (map projection rounding, not a move). */
const SAME_SPOT_KM = 0.01;
/** A re-reported centre closer than this (a resize, a note appearing) is not a move: the pin and its answer stay. */
const JITTER_KM = 0.002;

export function PinDialog({
  title,
  mode,
  initial = null,
  check,
  onBack,
  onConfirm,
}: {
  title: string;
  mode: 'pickup' | 'drop';
  /** The field's current place: the map opens on it, and confirming without moving returns it unchanged. */
  initial?: GeoPlace | null;
  /** The field's own rule (e.g. airport only); a refusal is shown here so the pin can be corrected. */
  check?: (p: GeoPlace) => string;
  onBack: () => void;
  onConfirm: (p: GeoPlace) => void;
}) {
  // Taken once when the dialog opens, so a later change elsewhere never moves this pin.
  const [start] = useState<GeoPlace | null>(() => (initial && isValidLatLng(initial) ? initial : null));
  // With no place chosen yet the map starts on the rider's real location (asks once); with one, GPS is never needed.
  // The map's locate button still finds the device on request.
  const { position, locate, locating, error: locError, permission } = useDeviceLocation(false, !start);
  const [center, setCenter] = useState<LatLng | null>(start ? { lat: start.lat, lng: start.lng } : null);
  const [place, setPlace] = useState<GeoPlace | null>(start);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);
  // Slides down before it is removed, mirroring the slide up when it opens.
  const close = () => {
    if (closing) return;
    setClosing(true);
    closeTimer.current = window.setTimeout(onBack, 240);
  };
  const onCenterChange = useCallback((c: LatLng) => {
    if (!isValidLatLng(c)) return;
    setCenter((prev) => (prev && haversineKm(prev, c) < JITTER_KM ? prev : c));
  }, []);

  useEffect(() => {
    if (!center || !isValidLatLng(center)) return undefined;
    setProblem('');
    // Still on the selected place: keep it exactly (name, address, id, type) instead of re-reading the address.
    if (start && haversineKm(center, start) <= SAME_SPOT_KM) {
      setPlace(start);
      setBusy(false);
      return undefined;
    }
    setBusy(true);
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      reverseGeocode(center, controller.signal)
        .then((p) => {
          // A newer pan superseded this lookup: its answer must not replace the newer point.
          if (controller.signal.aborted) return;
          const resolved: GeoPlace = { ...p, lat: center.lat, lng: center.lng };
          setPlace(resolved);
          setBusy(false);
          if (isCoordinateOnly(resolved)) setProblem('We couldn’t find the address of this spot. You can confirm the pinned point, or move the map slightly to try again.');
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setPlace(coordinatePlace(center));
          setBusy(false);
          setProblem('We couldn’t find the address of this spot. You can confirm the pinned point, or move the map slightly to try again.');
        });
    }, 450);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [center?.lat, center?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const confirm = () => {
    if (!place || busy || !isValidLatLng(place)) return;
    const why = check?.(place) ?? '';
    if (why) {
      setProblem(why);
      return;
    }
    onConfirm(place);
  };

  const locNote = locError ? LOCATION_HELP[locError.kind] : permission === 'denied' || permission === 'blocked' ? LOCATION_HELP.blocked : '';

  return (
    <Dialog
      variant="page"
      className={`pin-sheet ${closing ? 'is-closing' : ''}`}
      title={title}
      subtitle="Move the map so the pin sits on the exact spot."
      onClose={close}
      footer={
        <>
          <Button variant="secondary" icon="arrow-left" onClick={close}>
            Back
          </Button>
          <Button disabled={!place || busy} onClick={confirm}>
            Confirm location
          </Button>
        </>
      }
    >
      <RouteMap className="pinmap" label="Choose a place on the map" pinMode={mode} pinStart={start} userLocation={position} onCenterChange={onCenterChange} onLocate={locate} />
      {locating ? (
        <p className="pin-note muted" role="status">
          Finding your location…
        </p>
      ) : locNote && !start ? (
        <p className="pin-note muted" role="status">
          {locNote}
        </p>
      ) : null}
      {problem ? (
        <p className="field__error pin-note" role="alert">
          {problem}
        </p>
      ) : null}
      <div className="pin-card" aria-live="polite">
        <Icon name="map-pin" size={20} />
        <div>
          <strong>{place?.name ?? 'Move the map…'}</strong>
          <small className="muted">{busy ? 'Finding address…' : place && place.address !== place.name ? place.address : ''}</small>
        </div>
      </div>
    </Dialog>
  );
}

/** reverseGeocode's own "no address" answer: a pin labelled only by its coordinates. */
const isCoordinateOnly = (p: GeoPlace): boolean => p.id.startsWith('pin-') && p.name === 'Pinned location';
const coordinatePlace = (c: LatLng): GeoPlace => ({
  id: `pin-${c.lat.toFixed(4)},${c.lng.toFixed(4)}`,
  name: 'Pinned location',
  address: `${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}`,
  type: 'other',
  lat: c.lat,
  lng: c.lng,
});
