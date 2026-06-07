import * as NativeLocation from '../../modules/native-location';

// See gpsLocation.android.ts for why Android sources location data from
// modules/native-location (android.location.Geocoder) rather than expo-location
// (which would otherwise pull com.google.android.gms:play-services-location
// into every Android build, including this reverse-geocoding path).
export async function reverseGeocode(lat: number, lng: number): Promise<string | undefined> {
  try {
    const [r] = await NativeLocation.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    if (!r) return undefined;
    return [r.district ?? r.subregion, r.city, r.country].filter(Boolean).join(', ') || undefined;
  } catch {
    return undefined;
  }
}
