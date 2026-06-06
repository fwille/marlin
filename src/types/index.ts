export interface INatPhoto {
  url?: string;
  medium_url?: string;
  large_url?: string;
  attribution?: string;
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
  ancestors?: Array<{
    rank: string;
    name: string;
    preferred_common_name?: string;
  }>;
  taxon_photos?: Array<{ photo: INatPhoto }>;
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
  imageUrl?: string;   // iNaturalist species photo URL
  locationName?: string;
  photoUri?: string;   // user's own photo (local file URI)
}

export function getTaxonPhotoUrl(taxon?: INatTaxon): string | undefined {
  const photo = taxon?.default_photo;
  if (!photo) return undefined;
  return photo.medium_url ?? photo.url?.replace('square', 'medium');
}
