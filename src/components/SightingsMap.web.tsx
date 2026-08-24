import { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQueries } from '@tanstack/react-query';
import { useLifelist } from '@/store/lifelist';
import { getTaxon, marineGroupFor, MARINE_GROUPS } from '@/api/inaturalist';
import { LEAFLET_HEAD } from '@/lib/leafletAssets';
import PlaceSearch from './PlaceSearch';
import { PlaceResult } from '@/lib/geocodeSearch';

const OCEAN_BLUE = '#006994';

// True taxonomic "family" would yield dozens of near-indistinguishable colors
// across a life list, so pins are colored by the same broad groups the marine
// search fans out over (MARINE_GROUPS), keyed by taxon ID.
//
// Not by `iconic_taxon_name`: iNaturalist's iconic taxa are a short fixed list,
// and everything outside it — sharks, jellyfish, starfish, comb jellies, sea
// snakes — reports plain "Animalia", which silently collapsed most of the
// legend into a single grey "Other" bucket.
const GROUP_COLORS: Record<number, string> = {
  47178: '#1976d2',  // Fish
  47273: '#c62828',  // Sharks & Rays
  47549: '#00897b',  // Starfish & Urchins
  47459: '#f9a825',  // Octopus & Squid
  47113: '#ef6c00',  // Sea Slugs
  47534: '#d81b60',  // Jellyfish & Corals
  51508: '#00acc1',  // Comb Jellies
  47186: '#6d4c41',  // Crabs & Shrimp
  152871: '#6a1b9a', // Marine Mammals (Cetacea)
  46306: '#6a1b9a',  // Marine Mammals (Sirenia)
  372234: '#2e7d32', // Sea Turtles
  1630892: '#827717', // Sea Snakes (Hydrophiini)
  492347: '#827717',  // Sea Snakes (Laticaudinae)
};
const OTHER_GROUP = { label: 'Other', color: '#757575' };

function groupInfo(groupId: number): { label: string; color: string } {
  const group = MARINE_GROUPS.find(g => g.id === groupId);
  if (!group) return OTHER_GROUP;
  return { label: group.label, color: GROUP_COLORS[group.id] ?? OTHER_GROUP.color };
}

interface Point {
  lat: number; lng: number;
  name: string; date: string; locationName: string;
  sightingId: number; speciesId: number; photoUri: string; imageUrl: string;
  color: string;
}

