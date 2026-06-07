import { NativeModule, requireNativeModule } from 'expo';

import {
  GeocodedAddress,
  LocationCoordinates,
  LocationResult,
  PermissionResponse,
} from './NativeLocation.types';

declare class NativeLocationModule extends NativeModule<{}> {
  getForegroundPermissionsAsync(): Promise<PermissionResponse>;
  requestForegroundPermissionsAsync(): Promise<PermissionResponse>;
  getCurrentPositionAsync(): Promise<LocationResult>;
  reverseGeocodeAsync(coords: LocationCoordinates): Promise<GeocodedAddress[]>;
}

export default requireNativeModule<NativeLocationModule>('NativeLocation');
