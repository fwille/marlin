import { useRef, useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Keyboard,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { searchPlaces, shortPlaceName, PlaceResult } from '@/lib/geocodeSearch';

interface Props {
  onSelect: (place: PlaceResult) => void;
  isDark?: boolean;
  placeholder?: string;
  containerStyle?: StyleProp<ViewStyle>;
}

const MIN_CHARS = 3;
const DEBOUNCE_MS = 500;

// A debounced place-name search box with a results dropdown. Pure React Native
// (no map/platform code) so it's shared unchanged across the native and web
// variants of both map components. Callers wire onSelect to their map — fly to
// the result (SightingsMap) or drop the pin there (LocationPicker).
export default function PlaceSearch({
  onSelect,
  isDark,
  placeholder = 'Search for a place…',
  containerStyle,
}: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback((q: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    searchPlaces(q, controller.signal)
      .then(r => {
        if (controller.signal.aborted) return;
        setResults(r);
        setOpen(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
  }, []);

  const onChangeText = useCallback(
    (t: string) => {
      setQuery(t);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      const q = t.trim();
      if (q.length < MIN_CHARS) {
        abortRef.current?.abort();
        setResults([]);
        setOpen(false);
        setLoading(false);
        return;
      }
      debounceRef.current = setTimeout(() => runSearch(q), DEBOUNCE_MS);
    },
    [runSearch]
  );

  useEffect(
    () => () => {
      abortRef.current?.abort();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    []
  );

  const handleSelect = useCallback(
    (p: PlaceResult) => {
      onSelect(p);
      setQuery(shortPlaceName(p.name));
      setResults([]);
      setOpen(false);
      Keyboard.dismiss();
    },
    [onSelect]
  );

  const clear = useCallback(() => {
    abortRef.current?.abort();
    setQuery('');
    setResults([]);
    setOpen(false);
    setLoading(false);
  }, []);

  const showEmpty = open && !loading && results.length === 0 && query.trim().length >= MIN_CHARS;

  return (
    <View style={[styles.wrap, containerStyle]}>
      <View style={[styles.bar, isDark && styles.barDark]}>
        <Ionicons name="location-outline" size={15} color="#888" />
        <TextInput
          style={[styles.input, isDark && styles.textLight]}
          placeholder={placeholder}
          placeholderTextColor="#888"
          value={query}
          onChangeText={onChangeText}
          autoCorrect={false}
          returnKeyType="search"
        />
        {loading ? (
          <ActivityIndicator size="small" color="#888" />
        ) : query.length > 0 ? (
          <TouchableOpacity hitSlop={8} onPress={clear}>
            <Ionicons name="close-circle" size={15} color="#888" />
          </TouchableOpacity>
        ) : null}
      </View>

      {open && results.length > 0 && (
        <View style={[styles.results, isDark && styles.resultsDark]}>
          {results.map((r, i) => (
            <TouchableOpacity
              key={`${r.lat},${r.lng},${i}`}
              style={[styles.row, i > 0 && styles.rowBorder, isDark && styles.rowBorderDark]}
              onPress={() => handleSelect(r)}>
              <Ionicons name="location" size={14} color="#888" style={styles.rowIcon} />
              <Text numberOfLines={2} style={[styles.rowText, isDark && styles.textLight]}>
                {r.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {showEmpty && (
        <View style={[styles.results, isDark && styles.resultsDark]}>
          <Text style={styles.noResult}>No places found</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { zIndex: 20 },
  bar: {
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
  barDark: { backgroundColor: 'rgba(10,22,40,0.95)' },
  input: { flex: 1, fontSize: 14, color: '#111', padding: 0 },
  results: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 6,
    maxHeight: 168,
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  resultsDark: { backgroundColor: '#112240' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e2e8f0' },
  rowBorderDark: { borderTopColor: '#1e3a5f' },
  rowIcon: { marginRight: 8 },
  rowText: { flex: 1, fontSize: 13, color: '#333', lineHeight: 17 },
  noResult: { padding: 12, fontSize: 13, color: '#888' },
  textLight: { color: '#fff' },
});