// Built once and reused: the iframe used to be destroyed and recreated whenever
// the points changed, which reloaded Leaflet and every map tile — a visible
// flash on each settling taxon query, and on every keystroke in the filter box.
// Points and filter changes now arrive over postMessage instead.
function buildMapHtml(): string {
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
<script>
  var map=L.map('map').setView([20,0],2);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap'}).addTo(map);

  var allMarkers=[],framed=false;

  function popupHtml(p){
    var img=(p.photoUri||p.imageUrl)?'<img class="pop-img" src="'+(p.photoUri||p.imageUrl)+'">':'';
    var loc=p.locationName?'<div class="pop-sub">'+p.locationName+'<\/div>':'';
    return '<div style="min-width:150px">'+img+'<div class="pop-name">'+p.name+'<\/div><div class="pop-sub">'+p.date+'<\/div>'+loc+'<div class="pop-link" onclick="navSighting('+p.sightingId+')">View sighting →<\/div><div class="pop-link" style="color:#888" onclick="nav('+p.speciesId+')">View species →<\/div><\/div>';
  }

  function setPoints(pts){
    allMarkers.forEach(function(m){map.removeLayer(m);});
    allMarkers=[];
    pts.forEach(function(p){
      allMarkers.push(L.circleMarker([p.lat,p.lng],{radius:8,weight:2,color:'#fff',fillColor:p.color,fillOpacity:0.9}).bindPopup(popupHtml(p)).addTo(map));
    });
    // Frame the sightings on the first batch only. Refitting on later updates
    // would yank the view back while someone is already panning around.
    if(!framed&&pts.length){
      framed=true;
      var lats=pts.map(function(p){return p.lat}),lngs=pts.map(function(p){return p.lng});
      map.fitBounds([
        [Math.min.apply(null,lats)-1,Math.min.apply(null,lngs)-1],
        [Math.max.apply(null,lats)+1,Math.max.apply(null,lngs)+1]
      ],{maxZoom:10});
    }
  }

  function nav(id){window.parent.postMessage(JSON.stringify({type:'marlin_nav',id:id}),'*');}
  function navSighting(id){window.parent.postMessage(JSON.stringify({type:'marlin_nav_sighting',id:id}),'*');}
  window.addEventListener('message',function(e){
    try{var d=typeof e.data==='string'?JSON.parse(e.data):e.data;
      if(d&&d.type==='marlin_flyto')map.flyTo([d.lat,d.lng],12);
      if(d&&d.type==='marlin_points')setPoints(d.points);}catch(err){}
  });
  window.parent.postMessage(JSON.stringify({type:'marlin_ready'}),'*');
<\/script>
</body></html>`;
}


export default function SightingsMap() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const mapRef = useRef<any>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const sightings = useLifelist(s => s.sightings);
  const [query, setQuery] = useState('');

  // Look up each species' full taxon record for its ancestry (cached — reuses the species
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
  // `useQueries` hands back a fresh results array on every render, and the taxon
  // queries settle one at a time, so memoizing on it directly rebuilt the points
  // over and over — re-encoding every sighting photo to base64 each pass.
  // Collapsing the resolved groups into a string gives a value-stable dep.
  const groupKey = speciesIds
    .map((id, i) => `${id}:${marineGroupFor(taxonResults[i]?.data)?.id ?? 0}`)
    .join('|');

  const groupBySpecies = useMemo(() => {
    const map = new Map<number, { label: string; color: string }>();
    for (const entry of groupKey ? groupKey.split('|') : []) {
      const [speciesId, groupId] = entry.split(':');
      map.set(Number(speciesId), groupInfo(Number(groupId)));
    }
    return map;
  }, [groupKey]);

  const legendGroups = useMemo(() => {
    const seen = new Map<string, { label: string; color: string }>();
    for (const id of speciesIds) {
      const g = groupBySpecies.get(id) ?? OTHER_GROUP;
      if (!seen.has(g.label)) seen.set(g.label, g);
    }
    return [...seen.values()];
  }, [speciesIds, groupBySpecies]);

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
          color: (groupBySpecies.get(s.speciesId) ?? OTHER_GROUP).color,
        })),
    [sightings, groupBySpecies]
  );

  const points = useMemo<Point[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allPoints;
    return allPoints.filter(p => p.name.toLowerCase().includes(q));
  }, [allPoints, query]);

  // The iframe is created once and then kept. `hasPoints` is the dependency
  // rather than `points` because the map container is only rendered once there
  // is something to show — re-running on the points themselves is what used to
  // rebuild the map on every keystroke.
  const [mapReady, setMapReady] = useState(false);
  const hasPoints = allPoints.length > 0;

  useEffect(() => {
    const el = mapRef.current as HTMLElement | null;
    if (!el || typeof el.appendChild !== 'function' || !hasPoints) return;
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'width:100%;height:100%;border:none;display:block;';
    iframe.srcdoc = buildMapHtml();
    el.appendChild(iframe);
    iframeRef.current = iframe;
    const handleMessage = (e: MessageEvent) => {
      try {
        const d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        if (d?.type === 'marlin_ready') setMapReady(true);
        if (d?.type === 'marlin_nav') router.push(`/species/${d.id}`);
        if (d?.type === 'marlin_nav_sighting') router.push(`/sighting/${d.id}`);
      } catch {}
    };
    window.addEventListener('message', handleMessage);
    return () => {
      if (el.contains(iframe)) el.removeChild(iframe);
      window.removeEventListener('message', handleMessage);
      iframeRef.current = null;
      setMapReady(false);
    };
  }, [hasPoints]);

  // Re-runs on mapReady too, which is what delivers points that were ready
  // before the iframe finished loading.
  useEffect(() => {
    if (!mapReady) return;
    iframeRef.current?.contentWindow?.postMessage(
      JSON.stringify({ type: 'marlin_points', points }),
      '*'
    );
  }, [mapReady, points]);

  const handlePlaceSelect = useCallback((p: PlaceResult) => {
    iframeRef.current?.contentWindow?.postMessage(
      JSON.stringify({ type: 'marlin_flyto', lat: p.lat, lng: p.lng }),
      '*'
    );
  }, []);

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
        />
        {query.length > 0 && (
          <>
            <Text style={styles.filterCount}>{points.length}/{allPoints.length}</Text>
            <TouchableOpacity hitSlop={8} onPress={() => setQuery('')}>
              <Ionicons name="close-circle" size={15} color="#888" />
            </TouchableOpacity>
          </>
        )}
      </View>
      {points.length === 0 ? (
        <View style={[styles.empty, isDark && styles.emptyDark]}>
          <Ionicons name="search-outline" size={48} color="#ccc" />
          <Text style={[styles.emptyTitle, isDark && styles.textLight]}>No matches for "{query}"</Text>
        </View>
      ) : (
        <View style={styles.mapArea}>
          <View ref={mapRef} style={styles.mapArea} />
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
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    margin: 12,
    backgroundColor: '#fff',
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 9,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  filterBarDark: { backgroundColor: '#112240' },
  filterInput: { flex: 1, fontSize: 14, color: '#111', padding: 0 },
  filterCount: { fontSize: 12, color: '#888' },
  mapArea: { flex: 1 },
  placeSearch: { position: 'absolute', top: 12, left: 12, right: 12 },
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
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: '#f5f8fa' },
  emptyDark: { backgroundColor: '#0A1628' },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: '#333' },
  emptyHint: { fontSize: 14, color: '#888', textAlign: 'center', paddingHorizontal: 40 },
  textLight: { color: '#fff' },
});
