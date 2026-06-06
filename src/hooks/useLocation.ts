import { useState, useEffect, useCallback } from 'react';
import * as Location from 'expo-location';
import { useManualLocation } from '@/store/manualLocation';

export interface UserLocation {
  lat: number;
  lng: number;
}

// Module-level cache so subsequent mounts get a result instantly.
let cachedGps: UserLocation | null = null;
let gpsSettled = false;

async function fetchGps(): Promise<UserLocation | null> {
  try {
    const loc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return { lat: loc.coords.latitude, lng: loc.coords.longitude };
  } catch {
    return null;
  }
}

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
      const { status } = await Location.getForegroundPermissionsAsync();
      if (cancelled || status !== 'granted') return;
      // Permission was previously granted — silently refresh position.
      setGpsLoading(true);
      const result = await fetchGps();
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
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      gpsSettled = true;
      setGpsLoading(false);
      return;
    }
    const result = await fetchGps();
    cachedGps = result;
    gpsSettled = true;
    if (result) setGpsLocation(result);
    setGpsLoading(false);
  }, []);

  const location = forced ? manualLoc : (gpsLocation ?? manualLoc ?? null);
  const loading = gpsLoading;

  return {
    location,
    loading,
    isManual: forced || (!gpsLocation && !!manualLoc),
    locationName: manualLoc?.name,
    requestGps,
  };
}
