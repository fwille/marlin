@AGENTS.md

# Marlin — Project Guide for Claude

## What this app is

Marlin is a marine species identification and life-list app for fish and marine life. No camera/photo-ID feature yet.

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Expo SDK 56 + React Native 0.85 + TypeScript |
| Routing | Expo Router (`src/app/` — file-based) |
| Remote data | iNaturalist API + TanStack Query v5 |
| Local data | expo-sqlite v15 (sync API) |
| State | Zustand v5 |
| Maps (native) | Leaflet 1.9.4 via `react-native-webview` + `postMessage` — no API key |
| Maps (web) | Leaflet 1.9.4 via `<iframe srcdoc>` + `postMessage` |
| Photos | expo-image-picker (gallery picker — no in-app camera capture) + expo-image-manipulator (resize, see `lib/photoStorage`) |
| Location | expo-location (iOS/web) — Android uses a local GMS-free module instead, see `modules/native-location` below |
| Node.js | **v22+** required — Metro breaks on v21 (`util.styleText` array support) |

## Source layout

```
src/
  api/inaturalist.ts          iNaturalist API client
  app/
    _layout.tsx               Root layout — ErrorBoundary, QueryClientProvider, SafeAreaProvider, AppInit (loads DB)
    (tabs)/
      _layout.tsx             Tabs: Nearby, Search, Life List, Settings — plus a hidden "My Map"
      index.tsx               Nearby species (location-based)
      search.tsx              Global species search + ancestor-scoped browsing (tap a classification chip)
      lifelist.tsx            Personal life list with swipe-delete
      settings.tsx            Theme, export/import, manual location override
      map.tsx / map.web.tsx   Hidden tab (href:null) — re-exports SightingsMap
    species/[id].tsx          Species detail + Add Sighting modal
    sighting/[id].tsx         Sighting detail — edit notes/location/photos, delete
  components/
    SightingsMap.tsx(.web)      My Sightings map — pins colored by taxonomic group, with legend
    DistributionMap.tsx(.web)   Species distribution — Leaflet + iNat observation tiles
    LocationPicker.tsx(.web)    Tap-to-place map for picking a sighting's location
    ZoomableImage.tsx           Pinch-to-zoom lightbox for sighting photos
    error-boundary.tsx              Top-level React error boundary (wraps root layout)
    themed-text.tsx, themed-view.tsx, hint-row.tsx,
    web-badge.tsx, animated-icon.tsx(.web)   Small shared UI primitives
  db/
    index.ts                  SQLite singleton + sighting CRUD + key/value settings — native
    index.web.ts              No-op stubs for web (SharedArrayBuffer unavailable in browsers)
  hooks/
    useLocation.ts            Resolves GPS or manual-override location (module-level cache)
    useNearby.ts              Nearby-species query (TanStack Query, wraps getNearbySpecies)
    useSearch.ts              Global species search query
    use-color-scheme.ts(.web) Color scheme, theme-aware
  lib/
    photoStorage.ts           Resize + relocate sighting photos into document storage (see Key patterns)
    gpsLocation.ts(.android)      Current-position + permission primitives — iOS/web wrap expo-location, Android wraps ../../modules/native-location
    reverseGeocode.ts(.android)   Coordinates → place name — same iOS/web vs. Android split
    leafletAssets.ts          Vendored Leaflet 1.9.4 (CSS+JS+marker icons as data URIs) inlined into map HTML — no runtime CDN fetch
  store/
    lifelist.ts               Zustand lifelist store (sightings, optimistic add)
    manualLocation.ts         Manual "as if I'm at…" location override, persisted via db settings
    theme.ts                  Theme preference (system/light/dark), persisted via db settings
  types/index.ts              Shared types: INatTaxon, Sighting, NearbySpecies, …
  global.d.ts                 `/// <reference types="expo/types" />` — provides CSS module types on CI
                              where expo-env.d.ts is gitignored

modules/
  native-location/            Local Expo module (Android-only) — GMS-free LocationManager/Geocoder backend, see Key patterns
