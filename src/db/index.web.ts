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

export function dbDeleteSighting(_id: number): void {}

export function dbGetSetting(key: string): string | null {
  try { return localStorage.getItem(`marlin_${key}`); } catch { return null; }
}

export function dbSetSetting(key: string, value: string): void {
  try { localStorage.setItem(`marlin_${key}`, value); } catch {}
}
