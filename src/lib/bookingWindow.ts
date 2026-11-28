// The booking server's window, read live from settings/operations (signed-in riders may read it):
// - the minimum notice before pickup (admin → "Minimum notice before pickup"). "Ride now" follows it: at 0 it books the
//   current time; until the setting can be read it keeps the server's default (30 minutes);
// - how many days ahead a pickup can be booked (admin → "Advance booking limit"). The calendars and checks follow it;
//   until it can be read (or for a rider not signed in) it keeps the server's default (30 days).
import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/platform/firebase';
import { SCHEDULE_MAX_DAYS, SCHEDULE_MIN_LEAD_MIN } from '@core/config/constants';
import { setMaxAdvanceDays } from '@core/utils/bookingRules';
import { leadMinutesFrom, maxAdvanceDaysFrom } from './schedule';

export function useServerLeadMinutes(signedIn: boolean): number {
  const [lead, setLead] = useState(SCHEDULE_MIN_LEAD_MIN);
  useEffect(() => {
    if (!signedIn) {
      setLead(SCHEDULE_MIN_LEAD_MIN);
      setMaxAdvanceDays(SCHEDULE_MAX_DAYS);
      return undefined;
    }
    return onSnapshot(
      doc(db, 'settings', 'operations'),
      (snap) => {
        const data = snap.exists() ? snap.data() : null;
        setMaxAdvanceDays(maxAdvanceDaysFrom(data));
        setLead(leadMinutesFrom(data));
      },
      () => {
        setMaxAdvanceDays(SCHEDULE_MAX_DAYS);
        setLead(SCHEDULE_MIN_LEAD_MIN);
      },
    );
  }, [signedIn]);
  return lead;
}
