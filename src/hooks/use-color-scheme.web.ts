import { useEffect, useState } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';
import { useThemeStore } from '@/store/theme';

export function useColorScheme(): 'light' | 'dark' {
  const [hasHydrated, setHasHydrated] = useState(false);
  useEffect(() => { setHasHydrated(true); }, []);

  const pref = useThemeStore(s => s.preference);
  const system = useRNColorScheme();

  if (!hasHydrated) return 'light';
  if (pref === 'light') return 'light';
  if (pref === 'dark') return 'dark';
  return (system === 'dark' ? 'dark' : 'light');
}
