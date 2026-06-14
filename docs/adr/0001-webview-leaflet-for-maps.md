# ADR-0001: Use WebView + Leaflet for all map views

**Status:** Accepted

## Context

The app needs map views for three features: species distribution (iNaturalist observation tiles), personal Sightings map, and a location picker. The conventional React Native choice is `react-native-maps`, which on Android uses the Google Maps SDK — a proprietary dependency that requires Google Play Services and an API key. This is a hard blocker for F-Droid distribution and de-Googled devices (GrapheneOS, CalyxOS, LineageOS).

## Decision

Use Leaflet 1.9.4 rendered inside a `react-native-webview` (native) or an imperative `<iframe>` (web), with OpenStreetMap tiles. Leaflet assets are vendored as inline data URIs — no CDN fetch at runtime. Communication between Leaflet and the RN layer uses `postMessage`.

## Consequences

- No API key, no Google Play Services dependency, fully F-Droid compatible.
- `react-native-webview` ships with Expo Go, so maps work without a dev build on iOS.
- Map interaction is more limited than a native SDK (no clustering, no native gestures on the map canvas).
- Web platform requires a separate iframe-based implementation (`*.web.tsx`) because `react-native-webview` changes `postMessage` origin in browsers.
