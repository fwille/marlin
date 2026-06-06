import * as SQLite from 'expo-sqlite';
import { Sighting } from '@/types';

let _db: SQLite.SQLiteDatabase | null = null;

export function getDb(): SQLite.SQLiteDatabase {
  if (_db) return _db;

  _db = SQLite.openDatabaseSync('marlin.db');

  _db.execSync(`
    CREATE TABLE IF NOT EXISTS sightings (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      species_id    INTEGER NOT NULL,
      scientific_name TEXT NOT NULL,
      common_name   TEXT,
      lat           REAL,
      lng           REAL,
      date          TEXT NOT NULL,
      notes         TEXT,
      image_url     TEXT,
      location_name TEXT,
      photo_uri     TEXT,
      photo_uris    TEXT
    );
  `);

  // Non-destructive migrations for older schemas
  for (const col of ['photo_uri TEXT', 'photo_uris TEXT']) {
    try { _db.execSync(`ALTER TABLE sightings ADD COLUMN ${col}`); } catch {}
  }

  _db.execSync(
    `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`
  );

  return _db;
}

export function dbGetSetting(key: string): string | null {
  const db = getDb();
  const row = db.getFirstSync<{ value: string }>('SELECT value FROM settings WHERE key = ?', key);
  return row?.value ?? null;
}

export function dbSetSetting(key: string, value: string): void {
  const db = getDb();
  db.runSync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', key, value);
}

function rowToSighting(row: Record<string, unknown>): Sighting {
  // Merge legacy single photo_uri into the newer photo_uris JSON array
  let photoUris: string[] = [];
  if (row.photo_uris) {
    try { photoUris = JSON.parse(row.photo_uris as string); } catch {}
  }
  const legacy = row.photo_uri as string | null;
  if (legacy && !photoUris.includes(legacy)) photoUris = [legacy, ...photoUris];

  return {
    id: row.id as number,
    speciesId: row.species_id as number,
    scientificName: row.scientific_name as string,
    commonName: (row.common_name as string) ?? undefined,
    lat: (row.lat as number) ?? undefined,
    lng: (row.lng as number) ?? undefined,
    date: row.date as string,
    notes: (row.notes as string) ?? undefined,
    imageUrl: (row.image_url as string) ?? undefined,
    locationName: (row.location_name as string) ?? undefined,
    photoUris: photoUris.length > 0 ? photoUris : undefined,
  };
}

export function dbGetAllSightings(): Sighting[] {
  const db = getDb();
  const rows = db.getAllSync<Record<string, unknown>>(
    'SELECT * FROM sightings ORDER BY date DESC'
  );
  return rows.map(rowToSighting);
}

export function dbAddSighting(s: Omit<Sighting, 'id'>): Sighting {
  const db = getDb();
  const result = db.runSync(
    `INSERT INTO sightings
       (species_id, scientific_name, common_name, lat, lng, date, notes, image_url, location_name, photo_uris)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    s.speciesId,
    s.scientificName,
    s.commonName ?? null,
    s.lat ?? null,
    s.lng ?? null,
    s.date,
    s.notes ?? null,
    s.imageUrl ?? null,
    s.locationName ?? null,
    s.photoUris ? JSON.stringify(s.photoUris) : null
  );
  return { ...s, id: result.lastInsertRowId };
}

export function dbUpdateSighting(
  id: number,
  updates: { lat?: number | null; lng?: number | null; locationName?: string | null; notes?: string | null; photoUris?: string[] }
): void {
  const db = getDb();
  const sets: string[] = [];
  const vals: (string | number | null)[] = [];
  if ('lat' in updates)          { sets.push('lat = ?');           vals.push(updates.lat ?? null); }
  if ('lng' in updates)          { sets.push('lng = ?');           vals.push(updates.lng ?? null); }
  if ('locationName' in updates) { sets.push('location_name = ?'); vals.push(updates.locationName ?? null); }
  if ('notes' in updates)        { sets.push('notes = ?');         vals.push(updates.notes ?? null); }
  if ('photoUris' in updates)    { sets.push('photo_uris = ?');    vals.push(JSON.stringify(updates.photoUris ?? [])); }
  if (sets.length === 0) return;
  vals.push(id);
  db.runSync(`UPDATE sightings SET ${sets.join(', ')} WHERE id = ?`, ...vals);
}

export function dbDeleteSighting(id: number): void {
  const db = getDb();
  db.runSync('DELETE FROM sightings WHERE id = ?', id);
}

export function dbClearAllSightings(): void {
  getDb().runSync('DELETE FROM sightings');
}

export function dbImportSightings(sightings: Omit<Sighting, 'id'>[]): void {
  const db = getDb();
  db.withTransactionSync(() => {
    db.runSync('DELETE FROM sightings');
    for (const s of sightings) {
      db.runSync(
        `INSERT INTO sightings
           (species_id, scientific_name, common_name, lat, lng, date, notes, image_url, location_name, photo_uris)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        s.speciesId, s.scientificName, s.commonName ?? null,
        s.lat ?? null, s.lng ?? null, s.date, s.notes ?? null,
        s.imageUrl ?? null, s.locationName ?? null,
        s.photoUris ? JSON.stringify(s.photoUris) : null
      );
    }
  });
}
