import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { dateLocale, msg, translate, useT } from '@/i18n';
// Local Rentals: a full-screen map and a sheet that rises from the bottom, one question at a time (Ola / Uber style).
//   Hourly Rental   → pickup on the map, then the hours, Ride now or Schedule, and the cabs with their fares.
//   Pickup & Drop   → pickup on the map, drop on the map, then Ride now or Schedule, and the cabs with their fares.
// The cab is picked and booked right in the sheet (no separate vehicle and review steps). Every fare is the booking server's
// own quote, and the server prices the booking again, so nothing here can change what a rider is charged.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import type { FareBreakdown, GeoPlace, TripRecord } from '@core/types';
import { reverseGeocode } from '@core/services/geoService';
import { cancellationQuote, createRideRequest, subscribeToBoardingOtp, subscribeToBooking } from '@core/services/rideService';
import { scheduleProblem } from '@core/utils/bookingRules';
import { formatINR, localMobile } from '@core/utils/format';
import { haversineKm, isValidLatLng } from '@core/utils/geo';
import { describeError } from '@core/utils/retry';
import { breakupFromFare } from '@core/utils/fareBreakup';
import { Icon } from '@/components/Icon';
import { Avatar } from '@/components/ui';
import { LocationPicker } from '@/components/LocationPicker';
import { TimePicker, formatTime12 } from '@/components/TimePicker';
import { DatePicker, opensDatePicker } from '@/components/DatePicker';
import { useBooking, useBookingQuote } from '@/state/Booking';
import { useAuth } from '@/state/Auth';
import { useCustomerData } from '@/state/customer';
import { categoryName, categoryPhoto, isLocalOnlyCategory, localOnlyTrip, tripCategoryName } from '@/lib/categories';
import { quoteForFuel, quoteMatchesFuel } from '@/lib/fuelQuote';
import { primeChime } from '@/lib/confirmChime';
import { saveDraft, RENTAL_PACKAGE_HOURS } from '@/lib/draft';
import { setPendingReturn } from '@/lib/pendingReturn';
import { useDeviceLocation, useLivePickupDefault, useMinWidth, useOnline } from '@/lib/hooks';
import { LOCATION_HELP, combineDateTime, earliestSlot, latestPickup, pickupTimeOptions, ridenowBookingTime, ridenowPickup, toDateInput, toTimeInput } from '@/lib/schedule';
import { useSeo } from '@/lib/seo';
import { LOCAL_CITIES, QUICK_CITIES } from '@/pages/book/content';
import { dragToScroll } from '@/lib/dragScroll';
import { SERVICES, serviceHref } from '@/lib/services';
import { loadGoogleMaps, hasGoogleMapsWebKey, onGoogleMapsFailure } from '@/lib/googleMaps';
import { CancelDialog } from '@/pages/ride/dialogs';
import { useToasts } from '@/state/Toasts';
import { useQuietBookingConfirmed } from '@/state/Inbox';
import { FareDialog } from '@/pages/book/parts';
import { OutstationDialog } from './OutstationDialog';
import { RideKindIcon } from '@/components/RideKindIcon';
import { forKind, rideKind } from '@/lib/rideKind';
import { useNearbyDrivers, type NearbyDot } from '@/lib/nearbyDrivers';
import { cabArt, cabDotHtml, cabDotKey, mostKind } from './cabDots';
import './localRentals.css';

type Mode = 'hourly' | 'pickup';
type Stage = 'pickup' | 'drop' | 'when';
type LatLng = { lat: number; lng: number };

