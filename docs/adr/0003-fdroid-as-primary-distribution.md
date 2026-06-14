# ADR-0003: F-Droid as primary distribution channel

**Status:** Accepted

## Context

The app was initially developed with Google Play as the target distribution channel. F-Droid was added later and has since become the primary channel. Google Play is no longer under active consideration.

## Decision

F-Droid is the sole distribution target. The app will not be published on Google Play for the foreseeable future.

## Consequences

- All platform constraints become hard requirements rather than preferences: GMS-free (no Play Services dependency), no proprietary SDKs, all native code must build from source (`buildFromSource`), no API keys bundled in the binary.
- Maps use WebView + Leaflet/OSM (ADR-0001) and Android location uses a custom AOSP module (ADR-0002) — both are direct consequences of this decision.
- The F-Droid recipe (`metadata/com.marlinid.marlin.yml`) is the canonical release mechanism. Releases are tagged commits; the `fdroid-sync` GHA workflow pushes recipe updates to fdroiddata automatically.
- ABI splits via `VercodeOperation` are used to produce per-architecture APKs, avoiding a fat multi-ABI binary.
- If Google Play distribution is reconsidered in the future, a separate build variant or CI pipeline would be needed since the F-Droid build strips features (e.g. removes `signingConfig`) that Play requires.
