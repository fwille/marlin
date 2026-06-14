# ADR-0002: Custom native Android location module instead of expo-location

**Status:** Accepted

## Context

`expo-location`'s Android implementation has a hard `api`-level dependency on `com.google.android.gms:play-services-location` (Fused Location Provider). This is unavailable on de-Googled devices and is a hard blocker for F-Droid distribution. F-Droid requires the app to function without Google Mobile Services — this is a non-negotiable distribution requirement.

## Decision

Exclude `expo-location` from the Android build entirely (via `expo.autolinking.android.exclude`) and replace it with a local Expo module at `modules/native-location/` implemented in Kotlin using only AOSP APIs (`android.location.LocationManager`, `android.location.Geocoder`). iOS and web continue to use `expo-location` unchanged.

Platform-split wrappers (`lib/gpsLocation.android.ts`, `lib/reverseGeocode.android.ts`) expose an identical API to the iOS/web versions so all consuming code stays single-sourced.

## Consequences

- App works on any Android device regardless of Play Services (GrapheneOS, CalyxOS, LineageOS, standard Android).
- Expo Go can no longer run the Android build — `requireNativeModule('NativeLocation')` throws immediately. Development requires `npx expo run:android` or an EAS dev build.
- AOSP `LocationManager` is less power-efficient than Fused Location Provider for continuous tracking, but acceptable for this app's single-fix use case.
