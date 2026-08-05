export type PermissionStatus = 'granted' | 'denied' | 'undetermined';

export interface PermissionResponse {
  status: PermissionStatus;
}

export interface LocationCoordinates {
  latitude: number;
  longitude: number;
}

export interface LocationResult {
  coords: LocationCoordinates;
}

export interface GeocodedAddress {
  city?: string;
  subregion?: string;
  district?: string;
  country?: string;
}
