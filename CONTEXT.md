# Marlin — Domain Glossary

## Species
A marine organism identified to **species rank** (as defined by iNaturalist). The app does not support logging at genus, family, or higher ranks — users must identify to species, consistent with apps like Merlin Bird ID. Represented in code as `INatTaxon` (rank-filtered to `species`) and keyed by `speciesId` (the iNaturalist taxon ID).

## Sighting
A personal record that a user logged of encountering a specific Species. Contains the date, optional location (lat/lng + place name), optional notes, and optional user photos. The species identity is denormalised into the Sighting (scientific name, common name, iNaturalist photo URL) so records remain readable without a network connection.

## Life List
The collection of all Sightings belonging to a user, displayed as a flat chronological list of individual encounters. A unique-species count is shown as a summary badge. The name "Life List" refers to the lifetime scope, not to a species-deduplicated view — a user may have multiple Sightings of the same Species. Whether to move to a species-grouped model is an open question.

## Manual Location Override
A user-set "as if I'm at…" position that replaces GPS for the Nearby tab. Use cases: (1) planning a future dive trip by previewing species at the destination, (2) browsing a recently dived location after returning home when GPS shows the home position, (3) exploring unfamiliar locations to assess whether they are worth diving. Persisted across sessions via the settings store.

## Photo Identification
AI-based species identification from a photo (like iNaturalist's Seek) is not under active consideration. It may be revisited in the future. The current photo feature is gallery attachment only — evidence photos on a Sighting, not identification input.

## Usage Pattern
Sightings are logged **after** the dive or snorkel session, not in real time underwater. This is why there is no in-app camera capture — divers photograph with dedicated underwater cameras or GoPros and attach photos from the gallery later. The app is a post-dive logging tool, not an underwater companion.

## Life List Size
Expected to stay well under 150 Sightings per user — divers and snorkelers encounter species far less frequently than, say, birdwatchers. This bound justifies loading all Sightings into memory at startup (Zustand store) rather than paginating or querying on demand. Revisit if usage patterns prove otherwise.

## Export / Import
Sightings can be exported as a JSON file and re-imported, using the device's native share/document picker. The sole intended use case is manual backup and device migration — not inter-app sharing or cloud sync. The format is the `Sighting[]` array serialised as JSON.

## Aquatic Scope
The set of species the app covers: aquatic life that divers and snorkelers are interested in logging — marine, brackish, and freshwater. Includes fish, sharks & rays, cephalopods, cnidarians, echinoderms, decapods, cetaceans, sirenians, and sea turtles. Enforced via a hand-curated list of iNaturalist taxon IDs (`MARINE_TAXON_IDS` in code — a misnomer, since freshwater species are included). The list is intentionally incomplete and will need ongoing curation as gaps are discovered.

## Web Platform
A web build is possible (Expo static output, `.web.tsx` platform files) and was used for early development testing. No hosted web version is planned currently. Web SQLite is stubbed out (no `SharedArrayBuffer` in browsers without COOP/COEP headers), so the Life List does not persist between page loads on web.

## Distribution
F-Droid is the primary and currently sole distribution channel. Google Play was the original target but is no longer under active consideration — see ADR-0003. All platform constraints (GMS-free, no proprietary SDKs, buildFromSource) flow from this decision.

## GMS-Free
The app must function on Android without Google Mobile Services (Play Services). This is a hard F-Droid distribution requirement. Consequences: `expo-location` is excluded from the Android build (replaced by a custom `native-location` module using AOSP `LocationManager`/`Geocoder`), and maps use Leaflet/OSM rather than Google Maps — see ADR-0001 and ADR-0002.

## Maps
All map views (species distribution, Sightings map, Location picker) use Leaflet 1.9.4 via WebView with OpenStreetMap tiles. No API key or proprietary SDK is required. This is a hard constraint driven by F-Droid/GMS-free compatibility — see ADR-0001. The Sightings map and Location picker also offer place-name search (forward geocoding) via OpenStreetMap Nominatim — keyless, and reliable on de-Googled Android where the device geocoder is not, for the same GMS-free reason.

## Discovery
Finding Species to log, via Nearby (location-based) or Search (name-based). Discovery requires a network connection and is powered entirely by the iNaturalist API — there is no bundled species database. This is a pragmatic starting point, not a principled constraint; a local database could be added later. The dependency on iNaturalist is the reason for the F-Droid `TetheredNet` anti-feature declaration.

## Offline Readability
The Life List must be fully readable without a network connection. This is the explicit reason species identity is denormalised into each Sighting. Discovery features (Nearby, Search, Species detail) require connectivity and degrade gracefully without it.
