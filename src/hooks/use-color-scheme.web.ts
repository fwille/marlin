import { useSyncExternalStore } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';
import { useThemeStore } from '@/store/theme';

const subscribe = () => () => {};

export function useColorScheme(): 'light' | 'dark' {
  // Renders 'light' on the server/first paint and the real scheme once hydrated,
  // without the extra setState-in-effect render pass `useState` + `useEffect` would need.
  const hasHydrated = useSyncExternalStore(subscribe, () => true, () => false);

  const pref = useThemeStore(s => s.preference);
  const system = useRNColorScheme();

  if (!hasHydrated) return 'light';
  if (pref === 'light') return 'light';
  if (pref === 'dark') return 'dark';
  return (system === 'dark' ? 'dark' : 'light');
}
