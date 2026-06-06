import { useState, useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import WebView from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';

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
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
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

function MapWebView({ html }: { html: string }) {
  return (
    <WebView
      style={styles.map}
      source={{ html }}
      scrollEnabled={false}
      originWhitelist={['*']}
      javaScriptEnabled
    />
  );
}

export default function DistributionMap({ taxonId, userLat, userLng }: Props) {
  const [fullscreen, setFullscreen] = useState(false);
  const html = useMemo(
    () => buildMapHtml(taxonId, userLat, userLng),
    [taxonId, userLat, userLng]
  );

  return (
    <>
      {/* Inline map */}
      <View style={styles.container}>
        <MapWebView html={html} />
        <TouchableOpacity style={styles.expandBtn} onPress={() => setFullscreen(true)}>
          <Ionicons name="expand" size={16} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Full-screen modal */}
      <Modal
        visible={fullscreen}
        animationType="slide"
        onRequestClose={() => setFullscreen(false)}>
        <SafeAreaView style={styles.fullscreenSafe} edges={['top', 'bottom']}>
          <View style={styles.fullscreenContainer}>
            <MapWebView html={html} />
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={() => setFullscreen(false)}>
              <Ionicons name="close-circle" size={34} color="#fff" />
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { height: 200, borderRadius: 12, overflow: 'hidden' },
  map: { flex: 1 },
  expandBtn: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 8,
    padding: 6,
  },
  fullscreenSafe: { flex: 1, backgroundColor: '#000' },
  fullscreenContainer: { flex: 1, position: 'relative' },
  closeBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
  },
});
