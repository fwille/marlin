import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useLifelist } from '@/store/lifelist';
import { useManualLocation } from '@/store/manualLocation';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

function AppInit() {
  const loadLifelist = useLifelist(s => s.load);
  const loadManualLocation = useManualLocation(s => s.load);
  useEffect(() => {
    loadLifelist();
    loadManualLocation();
  }, [loadLifelist, loadManualLocation]);
  return null;
}

export default function RootLayout() {
  const scheme = useColorScheme();

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <AppInit />
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="species/[id]"
            options={{
              title: '',
              headerBackTitle: 'Back',
              headerTransparent: true,
              headerTintColor: '#fff',
            }}
          />
        </Stack>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
