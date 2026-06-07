import * as Location from 'expo-location';

// See gpsLocation.ts / gpsLocation.android.ts: this default (iOS/web) path
// keeps using expo-location, whose reverse geocoding doesn't pull in Google
// Play Services on those platforms. Android uses reverseGeocode.android.ts.
export async function reverseGeocode(lat: number, lng: number): Promise<string | undefined> {
  try {
    const [r] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    if (!r) return undefined;
    return [r.district ?? r.subregion, r.city, r.country].filter(Boolean).join(', ') || undefined;
  } catch {
    return undefined;
  }
}
