import { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Modal,
  TextInput,
  StyleSheet,
} from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useLocation } from '@/hooks/useLocation';
import { useNearby } from '@/hooks/useNearby';
import { useLifelist } from '@/store/lifelist';
import { useManualLocation } from '@/store/manualLocation';
import LocationPicker, { PickedLocation } from '@/components/LocationPicker';
import { NearbySpecies, getTaxonPhotoUrl } from '@/types';

const OCEAN_BLUE = '#006994';

function SpeciesCard({ item }: { item: NearbySpecies }) {
  const hasSeen = useLifelist(s => s.hasSeen(item.taxon.id));
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const photoUrl = getTaxonPhotoUrl(item.taxon);

  return (
    <TouchableOpacity
      style={[styles.card, isDark && styles.cardDark]}
      onPress={() => router.push(`/species/${item.taxon.id}`)}>
      {photoUrl ? (
        <Image source={{ uri: photoUrl }} style={styles.cardImage} />
      ) : (
        <View style={[styles.cardImage, styles.cardImagePlaceholder]}>
          <Ionicons name="fish" size={32} color="#aaa" />
        </View>
      )}
      <View style={styles.cardBody}>
        <View style={styles.cardRow}>
          <Text style={[styles.commonName, isDark && styles.textDark]} numberOfLines={1}>
            {item.taxon.preferred_common_name ?? item.taxon.name}
          </Text>
          {hasSeen && <Ionicons name="checkmark-circle" size={18} color={OCEAN_BLUE} />}
        </View>
        <Text style={styles.sciName} numberOfLines={1}>{item.taxon.name}</Text>
        <Text style={styles.count}>{item.count} sightings nearby</Text>
      </View>
    </TouchableOpacity>
  );
}

function LocationPickerModal({
  visible,
  onClose,
  isManual,
  gpsLocation,
}: {
  visible: boolean;
  onClose: () => void;
  isManual: boolean;
  gpsLocation?: { lat: number; lng: number } | null;
}) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const setManual = useManualLocation(s => s.set);
  const clearForced = useManualLocation(s => s.clearForced);
  const [picked, setPicked] = useState<PickedLocation | null>(null);

  const confirm = useCallback(() => {
    if (!picked) return;
    setManual({ lat: picked.lat, lng: picked.lng, name: picked.name ?? 'Custom location' });
    onClose();
  }, [picked, setManual, onClose]);

  const useGps = useCallback(() => {
    clearForced();
    onClose();
  }, [clearForced, onClose]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.modalContainer, isDark && styles.modalDark]}>
        <View style={styles.modalHeader}>
          <Text style={[styles.modalTitle, isDark && styles.textDark]}>Set your location</Text>
          <TouchableOpacity onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={24} color={isDark ? '#fff' : '#111'} />
          </TouchableOpacity>
        </View>
        <Text style={[styles.modalHint, isDark && { color: '#aaa' }]}>
          Tap the map to place a pin where you want to look for marine life.
        </Text>
        {gpsLocation && (
          <View style={styles.gpsLegendRow}>
            <View style={styles.gpsDot} />
            <Text style={[styles.gpsLegendText, isDark && styles.hintDark]}>
              Blue dot shows your current GPS location
            </Text>
          </View>
        )}
        <View style={styles.pickerWrapper}>
          <LocationPicker value={picked} onChange={setPicked} gpsLocation={gpsLocation} />
        </View>
        {picked && (
          <View style={styles.pickedRow}>
            <Ionicons name="location" size={14} color={OCEAN_BLUE} />
            <Text style={[styles.pickedName, isDark && styles.textDark]} numberOfLines={1}>
              {picked.name ?? `${picked.lat.toFixed(3)}, ${picked.lng.toFixed(3)}`}
            </Text>
          </View>
        )}
        <TouchableOpacity
          style={[styles.confirmBtn, !picked && styles.confirmBtnDisabled]}
          onPress={confirm}
          disabled={!picked}>
          <Text style={styles.confirmText}>Use this location</Text>
        </TouchableOpacity>
        {isManual && (
          <TouchableOpacity style={styles.useGpsBtn} onPress={useGps}>
            <Ionicons name="navigate" size={14} color={OCEAN_BLUE} />
            <Text style={styles.useGpsText}>Switch back to GPS location</Text>
          </TouchableOpacity>
        )}
      </SafeAreaView>
    </Modal>
  );
}

