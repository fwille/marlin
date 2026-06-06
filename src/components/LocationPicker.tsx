import { useRef, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import WebView, { WebViewMessageEvent } from 'react-native-webview';
import * as Location from 'expo-location';

export interface PickedLocation {
  lat: number;
  lng: number;
  name?: string;
}

interface Props {
  value: PickedLocation | null;
  onChange: (loc: PickedLocation) => void;
}

async function reverseGeocode(lat: number, lng: number): Promise<string | undefined> {
  try {
    const [r] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    if (!r) return undefined;
    return [r.district ?? r.subregion, r.city, r.country].filter(Boolean).join(', ') || undefined;
  } catch {
    return undefined;
  }
}

function buildPickerHtml(lat?: number, lng?: number): string {
  const hasPin = lat !== undefined && lng !== undefined;
  return `<!DOCTYPE html><html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
<style>
  *{margin:0;padding:0}html,body,#map{width:100%;height:100%}
  #hint{position:absolute;top:8px;left:50%;transform:translateX(-50%);
    background:rgba(0,0,0,.6);color:#fff;padding:3px 10px;border-radius:12px;
    font:12px/1.5 sans-serif;z-index:999;pointer-events:none}
</style>
</head>
<body>
<div id="map"></div>
<div id="hint">Tap map to place pin · drag to adjust</div>
<script>
  var map = L.map('map').setView(
    [${hasPin ? lat : 20},${hasPin ? lng : 0}],
    ${hasPin ? 10 : 2}
  );
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
    attribution:'© OpenStreetMap'
  }).addTo(map);

  var marker = ${hasPin
    ? `L.marker([${lat},${lng}],{draggable:true}).addTo(map)`
    : 'null'};

  function send(lat,lng){
    window.ReactNativeWebView.postMessage(JSON.stringify({type:'marlin_loc',lat:lat,lng:lng}));
  }

  function attachDrag(m){
    m.on('dragend',function(){var ll=m.getLatLng();send(ll.lat,ll.lng);});
  }
  if(marker) attachDrag(marker);

  map.on('click',function(e){
    if(marker){ marker.setLatLng(e.latlng); }
    else{ marker=L.marker(e.latlng,{draggable:true}).addTo(map); attachDrag(marker); }
    document.getElementById('hint').style.display='none';
    send(e.latlng.lat,e.latlng.lng);
  });
<\/script>
</body></html>`;
}

export default function LocationPicker({ value, onChange }: Props) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const htmlRef = useRef(buildPickerHtml(value?.lat, value?.lng));

  const handleMessage = useCallback(async (event: WebViewMessageEvent) => {
    try {
      const d = JSON.parse(event.nativeEvent.data);
      if (d?.type === 'marlin_loc') {
        const name = await reverseGeocode(d.lat, d.lng);
        onChangeRef.current({ lat: d.lat, lng: d.lng, name });
      }
    } catch {}
  }, []);

  return (
    <View style={styles.container}>
      <WebView
        style={styles.map}
        source={{ html: htmlRef.current }}
        onMessage={handleMessage}
        scrollEnabled={false}
        originWhitelist={['*']}
        javaScriptEnabled
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { height: 220, borderRadius: 12, overflow: 'hidden' },
  map: { flex: 1 },
});
