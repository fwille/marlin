import NativeLocationModule from './src/NativeLocationModule';

export * from './src/NativeLocation.types';

export function getForegroundPermissionsAsync() {
  return NativeLocationModule.getForegroundPermissionsAsync();
}

export function requestForegroundPermissionsAsync() {
  return NativeLocationModule.requestForegroundPermissionsAsync();
}

export function getCurrentPositionAsync() {
  return NativeLocationModule.getCurrentPositionAsync();
}

export function reverseGeocodeAsync(coords: { latitude: number; longitude: number }) {
  return NativeLocationModule.reverseGeocodeAsync(coords);
}
