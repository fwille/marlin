@AGENTS.md

# Marlin — Project Guide for Claude

## What this app is

Marlin is a marine species identification and life-list app — like Merlin Bird ID but for fish and marine life. Android-first, iOS later. No camera/photo-ID feature yet.

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
| Photos | expo-image-picker |
| Location | expo-location |
| Node.js | **v22+** required — Metro breaks on v21 (`util.styleText` array support) |

## Source layout

```
src/
  api/inaturalist.ts          iNaturalist API client
  app/
    _layout.tsx               Root layout — QueryClientProvider, SafeAreaProvider, AppInit (loads DB)
    (tabs)/
      _layout.tsx             4 tabs: Nearby, Search, Life List, My Map
      index.tsx               Nearby species (location-based)
      search.tsx              Global species search
      lifelist.tsx            Personal life list with swipe-delete
      map.tsx                 Hidden tab (href:null) — re-exports SightingsMap
    species/[id].tsx          Species detail + Add Sighting modal
  components/
    SightingsMap.tsx          My Sightings map — native (WebView + Leaflet)
    SightingsMap.web.tsx      My Sightings map — web (iframe + Leaflet)
    DistributionMap.tsx       Species distribution — native (WebView + Leaflet + iNat tiles)
    DistributionMap.web.tsx   Species distribution — web (iframe + Leaflet + iNat tiles)
    LocationPicker.tsx        Tap-to-place map for sighting location — native (WebView + Leaflet)
    LocationPicker.web.tsx    Tap-to-place map for sighting location — web (iframe + Leaflet)
  db/
    index.ts                  SQLite singleton + CRUD helpers — native
    index.web.ts              No-op stubs for web (SharedArrayBuffer unavailable in browsers)
  store/lifelist.ts           Zustand lifelist store
  types/index.ts              Shared types: INatTaxon, Sighting, NearbySpecies, …
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
| `GET /taxa` | Search species by name |
| `GET /taxa/{id}?all_photos=true` | Species detail + photos |
| `GET /observations` | Recent observations for a taxon |

Marine taxa filter: `taxon_name` in `['Actinopterygii','Mammalia','Reptilia','Mollusca','Echinodermata']`

## Maps work in Expo Go

All maps use `react-native-webview` with Leaflet/OpenStreetMap — no Google Maps API key required. `react-native-webview` is included in Expo Go, so maps can be tested without a dev build.

Run with `npx expo start` and scan the QR code in Expo Go to test on a physical device.

## Running the project

```bash
nvm use 22          # ensure Node 22+
npx expo start      # web/Expo Go
npx expo run:android  # native Android (required for maps)
```

Use `npx expo start --clear` to bust the Metro cache after adding `.web.ts` stubs or changing platform-specific files.
