import { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  Alert,
  StyleSheet,
} from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useLifelist } from '@/store/lifelist';
import { Sighting } from '@/types';
import SightingsMap from '@/components/SightingsMap';

const OCEAN_BLUE = '#006994';

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function SightingCard({ sighting, onDelete }: { sighting: Sighting; onDelete: () => void }) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  const confirmDelete = () => {
    Alert.alert(
      'Remove from Life List',
      `Remove ${sighting.commonName ?? sighting.scientificName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: onDelete },
      ]
    );
  };

  return (
    <TouchableOpacity
      style={[styles.card, isDark && styles.cardDark]}
      onPress={() => router.push(`/sighting/${sighting.id}`)}>
      {(sighting.photoUris?.[0] ?? sighting.imageUrl) ? (
        <Image source={{ uri: sighting.photoUris?.[0] ?? sighting.imageUrl }} style={styles.cardImage} />
      ) : (
        <View style={[styles.cardImage, styles.cardImagePlaceholder]}>
          <Ionicons name="fish" size={32} color="#aaa" />
        </View>
      )}
      <View style={styles.cardBody}>
        <Text style={[styles.commonName, isDark && styles.textDark]} numberOfLines={1}>
          {sighting.commonName ?? sighting.scientificName}
        </Text>
        {sighting.commonName && (
          <Text style={styles.sciName} numberOfLines={1}>{sighting.scientificName}</Text>
        )}
        <View style={styles.metaRow}>
          <Ionicons name="calendar-outline" size={12} color="#888" />
          <Text style={styles.meta}>{formatDate(sighting.date)}</Text>
          {sighting.locationName && (
            <>
              <Ionicons name="location-outline" size={12} color="#888" />
              <Text style={styles.meta} numberOfLines={1}>{sighting.locationName}</Text>
            </>
          )}
        </View>
        {sighting.notes ? (
          <Text style={styles.notes} numberOfLines={2}>{sighting.notes}</Text>
        ) : null}
      </View>
      <TouchableOpacity onPress={confirmDelete} style={styles.deleteBtn} hitSlop={8}>
        <Ionicons name="trash-outline" size={18} color="#cc4444" />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

export default function LifelistScreen() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const sightings = useLifelist(s => s.sightings);
  const remove = useLifelist(s => s.remove);
  const [view, setView] = useState<'list' | 'map'>('list');
  const uniqueCount = new Set(sightings.map(s => s.speciesId)).size;

  return (
    <SafeAreaView style={[styles.container, isDark && styles.containerDark]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={[styles.title, isDark && styles.textDark]}>Life List</Text>
          {sightings.length > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{uniqueCount} species</Text>
            </View>
          )}
        </View>

        {/* List / Map toggle */}
        <View style={[styles.toggle, isDark && styles.toggleDark]}>
          <TouchableOpacity
            style={[styles.toggleBtn, view === 'list' && styles.toggleBtnActive]}
            onPress={() => setView('list')}>
            <Ionicons
              name="list"
              size={18}
              color={view === 'list' ? '#fff' : (isDark ? '#aaa' : '#888')}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, view === 'map' && styles.toggleBtnActive]}
            onPress={() => setView('map')}>
            <Ionicons
              name="map"
              size={18}
              color={view === 'map' ? '#fff' : (isDark ? '#aaa' : '#888')}
            />
          </TouchableOpacity>
        </View>
      </View>

      {view === 'map' ? (
        <SightingsMap />
      ) : (
        <FlatList
          data={sightings}
          keyExtractor={item => item.id.toString()}
          renderItem={({ item }) => (
            <SightingCard sighting={item} onDelete={() => remove(item.id)} />
          )}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="list-outline" size={64} color="#ccc" />
              <Text style={[styles.emptyTitle, isDark && styles.textDark]}>
                Your life list is empty
              </Text>
              <Text style={styles.emptyHint}>
                Browse Nearby or Search to find species, then add them to your life list.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f8fa' },
  containerDark: { backgroundColor: '#0A1628' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 10,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 28, fontWeight: '700', color: '#111' },
  textDark: { color: '#fff' },
  badge: {
    backgroundColor: OCEAN_BLUE,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  toggle: {
    flexDirection: 'row',
    backgroundColor: '#e0e8f0',
    borderRadius: 10,
    padding: 3,
    gap: 2,
  },
  toggleDark: { backgroundColor: '#1a2a40' },
  toggleBtn: { borderRadius: 8, padding: 6 },
  toggleBtnActive: { backgroundColor: OCEAN_BLUE },
  list: { paddingHorizontal: 16, paddingBottom: 24, flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#333' },
  emptyHint: { fontSize: 14, color: '#888', textAlign: 'center', paddingHorizontal: 32 },
  card: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 10,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  cardDark: { backgroundColor: '#112240' },
  cardImage: { width: 80, height: 80 },
  cardImagePlaceholder: { backgroundColor: '#e8eff5', alignItems: 'center', justifyContent: 'center' },
  cardBody: { flex: 1, padding: 12, justifyContent: 'center', gap: 4 },
  commonName: { fontSize: 15, fontWeight: '600', color: '#111' },
  sciName: { fontSize: 12, color: '#888', fontStyle: 'italic' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  meta: { fontSize: 12, color: '#888' },
  notes: { fontSize: 12, color: '#666', fontStyle: 'italic' },
  deleteBtn: { justifyContent: 'center', paddingRight: 16 },
});
