import { useColorScheme as useRNColorScheme } from 'react-native';
import { useThemeStore } from '@/store/theme';

export function useColorScheme(): 'light' | 'dark' {
  const pref = useThemeStore(s => s.preference);
  const system = useRNColorScheme();
  if (pref === 'light') return 'light';
  if (pref === 'dark') return 'dark';
  return (system === 'dark' ? 'dark' : 'light');
}
