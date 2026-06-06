import { useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  StyleSheet,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, Callout, Region } from 'react-native-maps';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useLifelist } from '@/store/lifelist';
import { useLocation } from '@/hooks/useLocation';

const OCEAN_BLUE = '#006994';

export default function MyMapScreen() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const mapRef = useRef<MapView>(null);

  const sightings = useLifelist(s => s.sightings);
  const { location } = useLocation();
  const [query, setQuery] = useState('');

  const sightingsWithCoords = useMemo(
    () => sightings.filter(s => s.lat != null && s.lng != null),
    [sightings]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sightingsWithCoords;
    return sightingsWithCoords.filter(
      s =>
        s.commonName?.toLowerCase().includes(q) ||
        s.scientificName.toLowerCase().includes(q)
    );
  }, [sightingsWithCoords, query]);

  const regionForSet = (pts: typeof sightingsWithCoords): Region => {
    if (pts.length === 0) {
      if (location) return { latitude: location.lat, longitude: location.lng, latitudeDelta: 10, longitudeDelta: 10 };
      return { latitude: 20, longitude: 10, latitudeDelta: 60, longitudeDelta: 60 };
    }
    const lats = pts.map(s => s.lat!);
    const lngs = pts.map(s => s.lng!);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    const pad = 2;
    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: Math.max(maxLat - minLat + pad, 1),
      longitudeDelta: Math.max(maxLng - minLng + pad, 1),
    };
  };

  const initialRegion: Region = useMemo(
    () => regionForSet(sightingsWithCoords),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [] // only for initial mount — map handles panning after that
  );

  const goToMyLocation = () => {
    if (location) {
      mapRef.current?.animateToRegion(
        { latitude: location.lat, longitude: location.lng, latitudeDelta: 1, longitudeDelta: 1 },
        400
      );
    }
  };

  const fitToFiltered = (pts: typeof filtered) => {
    mapRef.current?.animateToRegion(regionForSet(pts), 400);
  };

  return (
    <View style={styles.container}>
      {/* Header + filter overlay */}
      <SafeAreaView style={styles.headerOverlay} edges={['top']}>
        <View style={[styles.headerPill, isDark && styles.headerPillDark]}>
          <Text style={[styles.headerTitle, isDark && styles.textDark]}>My Sightings</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {query.trim() ? `${filtered.length}/${sightingsWithCoords.length}` : sightingsWithCoords.length}
            </Text>
          </View>
        </View>
        {sightingsWithCoords.length > 0 && (
          <View style={[styles.filterBar, isDark && styles.filterBarDark]}>
            <Ionicons name="search" size={15} color="#888" />
            <TextInput
              style={[styles.filterInput, isDark && styles.textDark]}
              placeholder="Filter by species…"
              placeholderTextColor="#888"
              value={query}
              onChangeText={t => {
                setQuery(t);
                const q = t.trim().toLowerCase();
                const next = q
                  ? sightingsWithCoords.filter(
                      s =>
                        s.commonName?.toLowerCase().includes(q) ||
                        s.scientificName.toLowerCase().includes(q)
                    )
                  : sightingsWithCoords;
                fitToFiltered(next);
              }}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="done"
            />
            {query.length > 0 && (
              <TouchableOpacity
                hitSlop={8}
                onPress={() => { setQuery(''); fitToFiltered(sightingsWithCoords); }}>
                <Ionicons name="close-circle" size={15} color="#888" />
              </TouchableOpacity>
            )}
          </View>
        )}
      </SafeAreaView>

      {sightingsWithCoords.length === 0 ? (
        <View style={[styles.empty, isDark && styles.containerDark]}>
          <Ionicons name="map-outline" size={64} color="#ccc" />
          <Text style={[styles.emptyTitle, isDark && styles.textDark]}>No mapped sightings yet</Text>
          <Text style={styles.emptyHint}>
            When you log a sighting with a map location, it will appear here.
          </Text>
        </View>
      ) : (
        <>
          <MapView ref={mapRef} style={styles.map} initialRegion={initialRegion}>
            {filtered.map(s => (
              <Marker
                key={s.id}
                coordinate={{ latitude: s.lat!, longitude: s.lng! }}
                pinColor={OCEAN_BLUE}>
                <Callout onPress={() => router.push(`/species/${s.speciesId}`)}>
                  <View style={styles.callout}>
                    {s.photoUri || s.imageUrl ? (
                      <Image
                        source={{ uri: s.photoUri ?? s.imageUrl }}
                        style={styles.calloutImage}
                      />
                    ) : null}
                    <View style={styles.calloutBody}>
                      <Text style={styles.calloutName} numberOfLines={1}>
                        {s.commonName ?? s.scientificName}
                      </Text>
                      <Text style={styles.calloutDate}>{s.date}</Text>
                      {s.locationName ? (
                        <Text style={styles.calloutPlace} numberOfLines={1}>
                          {s.locationName}
                        </Text>
                      ) : null}
                      <Text style={styles.calloutTap}>Tap to view species →</Text>
                    </View>
                  </View>
                </Callout>
              </Marker>
            ))}
          </MapView>

          {/* My location button */}
          {location && (
            <TouchableOpacity style={styles.myLocationBtn} onPress={goToMyLocation}>
              <Ionicons name="locate" size={22} color={OCEAN_BLUE} />
            </TouchableOpacity>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  containerDark: { backgroundColor: '#0A1628' },
  map: { flex: 1 },
  headerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    alignItems: 'center',
    pointerEvents: 'none',
  },
  headerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 24,
    marginTop: 8,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  headerPillDark: { backgroundColor: 'rgba(10,22,40,0.9)' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#111' },
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 6,
    shadowColor: '#000',
    shadowOpacity: 0.10,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    minWidth: 220,
  },
  filterBarDark: { backgroundColor: 'rgba(10,22,40,0.9)' },
  filterInput: { flex: 1, fontSize: 14, color: '#111', padding: 0 },
  textDark: { color: '#fff' },
  badge: {
    backgroundColor: OCEAN_BLUE,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#f5f8fa',
  },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#333' },
  emptyHint: { fontSize: 14, color: '#888', textAlign: 'center', paddingHorizontal: 40 },
  callout: { flexDirection: 'row', gap: 10, maxWidth: 220 },
  calloutImage: { width: 60, height: 60, borderRadius: 8 },
  calloutBody: { flex: 1, gap: 2 },
  calloutName: { fontSize: 14, fontWeight: '700', color: '#111' },
  calloutDate: { fontSize: 12, color: '#666' },
  calloutPlace: { fontSize: 12, color: '#888' },
  calloutTap: { fontSize: 11, color: OCEAN_BLUE, marginTop: 2 },
  myLocationBtn: {
    position: 'absolute',
    bottom: 24,
    right: 16,
    backgroundColor: '#fff',
    borderRadius: 28,
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
});