```

## Key patterns

### Platform-specific files
Metro auto-resolves `.web.ts` / `.web.tsx` over `.ts` / `.tsx` for browser builds. Use this for anything that diverges between native and web (maps, SQLite, color scheme hook).

### Maps — native (WebView + Leaflet)
Native map components use `react-native-webview`. The Leaflet HTML is built as a string and passed via `source={{ html }}`. Communication:
- Leaflet → native: `window.ReactNativeWebView.postMessage(JSON.stringify({...}))` inside the HTML; received via the `onMessage` prop.
- Native → Leaflet: `webViewRef.current?.injectJavaScript('someGlobal(...); true;')` — must end with `true;` so the JS expression has a value.
- Build the HTML once on mount (or via `useMemo`) to avoid reloading the map on re-renders. For dynamic updates like filtering, use `injectJavaScript` rather than rebuilding the HTML.

### Maps — web (iframe + Leaflet)
Web map components (`*.web.tsx`) use a different pattern since `react-native-webview` uses `<iframe>` under the hood in browsers, which changes the `postMessage` origin. These use the imperative iframe pattern instead:
1. Attach a `ref` to a `<View>` to get the underlying DOM node.
2. Imperatively create `<iframe srcdoc={leafletHtml}>` and append it.
3. Leaflet inside the iframe sends `postMessage` events via `window.parent.postMessage(data, '*')`; the parent listens with `window.addEventListener('message', ...)`.
4. Clean up iframe and listener in the `useEffect` return.

Always use a `useRef` for callbacks passed into these effects to avoid stale closures.

### Android location is GMS-free (F-Droid compatibility)
`expo-location`'s Android implementation has a hard `api`-level dependency on the proprietary `com.google.android.gms:play-services-location` (Fused Location Provider) — unavailable on de-Googled devices and a hard blocker for F-Droid distribution. Android instead uses a local Expo module at `modules/native-location/` (Kotlin, built only on AOSP `android.location.LocationManager`/`Geocoder`, which ship on every Android device regardless of Play Services):
- `package.json` → `expo.autolinking.android.exclude: ["expo-location"]` removes `expo-location`'s Android native module from the build graph entirely — verify with `npx expo-modules-autolinking resolve --platform android --json`.
- `lib/gpsLocation.ts`/`.android.ts` and `lib/reverseGeocode.ts`/`.android.ts` are platform-split wrappers exposing an identical API. `useLocation` and `LocationPicker` import from these — never from `expo-location` or `modules/native-location` directly — so the hook/component code stays single-sourced across platforms (same convention as `.web.ts`).
- iOS and web are unaffected and still go through `expo-location` — its proprietary dependency only exists on Android.

**Expo Go can no longer run the Android build.** `requireNativeModule('NativeLocation')` throws `Cannot find native module 'NativeLocation'` the moment `useLocation` runs (e.g. opening the Nearby tab), because Expo Go's binary doesn't contain this custom module. Use `npx expo run:android` or an EAS development build instead — see Running the project.

### Zustand selector rule — CRITICAL
**Never return a new array or object from a Zustand selector** — it creates a new reference on every render and causes an infinite re-render loop.

```typescript
// WRONG — new array ref every call → infinite loop
const sightings = useLifelist(s => s.getSightingsForSpecies(taxonId));

// RIGHT — select stable array, derive with useMemo
const sightings = useLifelist(s => s.sightings);
const mySightings = useMemo(() => sightings.filter(s => s.speciesId === taxonId), [sightings, taxonId]);
```

Only selectors returning primitives (`hasSeen` → `boolean`) are safe to use directly.

### Sighting photos must go through `lib/photoStorage`
`expo-image-picker` saves into the cache directory, which the OS can clear at any time. `persistSightingPhoto` downscales each photo (long edge ≤1280px, JPEG q0.7) and moves it into the app's document storage so it stays around for the life of the sighting. Always pair it with `deleteSightingPhoto` wherever a photo can be removed or replaced — including discarded Add Sighting drafts — so files don't linger as orphans. No-op on web (picker returns blob/data URIs that aren't persisted anyway).

### SQLite on web
expo-sqlite's sync API requires `SharedArrayBuffer`, which browsers block without `COOP/COEP` headers. The `.web.ts` stubs return empty arrays / temp IDs so the web build compiles and runs. Data is not persisted between web page loads.

### Optimistic store update
`dbAddSighting` returns the full `Sighting` with the real DB-assigned `lastInsertRowId`. The store prepends it directly — no re-read of the whole DB:

```typescript
add: (sighting) => {
  const saved = dbAddSighting(sighting);
  set(state => ({ sightings: [saved, ...state.sightings] }));
},
```

## iNaturalist API

Base URL: `https://api.inaturalist.org/v1`

