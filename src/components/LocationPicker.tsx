import { useRef, useCallback, useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import WebView, { WebViewMessageEvent } from 'react-native-webview';
import { reverseGeocode } from '@/lib/reverseGeocode';
import { LEAFLET_HEAD } from '@/lib/leafletAssets';

export interface PickedLocation {
  lat: number;
  lng: number;
  name?: string;
}

interface Props {
  value: PickedLocation | null;
  onChange: (loc: PickedLocation) => void;
}

function buildPickerHtml(lat?: number, lng?: number): string {
  const hasPin = lat !== undefined && lng !== undefined;
  return `<!DOCTYPE html><html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1">
${LEAFLET_HEAD}
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
    ${hasPin ? 14 : 2}
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

  window.seedLocation=function(lat,lng){
    if(marker){ marker.setLatLng([lat,lng]); }
    else{ marker=L.marker([lat,lng],{draggable:true}).addTo(map); attachDrag(marker); }
    document.getElementById('hint').style.display='none';
    map.setView([lat,lng],14);
  };
<\/script>
</body></html>`;
}

export default function LocationPicker({ value, onChange }: Props) {
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  const [html] = useState(() => buildPickerHtml(value?.lat, value?.lng));
  const webViewRef = useRef<WebView>(null);

  // `value` often starts null and is seeded asynchronously (e.g. GPS resolves
  // after this picker has already mounted, as in the Add Sighting modal). The
  // WebView's HTML is built once above, so a later seed needs to reach the map
  // via injectJavaScript — but only once the page has actually finished loading
  // (window.seedLocation doesn't exist yet otherwise, and injectJavaScript calls
  // made too early are silently dropped, not queued — that's what made this
  // unreliable). Track both "page loaded" and "value arrived" and seed once both
  // are true, whichever order they happen in — and only the first time, so we
  // don't fight the user's own taps/drags.
  const valueRef = useRef(value);
  const readyRef = useRef(false);
  const seededRef = useRef(!!value);

  const seedIfReady = useCallback(() => {
    if (seededRef.current || !readyRef.current) return;
    const v = valueRef.current;
    if (!v) return;
    seededRef.current = true;
    webViewRef.current?.injectJavaScript(`window.seedLocation(${v.lat},${v.lng}); true;`);
  }, []);

  const handleLoadEnd = useCallback(() => {
    readyRef.current = true;
    seedIfReady();
  }, [seedIfReady]);

  useEffect(() => {
    valueRef.current = value;
    seedIfReady();
  }, [value, seedIfReady]);

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
        ref={webViewRef}
        style={styles.map}
        source={{ html }}
        onMessage={handleMessage}
        onLoadEnd={handleLoadEnd}
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
