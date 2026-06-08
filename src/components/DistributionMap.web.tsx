import { useRef, useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LEAFLET_HEAD } from '@/lib/leafletAssets';

interface Props {
  taxonId: number;
  userLat?: number;
  userLng?: number;
}

function buildMapHtml(taxonId: number, userLat?: number, userLng?: number): string {
  const center = userLat != null && userLng != null ? `[${userLat},${userLng}]` : '[20,10]';
  const zoom = userLat != null ? 5 : 2;
  return `<!DOCTYPE html><html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1">
${LEAFLET_HEAD}
<style>*{margin:0;padding:0}html,body,#map{width:100%;height:100%}<\/style>
</head>
<body>
<div id="map"></div>
<script>
  var map=L.map('map',{zoomControl:true,scrollWheelZoom:false}).setView(${center},${zoom});
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
    maxZoom:19,attribution:'© OpenStreetMap'
  }).addTo(map);
  L.tileLayer(
    'https://api.inaturalist.org/v1/grid/{z}/{x}/{y}.png?taxon_id=${taxonId}&color=%23006994',
    {maxNativeZoom:8,maxZoom:18,opacity:0.75,attribution:'© iNaturalist'}
  ).addTo(map);
<\/script>
</body></html>`;
}

export default function DistributionMap({ taxonId, userLat, userLng }: Props) {
  const containerRef = useRef<any>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const el = containerRef.current as HTMLElement | null;
    if (!el || typeof el.appendChild !== 'function') return;

    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'width:100%;height:100%;border:none;display:block;';
    iframe.srcdoc = buildMapHtml(taxonId, userLat, userLng);
    el.appendChild(iframe);

    return () => {
      if (el.contains(iframe)) el.removeChild(iframe);
    };
  }, [taxonId, userLat, userLng]);

  return (
    <View style={[styles.container, expanded && styles.containerExpanded]}>
      <View ref={containerRef} style={styles.map} />
      <TouchableOpacity
        style={styles.expandBtn}
        onPress={() => setExpanded(e => !e)}>
        <Ionicons name={expanded ? 'contract' : 'expand'} size={16} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { height: 200, borderRadius: 12, overflow: 'hidden' },
  containerExpanded: { height: 460 },
  map: { flex: 1 },
  expandBtn: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 8,
    padding: 6,
  },
});