| Endpoint | Used for |
|---|---|
| `GET /observations/species_counts` | Nearby species (pre-deduplicated, with counts) |
| `GET /taxa` | Search species by name, optionally scoped to an ancestor taxon |
| `GET /taxa/{id}?all_photos=true` | Species detail + photos + ancestor chain |
| `GET /observations` | Recent observations for a taxon (map pins, distribution) |
| `GET /observations/histogram` | Monthly seasonality histogram for a taxon |

Marine taxa filter: a curated `MARINE_TAXON_IDS` list of `taxon_id`s (`src/api/inaturalist.ts`) — fish, sharks & rays, cephalopods, cnidarians, echinoderms, decapods, cetaceans, sirenians, sea turtles. iNaturalist ignores repeated `taxon_id[]` params, so each ID is fanned out as a parallel request and results are merged by taxon. Comments in the file explain why specific IDs were chosen over broader (but partly terrestrial) groupings like Crustacea or Mammalia.

Two other APIs are layered on top, both optional and gated so the app degrades gracefully without them:
- **Wikipedia** (`getWikipediaSummary`) — calls `en.wikipedia.org/w/api.php` directly (not iNaturalist) for the species-detail summary blurb, using the title parsed out of the taxon's `wikipedia_url`.
- **IUCN Red List** (`getIucnStatus`) — calls `api.iucnredlist.org`, gated behind an optional `EXPO_PUBLIC_IUCN_TOKEN` in `.env.local` (`HAS_IUCN_TOKEN` flags whether it's configured); without it, conservation-status badges simply don't appear.

## Maps render fine in Expo Go — but Android as a whole no longer runs there

Maps use `react-native-webview` with Leaflet/OpenStreetMap (no Google Maps API key, and `react-native-webview` ships with Expo Go), so the map *components themselves* need no dev build.

However, **Expo Go can't run the Android app at all anymore**: the custom `native-location` module (see Key patterns above) isn't present in Expo Go's binary, and `useLocation` — which the Nearby tab calls on mount — throws `Cannot find native module 'NativeLocation'` immediately. iOS/web are unaffected (they still use `expo-location`, which Expo Go bundles).

## Running the project

```bash
nvm use 22            # ensure Node 22+
npx expo start        # Metro — web or iOS in Expo Go
npx expo run:android  # native Android dev client — required (native-location + maps)
```

Use `npx expo start --clear` to bust the Metro cache after adding `.web.ts` stubs or changing platform-specific files.

## CI and tooling

### GitHub Actions
Two workflows in `.github/workflows/`:
- **`ci.yml`** — runs on every push/PR to `main`: `npm audit --audit-level=high` → `expo lint` → `tsc --noEmit` → `jest --coverage`. Coverage thresholds: 55% statements/branches/lines, 60% functions (measured over `src/api/`, `src/store/`, `src/types/`). Test files are excluded from `tsc` — they're type-checked by jest-expo's Babel transform during `npm test`.
- **`eas-build.yml`** — triggers on `v*` tags; builds a production Android APK via EAS. Requires an `EXPO_TOKEN` secret (GitHub → Settings → Secrets → Actions).

### Pre-commit hooks
`husky` + `lint-staged`: runs `eslint --fix` on staged `.ts`/`.tsx` files before each commit. Installed automatically via the `prepare` npm script on `npm install`. Skipped in CI automatically by husky.

### Dependabot
Weekly PRs for npm and GitHub Actions dependencies. `expo` and `react-native` major bumps are ignored — upgrade those manually following the [Expo upgrade guide](https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/).

### Tests
`jest-expo` preset, tests under `src/**/__tests__/`. Run with `npm test`. Mocking pattern: `jest.mock('@/db')` for database, `useLifelist.getState()` / `useLifelist.setState()` for Zustand stores. For module-level constants that read env vars at load time (e.g. `IUCN_TOKEN`), use `jest.resetModules()` + `require()` in `beforeAll` after setting the env var.

## Agent skills

### Issue tracker

Issues live in this repo's GitHub Issues (fwille/marlin); skills use the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default label vocabulary (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout — CONTEXT.md + docs/adr/ at the repo root (neither exists yet; created lazily by /grill-with-docs). See `docs/agents/domain.md`.
