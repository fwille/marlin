@AGENTS.md

# Marlin — Project Guide for Claude

## What this app is

Marlin is an aquatic species identification and life-list app for divers and snorkelers (marine and freshwater). No in-app camera capture is planned (divers log sightings post-dive from gallery photos). Photo-ID is not under active consideration.

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
    SightingsMap.tsx(.web)      My Sightings map — pins colored by taxonomic group, with legend; tapping a pin shows a popup with "View sighting" and "View species" links. Includes a PlaceSearch that flies the map to a searched place
    DistributionMap.tsx(.web)   Species distribution — Leaflet + iNat observation tiles
    LocationPicker.tsx(.web)    Tap-to-place map for picking a sighting's location (inline + fullscreen); includes a PlaceSearch that drops the pin at a searched place
    PlaceSearch.tsx             Shared debounced place-name search box + results dropdown (pure RN, no .web variant) — used by SightingsMap and LocationPicker
    ZoomableImage.tsx           Pinch-to-zoom + swipe-through lightbox; accepts onSwipeLeft/onSwipeRight props — fires when scale === 1 and horizontal pan exceeds 50 px
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
    geocodeSearch.ts          Place name → coordinates (forward geocoding for the map search boxes) via OpenStreetMap Nominatim. No platform split — a keyless fetch that works everywhere, incl. de-Googled Android where the device Geocoder returns nothing
    leafletAssets.ts          Vendored Leaflet 1.9.4 (CSS+JS+marker icons as data URIs) inlined into map HTML — no runtime CDN fetch. LEAFLET_ICON_OVERRIDE deletes L.Icon.Default.prototype._getIconUrl before mergeOptions so the parent implementation returns options.iconUrl directly without prepending imagePath (which would corrupt data URIs)
  store/
    lifelist.ts               Zustand lifelist store (sightings, optimistic add)
    manualLocation.ts         Manual "as if I'm at…" location override, persisted via db settings
    theme.ts                  Theme preference (system/light/dark), persisted via db settings
  types/index.ts              Shared types: INatTaxon, Sighting, NearbySpecies, …
  global.d.ts                 `/// <reference types="expo/types" />` — provides CSS module types on CI
                              where expo-env.d.ts is gitignored

modules/
  native-location/            Local Expo module (Android-only) — GMS-free LocationManager/Geocoder backend, see Key patterns

android/                      Committed bare-workflow output of `expo prebuild` — lets F-Droid checkupdates
                              read versionCode/versionName from android/app/build.gradle without running
                              prebuild first. The recipe runs `expo prebuild --no-install` (without `--clean`)
                              so committed customisations survive: R8 settings + `expo.inlineModules.watchedDirectories`
                              in gradle.properties; `dependenciesInfo`/`lint` blocks + NDK subprojects block
                              in build.gradle files. Update by running `npx expo prebuild --platform android`
                              and committing.

metadata/
  com.marlinid.marlin.yml     F-Droid recipe — build instructions, scanignore/scandelete, NDK version
  en-US/
    changelogs/{apkVersionCode}.txt  Per-version release notes shown as "What's New" in F-Droid
                                  (plain text, ≤500 chars). Named after the **published APK**
                                  versionCode (the VercodeOperation-derived 111/112), NOT app.json's
                                  versionCode — see Release notes below. The release script
                                  auto-generates a draft via Claude CLI if missing and writes one
                                  copy per ABI.
    full_description.txt / short_description.txt / images/   Store listing copy and screenshots
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

Three other external APIs are layered on top, all optional and gated so the app degrades gracefully without them:
- **Wikipedia** (`getWikipediaSummary`) — calls `en.wikipedia.org/w/api.php` directly (not iNaturalist) for the species-detail summary blurb, using the title parsed out of the taxon's `wikipedia_url`.
- **IUCN Red List** (`getIucnStatus`) — calls `api.iucnredlist.org`, gated behind an optional `EXPO_PUBLIC_IUCN_TOKEN` in `.env.local` (`HAS_IUCN_TOKEN` flags whether it's configured); without it, conservation-status badges simply don't appear.
- **Nominatim** (`lib/geocodeSearch`) — calls `nominatim.openstreetmap.org` for the map place-name search (forward geocoding). Keyless; debounced client-side to respect the usage policy. Search just doesn't return results if it's unreachable — the maps still work.

## Releasing

```bash
./scripts/release.sh 1.2.0
```

The script:
1. Checks for `metadata/en-US/changelogs/{apkVersionCode}.txt` — one per ABI (see Release notes below). If missing, calls `npx @anthropic-ai/claude-code -p` with the git log since the last tag to generate a draft, then pauses for review, then copies it to every derived versionCode. Write the highest-numbered file yourself beforehand to skip generation.
2. Bumps `app.json` (version + versionCode) and `android/app/build.gradle` (so F-Droid `checkupdates` can read the version without running `expo prebuild`).
3. Commits the version bump, then captures the commit SHA and appends new build entries to `metadata/com.marlinid.marlin.yml` — one per `VercodeOperation` entry (currently two: armeabi-v7a and arm64-v8a), using the commit SHA (not the tag name) as `commit:`. Runs `fdroid rewritemeta` locally afterward so the committed recipe never drifts from canonical format.
4. Commits the recipe separately, tags, and pushes to GitHub.

Pushing the tag triggers the `fdroid-sync` GHA workflow, which re-canonicalises the recipe with `fdroid rewritemeta` and pushes it to the `fiwille/fdroiddata` GitLab fork automatically — **for a normal release this is the only sync that happens, and it's automatic; no manual fork push is needed.** The manual SSH-push process described under [F-Droid distribution](#f-droid-distribution) is only for recipe fixes made *between* tagged releases (exactly what this session spent a long time on, after the fork had silently fallen six weeks behind GitHub — see ADR-0004).

**Tagging and pushing does not put the release in front of users.** `fdroid-sync` only updates the pre-flight fork; going live on F-Droid itself happens separately, either automatically via F-Droid's own `checkupdates` bot (which watches this repo's GitHub tags directly and has handled past releases with zero human action) or via a manually merged MR from the fork into the official `fdroid/fdroiddata` repo. Don't assume a tag push means the release shipped.

