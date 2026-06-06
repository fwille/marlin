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
      photo_uri     TEXT
    );
  `);

  // Non-destructive migration: add photo_uri if upgrading from an older schema
  try {
    _db.execSync('ALTER TABLE sightings ADD COLUMN photo_uri TEXT');
  } catch {
    // column already exists — fine
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
    photoUri: (row.photo_uri as string) ?? undefined,
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
       (species_id, scientific_name, common_name, lat, lng, date, notes, image_url, location_name, photo_uri)
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
    s.photoUri ?? null
  );
  return { ...s, id: result.lastInsertRowId };
}

export function dbDeleteSighting(id: number): void {
  const db = getDb();
  db.runSync('DELETE FROM sightings WHERE id = ?', id);
}
