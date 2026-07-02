import { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import WebView, { WebViewMessageEvent } from 'react-native-webview';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { File } from 'expo-file-system';
import { useQueries } from '@tanstack/react-query';
import { useLifelist } from '@/store/lifelist';
import { useLocation } from '@/hooks/useLocation';
import { getTaxon } from '@/api/inaturalist';
import { LEAFLET_HEAD } from '@/lib/leafletAssets';
import PlaceSearch from './PlaceSearch';
import { PlaceResult } from '@/lib/geocodeSearch';

const OCEAN_BLUE = '#006994';

// True taxonomic "family" would yield dozens of near-indistinguishable colors
// across a life list — iNaturalist's broad `iconic_taxon_name` groupings (the
// same classes the marine search already filters on) make a far more readable
// map legend, so pins are colored by those instead.
const GROUP_INFO: Record<string, { label: string; color: string }> = {
  Actinopterygii: { label: 'Fish', color: '#1976d2' },
  Chondrichthyes: { label: 'Sharks & Rays', color: '#c62828' },
  Mollusca: { label: 'Mollusks', color: '#f9a825' },
  Cnidaria: { label: 'Jellyfish & Corals', color: '#d81b60' },
  Echinodermata: { label: 'Starfish & Urchins', color: '#00897b' },
  Arthropoda: { label: 'Crabs & Shrimp', color: '#6d4c41' },
  Mammalia: { label: 'Marine Mammals', color: '#6a1b9a' },
  Reptilia: { label: 'Sea Turtles', color: '#2e7d32' },
};
const OTHER_GROUP = { label: 'Other', color: '#757575' };

function groupFor(iconicTaxonName?: string): { label: string; color: string } {
  return (iconicTaxonName && GROUP_INFO[iconicTaxonName]) || OTHER_GROUP;
}

interface Point {
  lat: number; lng: number;
  name: string; date: string; locationName: string;
  sightingId: number; speciesId: number; photoUri: string; imageUrl: string;
  color: string;
}

function buildMapHtml(points: Point[]): string {
  const dataJson = JSON.stringify(points).replace(/<\/script>/gi, '<\\/script>');
  return `<!DOCTYPE html><html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1">
${LEAFLET_HEAD}
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
  var lats=pts.map(function(p){return p.lat}),lngs=pts.map(function(p){return p.lng});
  var map=L.map('map').fitBounds([
    [Math.min.apply(null,lats)-1,Math.min.apply(null,lngs)-1],
    [Math.max.apply(null,lats)+1,Math.max.apply(null,lngs)+1]
  ],{maxZoom:10});
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap'}).addTo(map);

  var allMarkers=[];
  pts.forEach(function(p){
    var img=(p.photoUri||p.imageUrl)?'<img class="pop-img" src="'+(p.photoUri||p.imageUrl)+'">':'';
    var loc=p.locationName?'<div class="pop-sub">'+p.locationName+'<\/div>':'';
    var html='<div style="min-width:150px">'+img+'<div class="pop-name">'+p.name+'<\/div><div class="pop-sub">'+p.date+'<\/div>'+loc+'<div class="pop-link" onclick="navSighting('+p.sightingId+')">View sighting →<\/div><div class="pop-link" style="color:#888" onclick="nav('+p.speciesId+')">View species →<\/div><\/div>';
    var m=L.circleMarker([p.lat,p.lng],{radius:8,weight:2,color:'#fff',fillColor:p.color,fillOpacity:0.9}).addTo(map).bindPopup(html);
    m._speciesName=p.name.toLowerCase();
    allMarkers.push(m);
  });

  window.filterMarkers=function(q){
    q=q.toLowerCase().trim();
    allMarkers.forEach(function(m){
      if(!q||m._speciesName.indexOf(q)!==-1){if(!map.hasLayer(m))map.addLayer(m);}
      else{if(map.hasLayer(m))map.removeLayer(m);}
    });
  };

  window.flyTo=function(lat,lng){map.flyTo([lat,lng],12);};

  function nav(id){window.ReactNativeWebView.postMessage(JSON.stringify({type:'marlin_nav',id:id}));}
  function navSighting(id){window.ReactNativeWebView.postMessage(JSON.stringify({type:'marlin_nav_sighting',id:id}));}
<\/script>
</body></html>`;
}

export default function SightingsMap() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const webViewRef = useRef<WebView>(null);
  const sightings = useLifelist(s => s.sightings);
  const { location } = useLocation();
  const [query, setQuery] = useState('');

  // Look up each species' broad taxonomic group (cached — reuses the species
  // detail screen's ['taxon', id] cache, so most of these resolve instantly).
  const speciesIds = useMemo(() => [...new Set(sightings.map(s => s.speciesId))], [sightings]);
  const taxonResults = useQueries({
    queries: speciesIds.map(id => ({
      queryKey: ['taxon', id],
      queryFn: () => getTaxon(id),
      staleTime: Infinity,
      gcTime: 24 * 60 * 60 * 1000,
    })),
  });
  const groupById = useMemo(() => {
    const map = new Map<number, string | undefined>();
    speciesIds.forEach((id, i) => map.set(id, taxonResults[i]?.data?.iconic_taxon_name));
    return map;
  }, [speciesIds, taxonResults]);

  const legendGroups = useMemo(() => {
    const seen = new Map<string, { label: string; color: string }>();
    for (const id of speciesIds) {
      const g = groupFor(groupById.get(id));
      if (!seen.has(g.label)) seen.set(g.label, g);
    }
    return [...seen.values()];
  }, [speciesIds, groupById]);

  const allPoints = useMemo<Point[]>(
    () =>
      sightings
        .filter(s => s.lat != null && s.lng != null)
        .map(s => ({
          lat: s.lat!, lng: s.lng!,
          name: s.commonName ?? s.scientificName,
          date: s.date,
          locationName: s.locationName ?? '',
          sightingId: s.id,
          speciesId: s.speciesId,
          photoUri: s.photoUris?.[0] ?? '',
          imageUrl: s.imageUrl ?? '',
          color: groupFor(groupById.get(s.speciesId)).color,
        })),
    [sightings, groupById]
  );

  // Resolve local file:// URIs to base64 data URIs so the WebView can display them.
  // The early reset clears stale points from a previous (non-empty) sightings list
  // before the async resolution below kicks in for the new one — genuinely async
  // external work, not state derivable during render.
  const [resolvedPoints, setResolvedPoints] = useState<Point[]>([]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (allPoints.length === 0) { setResolvedPoints([]); return; }
    let cancelled = false;
    (async () => {
      const resolved = await Promise.all(
        allPoints.map(async (p) => {
          const uri = p.photoUri;
          if (!uri || (!uri.startsWith('file://') && !uri.startsWith('content://'))) return p;
          try {
            const b64 = await new File(uri).base64();
            return { ...p, photoUri: `data:image/jpeg;base64,${b64}` };
          } catch {
            return { ...p, photoUri: '' };
          }
        })
      );
      if (!cancelled) setResolvedPoints(resolved);
    })();
    return () => { cancelled = true; };
  }, [allPoints]);

  const mapHtml = useMemo(
    () => resolvedPoints.length > 0 ? buildMapHtml(resolvedPoints) : '',
    [resolvedPoints]
  );

  useEffect(() => {
    webViewRef.current?.injectJavaScript(`filterMarkers(${JSON.stringify(query)}); true;`);
  }, [query]);

  const handleLoad = useCallback(() => {
    if (query) {
      webViewRef.current?.injectJavaScript(`filterMarkers(${JSON.stringify(query)}); true;`);
    }
  }, [query]);

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const d = JSON.parse(event.nativeEvent.data);
      if (d?.type === 'marlin_nav') router.push(`/species/${d.id}`);
      if (d?.type === 'marlin_nav_sighting') router.push(`/sighting/${d.id}`);
    } catch {}
  }, []);

  const handlePlaceSelect = useCallback((p: PlaceResult) => {
    webViewRef.current?.injectJavaScript(`flyTo(${p.lat},${p.lng}); true;`);
  }, []);

  const matchCount = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allPoints.length;
    return allPoints.filter(p => p.name.toLowerCase().includes(q)).length;
  }, [allPoints, query]);

  if (allPoints.length === 0) {
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
      {resolvedPoints.length === 0 ? (
        <View style={[styles.empty, isDark && styles.emptyDark]}>
          <ActivityIndicator size="large" color={OCEAN_BLUE} />
        </View>
      ) : (
        <WebView
          ref={webViewRef}
          style={styles.map}
          source={{ html: mapHtml }}
          onMessage={handleMessage}
          onLoad={handleLoad}
          scrollEnabled={false}
          originWhitelist={['*']}
          javaScriptEnabled
        />
      )}

      <View style={[styles.filterBar, isDark && styles.filterBarDark]}>
        <Ionicons name="search" size={15} color="#888" />
        <TextInput
          style={[styles.filterInput, isDark && styles.textLight]}
          placeholder="Filter by species…"
          placeholderTextColor="#888"
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="done"
        />
        {query.length > 0 && (
          <>
            <Text style={styles.filterCount}>{matchCount}/{allPoints.length}</Text>
            <TouchableOpacity hitSlop={8} onPress={() => setQuery('')}>
              <Ionicons name="close-circle" size={15} color="#888" />
            </TouchableOpacity>
          </>
        )}
      </View>

      <PlaceSearch
        onSelect={handlePlaceSelect}
        isDark={isDark}
        placeholder="Jump to a place…"
        containerStyle={styles.placeSearch}
      />

      {legendGroups.length > 0 && (
        <View style={[styles.legend, isDark && styles.legendDark]}>
          {legendGroups.map(g => (
            <View key={g.label} style={styles.legendRow}>
              <View style={[styles.legendDot, { backgroundColor: g.color }]} />
              <Text style={[styles.legendLabel, isDark && styles.textLight]}>{g.label}</Text>
            </View>
          ))}
        </View>
      )}

      {location && (
        <TouchableOpacity
          style={styles.locationBtn}
          onPress={() =>
            webViewRef.current?.injectJavaScript(
              `flyTo(${location.lat},${location.lng}); true;`
            )
          }>
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
  placeSearch: { position: 'absolute', top: 62, left: 12, right: 12 },
  legend: {
    position: 'absolute',
    bottom: 24,
    left: 12,
    maxWidth: 170,
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  legendDark: { backgroundColor: 'rgba(10,22,40,0.95)' },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { fontSize: 11, color: '#333', flexShrink: 1 },
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
