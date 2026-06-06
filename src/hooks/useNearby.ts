import { useQuery } from '@tanstack/react-query';
import { getNearbySpecies } from '@/api/inaturalist';
import { UserLocation } from './useLocation';

export function useNearby(location: UserLocation | null, radiusKm = 50) {
  return useQuery({
    queryKey: ['nearby', 'v4', location?.lat, location?.lng, radiusKm],
    queryFn: () => getNearbySpecies(location!.lat, location!.lng, radiusKm),
    enabled: !!location,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
}
