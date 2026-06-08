export interface INatPhoto {
  url?: string;
  medium_url?: string;
  large_url?: string;
  attribution?: string;
}

export interface INatConservationStatus {
  status: string;          // e.g. "LC", "VU", "EN", "CR"
  status_name?: string;    // e.g. "vulnerable"
  authority?: string;      // e.g. "IUCN Red List"
  iucn?: number;           // numeric: 10=LC 20=NT 30=VU 40=EN 50=CR 60=EW 70=EX
  url?: string;
}

export interface INatTaxon {
  id: number;
  name: string;
  preferred_common_name?: string;
  default_photo?: INatPhoto;
  observations_count?: number;
  rank?: string;
  iconic_taxon_name?: string;
  wikipedia_url?: string;
  wikipedia_summary?: string;
  description?: string;
  conservation_status?: INatConservationStatus;
  threatened?: boolean;
  ancestors?: {
    id: number;
    rank: string;
    name: string;
    preferred_common_name?: string;
  }[];
  taxon_photos?: { photo: INatPhoto }[];
}

export type MonthlyHistogram = Record<string, number>; // keys "1"–"12"

export interface INatObservation {
  id: number;
  taxon?: INatTaxon;
  observed_on?: string;
  place_guess?: string;
  location?: string; // "lat,lng" string
  photos?: INatPhoto[];
}

export interface NearbySpecies {
  count: number;
  taxon: INatTaxon;
}

export interface Sighting {
  id: number;
  speciesId: number;
  scientificName: string;
  commonName?: string;
  lat?: number;
  lng?: number;
  date: string;
  notes?: string;
  imageUrl?: string;       // iNaturalist species photo URL
  locationName?: string;
  photoUris?: string[];    // user's own photos (local file URIs)
}

export function getTaxonPhotoUrl(taxon?: INatTaxon): string | undefined {
  const photo = taxon?.default_photo;
  if (!photo) return undefined;
  return photo.medium_url ?? photo.url?.replace('square', 'medium');
}
