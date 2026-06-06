import { useQuery } from '@tanstack/react-query';
import { searchTaxa } from '@/api/inaturalist';

export function useSearch(query: string) {
  return useQuery({
    queryKey: ['search', 'v4', query],
    queryFn: () => searchTaxa(query),
    enabled: query.trim().length >= 2,
    staleTime: 10 * 60 * 1000,
    placeholderData: prev => prev,
  });
}