After tagging, **check the fork's pipeline** (`gitlab.com/fiwille/fdroiddata/-/pipelines`, `com.marlinid.marlin` branch) before considering the release done. `fdroid rewritemeta`/`lint` passing is not sufficient — confirm the `fdroid build` and `check apk` jobs also succeeded; those are what actually compile and validate the APKs. To check quickly with a GitLab read-only API token: `curl --header "PRIVATE-TOKEN: <token>" "https://gitlab.com/api/v4/projects/fiwille%2Ffdroiddata/pipelines?ref=com.marlinid.marlin&per_page=1"`. To confirm what's actually live (independent of the fork entirely), check `https://f-droid.org/api/v1/packages/com.marlinid.marlin` or `https://gitlab.com/fdroid/fdroiddata/-/raw/master/metadata/com.marlinid.marlin.yml` directly.

If the fork pipeline fails, **don't hand-patch the recipe file directly** — fix `scripts/release.sh` if the bug is in how it generates entries (most past bugs were here: see ADR-0004), or use `ruamel.yaml.YAML(typ='rt')` for any manual recipe edit (never plain PyYAML — it corrupts `gradle: [yes]`, see [F-Droid distribution](#f-droid-distribution)). After any manual fix, push to *both* GitHub (source of truth) and the fork (SSH), or the next tag's sync will silently overwrite one with the other.

Node.js is installed via `apt-get install -y -t forky nodejs npm` in the recipe's `sudo:` block (Debian `forky`), not a pinned tarball URL/hash — there's nothing to manually bump for a Node update unless the target Debian suite itself changes.

### Release notes ("What's New")

**Changelog files must be named after the published APK versionCode, not `app.json`'s.** `VercodeOperation` derives one APK versionCode per ABI from the `app.json` value (`10` → `101` armeabi-v7a, `102` arm64-v8a), and fdroidserver's `update.py` resolves release notes two ways, both keyed on the *derived* code:

- `<CurrentVersionCode>.txt` → app-level `whatsNew`, which `index.py` attaches only to the version matching the **last** `Builds` entry.
- `<Build versionCode>.txt` → per-build `whatsNew`, attached to that exact version.

So each release needs a file per derived code (`111.txt` **and** `112.txt`), which `scripts/release.sh` now writes automatically; `scripts/vercodes.py` holds the shared `VercodeOperation` arithmetic. A file named after `app.json`'s versionCode matches neither rule and is silently ignored — which is why no release from 1.1.3 (when the ABI split introduced `VercodeOperation`) through 1.2.2 showed any release notes in the F-Droid client, despite the files existing.

Notes are read from the source checkout at that build's commit, so the file must be committed **at the tagged release commit** — the release script includes it in the version-bump commit it tags. There is no way to retroactively add notes to an already-published version; a fix only takes effect from the next release. Files `1.txt`–`5.txt` predate the ABI split (when versionCode *was* the `app.json` value) and are correct as-is.

## F-Droid distribution

The app is distributed on F-Droid under package ID `com.marlinid.marlin`. The recipe lives in `metadata/com.marlinid.marlin.yml` (mirrored into the `fdroiddata` fork at `gitlab.com/fiwille/fdroiddata`). See ADR-0004 for why the recipe deliberately matches the exact template already proven live on F-Droid, rather than a separately-evolved "improved" version.

**The personal fork does not feed the official F-Droid repo.** `gitlab.com/fdroid/fdroiddata` (the real, canonical repo) has its own `checkupdates` bot that watches this repo's GitHub tags directly (`AutoUpdateMode: Version` + `UpdateCheckMode: Tags v(.+)`) and auto-generates new Build entries on the *official* repo by templating from whatever's already merged there — entirely independent of the fork. This is fully automated with no merge request needed; it's how 1.2.0 went live with no human action. The fork exists purely as a pre-flight test sandbox — its pipeline going green tells you the recipe is buildable, not that it's live. Getting a release live still requires either the bot's own schedule to pick up the new tag, or manually opening and merging an MR from the fork into `fdroid/fdroiddata` for faster turnaround. Because the two repos are independent, they can — and did — silently diverge for weeks; always verify current live state via `https://f-droid.org/api/v1/packages/com.marlinid.marlin` or the official repo's raw recipe rather than assuming the fork reflects reality.

