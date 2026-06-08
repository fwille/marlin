# Privacy Policy for Marlin

**Last updated:** June 2026

Marlin ("the app") is a marine species identification and life-list app developed by Fiona Wille ("the developer," "we," "us"). This policy explains what data the app accesses, how and why it is used, and the rights you have over it, including under the EU General Data Protection Regulation (GDPR).

## Summary

Marlin does not require an account, does not use analytics, advertising, or tracking of any kind, and does not collect or transmit your personal data to the developer. Everything you log, including sightings, notes, photos, and locations, stays on your device, under your control.

## Data controller

For the purposes of GDPR, the data controller is Fiona Wille, the developer of Marlin. Questions, requests, or complaints about how data is handled can be sent to marlinid.app@gmail.com.

## Location

Marlin requests access to your device's location (`ACCESS_FINE_LOCATION` / `ACCESS_COARSE_LOCATION`) to show you marine species commonly recorded near you, and to optionally tag the location of a sighting you log.

- Your coordinates are sent only to the iNaturalist API to retrieve nearby-species data. They are not sent to, or stored by, the developer.
- You can decline location access entirely and use the manual location override in Settings ("as if I'm at...") instead.
- Location data attached to a sighting is stored only in the app's local database, on your device.

**Legal basis:** your consent, given when you grant the location permission (GDPR Art. 6(1)(a)). You can withdraw this consent at any time by revoking the permission in your device's app settings; the app continues to work using the manual location override instead.

## Photos

You may attach photos to a sighting from your device's photo library. The permission Marlin requests is used solely to let you pick and attach images; the app does not access your photo library for any other purpose.

Photos you attach are resized and copied into the app's private storage, on your device. They are never uploaded to the developer or to any third party.

**Legal basis:** your consent, given when you choose to attach a photo and grant the photo-library permission (GDPR Art. 6(1)(a)).

## Your life list data

Sightings, notes, photos, and locations you log are stored in a local database on your device. This data:

- is never transmitted to the developer or to any third party,
- is excluded from Android Auto Backup (the app opts out of this OS feature, so your data is never copied to a Google account by it),
- can be manually exported to, or imported from, a file of your choosing, entirely under your control, and
- is kept only for as long as you keep it in the app; deleting a sighting, clearing the app's storage, or uninstalling the app removes it from your device immediately and permanently.

**Legal basis:** processing is necessary to provide the life-list feature you've asked the app for (GDPR Art. 6(1)(b)).

## Third-party services

To show you species information and maps, Marlin connects to the external services listed below. Connecting to any internet service exposes your device's IP address to that service, simply as a normal consequence of how the internet works; this is outside the developer's control and applies to every app that goes online.

| Service | Purpose | What it can see |
|---|---|---|
| iNaturalist API | Species data, photos, observations, nearby-species lookup | Approximate coordinates (only for "nearby species" lookups), species search terms, IP address |
| Wikipedia API | Species summary text on species detail pages | Species name, IP address |
| IUCN Red List API (optional feature) | Conservation status badge | Species name, IP address |
| OpenStreetMap tile servers | Map tiles shown on distribution and sighting maps | IP address |
| unpkg.com (a content delivery network) | Loads the Leaflet mapping library that draws the maps | IP address |

These are independent services with their own privacy policies, and the developer has no control over how they process requests sent to them. Most of them are operated from outside the European Economic Area, for example the United States and United Kingdom, so using these features can involve transferring your IP address there. No personal data beyond what's listed above, and what's inherent to any internet connection, is sent.

**Legal basis:** the necessity of these connections to provide the species-lookup and mapping features you've chosen to use (GDPR Art. 6(1)(b)), and, for the international transfers this involves, the necessity of the transfer to provide that feature at your request (GDPR Art. 49(1)(b)).

## Your rights

If you're in the European Economic Area, the UK, or anywhere else with similar protections, you have rights over your data, including to access it, correct it, have it erased, restrict or object to its processing, and receive a copy in a portable format.

Because Marlin keeps everything on your device and nowhere else, you can exercise nearly all of these rights directly and instantly, without contacting anyone:

- **Access and portability:** open Settings and use the export feature to get a complete copy of your data at any time
- **Correction:** edit any sighting's notes, location, or photos directly in the app
- **Erasure:** delete individual sightings in the app, or remove everything at once by clearing the app's storage or uninstalling it
- **Restriction and objection:** revoke the location or photo-library permission in your device's settings to stop the corresponding processing immediately

If you believe your data has been mishandled, you also have the right to lodge a complaint with your local data-protection supervisory authority. You're welcome to reach out to marlinid.app@gmail.com first with any questions or concerns; we'll do our best to help.

## What Marlin doesn't do

- It doesn't require an account or sign-up, and doesn't collect your name, email address, or any other personal identifier
- It doesn't include analytics, advertising, or crash-reporting SDKs
- It doesn't sell, rent, or share your data with advertisers or data brokers
- It doesn't perform automated decision-making or profiling
- It isn't directed at children, and doesn't knowingly collect data from them

## Changes to this policy

If this policy changes, the updated version will be posted at this same URL with a revised "Last updated" date.

## Contact

Questions about this policy, how the app handles data, or your rights described above can be sent to marlinid.app@gmail.com.
