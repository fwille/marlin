import * as NativeLocation from '../../modules/native-location';

// expo-location's Android module hard-depends on the proprietary
// com.google.android.gms:play-services-location (Fused Location Provider) —
// a non-free dependency that's incompatible with F-Droid distribution and
// unavailable on de-Googled devices. modules/native-location is a small local
// Expo module that gets the same data from android.location.LocationManager /
// Geocoder, which ship on every Android device. Metro picks this file over
// gpsLocation.ts for Android builds; expo-location stays in use on iOS/web.
export interface UserLocation {
  lat: number;
  lng: number;
  /** Radius of 68% confidence, in meters. Absent if the provider didn't report one. */
  accuracy?: number;
}

export async function getForegroundPermissionStatus(): Promise<string> {
  const { status } = await NativeLocation.getForegroundPermissionsAsync();
  return status;
}

export async function requestForegroundPermissionStatus(): Promise<string> {
  const { status } = await NativeLocation.requestForegroundPermissionsAsync();
  return status;
}

export async function fetchCurrentPosition(): Promise<UserLocation | null> {
  try {
    const loc = await NativeLocation.getCurrentPositionAsync();
    return { lat: loc.coords.latitude, lng: loc.coords.longitude, accuracy: loc.coords.accuracy ?? undefined };
  } catch {
    return null;
  }
}
