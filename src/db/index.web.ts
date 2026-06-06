import { Sighting } from '@/types';

// expo-sqlite's synchronous API requires SharedArrayBuffer which browsers
// block without COOP/COEP headers. Web gets no-op stubs; native uses index.ts.

export function getDb() {
  return null;
}

export function dbGetAllSightings(): Sighting[] {
  return [];
}

export function dbAddSighting(s: Omit<Sighting, 'id'>): Sighting {
  // No persistence on web — return with a temporary negative ID so it shows
  // in-session without clashing with real SQLite IDs on native.
  return { ...s, id: -Date.now() };
}

export function dbUpdateSighting(
  id: number,
  updates: { lat?: number | null; lng?: number | null; locationName?: string | null; notes?: string | null; photoUris?: string[] }
): void {
  try {
    const key = `marlin_sighting_${id}`;
    const raw = localStorage.getItem(key);
    if (!raw) return;
    const s = JSON.parse(raw);
    if ('lat' in updates) s.lat = updates.lat;
    if ('lng' in updates) s.lng = updates.lng;
    if ('locationName' in updates) s.locationName = updates.locationName;
    if ('notes' in updates) s.notes = updates.notes;
    if ('photoUris' in updates) s.photoUris = updates.photoUris;
    localStorage.setItem(key, JSON.stringify(s));
  } catch {}
}

export function dbDeleteSighting(_id: number): void {}

export function dbClearAllSightings(): void {}

export function dbImportSightings(_sightings: Omit<Sighting, 'id'>[]): void {}

export function dbGetSetting(key: string): string | null {
  try { return localStorage.getItem(`marlin_${key}`); } catch { return null; }
}

export function dbSetSetting(key: string, value: string): void {
  try { localStorage.setItem(`marlin_${key}`, value); } catch {}
}
