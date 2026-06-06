import { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  TextInput,
  StyleSheet,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSearch } from '@/hooks/useSearch';
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
  const [query, setQuery] = useState('');
  const { data, isLoading, isFetching } = useSearch(query);

  return (
    <SafeAreaView style={[styles.container, isDark && styles.containerDark]}>
      <View style={styles.header}>
        <Text style={[styles.title, isDark && styles.textDark]}>Search</Text>
      </View>

      <View style={[styles.searchBar, isDark && styles.searchBarDark]}>
        <Ionicons name="search" size={18} color="#888" style={styles.searchIcon} />
        <TextInput
          style={[styles.searchInput, isDark && styles.searchInputDark]}
          value={query}
          onChangeText={setQuery}
          placeholder="Search marine species…"
          placeholderTextColor="#999"
          autoCapitalize="none"
          clearButtonMode="while-editing"
          returnKeyType="search"
        />
        {isFetching && <ActivityIndicator size="small" color={OCEAN_BLUE} />}
      </View>

      <FlatList
        data={data ?? []}
        keyExtractor={item => item.id.toString()}
        renderItem={({ item }) => <TaxonCard taxon={item} />}
        contentContainerStyle={styles.list}
        keyboardDismissMode="on-drag"
        ListEmptyComponent={
          query.trim().length < 2 ? (
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
          ) : isLoading ? (
            <View style={styles.empty}>
              <ActivityIndicator size="large" color={OCEAN_BLUE} />
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
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 },
  title: { fontSize: 28, fontWeight: '700', color: '#111' },
  textDark: { color: '#fff' },
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