export default function NearbyScreen() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const [showPicker, setShowPicker] = useState(false);
  const [query, setQuery] = useState('');

  const { location, loading: locLoading, isManual, locationName, gpsLocation, requestGps } = useLocation();
  const { data, isLoading, error, refetch } = useNearby(location);

  const filteredData = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return data ?? [];
    return (data ?? []).filter(item =>
      (item.taxon.preferred_common_name ?? '').toLowerCase().includes(q) ||
      item.taxon.name.toLowerCase().includes(q)
    );
  }, [data, query]);

  if (locLoading) {
    return (
      <SafeAreaView style={[styles.container, isDark && styles.containerDark]}>
        <View style={styles.header}>
          <Text style={[styles.title, isDark && styles.textDark]}>Nearby</Text>
        </View>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={OCEAN_BLUE} />
          <Text style={[styles.hint, isDark && styles.hintDark]}>Getting your location…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!location) {
    return (
      <SafeAreaView style={[styles.container, isDark && styles.containerDark]}>
        <View style={styles.header}>
          <Text style={[styles.title, isDark && styles.textDark]}>Nearby</Text>
        </View>
        <View style={styles.center}>
          <Ionicons name="location-outline" size={56} color="#aaa" />
          <Text style={[styles.emptyTitle, isDark && styles.textDark]}>No location set</Text>
          <Text style={[styles.hint, isDark && styles.hintDark]}>
            Use GPS or place a pin on the map to discover marine life near you.
            Location is always optional — you can search for species without it.
          </Text>
          <TouchableOpacity style={styles.setLocationBtn} onPress={requestGps}>
            <Ionicons name="navigate" size={16} color="#fff" />
            <Text style={styles.setLocationText}>Use my GPS location</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.setLocationBtnOutline} onPress={() => setShowPicker(true)}>
            <Ionicons name="map-outline" size={16} color={OCEAN_BLUE} />
            <Text style={styles.setLocationTextOutline}>Set location on map</Text>
          </TouchableOpacity>
        </View>
        <LocationPickerModal visible={showPicker} onClose={() => setShowPicker(false)} isManual={isManual} gpsLocation={gpsLocation} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, isDark && styles.containerDark]}>
      {/* Header lives outside the FlatList so its padding doesn't compound with contentContainerStyle */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={[styles.title, isDark && styles.textDark]}>Nearby</Text>
          <Text style={styles.subtitle}>Marine life spotted in your area</Text>
        </View>
        <TouchableOpacity style={styles.locationBtn} onPress={() => setShowPicker(true)}>
          <Ionicons name={isManual ? 'location' : 'navigate'} size={28} color={OCEAN_BLUE} />
          <Text style={[styles.locationBtnLabel, isDark && styles.locationBtnLabelDark]} numberOfLines={2}>
            {isManual ? (locationName ?? 'Custom') : 'GPS'}
          </Text>
        </TouchableOpacity>
      </View>
      {!isLoading && !error && (data?.length ?? 0) > 0 && (
        <View style={[styles.searchBar, isDark && styles.searchBarDark]}>
          <Ionicons name="search" size={18} color="#888" style={styles.searchIcon} />
          <TextInput
            style={[styles.searchInput, isDark && styles.searchInputDark]}
            value={query}
            onChangeText={setQuery}
            placeholder="Filter species near you…"
            placeholderTextColor="#999"
            autoCapitalize="none"
            clearButtonMode="while-editing"
            returnKeyType="search"
          />
        </View>
      )}
      <FlatList
        data={filteredData}
        keyExtractor={item => item.taxon.id.toString()}
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={OCEAN_BLUE} />
              <Text style={[styles.hint, isDark && styles.hintDark]}>
                Searching for species near you…
              </Text>
            </View>
          ) : error ? (
            <View style={styles.center}>
              <Ionicons name="cloud-offline-outline" size={48} color="#aaa" />
              <Text style={[styles.hint, isDark && styles.hintDark]}>
                Could not load species. Check your connection.
              </Text>
              <TouchableOpacity onPress={() => refetch()} style={styles.retryBtn}>
                <Text style={styles.retryText}>Try again</Text>
              </TouchableOpacity>
            </View>
          ) : query.trim().length > 0 ? (
            <View style={styles.center}>
              <Ionicons name="search-outline" size={48} color="#aaa" />
              <Text style={[styles.hint, isDark && styles.hintDark]}>
                No nearby species match "{query}"
              </Text>
            </View>
          ) : (
            <View style={styles.center}>
              <Ionicons name="fish-outline" size={48} color="#aaa" />
              <Text style={[styles.hint, isDark && styles.hintDark]}>
                No marine species found nearby. Try a larger radius.
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => <SpeciesCard item={item} />}
        contentContainerStyle={styles.list}
        keyboardDismissMode="on-drag"
      />
      <LocationPickerModal visible={showPicker} onClose={() => setShowPicker(false)} isManual={isManual} gpsLocation={gpsLocation} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f8fa' },
  containerDark: { backgroundColor: '#0A1628' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerLeft: { flex: 1 },
  title: { fontSize: 28, fontWeight: '700', color: '#111' },
  textDark: { color: '#fff' },
  subtitle: { fontSize: 14, color: '#666', marginTop: 2 },
  locationBtn: { alignItems: 'center', paddingLeft: 16, paddingVertical: 4, maxWidth: 88 },
  locationBtnLabel: { fontSize: 11, color: '#555', marginTop: 3, textAlign: 'center' },
  locationBtnLabelDark: { color: '#aaa' },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  searchBarDark: { backgroundColor: '#112240' },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 15, color: '#111' },
  searchInputDark: { color: '#fff' },
  list: { paddingHorizontal: 16, paddingBottom: 24, flexGrow: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: 12 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#111' },
  hint: { fontSize: 14, color: '#666', textAlign: 'center', paddingHorizontal: 32 },
  hintDark: { color: '#aaa' },
  setLocationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: OCEAN_BLUE,
    borderRadius: 24,
  },
  setLocationText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  setLocationBtnOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: OCEAN_BLUE,
  },
  setLocationTextOutline: { color: OCEAN_BLUE, fontWeight: '600', fontSize: 15 },
  retryBtn: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: OCEAN_BLUE,
    borderRadius: 20,
  },
  retryText: { color: '#fff', fontWeight: '600' },
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
  cardImagePlaceholder: {
    backgroundColor: '#e8eff5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: { flex: 1, padding: 12, justifyContent: 'center', gap: 3 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  commonName: { fontSize: 15, fontWeight: '600', color: '#111', flex: 1 },
  sciName: { fontSize: 12, color: '#888', fontStyle: 'italic' },
  count: { fontSize: 12, color: OCEAN_BLUE, fontWeight: '500' },
  // Modal
  modalContainer: { flex: 1, backgroundColor: '#f5f8fa', padding: 20, gap: 12 },
  modalDark: { backgroundColor: '#0A1628' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontSize: 22, fontWeight: '700', color: '#111' },
  modalHint: { fontSize: 14, color: '#666' },
  pickerWrapper: { flex: 1, borderRadius: 12, overflow: 'hidden' },
  pickedRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pickedName: { fontSize: 14, color: '#333', flex: 1 },
  gpsLegendRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  gpsDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#4285F4',
    borderWidth: 2,
    borderColor: '#fff',
  },
  gpsLegendText: { fontSize: 13, color: '#666' },
  confirmBtn: {
    backgroundColor: OCEAN_BLUE,
    borderRadius: 24,
    paddingVertical: 14,
    alignItems: 'center',
  },
  confirmBtnDisabled: { backgroundColor: '#aac8d6' },
  confirmText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  useGpsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  useGpsText: { color: OCEAN_BLUE, fontWeight: '600', fontSize: 14 },
});
