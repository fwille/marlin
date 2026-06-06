import { useEffect } from 'react';
import { Alert, Platform } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useLifelist } from '@/store/lifelist';
import { useManualLocation } from '@/store/manualLocation';
import { useThemeStore } from '@/store/theme';
import { dbGetAllSightings, dbClearAllSightings, dbGetSetting } from '@/db';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

const SENTINEL_KEY = 'marlin_device_sentinel';

function AppInit() {
  const loadLifelist = useLifelist(s => s.load);
  const loadManualLocation = useManualLocation(s => s.load);
  const loadTheme = useThemeStore(s => s.load);

  useEffect(() => {
    loadManualLocation();
    loadTheme();

    if (Platform.OS === 'web') {
      // SecureStore is native-only; no Auto Backup on web.
      loadLifelist();
      return;
    }

    // Dynamic import keeps expo-secure-store out of the web bundle entirely.
    (async () => {
      const SecureStore = await import('expo-secure-store');
      const sentinel = await SecureStore.getItemAsync(SENTINEL_KEY);

      if (!sentinel) {
        // First run on this device — write a sentinel that is never backed up.
        await SecureStore.setItemAsync(SENTINEL_KEY, Date.now().toString());

        // If backup was disabled and sightings exist, they must have been
        // restored by Android Auto Backup against the user's preference.
        const backupAllowed = dbGetSetting('backup_allowed') !== 'false';
        if (!backupAllowed && dbGetAllSightings().length > 0) {
          Alert.alert(
            'Restored data found',
            'Your life list was restored from a device backup, but you had Auto Backup disabled. Would you like to keep or discard this data?',
            [
              { text: 'Keep', onPress: () => loadLifelist() },
              {
                text: 'Discard',
                style: 'destructive',
                onPress: () => { dbClearAllSightings(); loadLifelist(); },
              },
            ]
          );
          return;
        }
      }

      loadLifelist();
    })();
  }, [loadLifelist, loadManualLocation, loadTheme]);

  return null;
}

export default function RootLayout() {
  const scheme = useColorScheme();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <AppInit />
          <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="species/[id]" options={{ headerShown: false }} />
            <Stack.Screen
              name="sighting/[id]"
              options={{ headerShown: false }}
            />
          </Stack>
        </SafeAreaProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
