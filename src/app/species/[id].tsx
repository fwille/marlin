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
  Alert,
} from 'react-native';
import { ZoomableImage } from '@/components/ZoomableImage';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';
import { persistSightingPhoto, deleteSightingPhoto } from '@/lib/photoStorage';
import { getTaxon, getRecentObservations, getMonthlyHistogram, getWikipediaSummary, getIucnStatus, HAS_IUCN_TOKEN } from '@/api/inaturalist';
import { useLifelist } from '@/store/lifelist';
import { useLocation } from '@/hooks/useLocation';
import { getTaxonPhotoUrl, INatTaxon, INatConservationStatus, MonthlyHistogram } from '@/types';
import LocationPicker, { PickedLocation } from '@/components/LocationPicker';
import DistributionMap from '@/components/DistributionMap';

const OCEAN_BLUE = '#006994';
const MONTHS = ['J','F','M','A','M','J','J','A','S','O','N','D'];
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const CHART_H = 100;
const YAXIS_W = 36;

function likelihood(v: number, max: number): string | null {
  if (v === 0) return 'Not recorded';
  // Suppress relative labels when the chart is based on very few observations —
  // "Very common" is misleading if the peak month only has 5 sightings.
  if (max < 30) return null;
  const pct = v / max;
  if (pct > 0.66) return 'Very common';
  if (pct > 0.33) return 'Common';
  if (pct > 0.1) return 'Occasionally seen';
  return 'Rarely seen';
}

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
  const currentMonth = new Date().getMonth(); // 0-indexed
  const [selected, setSelected] = useState(currentMonth);

  const values = MONTHS.map((_, i) => histogram[String(i + 1)] ?? 0);
  const max = Math.max(...values, 1);
  const gridColor = isDark ? '#1e3050' : '#e8ecf0';
  const labelColor = isDark ? '#556' : '#aaa';

  const ticks = [
    { label: fmtCount(max), y: 0 },
    { label: fmtCount(Math.round(max / 2)), y: CHART_H / 2 },
    { label: '0', y: CHART_H - 1 },
  ];

  const likelihoodLabel = likelihood(values[selected], max);

  return (
    <View>
      {/* Tooltip row — always visible, shows selected month */}
      <View style={{ paddingLeft: YAXIS_W, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? '#fff' : '#111' }}>
          {MONTH_NAMES[selected]}{selected === currentMonth ? ' · now' : ''}
        </Text>
        <View style={{ backgroundColor: OCEAN_BLUE, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
          <Text style={{ fontSize: 11, color: '#fff', fontWeight: '600' }}>
            {fmtCount(values[selected])} obs
          </Text>
        </View>
        {likelihoodLabel !== null && (
          <Text style={{ fontSize: 12, color: isDark ? '#aaa' : '#666' }}>
            {likelihoodLabel}
          </Text>
        )}
      </View>

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
              const isCurrent = i === currentMonth;
              const isSelected = i === selected;
              return (
                <TouchableOpacity
                  key={i}
                  activeOpacity={0.7}
                  onPress={() => setSelected(i)}
                  style={{ flex: 1, height: CHART_H, justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: 1 }}>
                  {/* Current month column highlight */}
                  {isCurrent && (
                    <View
                      pointerEvents="none"
                      style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: isDark ? '#0a2818' : '#edfbf3', borderRadius: 4 }}
                    />
                  )}
                  <View style={{
                    width: '75%',
                    height: Math.max(h, 2),
                    backgroundColor: isSelected && isCurrent ? '#26d07c' : isSelected ? '#2ab4e8' : isCurrent ? '#2ecc71' : OCEAN_BLUE,
                    borderRadius: 2,
                    opacity: v === 0 ? (isSelected ? 0.4 : 0.15) : 1,
                  }} />
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Month labels */}
          <View style={{ flexDirection: 'row', marginTop: 4 }}>
            {MONTHS.map((m, i) => {
              const isCurrent = i === currentMonth;
              const isSelected = i === selected;
              return (
                <View key={i} style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={{
                    fontSize: 9,
                    color: isCurrent ? '#2ecc71' : isSelected ? OCEAN_BLUE : labelColor,
                    fontWeight: (isCurrent || isSelected) ? '700' : '400',
                  }}>
                    {m}
                  </Text>
                  {isCurrent && (
                    <View style={{ width: 3, height: 3, borderRadius: 2, backgroundColor: '#2ecc71', marginTop: 1 }} />
                  )}
                </View>
              );
            })}
          </View>
        </View>
      </View>
    </View>
  );
}

