import { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  TextInput,
  Modal,
  ActivityIndicator,
  StyleSheet,
  useColorScheme,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, Stack } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';
import { getTaxon, getRecentObservations, getMonthlyHistogram, getWikipediaSummary } from '@/api/inaturalist';
import { useLifelist } from '@/store/lifelist';
import { useLocation } from '@/hooks/useLocation';
import { getTaxonPhotoUrl, INatTaxon, MonthlyHistogram } from '@/types';
import LocationPicker, { PickedLocation } from '@/components/LocationPicker';
import DistributionMap from '@/components/DistributionMap';

const OCEAN_BLUE = '#006994';
const MONTHS = ['J','F','M','A','M','J','J','A','S','O','N','D'];
const CHART_H = 100;
const YAXIS_W = 36;

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

function fmtCount(n: number): string {
  if (n >= 10000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function SeasonalChart({ histogram, isDark }: { histogram: MonthlyHistogram; isDark: boolean }) {
  const values = MONTHS.map((_, i) => histogram[String(i + 1)] ?? 0);
  const max = Math.max(...values, 1);
  const gridColor = isDark ? '#1e3050' : '#e8ecf0';
  const labelColor = isDark ? '#556' : '#aaa';

  // Three gridlines at top (max), middle (max/2), bottom (0)
  const ticks = [
    { label: fmtCount(max), y: 0 },
    { label: fmtCount(Math.round(max / 2)), y: CHART_H / 2 },
    { label: '0', y: CHART_H - 1 },
  ];

  return (
    <View style={{ flexDirection: 'row' }}>
      {/* Y-axis labels */}
      <View style={{ width: YAXIS_W, height: CHART_H, justifyContent: 'space-between', alignItems: 'flex-end', paddingRight: 5 }}>
        {ticks.map((t, i) => (
          <Text key={i} style={{ fontSize: 9, color: labelColor, lineHeight: 11 }}>
            {t.label}
          </Text>
        ))}
      </View>

      {/* Bar area + month labels */}
      <View style={{ flex: 1 }}>
        <View style={{ height: CHART_H, flexDirection: 'row', position: 'relative' }}>
          {/* Gridlines */}
          {ticks.map((t, i) => (
            <View
              key={i}
              pointerEvents="none"
              style={{ position: 'absolute', left: 0, right: 0, top: t.y, height: 1, backgroundColor: gridColor }}
            />
          ))}

          {/* Bars */}
          {values.map((v, i) => {
            const h = v > 0 ? Math.max((v / max) * CHART_H, 3) : 0;
            return (
              <View key={i} style={{ flex: 1, height: CHART_H, justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: 1 }}>
                <View style={{ width: '75%', height: h, backgroundColor: OCEAN_BLUE, borderRadius: 2, opacity: v === 0 ? 0.15 : 1 }} />
              </View>
            );
          })}
        </View>

        {/* Month labels */}
        <View style={{ flexDirection: 'row', marginTop: 4 }}>
          {MONTHS.map((m, i) => (
            <Text key={i} style={{ flex: 1, textAlign: 'center', fontSize: 9, color: labelColor }}>
              {m}
            </Text>
          ))}
        </View>
      </View>
    </View>
  );
}

function AncestorChip({ label }: { label: string }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipText}>{label}</Text>
    </View>
  );
}

interface SightingData {
  notes: string;
  locationName: string;
  coords: PickedLocation | null;
  photoUri?: string;
}

