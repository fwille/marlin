import { create } from 'zustand';
import { dbGetSetting, dbSetSetting } from '@/db';

export interface ManualLocation {
  lat: number;
  lng: number;
  name: string;
}

const SETTING_KEY = 'manual_location';
const FORCED_KEY = 'location_forced';

interface ManualLocationState {
  location: ManualLocation | null;
  /** When true the manual location overrides GPS even if GPS is available. */
  forced: boolean;
  load: () => void;
  set: (loc: ManualLocation | null) => void;
  clearForced: () => void;
}

export const useManualLocation = create<ManualLocationState>((set) => ({
  location: null,
  forced: false,

  load: () => {
    const raw = dbGetSetting(SETTING_KEY);
    const forced = dbGetSetting(FORCED_KEY) === 'true';
    if (raw) {
      try { set({ location: JSON.parse(raw), forced }); } catch {}
    }
  },

  set: (loc) => {
    dbSetSetting(SETTING_KEY, loc ? JSON.stringify(loc) : '');
    dbSetSetting(FORCED_KEY, loc ? 'true' : 'false');
    set({ location: loc, forced: !!loc });
  },

  clearForced: () => {
    dbSetSetting(FORCED_KEY, 'false');
    set({ forced: false });
  },
}));
