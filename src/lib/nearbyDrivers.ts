// Drivers on local duty near the rider's pickup, for the Pickup & Drop and Hourly Rental map (Ola / Uber style cars on the
// map and "N drivers nearby"). Asked again every 20 s while the page is in front, and when the pickup moves about 400 m.
// The server sends only a rounded position and the kind of vehicle. A failure (offline, an older server) just shows nothing.
import { useEffect, useState } from 'react';
import { callFunction } from '@core/services/callables';

export type NearbyKind = 'bike' | 'auto' | 'cab';
export interface NearbyDot { lat: number; lng: number; kind: NearbyKind }
export interface NearbyDrivers { count: number; nearestKm: number | null; drivers: NearbyDot[] }
export type NearbyMode = 'rental' | 'pickup_drop';

const POLL_MS = 20000;
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * Set once the server answers that it has no such function (an API deployed before this feature): the page then stops
 * asking until it is reloaded, instead of logging a failed request every 20 s.
 */
let serverLacksIt = false;

export async function fetchNearbyDrivers(at: { lat: number; lng: number }, mode: NearbyMode): Promise<NearbyDrivers> {
  const r = await callFunction<{ lat: number; lng: number; mode: NearbyMode }, Partial<NearbyDrivers>>('nearbyLocalDrivers', { lat: at.lat, lng: at.lng, mode }, 15000);
  const drivers = (Array.isArray(r?.drivers) ? r.drivers : [])
    .filter((d): d is NearbyDot => !!d && num(d.lat) !== null && num(d.lng) !== null)
    .map((d) => ({ lat: d.lat, lng: d.lng, kind: d.kind === 'bike' || d.kind === 'auto' ? d.kind : 'cab' }) as NearbyDot);
  return { count: Math.max(drivers.length, num(r?.count) ?? 0), nearestKm: num(r?.nearestKm), drivers };
}

/** `null` until the first answer, and while it is switched off. */
export function useNearbyDrivers(at: { lat: number; lng: number } | null, mode: NearbyMode, enabled: boolean): NearbyDrivers | null {
  // About 400 m steps, so dragging the pin a little does not ask again.
  const lat = at ? Math.round(at.lat * 250) / 250 : null;
  const lng = at ? Math.round(at.lng * 250) / 250 : null;
  const [got, setGot] = useState<{ mode: NearbyMode; data: NearbyDrivers } | null>(null);

  useEffect(() => {
    if (!enabled || lat === null || lng === null || serverLacksIt) return undefined;
    let live = true;
    const stop = () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onShow);
    };
    const ask = () => {
      if (serverLacksIt || (typeof document !== 'undefined' && document.hidden)) return;
      fetchNearbyDrivers({ lat, lng }, mode)
        .then((data) => live && setGot({ mode, data }))
        .catch((e: unknown) => {
          if ((e as { code?: string })?.code !== 'functions/not-found') return;
          serverLacksIt = true;
          stop();
        });
    };
    const onShow = () => { if (!document.hidden) ask(); };
    const timer = window.setInterval(ask, POLL_MS);
    document.addEventListener('visibilitychange', onShow);
    ask();
    return () => {
      live = false;
      stop();
    };
  }, [enabled, lat, lng, mode]);

  return enabled && got?.mode === mode ? got.data : null;
}
