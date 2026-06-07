import * as Location from 'expo-location';

// expo-location is fine here: its iOS/web implementations wrap CoreLocation and
// the browser geolocation API respectively, neither of which pulls in Google
// Play Services. Android uses gpsLocation.android.ts instead — see that file
// for why.
export interface UserLocation {
  lat: number;
  lng: number;
}

export async function getForegroundPermissionStatus(): Promise<string> {
  const { status } = await Location.getForegroundPermissionsAsync();
  return status;
}

export async function requestForegroundPermissionStatus(): Promise<string> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status;
}

export async function fetchCurrentPosition(): Promise<UserLocation | null> {
  try {
    const loc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return { lat: loc.coords.latitude, lng: loc.coords.longitude };
  } catch {
    return null;
  }
}
