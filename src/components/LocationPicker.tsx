import {
  useRef,
  useCallback,
  useEffect,
  useState,
  forwardRef,
  useImperativeHandle,
} from 'react';
import { View, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import WebView, { WebViewMessageEvent } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
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

export interface MapPickerHandle {
  seed: (lat: number, lng: number) => void;
}

interface MapPickerProps {
  initialLat?: number;
  initialLng?: number;
  onPick: (lat: number, lng: number) => void;
}

// A single interactive Leaflet WebView. Both the inline preview and the
// full-screen modal render one of these; the parent keeps their pins in sync
// via the imperative `seed` handle. Seeds arriving before the page has loaded
// are queued (injectJavaScript made too early is silently dropped, not queued).
const MapPicker = forwardRef<MapPickerHandle, MapPickerProps>(
  ({ initialLat, initialLng, onPick }, ref) => {
    const [html] = useState(() => buildPickerHtml(initialLat, initialLng));
    const webViewRef = useRef<WebView>(null);
    const onPickRef = useRef(onPick);
    useEffect(() => {
      onPickRef.current = onPick;
    });

    const readyRef = useRef(false);
    const pendingRef = useRef<{ lat: number; lng: number } | null>(null);

    const doSeed = useCallback((lat: number, lng: number) => {
      webViewRef.current?.injectJavaScript(`window.seedLocation(${lat},${lng}); true;`);
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        seed(lat, lng) {
          if (readyRef.current) doSeed(lat, lng);
          else pendingRef.current = { lat, lng };
        },
      }),
      [doSeed]
    );

    const handleLoadEnd = useCallback(() => {
      readyRef.current = true;
      const p = pendingRef.current;
      if (p) {
        pendingRef.current = null;
        doSeed(p.lat, p.lng);
      }
    }, [doSeed]);

    const handleMessage = useCallback((event: WebViewMessageEvent) => {
      try {
        const d = JSON.parse(event.nativeEvent.data);
        if (d?.type === 'marlin_loc') onPickRef.current(d.lat, d.lng);
      } catch {}
    }, []);

    return (
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
    );
  }
);
MapPicker.displayName = 'MapPicker';

export default function LocationPicker({ value, onChange }: Props) {
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  const [fullscreen, setFullscreen] = useState(false);
  // Coords captured when the full-screen map opens, so its WebView renders with
  // the current pin already in place (avoids reading a ref during render).
  const [fullSeed, setFullSeed] = useState<PickedLocation | null>(null);
  const inlineRef = useRef<MapPickerHandle>(null);
  const fullRef = useRef<MapPickerHandle>(null);

  // Latest known selection. The inline map's HTML is built once (below) from the
  // value present at mount; later updates reach the maps via `seed`.
  const selectedRef = useRef<PickedLocation | null>(value);
  const [initial] = useState(() => value);

  // `value` often starts null and is seeded asynchronously (e.g. GPS resolves
  // after this picker has already mounted, as in the Add Sighting modal), or the
  // parent may reset it. Seed the maps to match — but skip updates that merely
  // echo our own pick back through the parent (same coords), so we don't fight
  // the user's taps/drags.
  useEffect(() => {
    if (!value) return;
    const cur = selectedRef.current;
    if (cur && cur.lat === value.lat && cur.lng === value.lng) return;
    selectedRef.current = value;
    inlineRef.current?.seed(value.lat, value.lng);
    fullRef.current?.seed(value.lat, value.lng);
  }, [value]);

  const handlePick = useCallback((from: 'inline' | 'full', lat: number, lng: number) => {
    selectedRef.current = { lat, lng, name: selectedRef.current?.name };
    // Keep the other map's pin in sync; never re-seed the one the user just
    // tapped, whose marker has already moved.
    if (from === 'inline') fullRef.current?.seed(lat, lng);
    else inlineRef.current?.seed(lat, lng);
    reverseGeocode(lat, lng).then(name => {
      selectedRef.current = { lat, lng, name };
      onChangeRef.current({ lat, lng, name });
    });
  }, []);

  return (
    <>
      {/* Inline picker */}
      <View style={styles.container}>
        <MapPicker
          ref={inlineRef}
          initialLat={initial?.lat}
          initialLng={initial?.lng}
          onPick={(lat, lng) => handlePick('inline', lat, lng)}
        />
        <TouchableOpacity
          style={styles.expandBtn}
          onPress={() => {
            setFullSeed(selectedRef.current);
            setFullscreen(true);
          }}>
          <Ionicons name="expand" size={16} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Full-screen picker */}
      <Modal
        visible={fullscreen}
        animationType="slide"
        onRequestClose={() => setFullscreen(false)}>
        <SafeAreaView style={styles.fullscreenSafe} edges={['top', 'bottom']}>
          <View style={styles.fullscreenContainer}>
            {fullscreen && (
              <MapPicker
                ref={fullRef}
                initialLat={fullSeed?.lat}
                initialLng={fullSeed?.lng}
                onPick={(lat, lng) => handlePick('full', lat, lng)}
              />
            )}
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
  container: { height: 220, borderRadius: 12, overflow: 'hidden' },
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
