import { create } from 'zustand';
import { dbGetSetting, dbSetSetting } from '@/db';

export interface ManualLocation {
  lat: number;
  lng: number;
  name: string;
}

const SETTING_KEY = 'manual_location';

interface ManualLocationState {
  location: ManualLocation | null;
  load: () => void;
  set: (loc: ManualLocation | null) => void;
}

export const useManualLocation = create<ManualLocationState>((set) => ({
  location: null,

  load: () => {
    const raw = dbGetSetting(SETTING_KEY);
    if (raw) {
      try { set({ location: JSON.parse(raw) }); } catch {}
    }
  },

  set: (loc) => {
    dbSetSetting(SETTING_KEY, loc ? JSON.stringify(loc) : '');
    set({ location: loc });
  },
}));
