import { useState, useEffect, useCallback } from 'react';
import {
  fetchCurrentPosition,
  getForegroundPermissionStatus,
  requestForegroundPermissionStatus,
  UserLocation,
} from '@/lib/gpsLocation';
import { useManualLocation } from '@/store/manualLocation';

export type { UserLocation };

// Module-level cache so subsequent mounts get a result instantly.
let cachedGps: UserLocation | null = null;
let gpsSettled = false;

export function useLocation() {
  const [gpsLocation, setGpsLocation] = useState<UserLocation | null>(cachedGps);
  const [gpsLoading, setGpsLoading] = useState(false);
  const manualLoc = useManualLocation(s => s.location);
  const forced = useManualLocation(s => s.forced);

  useEffect(() => {
    // If we already have a cached result, nothing to do.
    if (gpsSettled) return;
    let cancelled = false;
    (async () => {
      // Check existing permission WITHOUT prompting the user.
      const status = await getForegroundPermissionStatus();
      if (cancelled || status !== 'granted') return;
      // Permission was previously granted — silently refresh position.
      setGpsLoading(true);
      const result = await fetchCurrentPosition();
      if (!cancelled) {
        if (result) {
          cachedGps = result;
          setGpsLocation(result);
        }
        gpsSettled = true;
        setGpsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Called when the user explicitly taps "Use my GPS location".
  const requestGps = useCallback(async () => {
    if (cachedGps) {
      setGpsLocation(cachedGps);
      return;
    }
    setGpsLoading(true);
    const status = await requestForegroundPermissionStatus();
    if (status !== 'granted') {
      gpsSettled = true;
      setGpsLoading(false);
      return;
    }
    const result = await fetchCurrentPosition();
    cachedGps = result;
    gpsSettled = true;
    if (result) setGpsLocation(result);
    setGpsLoading(false);
  }, []);

  const location = forced ? manualLoc : (gpsLocation ?? manualLoc ?? null);
  const loading = gpsLoading;
  const usingGps = !forced && !!gpsLocation;

  return {
    location,
    loading,
    isManual: forced || (!gpsLocation && !!manualLoc),
    locationName: manualLoc?.name,
    /** GPS accuracy radius in meters — only meaningful while `location` is the live GPS fix. */
    accuracy: usingGps ? gpsLocation?.accuracy : undefined,
    requestGps,
  };
}
