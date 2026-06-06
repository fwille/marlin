import { INatTaxon, INatObservation, NearbySpecies, MonthlyHistogram } from '@/types';

const BASE = 'https://api.inaturalist.org/v1';

// iNaturalist only supports a single taxon_id per request — multiple values via
// taxon_id[] are silently ignored. We fan out into parallel requests and merge.
// Crustacea (85493) excluded: it contains terrestrial woodlice. Decapoda (47186)
// covers only crabs, lobsters, shrimp and is almost entirely aquatic/marine.
const MARINE_TAXON_IDS = [
  47178,  // Actinopterygii — ray-finned fish
  47273,  // Chondrichthyes — sharks, rays, chimaeras
  47549,  // Echinodermata — starfish, sea urchins, sea cucumbers
  47459,  // Cephalopoda — octopus, squid, nautilus, cuttlefish
  51508,  // Cnidaria — jellyfish, corals, anemones, hydroids
  47186,  // Decapoda — crabs, lobsters, shrimp (replaces broad Crustacea)
  152871, // Cetacea — whales, dolphins, porpoises (infraorder, NOT 152870 which is Artiodactyla)
  46306,  // Sirenia — manatees, dugongs
  372234, // Chelonioidea — sea turtles
];

async function apiFetch<T>(endpoint: string, params: URLSearchParams): Promise<T> {
  const res = await fetch(`${BASE}${endpoint}?${params}`);
  if (!res.ok) throw new Error(`iNaturalist ${res.status}: ${await res.text()}`);
  return res.json();
}

/**
 * Returns deduplicated species counts observed near a coordinate.
 * Fans out into one request per marine taxon group, merges by taxon ID,
 * and returns the top 50 by observation count.
 */
export async function getNearbySpecies(
  lat: number,
  lng: number,
  radiusKm = 50
): Promise<NearbySpecies[]> {
  const groups = await Promise.all(
    MARINE_TAXON_IDS.map(taxonId => {
      const params = new URLSearchParams({
        lat: lat.toString(),
        lng: lng.toString(),
        radius: radiusKm.toString(),
        taxon_id: taxonId.toString(),
        photos: 'true',
        per_page: '30',
      });
      return apiFetch<{ results: NearbySpecies[] }>('/observations/species_counts', params)
        .then(d => d.results)
        .catch(() => [] as NearbySpecies[]);
    })
  );

  const byId = new Map<number, NearbySpecies>();
  for (const group of groups) {
    for (const item of group) {
      const existing = byId.get(item.taxon.id);
      if (!existing || item.count > existing.count) {
        byId.set(item.taxon.id, item);
      }
    }
  }

  return [...byId.values()].sort((a, b) => b.count - a.count).slice(0, 50);
}

/**
 * Text search across marine taxa names and common names.
 * Fans out into one request per marine taxon group and deduplicates by taxon ID.
 */
export async function searchTaxa(query: string): Promise<INatTaxon[]> {
  const groups = await Promise.all(
    MARINE_TAXON_IDS.map(taxonId => {
      const params = new URLSearchParams({
        q: query,
        taxon_id: taxonId.toString(),
        photos: 'true',
        per_page: '10',
        rank: 'species',
      });
      return apiFetch<{ results: INatTaxon[] }>('/taxa', params)
        .then(d => d.results)
        .catch(() => [] as INatTaxon[]);
    })
  );

  const byId = new Map<number, INatTaxon>();
  for (const group of groups) {
    for (const item of group) {
      if (!byId.has(item.id)) byId.set(item.id, item);
    }
  }

  return [...byId.values()]
    .sort((a, b) => (b.observations_count ?? 0) - (a.observations_count ?? 0))
    .slice(0, 30);
}

/**
 * Full taxon details including ancestors (family, order, class) and extra photos.
 */
export async function getTaxon(id: number): Promise<INatTaxon> {
  const params = new URLSearchParams({ all_photos: 'true' });
  const data = await apiFetch<{ results: INatTaxon[] }>(`/taxa/${id}`, params);
  if (!data.results.length) throw new Error(`Taxon ${id} not found`);
  return data.results[0];
}

/**
 * Fetches the current plain-text summary directly from Wikipedia's REST API.
 * More up-to-date than the cached wikipedia_summary stored by iNaturalist.
 * Returns null on any error so callers can fall back gracefully.
 */
export async function getWikipediaSummary(wikipediaUrl: string): Promise<string | null> {
  try {
    const title = wikipediaUrl.split('/wiki/')[1];
    if (!title) return null;
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return (data.extract as string) ?? null;
  } catch {
    return null;
  }
}

/**
 * Monthly observation counts for a species (keys "1"–"12").
 * Pass lat/lng to get data filtered to the user's region.
 */
export async function getMonthlyHistogram(
  taxonId: number,
  lat?: number,
  lng?: number,
  radiusKm = 500
): Promise<MonthlyHistogram> {
  const params = new URLSearchParams({
    taxon_id: taxonId.toString(),
    date_field: 'observed_on',
    interval: 'month_of_year',
  });
  if (lat !== undefined && lng !== undefined) {
    params.set('lat', lat.toString());
    params.set('lng', lng.toString());
    params.set('radius', radiusKm.toString());
  }
  const data = await apiFetch<{ results: { month_of_year: MonthlyHistogram } }>(
    '/observations/histogram',
    params
  );
  return data.results.month_of_year ?? {};
}

/**
 * Most recent observations of a species, optionally near a coordinate.
 */
export async function getRecentObservations(
  taxonId: number,
  lat?: number,
  lng?: number,
  radiusKm = 100
): Promise<INatObservation[]> {
  const params = new URLSearchParams({
    taxon_id: taxonId.toString(),
    order_by: 'observed_on',
    per_page: '20',
    photos: 'true',
  });
  if (lat !== undefined && lng !== undefined) {
    params.set('lat', lat.toString());
    params.set('lng', lng.toString());
    params.set('radius', radiusKm.toString());
  }

  const data = await apiFetch<{ results: INatObservation[] }>('/observations', params);
  return data.results;
}
