import { StyleSheet } from 'react-native';
import MapView, { Marker, MapPressEvent, MarkerDragStartEndEvent } from 'react-native-maps';
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

export default function LocationPicker({ value, onChange }: Props) {
  const region = value
    ? { latitude: value.lat, longitude: value.lng, latitudeDelta: 0.05, longitudeDelta: 0.05 }
    : { latitude: 20, longitude: 0, latitudeDelta: 60, longitudeDelta: 60 };

  const handlePress = async (e: MapPressEvent) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    const name = await reverseGeocode(latitude, longitude);
    onChange({ lat: latitude, lng: longitude, name });
  };

  const handleDragEnd = async (e: MarkerDragStartEndEvent) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    const name = await reverseGeocode(latitude, longitude);
    onChange({ lat: latitude, lng: longitude, name });
  };

  return (
    <MapView style={styles.map} region={region} onPress={handlePress}>
      {value && (
        <Marker
          coordinate={{ latitude: value.lat, longitude: value.lng }}
          draggable
          onDragEnd={handleDragEnd}
        />
      )}
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: { height: 220, borderRadius: 12, overflow: 'hidden' },
});
