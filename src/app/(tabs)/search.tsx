import { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  TextInput,
  StyleSheet,
} from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useSearch } from '@/hooks/useSearch';
import { useLocation } from '@/hooks/useLocation';
import { useNearby } from '@/hooks/useNearby';
import { searchTaxaInAncestor } from '@/api/inaturalist';
import { useLifelist } from '@/store/lifelist';
import { INatTaxon, getTaxonPhotoUrl } from '@/types';

const OCEAN_BLUE = '#006994';

function TaxonCard({ taxon }: { taxon: INatTaxon }) {
  const hasSeen = useLifelist(s => s.hasSeen(taxon.id));
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const photoUrl = getTaxonPhotoUrl(taxon);

  return (
    <TouchableOpacity
      style={[styles.card, isDark && styles.cardDark]}
      onPress={() => router.push(`/species/${taxon.id}`)}>
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
            {taxon.preferred_common_name ?? taxon.name}
          </Text>
          {hasSeen && <Ionicons name="checkmark-circle" size={18} color={OCEAN_BLUE} />}
        </View>
        <Text style={styles.sciName} numberOfLines={1}>
          {taxon.name}
        </Text>
        {taxon.observations_count !== undefined && (
          <Text style={styles.obsCount}>
            {taxon.observations_count.toLocaleString()} observations worldwide
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

export default function SearchScreen() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  const { q, ancestorId: ancestorIdParam, ancestorLabel } = useLocalSearchParams<{
    q?: string;
    ancestorId?: string;
    ancestorLabel?: string;
  }>();

  const ancestorId = ancestorIdParam ? parseInt(ancestorIdParam, 10) : null;

  const [query, setQuery] = useState(q ?? '');

  useEffect(() => {
    if (q) setQuery(q);
  }, [q]);

  // When browsing within an ancestor group, use ancestor-scoped search.
  // Otherwise fall back to the global marine taxa fan-out search.
  const ancestorQuery = useQuery({
    queryKey: ['search-ancestor', ancestorId, query],
    queryFn: () => searchTaxaInAncestor(ancestorId!, query || undefined),
    enabled: ancestorId !== null,
    staleTime: 10 * 60 * 1000,
    placeholderData: prev => prev,
  });

  const globalQuery = useSearch(query);

  const { data, isLoading, isFetching } = ancestorId !== null ? ancestorQuery : globalQuery;

  // "Seen near you" narrows results to species actually recorded in the user's
  // area. Browsing into a classification group (e.g. tapping "Carcharhinidae" on
  // a shark's page) is most useful narrowed this way by default — otherwise
  // you're staring at a worldwide list of dozens of lookalikes. Global search is
  // for discovery though, so it starts unfiltered there; the toggle is available
  // either way.
  const { location } = useLocation();
  const { data: nearbySpecies } = useNearby(location);
  const nearbyIds = useMemo(
    () => new Set((nearbySpecies ?? []).map(n => n.taxon.id)),
    [nearbySpecies]
  );
  const [nearbyOnly, setNearbyOnly] = useState(false);
  useEffect(() => { setNearbyOnly(ancestorId !== null); }, [ancestorId]);

  const nearbyFilterActive = !!location && nearbyOnly;
  const displayData = useMemo(() => {
    if (!nearbyFilterActive) return data ?? [];
    return (data ?? []).filter(t => nearbyIds.has(t.id));
  }, [data, nearbyFilterActive, nearbyIds]);

  return (
    <SafeAreaView style={[styles.container, isDark && styles.containerDark]}>
      <View style={styles.header}>
        <Text style={[styles.title, isDark && styles.textDark]}>Search</Text>
      </View>

      {/* Scope banners: ancestor group (when browsing classifications) and the
          "seen near you" toggle (available whenever a location is known) */}
      {(ancestorId !== null || !!location) && (
        <View style={styles.bannerRow}>
          {ancestorId !== null && ancestorLabel && (
            <View style={[styles.scopeBanner, isDark && styles.scopeBannerDark]}>
              <Ionicons name="filter" size={14} color={OCEAN_BLUE} />
              <Text style={[styles.scopeLabel, isDark && styles.scopeLabelDark]} numberOfLines={1}>
                {ancestorLabel}
              </Text>
              <TouchableOpacity
                hitSlop={8}
                onPress={() => router.setParams({ ancestorId: undefined, ancestorLabel: undefined })}>
                <Ionicons name="close-circle" size={18} color={isDark ? '#556' : '#aaa'} />
              </TouchableOpacity>
            </View>
          )}
          {!!location && (
            <TouchableOpacity
              style={[
                styles.scopeBanner,
                isDark && styles.scopeBannerDark,
                nearbyFilterActive && styles.scopeBannerActive,
              ]}
              onPress={() => setNearbyOnly(v => !v)}>
              <Ionicons name="navigate" size={14} color={nearbyFilterActive ? '#fff' : OCEAN_BLUE} />
              <Text
                style={[
                  styles.scopeLabel,
                  isDark && styles.scopeLabelDark,
                  nearbyFilterActive && styles.scopeLabelActive,
                ]}
                numberOfLines={1}>
                Seen near you
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <View style={[styles.searchBar, isDark && styles.searchBarDark]}>
        <Ionicons name="search" size={18} color="#888" style={styles.searchIcon} />
        <TextInput
          style={[styles.searchInput, isDark && styles.searchInputDark]}
          value={query}
          onChangeText={setQuery}
          placeholder={ancestorId ? 'Filter within group…' : 'Search marine species…'}
          placeholderTextColor="#999"
          autoCapitalize="none"
          clearButtonMode="while-editing"
          returnKeyType="search"
        />
        {isFetching && <ActivityIndicator size="small" color={OCEAN_BLUE} />}
      </View>

      <FlatList
        data={displayData}
        keyExtractor={item => item.id.toString()}
        renderItem={({ item }) => <TaxonCard taxon={item} />}
        contentContainerStyle={styles.list}
        keyboardDismissMode="on-drag"
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.empty}>
              <ActivityIndicator size="large" color={OCEAN_BLUE} />
            </View>
          ) : nearbyFilterActive && (data?.length ?? 0) > 0 ? (
            <View style={styles.empty}>
              <Ionicons name="navigate-outline" size={48} color="#ccc" />
              <Text style={[styles.emptyTitle, isDark && styles.textDark]}>
                None seen near you yet
              </Text>
              <Text style={styles.emptyHint}>
                {data!.length} matching {data!.length === 1 ? 'species is' : 'species are'} known, but none {data!.length === 1 ? 'has' : 'have'} been recorded near you.
              </Text>
              <TouchableOpacity onPress={() => setNearbyOnly(false)}>
                <Text style={styles.clearFilterLink}>Show all {data!.length}</Text>
              </TouchableOpacity>
            </View>
          ) : ancestorId !== null ? (
            <View style={styles.empty}>
              <Text style={[styles.emptyHint, isDark && { color: '#aaa' }]}>
                No species found
              </Text>
            </View>
          ) : query.trim().length < 2 ? (
            <View style={styles.empty}>
              <Ionicons name="fish-outline" size={56} color="#ccc" />
              <Text style={[styles.emptyTitle, isDark && styles.textDark]}>
                Discover marine life
              </Text>
              <Text style={styles.emptyHint}>
                Search by common name or scientific name.{'\n'}Includes fish, sharks, marine
                mammals, molluscs and more.
              </Text>
            </View>
          ) : (
            <View style={styles.empty}>
              <Text style={[styles.emptyHint, isDark && { color: '#aaa' }]}>
                No results for "{query}"
              </Text>
            </View>
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f8fa' },
  containerDark: { backgroundColor: '#0A1628' },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  title: { fontSize: 28, fontWeight: '700', color: '#111' },
  textDark: { color: '#fff' },
  bannerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 6,
  },
  scopeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#e0eef5',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  scopeBannerDark: { backgroundColor: '#0d2035' },
  scopeBannerActive: { backgroundColor: OCEAN_BLUE },
  scopeLabel: { fontSize: 13, color: OCEAN_BLUE, fontWeight: '600', flex: 1 },
  scopeLabelDark: { color: '#5ab4d8' },
  scopeLabelActive: { color: '#fff' },
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
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
    gap: 12,
  },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#333' },
  emptyHint: { fontSize: 14, color: '#888', textAlign: 'center', paddingHorizontal: 32 },
  clearFilterLink: { fontSize: 14, color: OCEAN_BLUE, fontWeight: '600', marginTop: 4 },
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
  obsCount: { fontSize: 12, color: '#888' },
});
