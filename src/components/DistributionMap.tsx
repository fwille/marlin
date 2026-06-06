import { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import WebView from 'react-native-webview';

interface Props {
  taxonId: number;
}

function buildMapHtml(taxonId: number): string {
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
  var map=L.map('map',{zoomControl:true}).setView([20,10],2);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
    attribution:'© OpenStreetMap'
  }).addTo(map);
  L.tileLayer(
    'https://api.inaturalist.org/v1/grid/{z}/{x}/{y}.png?taxon_id=${taxonId}&color=%23006994',
    {maxZoom:8,opacity:0.75,attribution:'© iNaturalist'}
  ).addTo(map);
<\/script>
</body></html>`;
}

export default function DistributionMap({ taxonId }: Props) {
  const html = useMemo(() => buildMapHtml(taxonId), [taxonId]);

  return (
    <View style={styles.container}>
      <WebView
        style={styles.map}
        source={{ html }}
        scrollEnabled={false}
        originWhitelist={['*']}
        javaScriptEnabled
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { height: 200, borderRadius: 12, overflow: 'hidden' },
  map: { flex: 1 },
});
