import { create } from 'zustand';
import { Sighting } from '@/types';
import { dbGetAllSightings, dbAddSighting, dbDeleteSighting } from '@/db';

interface LifelistState {
  sightings: Sighting[];
  load: () => void;
  add: (s: Omit<Sighting, 'id'>) => void;
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

  remove: (id) => {
    dbDeleteSighting(id);
    set(state => ({ sightings: state.sightings.filter(s => s.id !== id) }));
  },

  hasSeen: (speciesId) => get().sightings.some(s => s.speciesId === speciesId),
}));
