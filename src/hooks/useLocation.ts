import { useState, useEffect } from 'react';
import * as Location from 'expo-location';
import { useManualLocation } from '@/store/manualLocation';

export interface UserLocation {
  lat: number;
  lng: number;
}

export function useLocation() {
  const [gpsLocation, setGpsLocation] = useState<UserLocation | null>(null);
  const [gpsLoading, setGpsLoading] = useState(true);
  const manualLoc = useManualLocation(s => s.location);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (status !== 'granted') {
        setGpsLoading(false);
        return;
      }
      try {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (!cancelled) {
          setGpsLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude });
        }
      } catch {
        // fall through to manual location
      } finally {
        if (!cancelled) setGpsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const location = gpsLocation ?? manualLoc ?? null;
  // Only show loading spinner if GPS is still pending AND we have no location yet.
  const loading = gpsLoading && location === null;

  return {
    location,
    loading,
    // true when showing a manually-set location (GPS not available or not granted)
    isManual: !gpsLocation && !!manualLoc,
    locationName: manualLoc?.name,
  };
}
