// Forward geocoding (place name → coordinates) for the map search boxes.
//
// Uses OpenStreetMap's Nominatim rather than the device geocoder: on Android
// this app deliberately avoids Google Play Services (see gpsLocation.android.ts),
// and AOSP's Geocoder.getFromLocationName returns nothing on de-Googled devices —
// exactly our F-Droid audience. Nominatim is keyless and works identically on
// every platform. The app already fetches OSM tiles + the iNaturalist API at
// runtime (hence its TetheredNet flag), so this adds no new class of dependency.
export interface PlaceResult {
  name: string;
  lat: number;
  lng: number;
}

const ENDPOINT = 'https://nominatim.openstreetmap.org/search';

export async function searchPlaces(query: string, signal?: AbortSignal): Promise<PlaceResult[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const url = `${ENDPOINT}?format=jsonv2&limit=6&q=${encodeURIComponent(q)}`;
  try {
    const res = await fetch(url, {
      signal,
      headers: {
        // Nominatim's usage policy requires a descriptive User-Agent identifying
        // the app. Browsers forbid setting this header and drop it silently, so on
        // web Nominatim falls back to the Referer the browser sends automatically.
        'User-Agent': 'Marlin/1.0 (aquatic species life-list app; https://github.com/fwille/marlin)',
        Accept: 'application/json',
      },
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data
      .map((d: { display_name?: string; lat?: string; lon?: string }): PlaceResult => ({
        name: String(d.display_name ?? ''),
        lat: parseFloat(String(d.lat)),
        lng: parseFloat(String(d.lon)),
      }))
      .filter(p => p.name && Number.isFinite(p.lat) && Number.isFinite(p.lng));
  } catch {
    return [];
  }
}

// Nominatim's display_name is long ("Great Barrier Reef, Queensland, Australia").
// Keep the first couple of segments for a compact label / sighting location name.
export function shortPlaceName(name: string): string {
  return name
    .split(',')
    .slice(0, 2)
    .map(s => s.trim())
    .filter(Boolean)
    .join(', ');
}