The `android/` directory is committed (bare workflow) so F-Droid's `checkupdates` step can read `android/app/build.gradle` for `versionCode`/`versionName` at the tag. F-Droid can't read from `app.json` (Expo-specific). The recipe runs `expo prebuild --no-install` (without `--clean`) so committed settings in `android/` are preserved during the build.

The recipe declares `AntiFeatures: [TetheredNet]` because the discovery features (Nearby, Search, Species detail) depend entirely on iNaturalist's API, which cannot easily be self-hosted.

Key recipe constraints:
- **Node.js**: installed from Debian `forky` in the `sudo:` block — F-Droid's build server ships an older Node.
- **`expo prebuild`**: run in `prebuild:` with `--no-install --platform android` (no `--clean`) so committed settings in `android/` are preserved.
- **`buildFromSource`**: committed in `package.json` under `expo.autolinking.android.buildFromSource: [".*"]` so all native modules compile from source. This lives in source rather than being injected via `sed`.
- **`expo.inlineModules.watchedDirectories=[]`**: committed to `android/gradle.properties` — without it, `ExpoAutolinkingPlugin` passes an empty argument to `--watched-directories-serialized` and `JSON.parse` throws.
- **`lint { checkReleaseBuilds false }`**: committed to `android/app/build.gradle` — prevents `:lintVitalRelease` from triggering `lintVitalAnalyzeRelease` on every submodule, which exhausts Metaspace on the build server.
- **ABI filter `arm64-v8a` + `armeabi-v7a`**: set via `gradleprops: [reactNativeArchitectures=armeabi-v7a]` per build entry. Do **not** use `ndk { abiFilters }` in `build.gradle` — RN's `NdkConfiguratorUtils.finalizeDsl` callback overwrites it. The gradle property is the only reliable hook.
- **R8 minification + resource shrinking**: `android.enableMinifyInReleaseBuilds=true` and `android.enableShrinkResourcesInReleaseBuilds=true` committed to `android/gradle.properties`. `expo.useLegacyPackaging=true` is also set there to compress native `.so` libs and reduce APK download size.
- **NDK version propagation**: `android/build.gradle` has a `subprojects { plugins.withId("com.android.library") { android { ndkVersion rootProject.ext.ndkVersion } } }` block. Without it, library modules with C++ code (e.g. `expo-sqlite`) pick up the server's default side-by-side NDK, which differs from `ndk.dir` and triggers CXX1104.
- **`scandelete: node_modules`**: removes all of `node_modules` before the binary scan; `scanignore` entries must therefore point to files that exist after the build (validated by F-Droid) but are acceptable prebuilts. **The binary scan runs before `scandelete`** — `scanignore` entries for paths inside `node_modules/` are required even when `scandelete: node_modules` is present.
- **`gradle: [yes]`**: F-Droid's documented "no product flavors" idiom — only works if the loaded value is the literal *string* `'yes'`. Never edit the recipe with plain PyYAML (`yaml.safe_load`/`safe_dump`): its YAML-1.1 resolver reads bare `yes` as a boolean, and round-tripping silently corrupts it into `true`/`'true'`, which F-Droid's build code reads as a bogus flavor name and tries to run a nonexistent `assemble*Release` task. `scripts/release.sh` uses `ruamel.yaml` (YAML 1.2, matching `fdroidserver` itself) for exactly this reason.
- **`$$VERCODE$$`**: a real `fdroidserver` template placeholder (see `common.py`), substituted per build entry from its own `versionCode` field at build time. Use it in `prebuild:` sed commands instead of a hardcoded version number — avoids ever needing to remember to update a copied value when cloning a Build entry for a new release.
- **`rewritemeta`**: F-Droid's CI reformats the YAML canonically — any committed form that differs will fail the pipeline. The `fdroid-sync` GHA runs `rewritemeta` automatically on each tag push, and `scripts/release.sh` also runs it locally before committing. Recipe fixes pushed **between** releases must still be manually pushed to fdroiddata via SSH: `git clone -b com.marlinid.marlin git@gitlab.com:fiwille/fdroiddata.git`, apply the change, commit, and push — skipping this is exactly how the GitLab fork fell six weeks behind GitHub, so that the next tag's sync dumped a huge, confusing accumulated diff onto it all at once (ADR-0004).

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
- **`fdroid-sync.yml`** — triggers on any `v*.*.*` tag push. Runs `fdroid rewritemeta` to canonicalize the recipe YAML, then clones `gitlab.com/fiwille/fdroiddata` via a `GITLAB_TOKEN` secret and pushes the updated recipe, which triggers the F-Droid build pipeline. No manual GitLab interaction needed after tagging.

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

Single-context layout — `CONTEXT.md` (domain glossary) + `docs/adr/` (architecture decisions) at the repo root. See `docs/agents/domain.md`.
