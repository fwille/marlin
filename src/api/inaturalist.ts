import { INatTaxon, INatObservation, NearbySpecies, MonthlyHistogram, INatConservationStatus } from '@/types';

const BASE = 'https://api.inaturalist.org/v1';

// Free token from https://api.iucnredlist.org — register a new account (v3 tokens do not carry over).
// Set EXPO_PUBLIC_IUCN_TOKEN in .env.local (gitignored). Leave empty to skip IUCN lookups.
const IUCN_TOKEN = process.env.EXPO_PUBLIC_IUCN_TOKEN ?? '';
export const HAS_IUCN_TOKEN = !!IUCN_TOKEN;

const IUCN_STATUS_NAMES: Record<string, string> = {
  EX: 'Extinct', EW: 'Extinct in the Wild',
  CR: 'Critically Endangered', EN: 'Endangered',
  VU: 'Vulnerable', NT: 'Near Threatened',
  LC: 'Least Concern', DD: 'Data Deficient', NE: 'Not Evaluated',
};

// iNaturalist only supports a single taxon_id per request — multiple values via
// taxon_id[] are silently ignored. We fan out into parallel requests and merge.
// Crustacea (85493) excluded: it contains terrestrial woodlice. Decapoda (47186)
// covers only crabs, lobsters, shrimp and is almost entirely aquatic/marine.
const MARINE_TAXON_IDS = [
  47178,  // Actinopterygii — ray-finned fish
  47273,  // Chondrichthyes — sharks, rays, chimaeras
  47549,  // Echinodermata — starfish, sea urchins, sea cucumbers
  47459,  // Cephalopoda — octopus, squid, nautilus, cuttlefish
  47534,  // Cnidaria — jellyfish, corals, anemones, hydroids (was wrongly 51508=Ctenophora)
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
 * Search for species within a specific ancestor taxon (family / order / class).
 * When query is empty, returns the most-observed species in that group.
 */
export async function searchTaxaInAncestor(ancestorId: number, query?: string): Promise<INatTaxon[]> {
  const params = new URLSearchParams({
    taxon_id: ancestorId.toString(),
    photos: 'true',
    per_page: '30',
    rank: 'species',
  });
  if (query?.trim()) params.set('q', query.trim());
  const data = await apiFetch<{ results: INatTaxon[] }>('/taxa', params);
  return data.results;
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
 * Fetches the plain-text intro section via the stable MediaWiki API.
 * Uses `redirects=1` so reclassified taxa (e.g. Manta → Mobula) resolve automatically.
 * Throws on failure so TanStack Query retries rather than caching a null for 24 h.
 */
export async function getWikipediaSummary(wikipediaUrl: string): Promise<string> {
  const wikiPart = wikipediaUrl.split('/wiki/')[1];
  if (!wikiPart) throw new Error('No Wikipedia path in URL');
  // Strip hash fragments and query strings
  const title = wikiPart.split('#')[0].split('?')[0];
  if (!title) throw new Error('Empty Wikipedia title');
  const params = new URLSearchParams({
    action: 'query',
    prop: 'extracts',
    exintro: '1',
    explaintext: '1',
    redirects: '1',
    format: 'json',
    titles: title,
  });
  const res = await fetch(`https://en.wikipedia.org/w/api.php?${params}`);
  if (!res.ok) throw new Error(`Wikipedia HTTP ${res.status}`);
  const data = await res.json();
  const pages = data?.query?.pages as Record<string, { extract?: string }> | undefined;
  if (!pages) throw new Error('No pages in response');
  const extract = Object.values(pages)[0]?.extract?.trim();
  if (!extract) throw new Error('Empty Wikipedia extract');
  return extract;
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

/**
 * Looks up IUCN Red List status by scientific name using the v4 API.
 * Returns null when no token is configured or the species isn't assessed.
 * Older LR/ categories (Lower Risk) are normalised to their modern equivalents.
 */
export async function getIucnStatus(scientificName: string): Promise<INatConservationStatus | null> {
  if (!IUCN_TOKEN) return null;
  const parts = scientificName.trim().split(/\s+/);
  if (parts.length < 2) return null;
  const [genus, species] = parts;
  const params = new URLSearchParams({ genus_name: genus, species_name: species });
  const res = await fetch(
    `https://api.iucnredlist.org/api/v4/taxa/scientific_name?${params}`,
    { headers: { Authorization: `Bearer ${IUCN_TOKEN}` } }
  );
  if (!res.ok) return null;
  const data = await res.json();
  const latest = (data?.assessments as any[])?.find(a => a.latest);
  if (!latest?.red_list_category_code) return null;
  // Normalise legacy "LR/lc" → "LC", "LR/nt" → "NT", "LR/cd" → "NT"
  const raw = (latest.red_list_category_code as string).toUpperCase();
  const code = raw.startsWith('LR/') ? (raw === 'LR/LC' ? 'LC' : 'NT') : raw;
  return {
    status: code,
    status_name: IUCN_STATUS_NAMES[code],
    authority: 'IUCN Red List',
    url: latest.url ?? (data?.taxon?.sis_taxon_id
      ? `https://www.iucnredlist.org/species/${data.taxon.sis_taxon_id}`
      : undefined),
  };
}
