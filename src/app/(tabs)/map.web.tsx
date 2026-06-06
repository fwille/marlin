import { useMemo, useRef, useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useLifelist } from '@/store/lifelist';

const OCEAN_BLUE = '#006994';

interface Point {
  lat: number; lng: number;
  name: string; date: string; locationName: string;
  speciesId: number; photoUri: string; imageUrl: string;
}

function buildMapHtml(points: Point[]): string {
  // Embed data as a JSON script tag to avoid any escaping issues.
  const dataJson = JSON.stringify(points)
    .replace(/<\/script>/gi, '<\\/script>'); // prevent early script close

  return `<!DOCTYPE html><html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
<style>
  *{margin:0;padding:0}html,body,#map{width:100%;height:100%}
  .pop-name{font:bold 14px sans-serif;margin-bottom:3px}
  .pop-sub{color:#888;font:12px sans-serif;margin:1px 0}
  .pop-link{color:${OCEAN_BLUE};font:12px sans-serif;cursor:pointer;margin-top:4px}
  .pop-img{width:100%;max-height:70px;object-fit:cover;border-radius:6px;margin-bottom:6px}
</style>
</head>
<body>
<div id="map"></div>
<script id="pts" type="application/json">${dataJson}<\/script>
<script>
  var pts = JSON.parse(document.getElementById('pts').textContent);

  var lats = pts.map(function(p){return p.lat});
  var lngs = pts.map(function(p){return p.lng});
  var minLat=Math.min.apply(null,lats), maxLat=Math.max.apply(null,lats);
  var minLng=Math.min.apply(null,lngs), maxLng=Math.max.apply(null,lngs);

  var map = L.map('map').setView([(minLat+maxLat)/2,(minLng+maxLng)/2],4);
  map.fitBounds([[minLat-1,minLng-1],[maxLat+1,maxLng+1]],{maxZoom:10});

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
    attribution:'\\u00a9 OpenStreetMap'
  }).addTo(map);

  pts.forEach(function(p){
    var img = (p.photoUri||p.imageUrl)
      ? '<img class="pop-img" src="'+(p.photoUri||p.imageUrl)+'">' : '';
    var loc = p.locationName ? '<div class="pop-sub">'+p.locationName+'<\/div>' : '';
    var content =
      '<div style="min-width:150px">'+
      img+
      '<div class="pop-name">'+p.name+'<\/div>'+
      '<div class="pop-sub">'+p.date+'<\/div>'+
      loc+
      '<div class="pop-link" onclick="nav('+p.speciesId+')">View species \\u2192<\/div>'+
      '<\/div>';
    L.marker([p.lat,p.lng]).addTo(map).bindPopup(content);
  });

  function nav(id){
    window.parent.postMessage(JSON.stringify({type:'marlin_nav',id:id}),'*');
  }
<\/script>
</body></html>`;
}

export default function MyMapScreen() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const mapRef = useRef<any>(null);
  const sightings = useLifelist(s => s.sightings);
  const [query, setQuery] = useState('');

  const allPoints = useMemo<Point[]>(
    () =>
      sightings
        .filter(s => s.lat != null && s.lng != null)
        .map(s => ({
          lat: s.lat!,
          lng: s.lng!,
          name: s.commonName ?? s.scientificName,
          date: s.date,
          locationName: s.locationName ?? '',
          speciesId: s.speciesId,
          photoUri: s.photoUri ?? '',
          imageUrl: s.imageUrl ?? '',
        })),
    [sightings]
  );

  const points = useMemo<Point[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allPoints;
    return allPoints.filter(p => p.name.toLowerCase().includes(q));
  }, [allPoints, query]);

  useEffect(() => {
    const el = mapRef.current as HTMLElement | null;
    if (!el || typeof el.appendChild !== 'function' || points.length === 0) return;

    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'width:100%;height:100%;border:none;display:block;';
    iframe.srcdoc = buildMapHtml(points);
    el.appendChild(iframe);

    const handleMessage = (e: MessageEvent) => {
      try {
        const d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        if (d?.type === 'marlin_nav') router.push(`/species/${d.id}`);
      } catch {}
    };
    window.addEventListener('message', handleMessage);

    return () => {
      if (el.contains(iframe)) el.removeChild(iframe);
      window.removeEventListener('message', handleMessage);
    };
  }, [points]);

  return (
    <SafeAreaView style={[styles.container, isDark && styles.dark]}>
      <View style={styles.header}>
        <Text style={[styles.title, isDark && styles.light]}>My Sightings</Text>
        {allPoints.length > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {query.trim() ? `${points.length}/${allPoints.length}` : `${allPoints.length} mapped`}
            </Text>
          </View>
        )}
      </View>

      {allPoints.length > 0 && (
        <View style={[styles.filterBar, isDark && styles.filterBarDark]}>
          <Ionicons name="search" size={15} color="#888" />
          <TextInput
            style={[styles.filterInput, isDark && styles.light]}
            placeholder="Filter by species…"
            placeholderTextColor="#888"
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            autoCapitalize="none"
          />
          {query.length > 0 && (
            <TouchableOpacity hitSlop={8} onPress={() => setQuery('')}>
              <Ionicons name="close-circle" size={15} color="#888" />
            </TouchableOpacity>
          )}
        </View>
      )}

      {points.length === 0 ? (
        <View style={styles.empty}>
          {allPoints.length === 0 ? (
            <>
              <Ionicons name="map-outline" size={64} color="#ccc" />
              <Text style={[styles.emptyTitle, isDark && styles.light]}>No mapped sightings yet</Text>
              <Text style={styles.emptyHint}>
                Log a sighting with a map location and it will appear here.
              </Text>
            </>
          ) : (
            <>
              <Ionicons name="search-outline" size={64} color="#ccc" />
              <Text style={[styles.emptyTitle, isDark && styles.light]}>
                No matches for "{query}"
              </Text>
            </>
          )}
        </View>
      ) : (
        <View ref={mapRef} style={styles.mapArea} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f8fa' },
  dark: { backgroundColor: '#0A1628' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 20, paddingBottom: 8 },
  title: { fontSize: 28, fontWeight: '700', color: '#111' },
  light: { color: '#fff' },
  badge: { backgroundColor: OCEAN_BLUE, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  filterBarDark: { backgroundColor: '#112240' },
  filterInput: { flex: 1, fontSize: 14, color: '#111', padding: 0 },
  mapArea: { flex: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#333' },
  emptyHint: { fontSize: 14, color: '#888', textAlign: 'center', paddingHorizontal: 40 },
});
