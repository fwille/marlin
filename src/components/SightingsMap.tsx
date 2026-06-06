import { useMemo, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  StyleSheet,
  useColorScheme,
} from 'react-native';
import MapView, { Marker, Callout, Region } from 'react-native-maps';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useLifelist } from '@/store/lifelist';
import { useLocation } from '@/hooks/useLocation';

const OCEAN_BLUE = '#006994';

export default function SightingsMap() {
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

  const regionForSet = useCallback((pts: typeof sightingsWithCoords): Region => {
    if (pts.length === 0) {
      if (location) return { latitude: location.lat, longitude: location.lng, latitudeDelta: 10, longitudeDelta: 10 };
      return { latitude: 20, longitude: 10, latitudeDelta: 60, longitudeDelta: 60 };
    }
    const lats = pts.map(s => s.lat!);
    const lngs = pts.map(s => s.lng!);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: Math.max(maxLat - minLat + 2, 1),
      longitudeDelta: Math.max(maxLng - minLng + 2, 1),
    };
  }, [location]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initialRegion = useMemo(() => regionForSet(sightingsWithCoords), []);

  if (sightingsWithCoords.length === 0) {
    return (
      <View style={[styles.empty, isDark && styles.emptyDark]}>
        <Ionicons name="map-outline" size={56} color="#ccc" />
        <Text style={[styles.emptyTitle, isDark && styles.textLight]}>No mapped sightings yet</Text>
        <Text style={styles.emptyHint}>Log a sighting with a location and it will appear here.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView ref={mapRef} style={styles.map} initialRegion={initialRegion}>
        {filtered.map(s => (
          <Marker
            key={s.id}
            coordinate={{ latitude: s.lat!, longitude: s.lng! }}
            pinColor={OCEAN_BLUE}>
            <Callout onPress={() => router.push(`/species/${s.speciesId}`)}>
              <View style={styles.callout}>
                {(s.photoUri || s.imageUrl) && (
                  <Image source={{ uri: s.photoUri ?? s.imageUrl }} style={styles.calloutImage} />
                )}
                <View style={styles.calloutBody}>
                  <Text style={styles.calloutName} numberOfLines={1}>
                    {s.commonName ?? s.scientificName}
                  </Text>
                  <Text style={styles.calloutDate}>{s.date}</Text>
                  {s.locationName && (
                    <Text style={styles.calloutPlace} numberOfLines={1}>{s.locationName}</Text>
                  )}
                  <Text style={styles.calloutTap}>Tap to view species →</Text>
                </View>
              </View>
            </Callout>
          </Marker>
        ))}
      </MapView>

      {/* Filter bar overlay */}
      <View style={[styles.filterBar, isDark && styles.filterBarDark]}>
        <Ionicons name="search" size={15} color="#888" />
        <TextInput
          style={[styles.filterInput, isDark && styles.textLight]}
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
            if (next.length > 0) mapRef.current?.animateToRegion(regionForSet(next), 400);
          }}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="done"
        />
        {query.length > 0 && (
          <TouchableOpacity
            hitSlop={8}
            onPress={() => { setQuery(''); mapRef.current?.animateToRegion(regionForSet(sightingsWithCoords), 400); }}>
            <Ionicons name="close-circle" size={15} color="#888" />
          </TouchableOpacity>
        )}
        {query.trim() ? (
          <Text style={styles.filterCount}>{filtered.length}/{sightingsWithCoords.length}</Text>
        ) : null}
      </View>

      {/* My location button */}
      {location && (
        <TouchableOpacity
          style={styles.locationBtn}
          onPress={() => mapRef.current?.animateToRegion(
            { latitude: location.lat, longitude: location.lng, latitudeDelta: 1, longitudeDelta: 1 },
            400
          )}>
          <Ionicons name="locate" size={22} color={OCEAN_BLUE} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: '#f5f8fa' },
  emptyDark: { backgroundColor: '#0A1628' },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: '#333' },
  emptyHint: { fontSize: 14, color: '#888', textAlign: 'center', paddingHorizontal: 40 },
  textLight: { color: '#fff' },
  filterBar: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 9,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  filterBarDark: { backgroundColor: 'rgba(10,22,40,0.95)' },
  filterInput: { flex: 1, fontSize: 14, color: '#111', padding: 0 },
  filterCount: { fontSize: 12, color: '#888' },
  callout: { flexDirection: 'row', gap: 10, maxWidth: 220 },
  calloutImage: { width: 60, height: 60, borderRadius: 8 },
  calloutBody: { flex: 1, gap: 2 },
  calloutName: { fontSize: 14, fontWeight: '700', color: '#111' },
  calloutDate: { fontSize: 12, color: '#666' },
  calloutPlace: { fontSize: 12, color: '#888' },
  calloutTap: { fontSize: 11, color: OCEAN_BLUE, marginTop: 2 },
  locationBtn: {
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
