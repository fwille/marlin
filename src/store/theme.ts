import { create } from 'zustand';
import { dbGetSetting, dbSetSetting } from '@/db';

export type ThemePreference = 'system' | 'light' | 'dark';

interface ThemeState {
  preference: ThemePreference;
  load: () => void;
  setTheme: (pref: ThemePreference) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  preference: 'system',

  load: () => {
    const stored = dbGetSetting('theme');
    const pref: ThemePreference =
      stored === 'light' || stored === 'dark' ? stored : 'system';
    set({ preference: pref });
  },

  setTheme: (pref) => {
    dbSetSetting('theme', pref);
    set({ preference: pref });
  },
}));
