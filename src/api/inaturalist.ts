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
//
// The groups are deliberately mutually disjoint, so any given species matches at
// most one. That is what lets the sightings map reuse them as legend buckets
// (see marineGroupFor) instead of iNaturalist's `iconic_taxon_name`, which is a
// short fixed list that reports plain "Animalia" for sharks, jellies and stars.
//
// Crustacea (85493) excluded: it contains terrestrial woodlice. Decapoda (47186)
// covers only crabs, lobsters, shrimp and is almost entirely aquatic/marine.
// Mollusca (47115) excluded for the same reason — land snails and slugs — so the
// two groups divers actually log are listed on their own. Hydrophiinae (492346)
// excluded likewise: see the Sea Snakes entries below.
export interface MarineGroup {
  /** iNaturalist taxon ID: both the search root and the map-legend bucket. */
  id: number;
  /** Legend label on the sightings map. Groups sharing a label merge into one entry. */
  label: string;
}

export const MARINE_GROUPS: MarineGroup[] = [
  { id: 47178,  label: 'Fish' },                // Actinopterygii — ray-finned fish
  { id: 47273,  label: 'Sharks & Rays' },       // Chondrichthyes — sharks, rays, chimaeras
  { id: 47549,  label: 'Starfish & Urchins' },  // Echinodermata — starfish, urchins, sea cucumbers
  { id: 47459,  label: 'Octopus & Squid' },     // Cephalopoda — octopus, squid, nautilus, cuttlefish
  { id: 47113,  label: 'Sea Slugs' },           // Nudibranchia — nudibranchs
  { id: 47534,  label: 'Jellyfish & Corals' },  // Cnidaria — jellyfish, corals, anemones, hydroids
  { id: 51508,  label: 'Comb Jellies' },        // Ctenophora — a separate phylum from Cnidaria, not a
                                                // subgroup: scoping to 47534 finds no Mnemiopsis leidyi
  { id: 47186,  label: 'Crabs & Shrimp' },      // Decapoda — crabs, lobsters, shrimp
  { id: 152871, label: 'Marine Mammals' },      // Cetacea — whales, dolphins, porpoises (infraorder,
                                                // NOT 152870 which is Artiodactyla)
  { id: 46306,  label: 'Marine Mammals' },      // Sirenia — manatees, dugongs
  { id: 372234, label: 'Sea Turtles' },         // Chelonioidea — sea turtles
  { id: 1630892, label: 'Sea Snakes' },         // Hydrophiini — true sea snakes. NOT the parent
                                                // Hydrophiinae (492346): that subfamily is mostly
                                                // terrestrial Australian elapids (brown snakes,
                                                // tiger snakes) — same trap as Crustacea above.
  { id: 492347, label: 'Sea Snakes' },          // Laticaudinae — sea kraits, a sibling of Hydrophiini
];

export const MARINE_TAXON_IDS = MARINE_GROUPS.map(g => g.id);

/**
 * The marine group a taxon belongs to, matched against its own ID and ancestry.
 *
 * `iconic_taxon_name` cannot do this job: iNaturalist's iconic taxa are a short
 * fixed list, and everything outside it — sharks, jellyfish, starfish, comb
 * jellies, sea snakes — reports plain "Animalia". Matching on `ancestor_ids`
 * uses the same taxon IDs the search already fans out over, so every species
 * reachable through search lands in a real group. Returns undefined for taxa
 * outside all of them (e.g. a life-list entry predating a group's addition).
 */
export function marineGroupFor(
  taxon?: { id?: number; ancestor_ids?: number[] }
): MarineGroup | undefined {
  if (!taxon) return undefined;
  const chain = new Set<number>(taxon.ancestor_ids ?? []);
  if (taxon.id !== undefined) chain.add(taxon.id);
  return MARINE_GROUPS.find(g => chain.has(g.id));
}

async function apiFetch<T>(endpoint: string, params: URLSearchParams): Promise<T> {
  const res = await fetch(`${BASE}${endpoint}?${params}`);
  if (!res.ok) throw new Error(`iNaturalist ${res.status}: ${await res.text()}`);
  return res.json();
}

/**
 * Returns deduplicated species counts observed near a coordinate.
 * Fans out into one request per marine taxon group, merges by taxon ID,
 * and returns all of them sorted by observation count.
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
        per_page: '500', // iNaturalist's hard ceiling for this endpoint — effectively "all of them"
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

  return [...byId.values()].sort((a, b) => b.count - a.count);
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
