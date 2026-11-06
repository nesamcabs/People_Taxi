// Route map (Google Maps). Shows pickup, destination, the driven route, the driver and the
// rider's own position; can also run in "drop a pin" mode where the rider pans the map under a fixed pin.
// There is no second map: if Google Maps cannot load, the page says so.
import { useState } from 'react';
import type { LatLng } from '@core/types';
import { Icon } from './Icon';
import { GoogleRouteMap, hasGoogleMapsWebKey } from './GoogleRouteMap';

export interface MapPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface RouteMapProps {
  pickup?: (LatLng & { name?: string }) | null;
  drop?: (LatLng & { name?: string }) | null;
  driver?: (LatLng & { label?: string; stale?: boolean }) | null;
  userLocation?: LatLng | null;
  /** [lat, lng] pairs of the route to draw. A straight pickup→drop line is drawn when absent. */
  path?: [number, number][] | null;
  /** The whole trip, drawn quietly underneath `path` (e.g. while `path` is the driver's leg). */
  basePath?: [number, number][] | null;
  /** Visible area of the map when something (e.g. the booking panel) covers part of it. */
  padding?: MapPadding;
  /** Drop-a-pin mode: a fixed pin at the visible centre; reports where the map is centred. */
  pinMode?: 'pickup' | 'drop' | null;
  onCenterChange?: (p: LatLng) => void;
  className?: string;
  label: string;
}

const ZERO: MapPadding = { top: 24, right: 24, bottom: 24, left: 24 };

export function RouteMap(props: RouteMapProps) {
  const [failed, setFailed] = useState(false);
  const padding = props.padding ?? ZERO;
  if (!hasGoogleMapsWebKey || failed) {
    return (
      <div className={`route-map ${props.className ?? ''}`} role="region" aria-label={props.label}>
        <div className="route-map__offline" role="alert">
          <Icon name="circle-alert" size={16} /> The map could not load. Check your connection and reload the page.
        </div>
      </div>
    );
  }
  return <GoogleRouteMap {...props} padding={padding} onLoadError={() => setFailed(true)} />;
}