/** Pickup & Drop is for one city; the server treats anything longer than this (by road) as outstation. */
const CITY_LIMIT_KM = 40;
/** Pickup times offered in the dropdown: every half hour; "Other time" opens the wheel for anything else. */
const TIME_SLOTS = Array.from({ length: 38 }, (_, i) => `${String(5 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);
const TILE_URL = (import.meta.env.VITE_MAP_TILE_URL as string | undefined) || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = (import.meta.env.VITE_MAP_ATTRIBUTION as string | undefined) || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const STATE_VIEW = { lat: 11.1, lng: 78.4, zoom: 7 };

const DISPOSAL_ID = 'place-local-disposal';
/** A rental drives within the pickup city: its destination is the city-disposal placeholder, never priced by distance. */
const disposalFor = (pickup: GeoPlace): GeoPlace => ({
  id: DISPOSAL_ID,
  name: 'Local City Disposal',
  address: `${pickup.name} & City Limits (Within city disposal)`,
  lat: pickup.lat + 0.003,
  lng: pickup.lng - 0.003,
  type: 'other',
});

const pinPlace = (ll: LatLng): GeoPlace => ({
  id: 'pin',
  name: 'Pinned location',
  address: `${ll.lat.toFixed(5)}, ${ll.lng.toFixed(5)}`,
  lat: ll.lat,
  lng: ll.lng,
  type: 'other',
});

/** A name tag on the map, built from DOM nodes so a place name is never parsed as HTML. */
function tag(kind: 'from' | 'to', text: string): HTMLElement {
  const root = document.createElement('div');
  root.className = `lr-tag lr-tag--${kind}`;
  const dot = document.createElement('i');
  const name = document.createElement('span');
  name.textContent = text;
  root.append(dot, name);
  return root;
}

// ── The map ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
// While a place is being chosen the map is draggable and the pin stays fixed above the sheet: the place is whatever sits under
// the pin when the map stops. Afterwards the map just shows the trip.
interface Pin { place: GeoPlace; kind: 'from' | 'to' }
interface Target extends LatLng { zoom?: number; n: number }

// ── Google Maps (the map the sites use everywhere else) ─────────────────────────────────────────────────────────────────────
// The map ends at the top of the sheet, so Google's own logo and terms stay visible and the pin is simply the middle of the map.

/** The road between pickup and drop as [lat, lng] points (null until the route is known): drawn instead of a straight line. */
type Road = [number, number][] | null;
const roadKeyOf = (road: Road) => (road && road.length > 1 ? `${road.length}:${road[0]!.join(',')}:${road[road.length - 1]!.join(',')}` : '');
/** People Taxi blue line on a white casing, so the route reads clearly over any map (Ola / Uber style). */
const ROAD_COLOR = '#1665e8';
/** Finding a cab: a small radar sweeping round the pickup (two rings spreading out and a turning beam). Pure CSS (.lr-radar). */
const RADAR_HTML = '<span class="lr-radar" aria-hidden="true"><i></i><i></i><b></b></span>';

function LeafletPinMap({ picking, target, pins, sheetH, onPick, me, road, pulse, cabs }: { picking: boolean; target: Target | null; pins: Pin[]; sheetH: number; onPick: (ll: LatLng) => void; me: LatLng | null; road: Road; pulse: LatLng | null; cabs: NearbyDot[] }) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const cabLayer = useRef<L.LayerGroup | null>(null);
  const meMarker = useRef<L.Marker | null>(null);
  const programmatic = useRef(false);
  const gesture = useRef(false); // true only after the rider dragged or pinched: a resize of the map must never count as moving the pin
  const live = useRef({ picking, sheetH, onPick });
  live.current = { picking, sheetH: window.innerWidth >= 900 ? sheetH : 0, onPick };

  useEffect(() => {
    const el = host.current;
    if (!el || map.current) return undefined;
    const m = L.map(el, { zoomControl: false, attributionControl: true }).setView([STATE_VIEW.lat, STATE_VIEW.lng], STATE_VIEW.zoom);
    L.tileLayer(TILE_URL, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(m);
    cabLayer.current = L.layerGroup().addTo(m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    m.on('dragstart', () => { gesture.current = true; });
    m.on('zoomstart', () => { if (!programmatic.current) gesture.current = true; });
    m.on('movestart', () => el.classList.add('is-moving'));
    m.on('moveend', () => {
      el.classList.remove('is-moving');
      if (programmatic.current || !live.current.picking || !gesture.current) return;
      gesture.current = false;
      // The pin is drawn above the sheet, so the place is read at the pin's own point, not at the middle of the map.
      const size = m.getSize();
      const at = m.containerPointToLatLng(L.point(size.x / 2, Math.max(70, (size.y - live.current.sheetH) / 2)));
      live.current.onPick({ lat: at.lat, lng: at.lng });
    });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => m.invalidateSize()) : null;
    ro?.observe(el);
    return () => { ro?.disconnect(); m.remove(); map.current = null; meMarker.current = null; cabLayer.current = null; };
  }, []);

  // Drivers on duty nearby: small cars under the pins.
  useEffect(() => {
    const g = cabLayer.current;
    if (!g) return;
    g.clearLayers();
    for (const d of cabs) {
      L.marker([d.lat, d.lng], { icon: L.divIcon({ className: 'lr-cabwrap', html: cabDotHtml(d), iconSize: [32, 32], iconAnchor: [16, 16] }), keyboard: false, interactive: false, zIndexOffset: -50 }).addTo(g);
    }
  }, [cabDotKey(cabs)]); // eslint-disable-line react-hooks/exhaustive-deps

  // Finding a cab: the radar on the pickup.
  useEffect(() => {
    const m = map.current;
    if (!m || !pulse) return undefined;
    const marker = L.marker([pulse.lat, pulse.lng], { icon: L.divIcon({ className: 'lr-radarwrap', html: RADAR_HTML, iconSize: [0, 0], iconAnchor: [0, 0] }), keyboard: false, interactive: false, zIndexOffset: -100 }).addTo(m);
    return () => { marker.remove(); };
  }, [pulse?.lat, pulse?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // The rider's own position: a blue dot that stays on the map whatever the pin does.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!me) { meMarker.current?.remove(); meMarker.current = null; return; }
    if (meMarker.current) meMarker.current.setLatLng([me.lat, me.lng]);
    else meMarker.current = L.marker([me.lat, me.lng], { icon: L.divIcon({ className: 'lr-mewrap', html: '<span class="lr-me"></span>', iconSize: [22, 22], iconAnchor: [11, 11] }), keyboard: false, interactive: false, zIndexOffset: 400 }).addTo(m);
  }, [me?.lat, me?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // Move to a place (a search result, the device location, a city chip).
  useEffect(() => {
    const m = map.current;
    if (!m || !target) return;
    programmatic.current = true;
    m.setView([target.lat, target.lng], target.zoom ?? 16, { animate: false });
    if (live.current.picking) m.panBy([0, live.current.sheetH / 2], { animate: false });
    programmatic.current = false;
  }, [target?.n]); // eslint-disable-line react-hooks/exhaustive-deps

  // Draw the chosen places, and fit the trip into the part of the map above the sheet.
  useEffect(() => {
    const g = layer.current;
    const m = map.current;
    if (!g || !m) return;
    g.clearLayers();
    const pts: [number, number][] = pins.map((p) => [p.place.lat, p.place.lng]);
    // The trip follows the road. Until the road is known nothing is drawn (never a straight line across the map).
    const way = pins.length === 2 && road && road.length > 1 ? road : null;
    if (way) {
      L.polyline(way, { color: '#ffffff', weight: 8, opacity: 0.95, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(g);
      L.polyline(way, { color: ROAD_COLOR, weight: 5, opacity: 0.95, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(g);
    }
    for (const p of pins) {
      L.circleMarker([p.place.lat, p.place.lng], { radius: 7, color: '#fff', weight: 3, fillColor: p.kind === 'from' ? '#16a34a' : '#dc2626', fillOpacity: 1, interactive: false }).addTo(g);
      L.marker([p.place.lat, p.place.lng], { icon: L.divIcon({ className: 'lr-tagwrap', html: tag(p.kind, p.place.name), iconSize: [0, 0], iconAnchor: [0, p.kind === 'from' ? 18 : -10] }), keyboard: false, interactive: false, zIndexOffset: 500 }).addTo(g);
    }
    if (live.current.picking || !pts.length) return;
    programmatic.current = true;
    if (pts.length === 1) {
      m.setView(pts[0]!, 15, { animate: false });
      m.panBy([0, live.current.sheetH / 2], { animate: false });
    } else {
      m.fitBounds(L.latLngBounds(way ? [...pts, ...way] : pts), { paddingTopLeft: [48, 120], paddingBottomRight: [48, live.current.sheetH + 36], maxZoom: 15, animate: false });
    }
    programmatic.current = false;
  }, [pins.map((p) => `${p.kind}:${p.place.lat},${p.place.lng},${p.place.name}`).join('|'), picking, sheetH, roadKeyOf(road)]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={host} className="lr__map lr__map--google" role="application" aria-label={translate('Map. Drag it to place the pin on your location.')} />;
}

// ── Google Maps (the map the sites use everywhere else) ─────────────────────────────────────────────────────────────────────
// The map ends at the top of the sheet, so Google's own logo and terms stay visible and the pin is simply the middle of the map.
function GooglePinMap({ picking, target, pins, sheetH, onPick, onFail, me, road, pulse, cabs }: { picking: boolean; target: Target | null; pins: Pin[]; sheetH: number; onPick: (ll: LatLng) => void; onFail: () => void; me: LatLng | null; road: Road; pulse: LatLng | null; cabs: NearbyDot[] }) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const overlays = useRef<any[]>([]);
  const cabMarks = useRef<any[]>([]);
  const meMarker = useRef<any>(null);
  const last = useRef<LatLng | null>(null);
  const placed = useRef(false); // set once the first position has been applied: Google's first idle event is not the rider moving the pin
  const gesture = useRef(false); // true only after the rider dragged or pinched: Google's own resizes and recentring must never count as moving the pin
  const quietUntil = useRef(0); // zoom changes we make ourselves are not gestures
  const live = useRef({ picking, onPick, onFail, sheetH });
  live.current = { picking, onPick, onFail, sheetH };
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    // A rejected key (referrer, billing) is reported by Google through this hook rather than by the script failing to load.
    const stopFailureListener = onGoogleMapsFailure(() => { if (alive) live.current.onFail(); });
    loadGoogleMaps()
      .then((maps) => {
        if (!alive || !host.current) return;
        const el = host.current;
        const m = new maps.Map(el, { center: { lat: STATE_VIEW.lat, lng: STATE_VIEW.lng }, zoom: STATE_VIEW.zoom, disableDefaultUI: true, clickableIcons: false, gestureHandling: 'greedy', keyboardShortcuts: false });
        map.current = m;
        m.addListener('dragstart', () => { gesture.current = true; el.classList.add('is-moving'); });
        m.addListener('zoom_changed', () => { if (Date.now() > quietUntil.current) { gesture.current = true; el.classList.add('is-moving'); } });
        m.addListener('idle', () => {
          el.classList.remove('is-moving');
          if (!live.current.picking || !placed.current || !gesture.current) return;
          gesture.current = false;
          const c = m.getCenter();
          const ll = { lat: c.lat(), lng: c.lng() };
          last.current = ll;
          live.current.onPick(ll);
        });
        setReady(true);
      })
      .catch(() => { if (alive) live.current.onFail(); });
    return () => {
      alive = false;
      stopFailureListener();
      overlays.current.forEach((o) => o.setMap?.(null));
      overlays.current = [];
      cabMarks.current.forEach((o) => o.setMap?.(null));
      cabMarks.current = [];
      meMarker.current?.setMap(null);
      meMarker.current = null;
      if (map.current) window.google?.maps?.event?.clearInstanceListeners(map.current);
      map.current = null;
    };
  }, []);

  // Move to a place (a search result, the device location, a city chip).
  useEffect(() => {
    const m = map.current;
    if (!m || !ready || !target) return;
    last.current = { lat: target.lat, lng: target.lng };
    placed.current = true;
    gesture.current = false;
    quietUntil.current = Date.now() + 1200;
    m.setCenter({ lat: target.lat, lng: target.lng });
    m.setZoom(target.zoom ?? 16);
  }, [target?.n, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // The rider's own position: a blue dot that stays on the map whatever the pin does.
  useEffect(() => {
    const m = map.current;
    const maps = window.google?.maps;
    if (!m || !maps || !ready) return;
    if (!me) { meMarker.current?.setMap(null); meMarker.current = null; return; }
    const pos = { lat: me.lat, lng: me.lng };
    if (meMarker.current) meMarker.current.setPosition(pos);
    else meMarker.current = new maps.Marker({ map: m, position: pos, clickable: false, zIndex: 4, title: 'Your location', icon: { path: maps.SymbolPath.CIRCLE, scale: 8, fillColor: '#1a73e8', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 } });
  }, [me?.lat, me?.lng, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // Drivers on duty nearby: small cars (HTML overlays under the pins), redrawn when the list changes.
  useEffect(() => {
    const m = map.current;
    const maps = window.google?.maps;
    if (!m || !maps || !ready) return;
    cabMarks.current.forEach((o) => o.setMap(null));
    cabMarks.current = cabs.map((d) => {
      const holder = document.createElement('div');
      holder.className = 'lr-cabwrap lr-cabwrap--g';
      holder.innerHTML = cabDotHtml(d);
      const ov = new maps.OverlayView();
      ov.onAdd = () => ov.getPanes().overlayLayer.appendChild(holder);
      ov.draw = () => {
        const pt = ov.getProjection()?.fromLatLngToDivPixel(new maps.LatLng(d.lat, d.lng));
        if (pt) { holder.style.left = `${pt.x}px`; holder.style.top = `${pt.y}px`; }
      };
      ov.onRemove = () => holder.remove();
      ov.setMap(m);
      return ov;
    });
  }, [cabDotKey(cabs), ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // Finding a cab: the radar on the pickup (a small HTML overlay, under the pickup marker).
  useEffect(() => {
    const m = map.current;
    const maps = window.google?.maps;
    if (!m || !maps || !ready || !pulse) return undefined;
    const holder = document.createElement('div');
    holder.className = 'lr-radarwrap';
    holder.style.position = 'absolute';
    holder.innerHTML = RADAR_HTML;
    const ov = new maps.OverlayView();
    ov.onAdd = () => ov.getPanes().overlayLayer.appendChild(holder);
    ov.draw = () => {
      const pt = ov.getProjection()?.fromLatLngToDivPixel(new maps.LatLng(pulse.lat, pulse.lng));
      if (pt) { holder.style.left = `${pt.x}px`; holder.style.top = `${pt.y}px`; }
    };
    ov.onRemove = () => holder.remove();
    ov.setMap(m);
    return () => { ov.setMap(null); };
  }, [pulse?.lat, pulse?.lng, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // Draw the chosen places, and fit the trip into the map.
  useEffect(() => {
    const m = map.current;
    const maps = window.google?.maps;
    if (!m || !maps || !ready) return;
    overlays.current.forEach((o) => o.setMap(null));
    overlays.current = [];
    const add = (o: any) => { overlays.current.push(o); return o; };
    const bounds = new maps.LatLngBounds();
    for (const p of pins) {
      const pos = { lat: p.place.lat, lng: p.place.lng };
      bounds.extend(pos);
      add(new maps.Marker({ map: m, position: pos, clickable: false, zIndex: 5, icon: { path: maps.SymbolPath.CIRCLE, scale: 7, fillColor: p.kind === 'from' ? '#16a34a' : '#dc2626', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 } }));
      // The name tag is a small HTML overlay (built from DOM nodes) placed at the point.
      const div = tag(p.kind, p.place.name);
      div.style.position = 'absolute';
      const ov = new maps.OverlayView();
      ov.onAdd = () => ov.getPanes().overlayMouseTarget.appendChild(div);
      ov.draw = () => {
        const pt = ov.getProjection()?.fromLatLngToDivPixel(new maps.LatLng(pos.lat, pos.lng));
        if (pt) { div.style.left = `${pt.x}px`; div.style.top = `${pt.y + (p.kind === 'from' ? -46 : 12)}px`; }
      };
      ov.onRemove = () => div.remove();
      ov.setMap(m);
      add(ov);
    }
    // The trip follows the road. Until the road is known nothing is drawn (never a straight line across the map).
    if (pins.length === 2 && road && road.length > 1) {
      const path = road.map(([lat, lng]) => ({ lat, lng }));
      add(new maps.Polyline({ map: m, path, clickable: false, zIndex: 2, strokeColor: '#ffffff', strokeOpacity: 0.95, strokeWeight: 8 }));
      add(new maps.Polyline({ map: m, path, clickable: false, zIndex: 3, strokeColor: ROAD_COLOR, strokeOpacity: 0.95, strokeWeight: 5 }));
      for (const pt of path) bounds.extend(pt);
    }
    if (picking || !pins.length) return;
    quietUntil.current = Date.now() + 1200;
    if (pins.length === 1) {
      last.current = { lat: pins[0]!.place.lat, lng: pins[0]!.place.lng };
      m.setCenter(last.current);
      m.setZoom(15);
    } else {
      // On a phone the map ends at the sheet; on desktop it runs under the floating sheet, so keep the trip clear of it.
      m.fitBounds(bounds, { top: 100, right: 48, bottom: window.innerWidth >= 900 ? live.current.sheetH + 30 : 40, left: window.innerWidth >= 900 ? 420 : 48 });
      maps.event.addListenerOnce(m, 'idle', () => { if (m.getZoom() > 15) m.setZoom(15); });
    }
  }, [pins.map((p) => `${p.kind}:${p.place.lat},${p.place.lng},${p.place.name}`).join('|'), picking, ready, window.innerWidth >= 900 ? sheetH : 0, roadKeyOf(road)]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={host} className="lr__map lr__map--google" role="application" aria-label={translate('Map. Drag it to place the pin on your location.')} />;
}

/** Google Maps with the sites' key. If Google cannot load, or rejects the key, the same page keeps working on the open map. */
function PinMap(props: { picking: boolean; target: Target | null; pins: Pin[]; sheetH: number; onPick: (ll: LatLng) => void; me: LatLng | null; road: Road; pulse: LatLng | null; cabs: NearbyDot[] }) {
  const [provider, setProvider] = useState<'google' | 'leaflet'>(hasGoogleMapsWebKey ? 'google' : 'leaflet');
  return provider === 'google'
    ? <GooglePinMap picking={props.picking} target={props.target} pins={props.pins} sheetH={props.sheetH} onPick={props.onPick} me={props.me} road={props.road} pulse={props.pulse} cabs={props.cabs} onFail={() => setProvider('leaflet')} />
    : <LeafletPinMap {...props} />;
}

// ── The page ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * Phones book Local Rentals on this full-screen map sheet. Desktop books them on the home page, where the
 * booking form sits beside the map, so a desktop visit here (old link, bookmark, a back button) goes there.
 */
export function LocalRentalsPage() {
  const isDesktop = useMinWidth(900);
  const [params] = useSearchParams();
  if (isDesktop) return <Navigate to={`/book?service=${params.get('mode') === 'hourly' ? 'rental' : 'pickup'}`} replace />;
  return <LocalRentalsSheet />;
}

function LocalRentalsSheet() {
  const t = useT();
  useSeo({ title: t('Local Rentals'), noindex: true });
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { draft, update, reset, route, categories, categoryStatus, rideNowLead } = useBooking();
  const q = useBookingQuote();
  const { profile } = useCustomerData();
  const { state: auth, openLoginModal } = useAuth();
  const { position, locate, locating, error: locationError, permission } = useDeviceLocation(true, true);
  useEffect(() => { void locate(); }, [locate]);
  const { online } = useOnline();

  const real = (p: GeoPlace | null) => (p && p.id !== DISPOSAL_ID ? p : null);
  const [mode, setMode] = useState<Mode>(params.get('mode') === 'hourly' ? 'hourly' : 'pickup');
  // A trip this sheet already set up (the rider signed in half-way, or came back to it) opens again on its cabs. Anything else
  // starts fresh: a drop is never taken from another service's search (an outstation drop is not a city drop), and the pickup
  // is asked first.
  const resume = !!draft.pickupWhen && !!real(draft.pickup) && (mode === 'hourly' ? draft.tripType === 'Local Rental' : draft.tripType === 'One Way' && !!real(draft.drop));
  const upcoming = draft.scheduledAt && draft.scheduledAt.getTime() > Date.now() ? draft.scheduledAt : null;
  // The pickup time always starts again from the clock (30 minutes from now); a time from an earlier visit is not brought back.
  const future: Date | null = null;
  const [pickup, setPickup] = useState<GeoPlace | null>(resume ? real(draft.pickup) : null);
  const [drop, setDrop] = useState<GeoPlace | null>(resume && mode === 'pickup' ? real(draft.drop) : null);
  const [hours, setHours] = useState<number | null>(draft.tripType === 'Local Rental' ? draft.rentalHours ?? null : null);
  // The pickup starts at the earliest time a rider may book: 30 minutes after the device clock, rounded up to 5 minutes.
  const [date, setDate] = useState(() => toDateInput(future ?? earliestSlot()));
  const [time, setTime] = useState(() => toTimeInput(future ?? earliestSlot()));
  // Until the rider picks a date or time, the default keeps following the clock (always 30 minutes from now).
  const scheduleTouched = useRef(future !== null);
  useLivePickupDefault(scheduleTouched, (next) => {
    setDate(next.date);
    setTime(next.time);
  });
  const [nowMs, setNowMs] = useState(() => Date.now());
  // Ola / Uber style: Ride now (the earliest pickup the server accepts) or Schedule (a date and time).
  // Ride now unless the rider scheduled this trip last time.
  const [when, setWhen] = useState<'now' | 'later'>(draft.pickupWhen === 'later' && upcoming ? 'later' : 'now');
  const [stage, setStage] = useState<Stage>(resume ? 'when' : 'pickup');
  // A drop outside the city: ask whether to book it as Outstation instead (the place is kept until the rider answers).
  const [outstationAsk, setOutstationAsk] = useState<GeoPlace | null>(null);
  const [booking, setBooking] = useState(false);
  const bookingRef = useRef(false);
  const [cand, setCand] = useState<GeoPlace | null>(null);
  const [resolving, setResolving] = useState(false);
  const [target, setTarget] = useState<Target | null>(null);
  const [picker, setPicker] = useState<'pickup' | 'drop' | null>(null);
  const [timeOpen, setTimeOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  // The plan sheet can be pulled down to its button so the whole map shows.
  const [peek, setPeek] = useState(false);
  // Rental duration: a strip of hour tiles that scrolls sideways; the chosen tile is kept centred in view.
  const hourStripRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const strip = hourStripRef.current;
    const on = strip?.querySelector<HTMLElement>('[aria-checked="true"]');
    if (!strip || !on || !strip.clientWidth) return;
    strip.scrollTo({ left: on.offsetLeft - (strip.clientWidth - on.offsetWidth) / 2, behavior: 'smooth' });
  }, [hours, mode, stage, peek]);
  // City chips: every Tamil Nadu district and the other quick cities, nearest to the rider first once the device knows
  // where it is (rounded to about 10 km so the order does not shuffle while the rider moves), A to Z until then.
  const nearLat = position ? Math.round(position.lat * 10) / 10 : null;
  const nearLng = position ? Math.round(position.lng * 10) / 10 : null;
  const cityChips = useMemo(() => {
    if (nearLat == null || nearLng == null) return [...LOCAL_CITIES].sort((a, b) => a.name.localeCompare(b.name));
    const at = { lat: nearLat, lng: nearLng };
    return [...LOCAL_CITIES].sort((a, b) => haversineKm(at, a) - haversineKm(at, b));
  }, [nearLat, nearLng]);
  const [error, setError] = useState('');
  /** Shown when the device could only give a rough position (Wi-Fi / network), so a wrong-looking pin is explained. */
  const [approx, setApprox] = useState('');
  const [sheetH, setSheetH] = useState(240);
  const seq = useRef(0);
  const resolveToken = useRef(0);
  const dock = useRef<HTMLDivElement>(null);
  const userMoved = useRef(false);
  const { push } = useToasts();

  // ── Ride now, after booking: the ride lives on this same page (?ride=<id>, so a refresh keeps it) ──
  // The sheet follows the booking live: finding your cab (a radar on the pickup), then the driver and cab once one accepts.
  const rideId = params.get('ride');
  const [ride, setRide] = useState<TripRecord | null>(null);
  const [rideGone, setRideGone] = useState(false);
  const [rideOtp, setRideOtp] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  // The cab whose fare breakdown is open (tapping a cab's photo).
  const [fareFor, setFareFor] = useState<string | null>(null);
  useEffect(() => {
    setRide(null);
    setRideGone(false);
    if (!rideId) return undefined;
    return subscribeToBooking(rideId, (s) => {
      if (s.trip) { setRide(s.trip); setRideGone(false); }
      else if (!s.fromCache) setRideGone(true);
    });
  }, [rideId]);
  useEffect(() => (rideId ? subscribeToBoardingOtp(rideId, setRideOtp) : undefined), [rideId]);

  const picking = !rideId && stage !== 'when';

  // Drivers on local duty for this service near the pickup (the place under the pin while the pickup is being chosen).
  // Not while a ride is booked: then the map follows that ride.
  const nearAt = rideId ? null : stage === 'pickup' ? cand ?? pickup : pickup;
  const nearby = useNearbyDrivers(nearAt ? { lat: nearAt.lat, lng: nearAt.lng } : null, mode === 'hourly' ? 'rental' : 'pickup_drop', !rideId);
  const nearbyCabs = useMemo(() => nearby?.drivers ?? [], [nearby]);
  const nearbyArt = useMemo(() => ({ __html: cabArt(mostKind(nearbyCabs)) }), [nearbyCabs]);
  const nearestKm = nearby?.count && nearby.nearestKm !== null ? (nearby.nearestKm < 10 ? nearby.nearestKm.toFixed(1) : String(Math.round(nearby.nearestKm))) : null;

  const flyTo = useCallback((ll: LatLng, zoom = 16) => setTarget({ lat: ll.lat, lng: ll.lng, zoom, n: ++seq.current }), []);

  // Read the place under the pin (debounced, newest answer wins).
  const resolveAt = useCallback((ll: LatLng) => {
    const token = ++resolveToken.current;
    const fresh = () => token === resolveToken.current;
    setResolving(true);
    const ask = window.setTimeout(() => {
      reverseGeocode(ll)
        .then((p) => { if (fresh()) { setCand({ ...p, lat: ll.lat, lng: ll.lng }); setResolving(false); } })
        .catch(() => { if (fresh()) { setCand(pinPlace(ll)); setResolving(false); } });
    }, 300);
    // On a slow connection the rider is not kept waiting: the pin's coordinates stand in, and the address replaces them if it arrives.
    const giveUp = window.setTimeout(() => { if (fresh()) { setCand((c) => (c && c.lat === ll.lat && c.lng === ll.lng ? c : pinPlace(ll))); setResolving(false); } }, 3500);
    return () => { window.clearTimeout(ask); window.clearTimeout(giveUp); };
  }, []);

  const onPick = useCallback((ll: LatLng) => { userMoved.current = true; setError(''); resolveAt(ll); }, [resolveAt]);

  // Enter a stage: put the map on the place already chosen for it, or on where the rider is.
  const enter = useCallback((s: Stage) => {
    resolveToken.current += 1; // a lookup still running for the step we leave must not land in the next one
    setResolving(false);
    setStage(s);
    setError('');
    if (s === 'when') return;
    const have = s === 'pickup' ? pickup : drop;
    setCand(have);
    const at = have ?? (s === 'drop' ? pickup : null) ?? (position ? { lat: position.lat, lng: position.lng } : null);
    if (at) flyTo(at, have ? 16 : s === 'drop' ? 14 : 16);
    else setTarget({ ...STATE_VIEW, n: ++seq.current });
  }, [pickup, drop, position, flyTo]);

  // First screen: if the rider has no pickup yet, start where they are.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (stage === 'when') return;
    enter(stage);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (stage !== 'pickup' || userMoved.current || !position) return;
    flyTo({ lat: position.lat, lng: position.lng });
    resolveAt({ lat: position.lat, lng: position.lng });
  }, [position?.lat, position?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // What the sheet covers (the sheet plus the space it keeps above the tab bar) decides where the pin and the trip sit on the map.
  useEffect(() => {
    const el = dock.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const apply = () => setSheetH(Math.round(el.getBoundingClientRect().height) + (window.innerWidth >= 900 ? 20 : 0));
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    apply();
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (time && scheduleProblem(combineDateTime(date, time))) setTime('');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const leave = useCallback(() => navigate('/book?service=outstation'), [navigate]);
  const back = useCallback(() => {
    if (stage === 'drop') enter('pickup');
    else if (stage === 'when') enter(mode === 'pickup' ? 'drop' : 'pickup');
    else leave();
  }, [stage, mode, enter, leave]);
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && !picker && !timeOpen && !outstationAsk && !rideId && !cancelOpen && !fareFor) back(); };
    document.addEventListener('keydown', key);
    return () => { document.body.style.overflow = ''; document.removeEventListener('keydown', key); };
  }, [back, picker, timeOpen, outstationAsk, rideId, cancelOpen, fareFor]);

  const farApart = stage === 'drop' && !!pickup && !!cand && haversineKm(pickup, cand) > CITY_LIMIT_KM;
  const switchMode = (m: Mode) => {
    if (m === mode) return;
    setMode(m);
    setError('');
    // Either mode starts by asking the pickup (the one chosen before is prefilled, one tap to confirm). Pickup & Drop then asks the drop again.
    if (m === 'pickup') setDrop(null);
    enter('pickup');
  };
  // Local / Rental are chosen in the bottom bar, which only changes ?mode= in the URL. This page stays mounted when that
  // happens, so follow the URL here (the in-sheet Pickup & Drop / Hourly Rental switch is gone).
  const urlMode: Mode = params.get('mode') === 'hourly' ? 'hourly' : 'pickup';
  useEffect(() => { switchMode(urlMode); }, [urlMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const confirmStage = () => {
    setApprox('');
    if (!cand) return;
    if (stage === 'pickup') {
      setPickup(cand);
      if (mode === 'pickup') {
        resolveToken.current += 1;
        setResolving(false);
        if (drop && haversineKm(cand, drop) <= CITY_LIMIT_KM) { setStage('when'); setError(''); }
        else { setDrop(null); setStage('drop'); setError(''); setCand(null); flyTo(cand, 14); }
      } else enter('when');
    } else if (stage === 'drop') {
      // Outside the city (e.g. Theni → Madurai): offer Outstation, or stay here to pick another drop.
      if (farApart) { setOutstationAsk(cand); return; }
      resolveToken.current += 1;
      setResolving(false);
      setDrop(cand);
      setStage('when');
      setError('');
    }
  };

  // Yes to Outstation: carry the pickup and this drop over to the Outstation form (one way), which asks its own date and time.
  const goOutstation = () => {
    const to = outstationAsk;
    setOutstationAsk(null);
    if (!pickup || !to) return;
    update({ pickup, drop: to, tripType: 'One Way', rentalHours: null, stops: [], multicity: false, tripEndAt: null, pickupWhen: '' });
    navigate('/book?service=outstation&trip=one-way');
  };

  const chooseCity = (c: GeoPlace) => { userMoved.current = true; setCand(c); setResolving(false); flyTo(c, 13); };
  const onSearchPick = (p: GeoPlace) => {
    userMoved.current = true;
    setPicker(null);
    setCand(p);
    setResolving(false);
    flyTo(p, 16);
  };
  const useMyLocation = async () => {
    setApprox('');
    const p = await locate();
    if (!p) return;
    if (p.accuracy > 1000) setApprox(`Your device gave only an approximate location (about ${p.accuracy >= 10000 ? `${Math.round(p.accuracy / 1000)} km` : `${(p.accuracy / 1000).toFixed(1)} km`}). Move the map to place the pin exactly.`);
    flyTo({ lat: p.lat, lng: p.lng });
    if (stage === 'when') return; // the trip is already set; just show the rider where they are
    userMoved.current = true;
    resolveAt({ lat: p.lat, lng: p.lng });
  };
  // Until a position is known the sheet asks for it: the browser's own prompt opens from the button, and a blocked site says how to allow it.
  const secure = typeof window === 'undefined' || window.isSecureContext !== false;
  const askLocation = !position && !locating;
  const locationNote = !askLocation ? ''
    : !secure ? msg('Location only works on a secure (https) connection. Open the site over https, or search for your pickup.')
    : locationError ? LOCATION_HELP[locationError.kind]
    : permission === 'denied' || permission === 'blocked' ? LOCATION_HELP.blocked
    : msg('Allow location access so we can set your pickup where you are.');

  // ── When: day, time, hours ──
  const lastDay = toDateInput(latestPickup());
  const first = earliestSlot(nowMs);
  const firstDay = toDateInput(first);
  const firstTime = toTimeInput(first);
  // Only times that can still be booked are offered, so there is nothing to scroll past.
  const timeOptions = useMemo(() => pickupTimeOptions(date, TIME_SLOTS, nowMs), [date, nowMs]);
  const timeOk = (t: string) => !scheduleProblem(combineDateTime(date, t), nowMs);
  const pickDate = (iso: string) => {
    scheduleTouched.current = true;
    setDate(iso);
    setError('');
    if (time && scheduleProblem(combineDateTime(iso, time))) setTime(iso === firstDay ? firstTime : '');
  };
  // Keep the clock moving: a time that has become too soon is replaced by the new earliest one (never an error at the button).
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 15000);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => {
    if (date < firstDay) { setDate(firstDay); setTime(firstTime); return; } // no times left today
    if (date === firstDay && (!time || !timeOk(time))) setTime(firstTime);
  }, [nowMs]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── The cabs, right in the sheet ──
  // On the last step the trip is written into the booking draft, so the booking server prices every cab here. Ride now keeps
  // its pickup at the earliest time the server accepts (the booking state moves it forward); Schedule uses the chosen date and time.
  const picked = when === 'later' ? combineDateTime(date, time) : null;
  const pickedOk = !!picked && !scheduleProblem(picked, nowMs);
  const scheduleKey = when === 'now' ? 'now' : pickedOk ? picked.toISOString() : '';
  const byRider = when === 'later' && scheduleTouched.current;
  useEffect(() => {
    // Not while a booked ride is on screen: the draft was cleared when it was booked, and is set again when the rider books another.
    if (rideId || stage !== 'when' || !pickup || (mode === 'pickup' && !drop)) return;
    update({
      pickup,
      drop: mode === 'hourly' ? disposalFor(pickup) : drop,
      tripType: mode === 'hourly' ? 'Local Rental' : 'One Way',
      rentalHours: mode === 'hourly' ? hours : null,
      scheduledAt: when === 'now' ? ridenowPickup(Date.now(), rideNowLead) : pickedOk ? picked : null,
      scheduleByRider: byRider,
      tripEndAt: null,
      stops: [],
      multicity: false,
      fuelType: '',
      pickupWhen: when,
    });
  }, [rideId, stage, mode, pickup?.lat, pickup?.lng, pickup?.name, drop?.lat, drop?.lng, drop?.name, hours, scheduleKey, byRider, rideNowLead]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cab types the office turned off here are not shown. Each cab shows the server's fare (Diesel rate card), or why it has none.
  const localTrip = localOnlyTrip({ tripType: draft.tripType, multicity: false, distanceKm: route?.distanceKm });
  const cabs = useMemo(() => categories.filter((c) => !q.hidden.has(c.id) && (!isLocalOnlyCategory(c) || localTrip)), [categories, q.hidden, localTrip]);
  const fareOf = (id: string) => quoteForFuel(q.entries.get(id), 'diesel');
  // Keep a cab selected: the first one with a fare, until the rider taps another.
  useEffect(() => {
    if (stage !== 'when' || !q.entries.size) return;
    if (fareOf(draft.categoryId)) return;
    const first = cabs.find((c) => !!fareOf(c.id));
    if (first) update({ categoryId: first.id });
  }, [stage, q.entries, cabs, draft.categoryId]); // eslint-disable-line react-hooks/exhaustive-deps

  const needsHours = mode === 'hourly' && !hours;
  const needsTime = when === 'later' && !pickedOk;
  const cab = q.category;
  const fare = q.quote;
  const canBook = !needsHours && !needsTime && !!cab && !!fare && q.authoritative && !q.unavailable.has(cab.id) && quoteMatchesFuel(fare, q.entries.get(cab.id), 'diesel');
  // Ride now is sent at the current time, which can price a little differently from the quote on screen (e.g. at the
  // night-charge hour). The server then answers with the fare for that time: keep it for this cab, and the next tap books on it.
  const tripKey = JSON.stringify([draft.categoryId, pickup?.lat, pickup?.lng, drop?.lat, drop?.lng, mode, hours, when]);
  const [fareOverride, setFareOverride] = useState<{ key: string; fare: FareBreakdown } | null>(null);
  const bookFare = fareOverride?.key === tripKey ? fareOverride.fare : fare;

  // Book in one tap: no separate vehicle and review steps. Pay the driver at the end of the trip; WhatsApp updates go to the mobile number.
  const book = async () => {
    setError('');
    if (!online) return setError(msg('You’re offline. Reconnect to book.'));
    if (!pickup) return setError(msg('Choose your pickup location.'));
    if (mode === 'pickup' && !drop) return setError(msg('Choose your drop location.'));
    if (needsHours) return setError(msg('Select how many hours you need the car.'));
    if (when === 'later') {
      if (!date) return setError(msg('Choose a pickup date.'));
      if (!time) return setError(msg('Choose a pickup time.'));
      const problem = scheduleProblem(picked);
      if (problem) {
        if (date === firstDay) { setTime(firstTime); return setError(`That time has passed. Pickup moved to the earliest time, ${formatTime12(firstTime)}. Tap again to continue.`); }
        return setError(problem);
      }
    }
    if (auth.status !== 'ready' || !profile) {
      // Phone sign-in can remount the page: keep the trip, and come back to this sheet (it reopens on the cabs).
      saveDraft(draft);
      setPendingReturn(`/local-rentals?mode=${mode === 'hourly' ? 'hourly' : 'pickup'}`);
      openLoginModal({ title: msg('Sign in to book your cab'), subtitle: msg('Verify your mobile number to book this ride.') });
      return;
    }
    if (!canBook || !cab || !bookFare || !draft.pickup || !draft.drop || !draft.scheduledAt) return setError(q.quoteLoading ? msg('Getting the latest fares… Tap again in a moment.') : msg('Choose a cab to book.'));
    if (bookingRef.current) return;
    bookingRef.current = true;
    setBooking(true);
    // Unlock audio inside this tap, so the confirmation chime can play on the next screen (iPhones need this).
    primeChime();
    try {
      const res = await createRideRequest({
        awaitPayment: false,
        paymentOption: 'later',
        profile,
        pickup: draft.pickup,
        drop: draft.drop,
        stops: [],
        category: cab,
        route: route ?? { distanceKm: q.trip?.distanceKm ?? 0, durationMin: q.trip?.durationMin ?? 0, path: [], estimated: false },
        fare: bookFare,
        tripType: draft.tripType,
        multicity: false,
        paymentMethod: 'Cash',
        couponCode: q.coupon?.code ?? '',
        notes: '',
        // Ride now: the current time (when the server's minimum notice is 0), else the earliest pickup it accepts.
        scheduledAt: when === 'now' ? ridenowBookingTime(draft.scheduledAt, Date.now(), rideNowLead) : draft.scheduledAt,
        rentalHours: draft.tripType === 'Local Rental' ? draft.rentalHours : null,
        // As in Ola / Uber, the rider accepted the published terms when signing in (LegalGate); tapping Book confirms the ride on them.
        termsAccepted: true,
        addOns: { roofCarrier: false, pets: false },
        whatsapp: { sameAsMobile: true },
        email: profile.email || '',
        source: 'people_taxi',
        bookingSource: 'peopletaxi',
        brand: 'peopletaxi',
      });
      reset();
      if (when === 'now') {
        // Ride now: stay right here. The map's pickup starts its radar while a cab is found, and the driver and cab show in this sheet.
        setPeek(false);
        setParams({ mode: mode === 'hourly' ? 'hourly' : 'pickup', ride: res.id }, { replace: true });
      } else {
        // Scheduled: confirmed, and on to My bookings.
        push({ title: msg('Ride scheduled'), message: draft.scheduledAt ? t('Pickup {when}. We’ll share your driver’s details before pickup.', { when: draft.scheduledAt.toLocaleString(dateLocale(), { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) }) : msg('Your booking is confirmed.'), tone: 'success' });
        navigate('/trips', { replace: true });
      }
    } catch (e: unknown) {
      const err = e as { code?: string; fare?: FareBreakdown };
      if (err.code === 'fare-changed') {
        if (err.fare) {
          setFareOverride({ key: tripKey, fare: err.fare });
          setError(`The fare for this ride is now ${formatINR(err.fare.total)}. Tap Book again to confirm.`);
        } else {
          q.retryQuote();
          setError(msg('The fare for this trip has just updated. Check the new amount and tap Book again.'));
        }
        return;
      }
      setError(describeError(e, msg('We couldn’t book your cab. Please check your connection and try again.')));
    } finally {
      bookingRef.current = false;
      setBooking(false);
    }
  };

  // The booked ride, as the server has it (until it loads, what the rider just chose).
  const rideFrom = ride && isValidLatLng(ride.pickup) ? ride.pickup : pickup;
  const rideTo = ride ? (ride.tripType === 'Local Rental' || !isValidLatLng(ride.drop) ? null : ride.drop) : mode === 'pickup' ? drop : null;
  const ridePhase = ride?.phase ?? 'awaiting_review';
  const rideClosed = rideGone || ridePhase === 'cancelled' || ride?.status === 'Rejected';
  const rideFinding = !!rideId && !rideClosed && (ridePhase === 'awaiting_review' || ridePhase === 'arranging' || ridePhase === 'partner_confirmed');
  const pulse = rideFinding && rideFrom ? { lat: rideFrom.lat, lng: rideFrom.lng } : null;
  // No "Booking confirmed" popup over the search (from the tap on Book until a driver accepts).
  useQuietBookingConfirmed(rideFinding || (booking && when === 'now'));

  const pins: Pin[] = useMemo(() => {
    const out: Pin[] = [];
    if (rideId) {
      // Finding: the pickup alone, centred, with its radar. With a driver: the pickup and the drop.
      if (rideFrom) out.push({ place: rideFrom, kind: 'from' });
      if (!rideFinding && rideTo) out.push({ place: rideTo, kind: 'to' });
      return out;
    }
    if (stage === 'drop' && pickup) out.push({ place: pickup, kind: 'from' });
    if (stage === 'when') {
      if (pickup) out.push({ place: pickup, kind: 'from' });
      if (mode === 'pickup' && drop) out.push({ place: drop, kind: 'to' });
    }
    return out;
  }, [rideId, rideFinding, rideFrom?.lat, rideFrom?.lng, rideTo?.lat, rideTo?.lng, stage, mode, pickup, drop]); // eslint-disable-line react-hooks/exhaustive-deps

  // The road between pickup and drop: the same route the fares are priced on (worked out by the booking state once the trip is
  // set), used only when it belongs to the places on screen. While it loads, or if routing is down, no line is drawn.
  const samePlace = (a: GeoPlace | null, b: GeoPlace | null) => !!a && !!b && Math.abs(a.lat - b.lat) < 1e-7 && Math.abs(a.lng - b.lng) < 1e-7;
  const road: Road = !rideId && stage === 'when' && mode === 'pickup' && !!route && route.path.length > 1 && samePlace(draft.pickup, pickup) && samePlace(draft.drop, drop) ? route.path : null;

  const style = { '--lr-sheet': `${sheetH}px` } as React.CSSProperties;
  const place = cand;
  const addrLine = place && place.address && place.address !== place.name ? place.address : '';
  const pickerFor = picker ? (
    <LocationPicker
      config={{ title: t(picker === 'pickup' ? 'Pickup location' : 'Drop location'), allowCurrent: true, popular: QUICK_CITIES, popularLabel: t('Popular locations'), near: picker === 'drop' ? pickup : position ? { lat: position.lat, lng: position.lng } : null, pinMode: picker }}
      saved={[]}
      recent={[]}
      onClose={() => setPicker(null)}
      onSelect={onSearchPick}
    />
  ) : null;
  const scheduleFields = (
    <>
      <label className="lr-field lr-field--schedule">
        <span>{t('Pickup Date')}</span>
        <input type="date" className="lr-date" value={date} min={firstDay} max={lastDay} {...opensDatePicker(() => setDateOpen(true))} />
      </label>
      <label className="lr-field lr-field--schedule">
        <span>{t('Pickup Time')}</span>
        <div className="lr-select">
          <select
            value={time}
            onChange={(e) => {
              if (e.target.value === '__other') { setTimeOpen(true); return; }
              scheduleTouched.current = true;
              setTime(e.target.value);
              setError('');
            }}
          >
            <option value="">{t('Select')}</option>
            {time && !timeOptions.includes(time) ? <option value={time}>{formatTime12(time)}</option> : null}
            {timeOptions.map((t) => <option key={t} value={t}>{formatTime12(t)}</option>)}
            <option value="__other">{t('Other time…')}</option>
          </select>
        </div>
      </label>
    </>
  );
  // Ride now shows the pickup it will book (the earliest the server accepts); Schedule opens the date and time below it.
  const pickWhen = (w: 'now' | 'later') => { setWhen(w); setError(''); };
  const whenBlock = (
    <>
      <div className="lr-when" role="radiogroup" aria-label={t('When do you need the cab?')}>
        <button type="button" role="radio" aria-checked={when === 'now'} className={`lr-when__opt ${when === 'now' ? 'is-on' : ''}`} onClick={() => pickWhen('now')}>
          <span className="lr-when__icon" aria-hidden="true"><Icon name="clock" size={18} /></span>
          <span className="lr-when__text"><strong>{t('Ride now')}</strong></span>
        </button>
        <button type="button" role="radio" aria-checked={when === 'later'} className={`lr-when__opt ${when === 'later' ? 'is-on' : ''}`} onClick={() => pickWhen('later')}>
          <span className="lr-when__icon" aria-hidden="true"><Icon name="calendar" size={18} /></span>
          <span className="lr-when__text"><strong>{t('Schedule')}</strong></span>
        </button>
      </div>
      {when === 'later' ? <div className="lr-pair lr-pair--two">{scheduleFields}</div> : null}
    </>
  );

  // ── The booked ride, in this sheet ──
  const rideCanCancel = !!ride && !rideClosed && cancellationQuote(ride).allowed;
  const rideCancelFee = rideCanCancel && ride ? cancellationQuote(ride).fee : 0;
  // While finding: a partner has taken the ride and a cab is on the way to accept it.
  const rideFound = ridePhase === 'partner_confirmed';
  const rideDriver = ride?.driver ?? null;
  const rideWithDriver = !!rideDriver && (ridePhase === 'driver_assigned' || ridePhase === 'driver_en_route' || ridePhase === 'driver_arrived' || ridePhase === 'in_trip');
  // The boarding OTP only once a driver has accepted, and until the ride starts.
  const rideShowOtp = !!rideDriver && (ridePhase === 'driver_assigned' || ridePhase === 'driver_en_route' || ridePhase === 'driver_arrived');
  const rideDriverPhone = rideDriver ? localMobile(rideDriver.phone) : '';
  const rideFirst = rideDriver?.name.split(' ')[0] || t('Your driver');
  const rideCab = ride ? tripCategoryName(categories, ride) : cab ? categoryName(cab) : '';
  // Bike, auto or cab: the finding screen speaks of what was actually chosen.
  const kind = rideKind(ride ? ride.categoryName : cab?.name, rideCab);
  const findingLine = t(forKind(
    ride?.status === 'Pending' || !ride ? 'Matching you with a cab nearby'
    : ridePhase === 'partner_confirmed' ? 'A cab is on the way to accept your ride'
    : 'Finding the nearest driver',
    kind,
  ));
  const driverLine =
    ridePhase === 'driver_assigned' ? t('{name} accepted your ride', { name: rideFirst })
    : ridePhase === 'driver_en_route' ? t('{name} is on the way', { name: rideFirst })
    : ridePhase === 'driver_arrived' ? t('{name} has arrived at your pickup', { name: rideFirst })
    : t('Your ride is on');
  // Done with this ride on the sheet: back to booking (the ride itself stays in My bookings).
  const endRide = () => {
    setCancelOpen(false);
    setParams({ mode: mode === 'hourly' ? 'hourly' : 'pickup' }, { replace: true });
    if (!pickup || (mode === 'pickup' && !drop)) enter('pickup');
    else setStage('when');
  };

  const rideSheet = rideId ? (
    <section key="ride" className="lr-sheet lr-sheet--ride" aria-label={t('Your ride')} aria-live="polite">
      <span className="lr-grip" aria-hidden="true" />
      {rideFinding ? (
        <div className="lr-ride lr-finding">
          <div className="lr-finding__head">
            {/* The chosen vehicle on a navy disc, with a radar pulse around it. */}
            <span className="lr-finding__beacon" aria-hidden="true">
              <RideKindIcon kind={kind} />
            </span>
            <span className="lr-finding__title">
              <strong>{t(forKind('Finding your cab', kind))}<span className="lr-dots" aria-hidden="true"><i>.</i><i>.</i><i>.</i></span></strong>
              <small>{findingLine}</small>
            </span>
          </div>
          <ol className="lr-finding__steps" aria-label={t('Ride request progress')}>
            <li className="is-done">{t('Requested')}</li>
            <li className={rideFound ? 'is-done' : 'is-now'} aria-current={rideFound ? undefined : 'step'}>{t(forKind(rideFound ? 'Cab found' : 'Finding cab', kind))}</li>
            <li className={rideFound ? 'is-now' : undefined} aria-current={rideFound ? 'step' : undefined}>{t('Driver assigned')}</li>
          </ol>
          <div className="lr-finding__route">
            <p className="lr-finding__stops">
              <span className="lr-finding__stop">
                <span className="lr-dot lr-dot--from" aria-hidden="true" />
                <span className="truncate">{rideFrom?.name ?? t('Pickup')}</span>
              </span>
              <span className="lr-finding__stop">
                {rideTo ? <span className="lr-dot lr-dot--to" aria-hidden="true" /> : <span className="lr-finding__hours" aria-hidden="true"><Icon name="clock" size={13} /></span>}
                <span className="truncate"><span className="sr-only">{rideTo ? `${t('to')} ` : ''}</span>{rideTo ? rideTo.name : t('Hourly rental')}</span>
              </span>
            </p>
            {rideCab ? <span className="lr-finding__cab"><small>{t(kind === 'cab' ? 'Cab' : 'Vehicle')}</small><b>{rideCab}</b></span> : null}
          </div>
          {rideCanCancel ? (
            <div className="lr-finding__foot">
              <span className={`lr-finding__fee${rideCancelFee > 0 ? ' is-fee' : ''}`}>
                <Icon name={rideCancelFee > 0 ? 'info' : 'shield-check'} size={14} />
                {rideCancelFee > 0 ? t('{amount} cancellation fee', { amount: formatINR(rideCancelFee) }) : t('Free cancellation')}
              </span>
              <button type="button" className="lr-finding__cancel" onClick={() => setCancelOpen(true)}>
                <Icon name="close" size={14} /> {t('Cancel ride')}
              </button>
            </div>
          ) : null}
        </div>
      ) : rideWithDriver && rideDriver ? (
        <div className="lr-ride">
          <p className={`lr-ride__ok ${ridePhase === 'driver_arrived' ? 'is-arrived' : ''}`}>
            <Icon name="check-circle" size={16} /> {driverLine}
          </p>
          <div className="lr-ride__driver">
            <Avatar name={rideDriver.name} photoUrl={rideDriver.photoUrl} size={46} />
            <span className="lr-ride__who">
              <strong>{rideDriver.name}</strong>
              <small>{rideDriver.rating != null ? `★ ${rideDriver.rating.toFixed(1)} · ` : ''}{rideDriver.vehicleModel || rideCab}</small>
            </span>
            {rideDriver.vehicleNumber ? <span className="plate">{rideDriver.vehicleNumber}</span> : null}
          </div>
          {rideShowOtp ? (
            <div className="lr-ride__otp">
              <span><strong>{t('Ride OTP')}</strong><small>{t(ridePhase === 'driver_arrived' ? 'Share it now to start your ride' : 'Share with your driver after you board')}</small></span>
              <span className="lr-ride__code num" aria-label={`Ride OTP ${rideOtp ? rideOtp.split('').join(' ') : 'not available yet'}`}>{rideOtp ?? '····'}</span>
            </div>
          ) : null}
          <div className="lr-ride__actions">
            {rideDriverPhone && ridePhase !== 'in_trip' ? (
              <a className="btn btn--primary btn--sm" href={`tel:+91${rideDriverPhone}`}><Icon name="phone" /> Call {rideFirst}</a>
            ) : null}
            <button type="button" className="btn btn--secondary btn--sm" onClick={() => navigate(`/ride/${rideId}`)}>{t('Ride details')}</button>
          </div>
          {rideCanCancel ? <button type="button" className="lr-ride__cancel" onClick={() => setCancelOpen(true)}>{t('Cancel ride')}</button> : null}
        </div>
      ) : rideClosed ? (
        <div className="lr-ride lr-ride--end">
          <strong>{t(rideGone ? 'This ride is no longer available' : ride?.status === 'Rejected' ? 'Ride not accepted' : 'Ride cancelled')}</strong>
          <small>{ride && ride.cancellationFee > 0 ? t('A cancellation fee of {amount} applies.', { amount: formatINR(ride.cancellationFee) }) : t('No charge for this ride.')}</small>
          <button type="button" className="lr-cta" onClick={endRide}>{t('Book a ride')}</button>
        </div>
      ) : ridePhase === 'completed' ? (
        <div className="lr-ride lr-ride--end">
          <strong>{t('You’ve arrived')}</strong>
          <small>{t('Thanks for riding with People Taxi.')}</small>
          <button type="button" className="lr-cta" onClick={() => navigate(`/ride/${rideId}`)}>{t('Rate your ride')}</button>
          <button type="button" className="lr-ride__cancel lr-ride__cancel--plain" onClick={endRide}>{t('Book another ride')}</button>
        </div>
      ) : null}
    </section>
  ) : null;

  // Ola / Uber style cab list: tap a cab, then Book. Fares are the server's; a cab it cannot price says why.
  const cabList = (
    <section className="lr-cabs" aria-label={t('Choose your ride')}>
      {needsHours ? (
        <p className="lr-cabs__note">{t('Select the rental duration to see cabs and fares.')}</p>
      ) : needsTime ? (
        <p className="lr-cabs__note">{t('Pick a pickup date and time to see cabs and fares.')}</p>
      ) : q.quoteError ? (
        <div className="lr-cabs__note lr-cabs__note--warn" role="alert">
          <span>{q.quoteError}</span>
          <button type="button" className="lr-link" onClick={q.retryQuote}>{t('Try again')}</button>
        </div>
      ) : categoryStatus === 'loading' && !cabs.length ? (
        <div className="lr-cabs__list" aria-busy="true">
          <span className="skeleton lr-cab-skel" />
          <span className="skeleton lr-cab-skel" />
          <span className="skeleton lr-cab-skel" />
        </div>
      ) : !cabs.length ? (
        <p className="lr-cabs__note">{t('No cabs are available here right now. Please try again shortly.')}</p>
      ) : (
        <div className="lr-cabs__list" role="radiogroup" aria-label={t('Cabs')}>
          {cabs.map((c) => {
            const fq = fareOf(c.id);
            const na = q.unavailable.get(c.id);
            const on = c.id === draft.categoryId && !!fq;
            const km = fq?.includedKm ? `${+fq.includedKm.toFixed(1)} km incl.` : '';
            const hrs = mode === 'hourly' && q.entries.get(c.id)?.rentalHours ? `${q.entries.get(c.id)!.rentalHours} hr` : '';
            const pick = () => { update({ categoryId: c.id }); setError(''); };
            return (
              <div key={c.id} className={`lr-cab ${on ? 'is-on' : ''} ${fq ? '' : 'is-off'}`}>
                {/* The cab photo opens its fare breakdown (and picks the cab); the rest of the row just picks it. */}
                <button
                  type="button"
                  className="lr-cab__photo"
                  disabled={!fq}
                  onClick={() => { pick(); setFareFor(c.id); }}
                  aria-label={`Fare breakdown for ${categoryName(c)}`}
                  title="Fare breakdown"
                >
                  <img src={categoryPhoto(c)} alt="" loading="lazy" decoding="async" />
                  {fq ? <span className="lr-cab__info" aria-hidden="true"><Icon name="info" size={11} /></span> : null}
                </button>
                <button type="button" role="radio" aria-checked={on} disabled={!fq} className="lr-cab__pick" onClick={pick}>
                  <span className="lr-cab__text">
                    <strong>{categoryName(c)}</strong>
                    <small>{[`${c.seats} ${c.seats === 1 ? 'seat' : 'seats'}`,isLocalOnlyCategory(c) ? '' : 'AC', hrs, km].filter(Boolean).join(' · ')}</small>
                  </span>
                  <span className="lr-cab__price">
                    {fq ? (
                      <b>{formatINR(fq.fare.total)}</b>
                    ) : na ? (
                      <small className="lr-cab__na">{na}</small>
                    ) : (
                      <span className="skeleton lr-cab__skel" aria-label={t('Loading fare')} />
                    )}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );

  const locateButton = (
    <button type="button" className={`lr-locate ${locating ? 'is-busy' : ''} ${position ? 'is-on' : ''}`} aria-label={t('Detect my current location')} title={t('Detect my current location')} onClick={() => void useMyLocation()} disabled={locating}>
      <Icon name="navigation" size={nearby ? 17 : 20} />
    </button>
  );

  // The plan sheet's collapse handle belongs at the top of the card: in the status row when that is joined on, else in the sheet.
  const gripButton = (
    <button type="button" className="lr-gripbtn" aria-label={t(peek ? 'Show the trip details' : 'Show more of the map')} aria-expanded={!peek} onClick={() => setPeek((p) => !p)} />
  );
  const gripInBar = !!nearby && !rideSheet && stage === 'when';

  return (
    <div className="lr" style={style} role="dialog" aria-label={t('Local Rentals')}>
      <PinMap picking={picking} target={target} pins={pins} sheetH={sheetH} onPick={onPick} me={position ? { lat: position.lat, lng: position.lng } : null} road={road} pulse={pulse} cabs={nearbyCabs} />

      <header className="lr-top">
        <div className="lr-top__row">
          <button type="button" className="lr-round" aria-label={t('Back')} onClick={back}><Icon name="arrow-left" size={22} /></button>
          <nav className="lr-svc" aria-label={t('Services')}>
            {SERVICES.filter((x) => x.id !== 'local' && x.id !== 'pickup').map((x) => {
              const here = x.id === 'rental';
              return (
                <button key={x.id} type="button" className={here ? 'is-active' : ''} aria-current={here ? 'page' : undefined} onClick={() => { if (!here) navigate(serviceHref(x.id)); }}>
                  <Icon name={x.icon} size={20} />
                  <span>{t(here ? 'Local Rentals' : x.label)}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {picking ? (
        <>
          <div className="lr-find">
            <button type="button" className="lr-search" onClick={() => setPicker(stage === 'drop' ? 'drop' : 'pickup')}>
              <Icon name="search" size={18} />
              <span className={place ? '' : 'is-empty'}>{place ? place.name : t(stage === 'drop' ? 'Search a drop location' : 'Search a place or city')}</span>
            </button>
            {stage === 'pickup' ? (
              <div className="lr-cities" role="group" aria-label={t('Districts and cities')} ref={dragToScroll}>
                {cityChips.map((c) => (
                  <button key={c.id} type="button" className={`lr-chip ${place?.id === c.id ? 'is-on' : ''}`} onClick={() => chooseCity(c)}>{c.name}</button>
                ))}
              </div>
            ) : null}
          </div>
          <div className={`lr-pin lr-pin--${stage === 'drop' ? 'drop' : 'pickup'}`} aria-hidden="true">
            <span className="lr-pin__head"><i /></span>
            <span className="lr-pin__stem" />
            <span className="lr-pin__shadow" />
          </div>
        </>
      ) : null}

      {nearby ? null : <div className="lr-mapbar">{locateButton}</div>}

      <div className="lr-dock" ref={dock}>
        {/* Part of the dock, not floating on the map: it joins the top of the sheet, and the map (with its logo) ends above it. */}
        {nearby ? (
          <div className="lr-mapbar has-near">
            {gripInBar ? gripButton : null}
            <div className={`lr-near ${nearby.count ? 'is-live' : 'is-none'}`} role="status">
              {/* Fixed artwork from cabDots, the same little car that is on the map. */}
              <span className="lr-near__radar" aria-hidden="true"><span className="lr-near__art" dangerouslySetInnerHTML={nearbyArt} /></span>
              <span className="lr-near__text">
                <small className="lr-near__eyebrow"><i /><span>{nearby.count === 0 ? t('Searching nearby') : nearestKm ? t('Live · {km} km away', { km: nearestKm }) : t('Live')}</span></small>
                <b>{nearby.count === 0 ? t('No drivers nearby right now') : nearby.count === 1 ? t('1 driver nearby') : t('{n} drivers nearby', { n: nearby.count })}</b>
              </span>
            </div>
            {locateButton}
          </div>
        ) : null}
        {rideSheet ?? (stage !== 'when' ? (
          <section key={stage} className="lr-sheet" aria-label={t(stage === 'drop' ? 'Set drop location' : 'Set pickup location')}>
            {approx && !locating ? <p className="lr-hint" role="status">{t(approx)}</p> : null}
            {locating ? <p className="lr-hint" role="status">{t('Finding your current location…')}</p> : askLocation ? (
              <div className={`lr-perm ${locationError || permission === 'denied' || permission === 'blocked' ? 'is-warn' : ''}`} role={locationError ? 'alert' : 'status'}>
                <p>{t(locationNote)}</p>
                {secure ? <button type="button" onClick={() => void useMyLocation()}>{t(permission === 'prompt' && !locationError ? 'Allow location' : 'Try again')}</button> : null}
              </div>
            ) : null}
            <div className="lr-row">
            <div className={`lr-addr ${resolving ? 'is-busy' : ''}`}>
              <span className={`lr-dot lr-dot--${stage === 'drop' ? 'to' : 'from'}`} aria-hidden="true" />
              <div>
                {resolving ? (
                  <strong className="is-empty">{t('Finding this place…')}</strong>
                ) : place ? (
                  <>
                    <strong>{place.name}</strong>
                    {addrLine ? <small>{addrLine}</small> : null}
                  </>
                ) : (
                  <strong className="is-empty">{t('Move the map to place the pin')}</strong>
                )}
              </div>
            </div>
            <button type="button" className="lr-cta" disabled={!place || resolving} onClick={confirmStage}>
              {t(resolving ? 'Finding address…' : stage === 'drop' ? 'Confirm drop' : 'Confirm pickup')}
            </button>
            </div>
            {farApart ? <p className="lr-hint" role="status">This drop is outside the city ({Math.round(haversineKm(pickup!, cand!))} km away).</p> : null}
            {stage === 'drop' ? <button type="button" className="lr-link" onClick={() => enter('pickup')}>{t('Change pickup')}</button> : null}
          </section>
        ) : (
          <section key="when" className={`lr-sheet lr-sheet--tall ${peek ? 'is-peek' : ''}`} aria-label={t('Plan your trip')}>
            {gripInBar ? null : gripButton}

            <div className="lr-body">
            <div className="lr-trip">
              <button type="button" onClick={() => enter('pickup')}>
                <span className="lr-dot lr-dot--from" aria-hidden="true" />
                <span><small className="sr-only">{t('Pickup')}</small><strong>{pickup?.name ?? t('Choose pickup')}</strong></span>
                <em>{t('Edit')}</em>
              </button>
              {mode === 'pickup' ? (
                <button type="button" onClick={() => enter('drop')}>
                  <span className="lr-dot lr-dot--to" aria-hidden="true" />
                  <span><small className="sr-only">{t('Drop')}</small><strong>{drop?.name ?? t('Choose drop')}</strong></span>
                  <em>{t('Edit')}</em>
                </button>
              ) : null}
            </div>

            {mode === 'hourly' ? (
              <div className="lr-hourly-plan">
                <div className="lr-dur">
                  <div className="lr-dur__head">
                    <span className="lr-dur__label" id="lr-dur-label">{t('Rental duration')}</span>
                    <span className={`lr-dur__pick${hours ? '' : ' is-empty'}`}>
                      {hours ? (hours === 1 ? t('1 hour') : t('{n} hours', { n: hours })) : t('Choose hours')}
                    </span>
                  </div>
                  <div
                    className="lr-dur__strip"
                    ref={hourStripRef}
                    role="radiogroup"
                    aria-labelledby="lr-dur-label"
                    onKeyDown={(e) => {
                      // Arrow keys, Home and End move between the hours (one tab stop for the whole strip).
                      const list = RENTAL_PACKAGE_HOURS;
                      const at = hours == null ? -1 : list.indexOf(hours);
                      const next =
                        e.key === 'ArrowRight' || e.key === 'ArrowDown' ? list[Math.min(at + 1, list.length - 1)]
                        : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? list[Math.max(at - 1, 0)]
                        : e.key === 'Home' ? list[0]
                        : e.key === 'End' ? list[list.length - 1]
                        : undefined;
                      if (next == null) return;
                      e.preventDefault();
                      setHours(next);
                      setError('');
                      hourStripRef.current?.querySelector<HTMLElement>(`[data-hours="${next}"]`)?.focus();
                    }}
                  >
                    {RENTAL_PACKAGE_HOURS.map((h, i) => {
                      const on = hours === h;
                      return (
                        <button
                          key={h}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          aria-label={h === 1 ? t('1 hour') : t('{n} hours', { n: h })}
                          tabIndex={on || (hours == null && i === 0) ? 0 : -1}
                          data-hours={h}
                          className={`lr-dur__opt${on ? ' is-on' : ''}`}
                          onClick={() => { setHours(h); setError(''); }}
                        >
                          <strong>{h}</strong>
                          <small>{t(h === 1 ? 'hr' : 'hrs')}</small>
                        </button>
                      );
                    })}
                  </div>
                </div>
                {whenBlock}
              </div>
            ) : (
              <div className="lr-plan">
                {whenBlock}
              </div>
            )}

            {cabList}
            </div>
            <div className="lr-foot">
              {error ? <p className="lr-warn" role="alert">{t(error)}</p> : null}
              {!online ? <p className="lr-warn" role="alert">{t('You’re offline. Reconnect to book.')}</p> : null}
              <button type="button" className="lr-cta" onClick={() => void book()} disabled={booking} aria-busy={booking || undefined}>
                {t(booking ? 'Booking…' : when === 'now' ? 'Book ride' : 'Schedule ride')}
              </button>
            </div>
          </section>
        ))}
      </div>

      {cancelOpen && ride ? <CancelDialog trip={ride} onClose={() => setCancelOpen(false)} /> : null}
      {fareFor && fareOf(fareFor) ? (
        <FareDialog
          title={`${categoryName(cabs.find((c) => c.id === fareFor) ?? { name: 'Cab' })} · ${t('Fare breakdown')}`}
          fare={fareOf(fareFor)!.breakup ?? breakupFromFare(fareOf(fareFor)!.fare)}
          onClose={() => setFareFor(null)}
        />
      ) : null}

      {outstationAsk && pickup ? (
        <OutstationDialog
          from={pickup.name}
          to={outstationAsk.name}
          km={Math.round(haversineKm(pickup, outstationAsk))}
          onStay={() => setOutstationAsk(null)}
          onSwitch={goOutstation}
        />
      ) : null}

      {pickerFor}
      {dateOpen ? <DatePicker title={t('Pickup Date')} value={date} min={firstDay} max={lastDay} onClose={() => setDateOpen(false)} onSelect={(iso) => { pickDate(iso); setDateOpen(false); }} /> : null}
      {timeOpen ? (
        <TimePicker title={t('Pickup time')} date={date} value={time} validate="pickup" onClose={() => setTimeOpen(false)} onConfirm={(t) => { scheduleTouched.current = true; setTime(t); setError(''); setTimeOpen(false); }} />
      ) : null}
    </div>
  );
}
export default LocalRentalsPage;