function AddSightingModal({
  visible,
  taxon,
  initialLocation,
  onClose,
  onAdd,
}: {
  visible: boolean;
  taxon: INatTaxon;
  initialLocation: { lat: number; lng: number } | null;
  onClose: () => void;
  onAdd: (data: SightingData) => void;
}) {
  const [notes, setNotes] = useState('');
  const [locationName, setLocationName] = useState('');
  const [coords, setCoords] = useState<PickedLocation | null>(null);
  const [photoUri, setPhotoUri] = useState<string | undefined>();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  // Seed map at user location when modal opens
  useEffect(() => {
    if (visible && initialLocation && !coords) {
      setCoords({ lat: initialLocation.lat, lng: initialLocation.lng });
    }
  }, [visible, initialLocation]);

  const handleLocationChange = (loc: PickedLocation) => {
    setCoords(loc);
    if (loc.name) setLocationName(loc.name);
  };

  const handlePickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow Marlin to access your photos to attach a sighting image.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsEditing: true,
      aspect: [4, 3],
    });
    if (!result.canceled) setPhotoUri(result.assets[0].uri);
  };

  const handleTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow Marlin to use the camera to photograph sightings.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.7,
      allowsEditing: true,
      aspect: [4, 3],
    });
    if (!result.canceled) setPhotoUri(result.assets[0].uri);
  };

  const handleAdd = () => {
    onAdd({ notes: notes.trim(), locationName: locationName.trim(), coords, photoUri });
    setNotes('');
    setLocationName('');
    setCoords(null);
    setPhotoUri(undefined);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={[styles.modalContainer, isDark && styles.modalContainerDark]}>
        <View style={styles.modalHeader}>
          <Text style={[styles.modalTitle, isDark && styles.textDark]}>Log Sighting</Text>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color={isDark ? '#fff' : '#333'} />
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalScroll}>
          <Text style={[styles.modalSpeciesName, isDark && styles.textDark]}>
            {taxon.preferred_common_name ?? taxon.name}
          </Text>
          <Text style={styles.modalSciName}>{taxon.name}</Text>

          {/* Map location picker */}
          <Text style={[styles.fieldLabel, isDark && styles.textDark]}>
            Location — tap map to pin, drag to adjust
          </Text>
          <LocationPicker value={coords} onChange={handleLocationChange} />

          <TextInput
            style={[styles.input, isDark && styles.inputDark, { marginTop: 8 }]}
            value={locationName}
            onChangeText={setLocationName}
            placeholder="Location name (auto-filled from map)"
            placeholderTextColor="#999"
          />

          {/* Photo */}
          <Text style={[styles.fieldLabel, isDark && styles.textDark]}>Photo (optional)</Text>
          <View style={styles.photoRow}>
            <TouchableOpacity
              style={[styles.photoBtn, isDark && styles.photoBtnDark]}
              onPress={handlePickPhoto}>
              <Ionicons name="image-outline" size={20} color={OCEAN_BLUE} />
              <Text style={styles.photoBtnText}>Gallery</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.photoBtn, isDark && styles.photoBtnDark]}
              onPress={handleTakePhoto}>
              <Ionicons name="camera-outline" size={20} color={OCEAN_BLUE} />
              <Text style={styles.photoBtnText}>Camera</Text>
            </TouchableOpacity>
            {photoUri && (
              <View style={styles.photoPreviewWrapper}>
                <Image source={{ uri: photoUri }} style={styles.photoPreview} />
                <TouchableOpacity
                  style={styles.photoRemove}
                  onPress={() => setPhotoUri(undefined)}>
                  <Ionicons name="close-circle" size={20} color="#cc4444" />
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Notes */}
          <Text style={[styles.fieldLabel, isDark && styles.textDark]}>Notes (optional)</Text>
          <TextInput
            style={[styles.input, styles.inputMulti, isDark && styles.inputDark]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Depth, behaviour, water conditions…"
            placeholderTextColor="#999"
            multiline
            numberOfLines={3}
          />

          <TouchableOpacity style={styles.addBtn} onPress={handleAdd}>
            <Ionicons name="checkmark" size={20} color="#fff" />
            <Text style={styles.addBtnText}>Add to Life List</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

export default function SpeciesDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const taxonId = parseInt(id, 10);
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  const [modalVisible, setModalVisible] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const { location } = useLocation();

  const { data: taxon, isLoading, error } = useQuery({
    queryKey: ['taxon', taxonId],
    queryFn: () => getTaxon(taxonId),
  });

  const { data: recentObs } = useQuery({
    queryKey: ['obs', taxonId, location?.lat, location?.lng],
    queryFn: () => getRecentObservations(taxonId, location?.lat, location?.lng),
    enabled: !!taxon,
    staleTime: 5 * 60 * 1000,
  });

  const { data: histogram } = useQuery({
    queryKey: ['histogram', taxonId, location?.lat, location?.lng],
    queryFn: () => getMonthlyHistogram(taxonId, location?.lat, location?.lng),
    enabled: !!taxon,
    staleTime: 60 * 60 * 1000,
  });

  const { data: wikiSummary } = useQuery({
    queryKey: ['wiki', taxon?.wikipedia_url],
    queryFn: () => getWikipediaSummary(taxon!.wikipedia_url!),
    enabled: !!taxon?.wikipedia_url,
    staleTime: 24 * 60 * 60 * 1000,
  });

  // Select the stable array reference; derive hasSeen/mySightings with useMemo
  // so we don't hand Zustand a selector that returns a new array ref every call
  // (Object.is comparison would fail → infinite re-render loop).
  const sightings = useLifelist(s => s.sightings);
  const hasSeen = useMemo(
    () => sightings.some(s => s.speciesId === taxonId),
    [sightings, taxonId]
  );
  const mySightings = useMemo(
    () => sightings.filter(s => s.speciesId === taxonId),
    [sightings, taxonId]
  );
  const add = useLifelist(s => s.add);

  const handleAdd = ({ notes, locationName, coords, photoUri }: SightingData) => {
    if (!taxon) return;
    add({
      speciesId: taxon.id,
      scientificName: taxon.name,
      commonName: taxon.preferred_common_name,
      lat: coords?.lat ?? location?.lat,
      lng: coords?.lng ?? location?.lng,
      date: new Date().toISOString().split('T')[0],
      notes: notes || undefined,
      imageUrl: getTaxonPhotoUrl(taxon),
      locationName: locationName || coords?.name || undefined,
      photoUri,
    });
    setModalVisible(false);
    Alert.alert('Added!', `${taxon.preferred_common_name ?? taxon.name} added to your life list.`);
  };

  const coverPhoto = taxon
    ? (taxon.taxon_photos?.[0]?.photo.large_url ??
       taxon.taxon_photos?.[0]?.photo.medium_url ??
       getTaxonPhotoUrl(taxon))
    : undefined;

  const family = taxon?.ancestors?.find(a => a.rank === 'family');
  const order = taxon?.ancestors?.find(a => a.rank === 'order');
  const taxonClass = taxon?.ancestors?.find(a => a.rank === 'class');

  if (isLoading) {
    return (
      <View style={[styles.container, isDark && styles.containerDark, styles.center]}>
        <ActivityIndicator size="large" color={OCEAN_BLUE} />
      </View>
    );
  }

  if (error || !taxon) {
    return (
      <View style={[styles.container, isDark && styles.containerDark, styles.center]}>
        <Ionicons name="alert-circle-outline" size={48} color="#aaa" />
        <Text style={[styles.hint, isDark && { color: '#aaa' }]}>Species not found.</Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: taxon.preferred_common_name ?? taxon.name }} />

      <ScrollView
        style={[styles.container, isDark && styles.containerDark]}
        contentContainerStyle={styles.scroll}>

        {/* Cover photo */}
        {coverPhoto ? (
          <Image source={{ uri: coverPhoto }} style={styles.cover} resizeMode="cover" />
        ) : (
          <View style={[styles.cover, styles.coverPlaceholder]}>
            <Ionicons name="fish" size={64} color="#bbb" />
          </View>
        )}

        <View style={styles.body}>
          {/* Names */}
          <Text style={[styles.commonName, isDark && styles.textDark]}>
            {taxon.preferred_common_name ?? taxon.name}
          </Text>
          <Text style={styles.sciName}>{taxon.name}</Text>

          {/* Lifelist button */}
          {hasSeen ? (
            <View style={styles.seenBadge}>
              <Ionicons name="checkmark-circle" size={18} color="#fff" />
              <Text style={styles.seenBadgeText}>
                In your life list · {mySightings.length} sighting
                {mySightings.length !== 1 ? 's' : ''}
              </Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.lifelistBtn, hasSeen && styles.lifelistBtnSeen]}
            onPress={() => setModalVisible(true)}>
            <Ionicons
              name={hasSeen ? 'add-circle-outline' : 'add-circle'}
              size={20}
              color="#fff"
            />
            <Text style={styles.lifelistBtnText}>
              {hasSeen ? 'Log another sighting' : 'Add to Life List'}
            </Text>
          </TouchableOpacity>

          {/* Taxonomy */}
          <Text style={[styles.sectionTitle, isDark && styles.textDark]}>Classification</Text>
          <View style={styles.chipRow}>
            {taxonClass && (
              <AncestorChip label={`Class: ${taxonClass.preferred_common_name ?? taxonClass.name}`} />
            )}
            {order && (
              <AncestorChip label={`Order: ${order.preferred_common_name ?? order.name}`} />
            )}
            {family && (
              <AncestorChip label={`Family: ${family.preferred_common_name ?? family.name}`} />
            )}
            {taxon.iconic_taxon_name && (
              <AncestorChip label={taxon.iconic_taxon_name} />
            )}
          </View>

          {taxon.observations_count !== undefined && (
            <Text style={styles.stat}>
              {taxon.observations_count.toLocaleString()} observations recorded worldwide
            </Text>
          )}

          {/* Description */}
          {(wikiSummary ?? taxon.wikipedia_summary) ? (
            <>
              <Text style={[styles.sectionTitle, isDark && styles.textDark]}>About</Text>
              <Text style={[styles.description, isDark && styles.descriptionDark]}>
                {wikiSummary ?? stripHtml(taxon.wikipedia_summary!)}
              </Text>
              {taxon.wikipedia_url && (
                <Text style={styles.wikiLink}>Source: Wikipedia</Text>
              )}
            </>
          ) : null}

          {/* External links */}
          <View style={styles.linkRow}>
            <TouchableOpacity
              style={styles.linkBtn}
              onPress={() => WebBrowser.openBrowserAsync(`https://www.inaturalist.org/taxa/${taxon.id}`)}>
              <Ionicons name="leaf-outline" size={15} color={OCEAN_BLUE} />
              <Text style={styles.linkBtnText}>View on iNaturalist</Text>
            </TouchableOpacity>
            {taxon.wikipedia_url && (
              <TouchableOpacity
                style={styles.linkBtn}
                onPress={() => WebBrowser.openBrowserAsync(taxon.wikipedia_url!)}>
                <Ionicons name="book-outline" size={15} color={OCEAN_BLUE} />
                <Text style={styles.linkBtnText}>Wikipedia</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Seasonal activity chart */}
          {histogram && Object.keys(histogram).length > 0 && (
            <>
              <Text style={[styles.sectionTitle, isDark && styles.textDark]}>
                {location ? 'Seasonal Activity Near You' : 'Seasonal Activity'}
              </Text>
              <View style={[styles.chartCard, isDark && styles.chartCardDark]}>
                <SeasonalChart histogram={histogram} isDark={isDark} />
              </View>
            </>
          )}

          {/* Distribution map */}
          <Text style={[styles.sectionTitle, isDark && styles.textDark]}>Global Distribution</Text>
          <DistributionMap taxonId={taxonId} />

          {/* Recent observations */}
          {recentObs && recentObs.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, isDark && styles.textDark]}>
                {location ? 'Recent Nearby Sightings' : 'Recent Sightings'}
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {recentObs.map(obs => {
                  const photo = obs.photos?.[0] ?? obs.taxon?.default_photo;
                  const url = photo?.medium_url ?? photo?.url?.replace('square', 'medium');
                  const largeUrl = photo?.large_url ?? url;
                  return (
                    <TouchableOpacity
                      key={obs.id}
                      style={[styles.obsCard, isDark && styles.obsCardDark]}
                      activeOpacity={url ? 0.8 : 1}
                      onPress={() => largeUrl && setLightboxUrl(largeUrl)}>
                      {url ? (
                        <View>
                          <Image source={{ uri: url }} style={styles.obsImage} />
                          <View style={styles.obsZoomHint}>
                            <Ionicons name="expand-outline" size={14} color="#fff" />
                          </View>
                        </View>
                      ) : (
                        <View style={[styles.obsImage, styles.obsImagePlaceholder]}>
                          <Ionicons name="image-outline" size={24} color="#ccc" />
                        </View>
                      )}
                      {obs.observed_on && (
                        <Text style={[styles.obsDate, isDark && { color: '#aaa' }]}>
                          {obs.observed_on}
                        </Text>
                      )}
                      {obs.place_guess && (
                        <Text style={[styles.obsPlace, isDark && { color: '#888' }]} numberOfLines={2}>
                          {obs.place_guess}
                        </Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </>
          )}

          {/* My sightings */}
          {mySightings.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, isDark && styles.textDark]}>My Sightings</Text>
              {mySightings.map(s => (
                <View key={s.id} style={[styles.mySighting, isDark && styles.mySightingDark]}>
                  <Ionicons name="checkmark-circle" size={16} color={OCEAN_BLUE} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.mySightingDate, isDark && styles.textDark]}>
                      {s.date}
                      {s.locationName ? ` · ${s.locationName}` : ''}
                    </Text>
                    {s.notes ? (
                      <Text style={styles.mySightingNotes}>{s.notes}</Text>
                    ) : null}
                  </View>
                </View>
              ))}
            </>
          )}
        </View>
      </ScrollView>

      {taxon && (
        <AddSightingModal
          visible={modalVisible}
          taxon={taxon}
          initialLocation={location}
          onClose={() => setModalVisible(false)}
          onAdd={handleAdd}
        />
      )}

      {/* Lightbox */}
      <Modal
        visible={!!lightboxUrl}
        transparent
        animationType="fade"
        onRequestClose={() => setLightboxUrl(null)}>
        <TouchableOpacity
          style={styles.lightboxBackdrop}
          activeOpacity={1}
          onPress={() => setLightboxUrl(null)}>
          {lightboxUrl && (
            <Image
              source={{ uri: lightboxUrl }}
              style={styles.lightboxImage}
              resizeMode="contain"
            />
          )}
          <TouchableOpacity style={styles.lightboxClose} onPress={() => setLightboxUrl(null)}>
            <Ionicons name="close-circle" size={32} color="#fff" />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f8fa' },
  containerDark: { backgroundColor: '#0A1628' },
  scroll: { paddingBottom: 40 },
  center: { alignItems: 'center', justifyContent: 'center' },
  cover: { width: '100%', height: 260 },
  coverPlaceholder: { backgroundColor: '#dde8f0', alignItems: 'center', justifyContent: 'center' },
  body: { padding: 20, gap: 8 },
  commonName: { fontSize: 26, fontWeight: '700', color: '#111' },
  textDark: { color: '#fff' },
  sciName: { fontSize: 16, color: '#888', fontStyle: 'italic', marginBottom: 4 },
  seenBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#2a7a5a',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  seenBadgeText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  lifelistBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: OCEAN_BLUE,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    justifyContent: 'center',
    marginBottom: 8,
  },
  lifelistBtnSeen: { backgroundColor: '#005577' },
  lifelistBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: '#111', marginTop: 12 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: {
    backgroundColor: '#e0eef5',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  chipText: { fontSize: 13, color: '#006994', fontWeight: '500' },
  stat: { fontSize: 13, color: '#888', marginTop: 8 },
  description: { fontSize: 14, color: '#444', lineHeight: 22 },
  descriptionDark: { color: '#bbb' },
  wikiLink: { fontSize: 12, color: '#aaa', marginTop: 4 },
  linkRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginTop: 4 },
  linkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: OCEAN_BLUE,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  linkBtnText: { fontSize: 13, color: OCEAN_BLUE, fontWeight: '600' },
  chartCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  chartCardDark: { backgroundColor: '#112240' },
  obsCard: {
    width: 140,
    marginRight: 12,
    borderRadius: 10,
    backgroundColor: '#fff',
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  obsCardDark: { backgroundColor: '#112240' },
  obsImage: { width: 140, height: 100 },
  obsImagePlaceholder: { backgroundColor: '#dde', alignItems: 'center', justifyContent: 'center' },
  obsDate: { fontSize: 11, color: '#666', padding: 6, paddingBottom: 2, fontWeight: '500' },
  obsPlace: { fontSize: 11, color: '#999', paddingHorizontal: 6, paddingBottom: 6 },
  obsZoomHint: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 12,
    padding: 3,
  },
  lightboxBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  lightboxImage: { width: '100%', height: '80%' },
  lightboxClose: { position: 'absolute', top: 48, right: 20 },
  mySighting: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    alignItems: 'flex-start',
  },
  mySightingDark: { backgroundColor: '#112240' },
  mySightingDate: { fontSize: 13, fontWeight: '600', color: '#333' },
  mySightingNotes: { fontSize: 12, color: '#888', marginTop: 2 },
  hint: { fontSize: 14, color: '#888', textAlign: 'center', marginTop: 12 },
  // Modal
  modalContainer: {
    flex: 1,
    backgroundColor: '#f5f8fa',
  },
  modalContainerDark: { backgroundColor: '#0A1628' },
  modalScroll: { padding: 20, gap: 8, paddingBottom: 40 },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#111' },
  modalSpeciesName: { fontSize: 18, fontWeight: '600', color: '#111' },
  modalSciName: { fontSize: 14, color: '#888', fontStyle: 'italic', marginBottom: 4 },
  fieldLabel: { fontSize: 14, fontWeight: '600', color: '#333', marginTop: 10, marginBottom: 4 },
  input: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: '#111',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  inputDark: { backgroundColor: '#112240', borderColor: '#2a4060', color: '#fff' },
  inputMulti: { minHeight: 72, textAlignVertical: 'top' },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  photoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#e0eef5',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  photoBtnDark: { backgroundColor: '#1a3050' },
  photoBtnText: { color: OCEAN_BLUE, fontSize: 14, fontWeight: '600' },
  photoPreviewWrapper: { position: 'relative' },
  photoPreview: { width: 60, height: 60, borderRadius: 8 },
  photoRemove: { position: 'absolute', top: -6, right: -6 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: OCEAN_BLUE,
    borderRadius: 12,
    padding: 14,
    marginTop: 20,
  },
  addBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