function AncestorChip({ label, ancestorId }: { label: string; ancestorId: number }) {
  return (
    <TouchableOpacity
      style={styles.chip}
      onPress={() => router.push({ pathname: '/(tabs)/search', params: { ancestorId: ancestorId.toString(), ancestorLabel: label } })}
      activeOpacity={0.7}>
      <Text style={styles.chipText}>{label}</Text>
    </TouchableOpacity>
  );
}

const IUCN_COLORS: Record<string, { bg: string; text: string }> = {
  EX: { bg: '#111', text: '#fff' },
  EW: { bg: '#542788', text: '#fff' },
  CR: { bg: '#d73027', text: '#fff' },
  EN: { bg: '#f46d43', text: '#fff' },
  VU: { bg: '#fdae61', text: '#333' },
  NT: { bg: '#fee090', text: '#333' },
  LC: { bg: '#4dac26', text: '#fff' },
  DD: { bg: '#aaa', text: '#fff' },
};

function ConservationBadge({ status, taxonName, isDark }: { status: INatConservationStatus; taxonName: string; isDark: boolean }) {
  const code = status.status?.toUpperCase() ?? 'DD';
  const colors = IUCN_COLORS[code] ?? IUCN_COLORS.DD;
  const label = status.status_name
    ? status.status_name.charAt(0).toUpperCase() + status.status_name.slice(1)
    : code;
  const url = status.url ?? `https://www.iucnredlist.org/search?query=${encodeURIComponent(taxonName)}`;
  return (
    <TouchableOpacity
      style={[styles.conservationRow, isDark && styles.conservationRowDark]}
      onPress={() => WebBrowser.openBrowserAsync(url)}
      activeOpacity={0.75}>
      <View style={[styles.iucnBadge, { backgroundColor: colors.bg }]}>
        <Text style={[styles.iucnCode, { color: colors.text }]}>{code}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.iucnLabel, isDark && styles.textDark]}>{label}</Text>
        <Text style={styles.iucnAuthority}>{status.authority ?? 'IUCN Red List'} · tap to view ↗</Text>
      </View>
      <Ionicons name="open-outline" size={16} color={isDark ? '#556' : '#bbb'} />
    </TouchableOpacity>
  );
}

