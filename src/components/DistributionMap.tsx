import { StyleSheet } from 'react-native';
import MapView, { UrlTile } from 'react-native-maps';

interface Props {
  taxonId: number;
}

const WORLD_REGION = {
  latitude: 20,
  longitude: 10,
  latitudeDelta: 120,
  longitudeDelta: 180,
};

export default function DistributionMap({ taxonId }: Props) {
  return (
    <MapView
      style={styles.map}
      initialRegion={WORLD_REGION}
      rotateEnabled={false}
      pitchEnabled={false}>
      <UrlTile
        urlTemplate={`https://api.inaturalist.org/v1/grid/{z}/{x}/{y}.png?taxon_id=${taxonId}&color=%23006994`}
        maximumZ={8}
        opacity={0.75}
        shouldReplaceMapContent={false}
      />
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: { height: 200, borderRadius: 12, overflow: 'hidden' },
});
