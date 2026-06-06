import { useEffect } from 'react';
import { Alert, Platform } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { File, Paths } from 'expo-file-system';
import { useLifelist } from '@/store/lifelist';
import { useManualLocation } from '@/store/manualLocation';
import { useThemeStore } from '@/store/theme';
import { dbGetAllSightings, dbClearAllSightings, dbGetSetting } from '@/db';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

function AppInit() {
  const loadLifelist = useLifelist(s => s.load);
  const loadManualLocation = useManualLocation(s => s.load);
  const loadTheme = useThemeStore(s => s.load);

  useEffect(() => {
    loadManualLocation();
    loadTheme();

    if (Platform.OS === 'web') {
      loadLifelist();
      return;
    }

    // The cache directory is excluded from Android Auto Backup and is cleared
    // on a fresh install, making it a reliable sentinel: if this file is absent
    // but the DB has data, the data arrived via a backup restore.
    const sentinel = new File(Paths.cache, 'marlin_sentinel');
    if (!sentinel.exists) {
      sentinel.write('1');
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
