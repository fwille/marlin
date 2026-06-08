import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useLifelist } from '@/store/lifelist';
import { useManualLocation } from '@/store/manualLocation';
import { useThemeStore } from '@/store/theme';

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
