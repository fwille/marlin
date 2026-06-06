import { create } from 'zustand';
import { Sighting } from '@/types';
import { dbGetAllSightings, dbAddSighting, dbUpdateSighting, dbDeleteSighting } from '@/db';

type SightingUpdate = {
  lat?: number | null;
  lng?: number | null;
  locationName?: string | null;
  notes?: string | null;
  photoUris?: string[];
};

interface LifelistState {
  sightings: Sighting[];
  load: () => void;
  add: (s: Omit<Sighting, 'id'>) => void;
  update: (id: number, changes: SightingUpdate) => void;
  remove: (id: number) => void;
  // Returns a primitive — safe to use directly as a Zustand selector.
  hasSeen: (speciesId: number) => boolean;
}

export const useLifelist = create<LifelistState>((set, get) => ({
  sightings: [],

  load: () => {
    set({ sightings: dbGetAllSightings() });
  },

  add: (sighting) => {
    const saved = dbAddSighting(sighting);
    set(state => ({ sightings: [saved, ...state.sightings] }));
  },

  update: (id, changes) => {
    dbUpdateSighting(id, changes);
    set(state => ({
      sightings: state.sightings.map(s => {
        if (s.id !== id) return s;
        const next = { ...s };
        if ('lat' in changes)          next.lat = changes.lat ?? undefined;
        if ('lng' in changes)          next.lng = changes.lng ?? undefined;
        if ('locationName' in changes) next.locationName = changes.locationName ?? undefined;
        if ('notes' in changes)        next.notes = changes.notes ?? undefined;
        if ('photoUris' in changes)    next.photoUris = changes.photoUris;
        return next;
      }),
    }));
  },

  remove: (id) => {
    dbDeleteSighting(id);
    set(state => ({ sightings: state.sightings.filter(s => s.id !== id) }));
  },

  hasSeen: (speciesId) => get().sightings.some(s => s.speciesId === speciesId),
}));
