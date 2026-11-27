// The booking server's minimum notice before pickup, read live from settings/operations (signed-in riders may read it).
// Staff change it in admin → Settings → Operations & Security → "Minimum notice before pickup". "Ride now" follows it:
// at 0 it books the current time; until the setting can be read it keeps the server's default (30 minutes).
import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/platform/firebase';
import { SCHEDULE_MIN_LEAD_MIN } from '@core/config/constants';
import { leadMinutesFrom } from './schedule';

export function useServerLeadMinutes(signedIn: boolean): number {
  const [lead, setLead] = useState(SCHEDULE_MIN_LEAD_MIN);
  useEffect(() => {
    if (!signedIn) {
      setLead(SCHEDULE_MIN_LEAD_MIN);
      return undefined;
    }
    return onSnapshot(
      doc(db, 'settings', 'operations'),
      (snap) => setLead(leadMinutesFrom(snap.exists() ? snap.data() : null)),
      () => setLead(SCHEDULE_MIN_LEAD_MIN),
    );
  }, [signedIn]);
  return lead;
}
