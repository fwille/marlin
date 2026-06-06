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
import { useLifelist } from '@/store/lifelist';
import { useLocation } from '@/hooks/useLocation';

const OCEAN_BLUE = '#006994';

interface Point {
  lat: number; lng: number;
  name: string; date: string; locationName: string;
  speciesId: number; photoUri: string; imageUrl: string;
}

function buildMapHtml(points: Point[]): string {
  const dataJson = JSON.stringify(points).replace(/<\/script>/gi, '<\\/script>');
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
    var html='<div style="min-width:150px">'+img+'<div class="pop-name">'+p.name+'<\/div><div class="pop-sub">'+p.date+'<\/div>'+loc+'<div class="pop-link" onclick="nav('+p.speciesId+')">View species →<\/div><\/div>';
    var m=L.marker([p.lat,p.lng]).addTo(map).bindPopup(html);
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

  const allPoints = useMemo<Point[]>(
    () =>
      sightings
        .filter(s => s.lat != null && s.lng != null)
        .map(s => ({
          lat: s.lat!, lng: s.lng!,
          name: s.commonName ?? s.scientificName,
          date: s.date,
          locationName: s.locationName ?? '',
          speciesId: s.speciesId,
          photoUri: s.photoUris?.[0] ?? '',
          imageUrl: s.imageUrl ?? '',
        })),
    [sightings]
  );

  // Resolve local file:// URIs to base64 data URIs so the WebView can display them.
  const [resolvedPoints, setResolvedPoints] = useState<Point[]>([]);
  useEffect(() => {
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
    } catch {}
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