interface SightingData {
  notes: string;
  locationName: string;
  coords: PickedLocation | null;
  photoUris: string[];
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
  const [photoUris, setPhotoUris] = useState<string[]>([]);
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  // Seed map at user location when the modal opens — `initialLocation` arrives
  // asynchronously (GPS can resolve after the modal is already open), so this
  // genuinely needs to react to it rather than be computed during render.
  useEffect(() => {
    if (visible && initialLocation && !coords) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCoords({ lat: initialLocation.lat, lng: initialLocation.lng });
    }
  }, [visible, initialLocation, coords]);

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
      allowsMultipleSelection: true,
    });
    if (!result.canceled) {
      const persisted = await Promise.all(result.assets.map(a => persistSightingPhoto(a.uri)));
      setPhotoUris(prev => [...prev, ...persisted]);
    }
  };

  const handleAdd = () => {
    onAdd({ notes: notes.trim(), locationName: locationName.trim(), coords, photoUris });
    setNotes('');
    setLocationName('');
    setCoords(null);
    setPhotoUris([]);
  };

  // Discard any photos staged but never submitted, so they don't linger as orphans.
  const handleClose = () => {
    photoUris.forEach(deleteSightingPhoto);
    setPhotoUris([]);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={[styles.modalContainer, isDark && styles.modalContainerDark]}>
        <View style={styles.modalHeader}>
          <Text style={[styles.modalTitle, isDark && styles.textDark]}>Log Sighting</Text>
          <TouchableOpacity onPress={handleClose}>
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
              <Text style={styles.photoBtnText}>Add from gallery</Text>
            </TouchableOpacity>
            {photoUris.map((uri, i) => (
              <View key={uri} style={styles.photoPreviewWrapper}>
                <Image source={{ uri }} style={styles.photoPreview} />
                <TouchableOpacity
                  style={styles.photoRemove}
                  onPress={() => {
                    deleteSightingPhoto(uri);
                    setPhotoUris(prev => prev.filter((_, j) => j !== i));
                  }}>
                  <Ionicons name="close-circle" size={20} color="#cc4444" />
                </TouchableOpacity>
              </View>
            ))}
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
  const insets = useSafeAreaInsets();

  const [modalVisible, setModalVisible] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const { location } = useLocation();

  const { data: taxon, isLoading, error } = useQuery({
    queryKey: ['taxon', taxonId],
    queryFn: () => getTaxon(taxonId),
  });

  const { data: nearbyObs } = useQuery({
    queryKey: ['obs', taxonId, location?.lat, location?.lng],
    queryFn: () => getRecentObservations(taxonId, location?.lat, location?.lng),
    enabled: !!taxon,
    staleTime: 5 * 60 * 1000,
  });

  // When a location-filtered search returns nothing, fall back to global sightings
  const nearbyWasEmpty = !!location && nearbyObs !== undefined && nearbyObs.length === 0;
  const { data: globalObs } = useQuery({
    queryKey: ['obs-global', taxonId],
    queryFn: () => getRecentObservations(taxonId),
    enabled: nearbyWasEmpty,
    staleTime: 5 * 60 * 1000,
  });
  const recentObs = nearbyWasEmpty ? globalObs : nearbyObs;
  const obsIsGlobal = nearbyWasEmpty && !!globalObs?.length;

  const { data: histogram } = useQuery({
    queryKey: ['histogram', taxonId, location?.lat, location?.lng],
    queryFn: () => getMonthlyHistogram(taxonId, location?.lat, location?.lng),
    enabled: !!taxon,
    staleTime: 60 * 60 * 1000,
  });

  const { data: wikiSummary, isError: wikiError } = useQuery({
    queryKey: ['wiki', 'v3', taxon?.wikipedia_url],
    queryFn: () => getWikipediaSummary(taxon!.wikipedia_url!),
    enabled: !!taxon?.wikipedia_url,
    staleTime: 24 * 60 * 60 * 1000,
    retry: 1,
  });

  // IUCN Red List fallback — only runs when iNaturalist has no status and token is set.
  const { data: iucnStatus } = useQuery({
    queryKey: ['iucn', taxon?.name],
    queryFn: () => getIucnStatus(taxon!.name),
    enabled: !!taxon && !taxon.conservation_status && HAS_IUCN_TOKEN,
    staleTime: 7 * 24 * 60 * 60 * 1000,
    retry: 0,
  });

  const conservationStatus = taxon?.conservation_status ?? iucnStatus ?? null;

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

  const handleAdd = ({ notes, locationName, coords, photoUris }: SightingData) => {
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
      photoUris: photoUris.length > 0 ? photoUris : undefined,
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
      <ScrollView
        style={[styles.container, isDark && styles.containerDark]}
        contentContainerStyle={styles.scroll}>

        {/* Cover photo with back button overlay */}
        <View>
          {coverPhoto ? (
            <TouchableOpacity activeOpacity={0.92} onPress={() => setLightboxUrl(coverPhoto)}>
              <Image source={{ uri: coverPhoto }} style={styles.cover} resizeMode="cover" />
              {/* Expand hint */}
              <View style={styles.coverExpandHint} pointerEvents="none">
                <Ionicons name="expand-outline" size={18} color="rgba(255,255,255,0.85)" />
              </View>
            </TouchableOpacity>
          ) : (
            <View style={[styles.cover, styles.coverPlaceholder]}>
              <Ionicons name="fish" size={64} color="#bbb" />
            </View>
          )}
          {/* Custom back button — always visible regardless of photo brightness */}
          <TouchableOpacity
            style={[styles.coverBackBtn, { top: insets.top + 8 }]}
            onPress={() => router.back()}
            hitSlop={8}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
        </View>

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
              <AncestorChip
                label={`Class: ${taxonClass.preferred_common_name ?? taxonClass.name}`}
                ancestorId={taxonClass.id}
              />
            )}
            {order && (
              <AncestorChip
                label={`Order: ${order.preferred_common_name ?? order.name}`}
                ancestorId={order.id}
              />
            )}
            {family && (
              <AncestorChip
                label={`Family: ${family.preferred_common_name ?? family.name}`}
                ancestorId={family.id}
              />
            )}
          </View>

          {taxon.observations_count !== undefined && (
            <Text style={styles.stat}>
              {taxon.observations_count.toLocaleString()} observations recorded worldwide
            </Text>
          )}

          {/* Conservation status */}
          {conservationStatus && (
            <ConservationBadge status={conservationStatus} taxonName={taxon.name} isDark={isDark} />
          )}

          {/* Description — prefer live Wikipedia fetch, then iNat description, then cached summary.
              iNaturalist stores '...' as a placeholder; filter those out.
              Show the section whenever a Wikipedia URL exists, even while the fetch is in flight. */}
          {(() => {
            const hasWikiUrl = !!taxon.wikipedia_url;
            const inatSummary = taxon.wikipedia_summary
              ? stripHtml(taxon.wikipedia_summary)
              : null;
            const text = wikiSummary
              || taxon.description
              || (inatSummary && inatSummary.length > 20 ? inatSummary : null);
            // Nothing to show at all
            if (!text && !hasWikiUrl) return null;
            // Wiki fetch is in-flight (no text yet, no error)
            const wikiLoading = hasWikiUrl && !wikiSummary && !wikiError;
            return (
              <>
                <Text style={[styles.sectionTitle, isDark && styles.textDark]}>About</Text>
                {text ? (
                  <Text style={[styles.description, isDark && styles.descriptionDark]}>{text}</Text>
                ) : wikiLoading ? (
                  <ActivityIndicator
                    size="small"
                    color={OCEAN_BLUE}
                    style={{ alignSelf: 'flex-start', marginVertical: 4 }}
                  />
                ) : null}
                {hasWikiUrl && (
                  <TouchableOpacity onPress={() => WebBrowser.openBrowserAsync(taxon.wikipedia_url!)}>
                    <Text style={styles.wikiLink}>Source: Wikipedia ↗</Text>
                  </TouchableOpacity>
                )}
              </>
            );
          })()}

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
          <DistributionMap taxonId={taxonId} userLat={location?.lat} userLng={location?.lng} />

          {/* Recent observations */}
          {recentObs && recentObs.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, isDark && styles.textDark]}>
                {obsIsGlobal ? 'Recent Sightings Worldwide' : location ? 'Recent Nearby Sightings' : 'Recent Sightings'}
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
                <TouchableOpacity
                  key={s.id}
                  style={[styles.mySighting, isDark && styles.mySightingDark]}
                  onPress={() => router.push(`/sighting/${s.id}`)}>
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
                  <Ionicons name="chevron-forward" size={16} color={isDark ? '#555' : '#ccc'} />
                </TouchableOpacity>
              ))}
            </>
          )}
          {/* Attribution */}
          <TouchableOpacity
            onPress={() => WebBrowser.openBrowserAsync(`https://www.inaturalist.org/taxa/${taxon.id}`)}
            style={styles.attribution}>
            <Text style={styles.attributionText}>
              Species data from iNaturalist · © contributors, CC BY-NC
            </Text>
          </TouchableOpacity>
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
        <View style={styles.lightboxBackdrop}>
          {lightboxUrl && (
            <ZoomableImage key={lightboxUrl} uri={lightboxUrl} />
          )}
          <TouchableOpacity style={styles.lightboxClose} onPress={() => setLightboxUrl(null)}>
            <Ionicons name="close-circle" size={32} color="#fff" />
          </TouchableOpacity>
        </View>
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
  coverExpandHint: {
    position: 'absolute', bottom: 10, right: 10,
    backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 16, padding: 6,
  },
  coverBackBtn: {
    position: 'absolute', left: 14,
    backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 20, padding: 8,
    zIndex: 10,
  },
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
  conservationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 10,
    marginTop: 4,
  },
  conservationRowDark: { backgroundColor: '#112240' },
  iucnBadge: {
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minWidth: 44,
    alignItems: 'center',
  },
  iucnCode: { fontSize: 15, fontWeight: '800', letterSpacing: 0.5 },
  iucnLabel: { fontSize: 14, fontWeight: '600', color: '#111' },
  iucnAuthority: { fontSize: 11, color: '#888', marginTop: 1 },
  attribution: { marginTop: 20, alignItems: 'center', paddingBottom: 8 },
  attributionText: { fontSize: 11, color: '#aaa', textAlign: 'center' },
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
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
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
