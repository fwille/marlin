import { useRef, useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PickedLocation } from './LocationPicker';
import { LEAFLET_HEAD } from '@/lib/leafletAssets';

interface Props {
  value: PickedLocation | null;
  onChange: (loc: PickedLocation) => void;
}

// Keep a ref to the latest onChange so the message handler never goes stale.
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
    attribution:'\\u00a9 OpenStreetMap'
  }).addTo(map);

  var marker = ${hasPin
    ? `L.marker([${lat},${lng}],{draggable:true}).addTo(map)`
    : 'null'};

  function send(lat,lng){
    window.parent.postMessage(JSON.stringify({type:'marlin_loc',lat:lat,lng:lng}),'*');
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
  const containerRef = useRef<any>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [expanded, setExpanded] = useState(false);
  // Always call the latest onChange even though the effect runs once.
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  useEffect(() => {
    const el = containerRef.current as HTMLElement | null;
    if (!el || typeof el.appendChild !== 'function') return;

    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'width:100%;height:100%;border:none;display:block;';
    iframe.srcdoc = buildPickerHtml(value?.lat, value?.lng);
    iframeRef.current = iframe;
    el.appendChild(iframe);

    const handleMessage = (e: MessageEvent) => {
      try {
        const d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        if (d?.type === 'marlin_loc') onChangeRef.current({ lat: d.lat, lng: d.lng });
      } catch {}
    };
    window.addEventListener('message', handleMessage);

    return () => {
      if (el.contains(iframe)) el.removeChild(iframe);
      window.removeEventListener('message', handleMessage);
      iframeRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // `value` often starts null and is seeded asynchronously (e.g. GPS resolves
  // after this picker has already mounted, as in the Add Sighting modal). The
  // iframe's HTML is built once above, so reload it once with the seed baked
  // in — only the first time, so we don't fight the user's own taps/drags.
  const seededRef = useRef(!!value);
  useEffect(() => {
    if (!seededRef.current && value && iframeRef.current) {
      seededRef.current = true;
      iframeRef.current.srcdoc = buildPickerHtml(value.lat, value.lng);
    }
  }, [value]);

  return (
    <View style={[styles.container, expanded && styles.containerExpanded]}>
      <View ref={containerRef} style={styles.map} />
      <TouchableOpacity style={styles.expandBtn} onPress={() => setExpanded(e => !e)}>
        <Ionicons name={expanded ? 'contract' : 'expand'} size={16} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { height: 220, borderRadius: 12, overflow: 'hidden' },
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
