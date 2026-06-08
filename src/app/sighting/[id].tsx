import { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  Modal,
  TextInput,
  Alert,
  StyleSheet,
  FlatList,
  Dimensions,
} from 'react-native';
import { ZoomableImage } from '@/components/ZoomableImage';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { persistSightingPhoto, deleteSightingPhoto } from '@/lib/photoStorage';
import { useLifelist } from '@/store/lifelist';
import LocationPicker, { PickedLocation } from '@/components/LocationPicker';

const OCEAN_BLUE = '#006994';
const { width: SCREEN_WIDTH } = Dimensions.get('window');

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString(undefined, {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

export default function SightingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const sightingId = parseInt(id, 10);
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  const sightings = useLifelist(s => s.sightings);
  const updateSighting = useLifelist(s => s.update);
  const removeSighting = useLifelist(s => s.remove);

  const sighting = useMemo(
    () => sightings.find(s => s.id === sightingId) ?? null,
    [sightings, sightingId]
  );

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [draftNotes, setDraftNotes] = useState('');

  const [locationCoords, setLocationCoords] = useState<PickedLocation | null>(
    sighting?.lat != null && sighting?.lng != null
      ? { lat: sighting.lat, lng: sighting.lng, name: sighting.locationName }
      : null
  );
  const [locationName, setLocationName] = useState(sighting?.locationName ?? '');

  const photos = useMemo(() => sighting?.photoUris ?? [], [sighting?.photoUris]);

  // Detect which local photos no longer exist on this device (e.g. after a backup restore).
  const brokenIndices = useMemo(() => new Set(
    photos
      .map((uri, i) => ({ uri, i }))
      .filter(({ uri }) => uri.startsWith('file://') && !new File(uri).exists)
      .map(({ i }) => i)
  ), [photos]);

  // lightboxPhotos contains only viewable (non-broken) photos.
  // lightboxToGallery[lightboxIndex] gives the original photos[] index (needed for remove).
  const lightboxPhotos = useMemo(() => photos.filter((_, i) => !brokenIndices.has(i)), [photos, brokenIndices]);
  const lightboxToGallery = useMemo(() => photos.map((_, i) => i).filter(i => !brokenIndices.has(i)), [photos, brokenIndices]);
  const galleryToLightbox = useMemo(() => {
    const map = new Map<number, number>();
    let li = 0;
    photos.forEach((_, i) => { if (!brokenIndices.has(i)) map.set(i, li++); });
    return map;
  }, [photos, brokenIndices]);

  const handleLocationChange = useCallback((loc: PickedLocation) => {
    setLocationCoords(loc);
    if (loc.name) setLocationName(loc.name);
  }, []);

  const handleSaveLocation = () => {
    if (!sighting) return;
    updateSighting(sighting.id, {
      lat: locationCoords?.lat ?? null,
      lng: locationCoords?.lng ?? null,
      locationName: locationName || locationCoords?.name || null,
    });
    setShowLocationModal(false);
  };

  const handleSaveNotes = () => {
    if (!sighting) return;
    updateSighting(sighting.id, { notes: draftNotes.trim() || null });
    setEditingNotes(false);
  };

  const handleAddPhotos = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow Marlin to access your photos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsMultipleSelection: true,
    });
    if (!result.canceled && sighting) {
      const persisted = await Promise.all(result.assets.map(a => persistSightingPhoto(a.uri)));
      const merged = [...(sighting.photoUris ?? []), ...persisted];
      updateSighting(sighting.id, { photoUris: merged });
    }
  };

  const handleRemovePhoto = (index: number) => {
    if (!sighting) return;
    Alert.alert('Remove photo?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          const removedUri = (sighting.photoUris ?? [])[index];
          const updated = (sighting.photoUris ?? []).filter((_, i) => i !== index);
          updateSighting(sighting.id, { photoUris: updated });
          if (removedUri) deleteSightingPhoto(removedUri);
          if (lightboxIndex !== null) setLightboxIndex(null);
        },
      },
    ]);
  };

  const handleRelinkPhoto = async (index: number) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow Marlin to access your photos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (!result.canceled && sighting) {
      const persisted = await persistSightingPhoto(result.assets[0].uri);
      const updated = [...(sighting.photoUris ?? [])];
      updated[index] = persisted;
      updateSighting(sighting.id, { photoUris: updated });
    }
  };

  const handleDelete = () => {
    if (!sighting) return;
    Alert.alert(
      'Delete sighting?',
      `Remove ${sighting.commonName ?? sighting.scientificName} from your life list?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            (sighting.photoUris ?? []).forEach(deleteSightingPhoto);
            removeSighting(sighting.id);
            router.back();
          },
        },
      ]
    );
  };

  if (!sighting) {
    return (
      <SafeAreaView style={[styles.container, isDark && styles.containerDark]}>
        <View style={styles.notFound}>
          <Text style={[styles.notFoundText, isDark && styles.textDark]}>Sighting not found.</Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={20} color={OCEAN_BLUE} />
            <Text style={styles.backBtnText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, isDark && styles.containerDark]} edges={['top']}>
      {/* Nav bar */}
      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.navBack} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={isDark ? '#fff' : '#111'} />
        </TouchableOpacity>
        <Text style={[styles.navTitle, isDark && styles.textDark]} numberOfLines={1}>
          {sighting.commonName ?? sighting.scientificName}
        </Text>
        <TouchableOpacity onPress={handleDelete} hitSlop={8}>
          <Ionicons name="trash-outline" size={22} color="#cc4444" />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* Photo gallery */}
        {photos.length > 0 ? (
          <View style={styles.gallerySection}>
            <FlatList
              horizontal
              data={photos}
              keyExtractor={(_, i) => i.toString()}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.galleryList}
              renderItem={({ item, index }) => {
                const broken = brokenIndices.has(index);
                return (
                  <TouchableOpacity
                    onPress={() => broken ? handleRelinkPhoto(index) : setLightboxIndex(galleryToLightbox.get(index) ?? 0)}
                    activeOpacity={0.85}>
                    {broken ? (
                      <View style={[styles.galleryThumb, styles.galleryBroken, isDark && styles.galleryBrokenDark]}>
                        <Ionicons name="image-outline" size={28} color="#aaa" />
                        <Text style={styles.galleryBrokenLabel}>Re-attach</Text>
                      </View>
                    ) : (
                      <Image source={{ uri: item }} style={styles.galleryThumb} />
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        ) : sighting.imageUrl ? (
          <TouchableOpacity onPress={() => setLightboxIndex(0)} activeOpacity={0.85}>
            <Image source={{ uri: sighting.imageUrl }} style={styles.heroCover} />
          </TouchableOpacity>
        ) : (
          <View style={[styles.heroCover, styles.heroPlaceholder]}>
            <Ionicons name="fish" size={56} color="#aaa" />
          </View>
        )}

        {/* Add photo buttons */}
        <View style={styles.photoActions}>
          <TouchableOpacity style={[styles.photoBtn, isDark && styles.photoBtnDark]} onPress={handleAddPhotos}>
            <Ionicons name="image-outline" size={18} color={OCEAN_BLUE} />
            <Text style={styles.photoBtnText}>Add from gallery</Text>
          </TouchableOpacity>
        </View>

        {/* Species link */}
        <TouchableOpacity
          style={[styles.card, isDark && styles.cardDark, styles.speciesRow]}
          onPress={() => router.push(`/species/${sighting.speciesId}`)}>
          <View style={styles.speciesInfo}>
            <Text style={[styles.sectionLabel, isDark && styles.labelDark]}>Species</Text>
            <Text style={[styles.speciesName, isDark && styles.textDark]}>
              {sighting.commonName ?? sighting.scientificName}
            </Text>
            {sighting.commonName && (
              <Text style={styles.sciName}>{sighting.scientificName}</Text>
            )}
          </View>
          <Ionicons name="chevron-forward" size={20} color={isDark ? '#888' : '#aaa'} />
        </TouchableOpacity>

        {/* Date */}
        <View style={[styles.card, isDark && styles.cardDark]}>
          <Text style={[styles.sectionLabel, isDark && styles.labelDark]}>Date</Text>
          <View style={styles.infoRow}>
            <Ionicons name="calendar-outline" size={16} color="#888" />
            <Text style={[styles.infoText, isDark && styles.textDark]}>{formatDate(sighting.date)}</Text>
          </View>
        </View>

        {/* Location */}
        <View style={[styles.card, isDark && styles.cardDark]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionLabel, isDark && styles.labelDark]}>Location</Text>
            <TouchableOpacity onPress={() => {
              setLocationCoords(
                sighting.lat != null && sighting.lng != null
                  ? { lat: sighting.lat, lng: sighting.lng, name: sighting.locationName }
                  : null
              );
              setLocationName(sighting.locationName ?? '');
              setShowLocationModal(true);
            }} hitSlop={8}>
              <Ionicons name="pencil" size={16} color={OCEAN_BLUE} />
            </TouchableOpacity>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="location-outline" size={16} color="#888" />
            <Text style={[styles.infoText, isDark && styles.textDark]}>
              {sighting.locationName ?? (
                sighting.lat != null ? `${sighting.lat.toFixed(4)}, ${sighting.lng?.toFixed(4)}` : 'No location set'
              )}
            </Text>
          </View>
        </View>

        {/* Notes */}
        <View style={[styles.card, isDark && styles.cardDark]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionLabel, isDark && styles.labelDark]}>Notes</Text>
            {!editingNotes && (
              <TouchableOpacity onPress={() => {
                setDraftNotes(sighting.notes ?? '');
                setEditingNotes(true);
              }} hitSlop={8}>
                <Ionicons name="pencil" size={16} color={OCEAN_BLUE} />
              </TouchableOpacity>
            )}
          </View>
          {editingNotes ? (
            <>
              <TextInput
                style={[styles.notesInput, isDark && styles.notesInputDark]}
                value={draftNotes}
                onChangeText={setDraftNotes}
                placeholder="Depth, behaviour, water conditions…"
                placeholderTextColor="#999"
                multiline
                autoFocus
              />
              <View style={styles.notesBtns}>
                <TouchableOpacity onPress={() => setEditingNotes(false)} style={styles.cancelBtn}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleSaveNotes} style={styles.saveBtn}>
                  <Text style={styles.saveBtnText}>Save</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <Text style={[styles.notesText, isDark && styles.textDark, !sighting.notes && styles.notesPlaceholder]}>
              {sighting.notes ?? 'No notes yet — tap the pencil to add some.'}
            </Text>
          )}
        </View>
      </ScrollView>

      {/* Location edit modal */}
      <Modal visible={showLocationModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={[styles.modalContainer, isDark && styles.modalContainerDark]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, isDark && styles.textDark]}>Edit Location</Text>
            <TouchableOpacity onPress={() => setShowLocationModal(false)}>
              <Ionicons name="close" size={24} color={isDark ? '#fff' : '#333'} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalScroll}>
            <Text style={[styles.fieldLabel, isDark && styles.textDark]}>
              Tap the map to set location
            </Text>
            <LocationPicker value={locationCoords} onChange={handleLocationChange} />
            <TextInput
              style={[styles.notesInput, isDark && styles.notesInputDark, { marginTop: 8 }]}
              value={locationName}
              onChangeText={setLocationName}
              placeholder="Location name (auto-filled from map)"
              placeholderTextColor="#999"
            />
            <TouchableOpacity style={styles.saveBtnFull} onPress={handleSaveLocation}>
              <Ionicons name="checkmark" size={20} color="#fff" />
              <Text style={styles.saveBtnText}>Save Location</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Lightbox */}
      {lightboxIndex !== null && lightboxPhotos.length > 0 && (
        <Modal visible animationType="fade" transparent>
          <View style={styles.lightbox}>
            <TouchableOpacity style={styles.lightboxClose} onPress={() => setLightboxIndex(null)} hitSlop={12}>
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
            <ZoomableImage
              key={lightboxPhotos[lightboxIndex]}
              uri={lightboxPhotos[lightboxIndex]}
            />
            {photos.length > 0 && (
              <View style={styles.lightboxActions}>
                {lightboxIndex > 0 && (
                  <TouchableOpacity onPress={() => setLightboxIndex(i => (i ?? 0) - 1)} hitSlop={12}>
                    <Ionicons name="chevron-back" size={32} color="#fff" />
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => handleRemovePhoto(lightboxToGallery[lightboxIndex])} style={styles.lightboxRemove}>
                  <Ionicons name="trash-outline" size={20} color="#fff" />
                  <Text style={styles.lightboxRemoveText}>Remove</Text>
                </TouchableOpacity>
                {lightboxIndex < lightboxPhotos.length - 1 && (
                  <TouchableOpacity onPress={() => setLightboxIndex(i => (i ?? 0) + 1)} hitSlop={12}>
                    <Ionicons name="chevron-forward" size={32} color="#fff" />
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f8fa' },
  containerDark: { backgroundColor: '#0A1628' },
  textDark: { color: '#fff' },
  labelDark: { color: '#aaa' },

  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  navBack: { padding: 2 },
  navTitle: { flex: 1, fontSize: 18, fontWeight: '600', color: '#111' },

  scroll: { paddingBottom: 40 },

  gallerySection: { marginBottom: 0 },
  galleryList: { paddingHorizontal: 16, gap: 8, paddingVertical: 8 },
  galleryThumb: { width: 120, height: 120, borderRadius: 10, backgroundColor: '#dde6ef' },
  galleryBroken: { alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1, borderStyle: 'dashed', borderColor: '#bbb' },
  galleryBrokenDark: { borderColor: '#334' },
  galleryBrokenLabel: { fontSize: 11, color: '#aaa', fontWeight: '500' },

  heroCover: { width: '100%', height: 220, backgroundColor: '#dde6ef' },
  heroPlaceholder: { alignItems: 'center', justifyContent: 'center' },

  photoActions: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  photoBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#e8f0f8',
    borderWidth: 1,
    borderColor: '#c8daea',
  },
  photoBtnDark: { backgroundColor: '#1a2a40', borderColor: '#2a4060' },
  photoBtnText: { fontSize: 13, color: OCEAN_BLUE, fontWeight: '500' },

  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 16,
    marginTop: 10,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  cardDark: { backgroundColor: '#112240' },

  speciesRow: { flexDirection: 'row', alignItems: 'center' },
  speciesInfo: { flex: 1 },
  speciesName: { fontSize: 16, fontWeight: '600', color: '#111', marginTop: 2 },
  sciName: { fontSize: 12, color: '#888', fontStyle: 'italic', marginTop: 1 },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  sectionLabel: { fontSize: 11, fontWeight: '600', color: '#888', textTransform: 'uppercase', letterSpacing: 0.5 },

  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  infoText: { fontSize: 15, color: '#111' },

  notesText: { fontSize: 14, color: '#333', lineHeight: 20, marginTop: 2 },
  notesPlaceholder: { color: '#999', fontStyle: 'italic' },
  notesInput: {
    borderWidth: 1,
    borderColor: '#c8d8e8',
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: '#111',
    backgroundColor: '#f5f8fa',
    minHeight: 80,
    textAlignVertical: 'top',
  },
  notesInputDark: { backgroundColor: '#1a2a40', borderColor: '#2a4060', color: '#fff' },
  notesBtns: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 8 },
  cancelBtn: { paddingHorizontal: 16, paddingVertical: 8 },
  cancelBtnText: { color: '#888', fontSize: 14 },
  saveBtn: { backgroundColor: OCEAN_BLUE, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 },
  saveBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },

  saveBtnFull: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: OCEAN_BLUE,
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 16,
  },

  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#444', marginBottom: 6 },

  modalContainer: { flex: 1, backgroundColor: '#f5f8fa' },
  modalContainerDark: { backgroundColor: '#0A1628' },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#dde6ef',
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#111' },
  modalScroll: { padding: 20 },

  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  notFoundText: { fontSize: 16, color: '#333' },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  backBtnText: { color: OCEAN_BLUE, fontSize: 15 },

  lightbox: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightboxClose: { position: 'absolute', top: 52, right: 20, zIndex: 10 },
  lightboxImage: { width: SCREEN_WIDTH, height: SCREEN_WIDTH * 1.2 },
  lightboxActions: {
    position: 'absolute',
    bottom: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 32,
  },
  lightboxRemove: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  lightboxRemoveText: { color: '#fff', fontSize: 14 },
});
