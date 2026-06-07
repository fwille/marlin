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
| Photos | expo-image-picker (capture) + expo-image-manipulator (resize, see `lib/photoStorage`) |
| Location | expo-location |
| Node.js | **v22+** required — Metro breaks on v21 (`util.styleText` array support) |

## Source layout

```
src/
  api/inaturalist.ts          iNaturalist API client
  app/
    _layout.tsx               Root layout — QueryClientProvider, SafeAreaProvider, AppInit (loads DB)
    (tabs)/
      _layout.tsx             Tabs: Nearby, Search, Life List, Settings — plus a hidden "My Map"
      index.tsx               Nearby species (location-based)
      search.tsx              Global species search + ancestor-scoped browsing (tap a classification chip)
      lifelist.tsx            Personal life list with swipe-delete
      settings.tsx            Theme, Auto Backup toggle, export/import, manual location override
      map.tsx / map.web.tsx   Hidden tab (href:null) — re-exports SightingsMap
    species/[id].tsx          Species detail + Add Sighting modal
    sighting/[id].tsx         Sighting detail — edit notes/location/photos, delete
  components/
    SightingsMap.tsx(.web)      My Sightings map — pins colored by taxonomic group, with legend
    DistributionMap.tsx(.web)   Species distribution — Leaflet + iNat observation tiles
    LocationPicker.tsx(.web)    Tap-to-place map for picking a sighting's location
    ZoomableImage.tsx           Pinch-to-zoom lightbox for sighting photos
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
  lib/photoStorage.ts         Resize + relocate sighting photos into document storage (see Key patterns)
  store/
    lifelist.ts               Zustand lifelist store (sightings, optimistic add)
    manualLocation.ts         Manual "as if I'm at…" location override, persisted via db settings
    theme.ts                  Theme preference (system/light/dark), persisted via db settings
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

### Sighting photos must go through `lib/photoStorage`
`expo-image-picker` saves into the cache directory — which Android Auto Backup excludes, and which the OS can clear at any time. `persistSightingPhoto` downscales each photo (long edge ≤1280px, JPEG q0.7) and moves it into the app's document storage so it (a) survives a backup/restore cycle and (b) doesn't blow Android's backup size quota. Always pair it with `deleteSightingPhoto` wherever a photo can be removed or replaced — including discarded Add Sighting drafts — so files don't linger as orphans. No-op on web (picker returns blob/data URIs that aren't persisted anyway).

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
