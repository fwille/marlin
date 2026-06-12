import { useLifelist } from '../lifelist';
import * as db from '@/db';

jest.mock('@/db', () => ({
  dbGetAllSightings: jest.fn(() => []),
  dbAddSighting: jest.fn(),
  dbUpdateSighting: jest.fn(),
  dbDeleteSighting: jest.fn(),
}));

const mockDb = db as jest.Mocked<typeof db>;

const base = {
  speciesId: 1,
  scientificName: 'Amphiprion ocellaris',
  commonName: 'Clownfish',
  date: '2024-01-01',
};

beforeEach(() => {
  useLifelist.setState({ sightings: [] });
  jest.clearAllMocks();
});

describe('add', () => {
  it('prepends the DB-returned sighting to the front of the list', () => {
    const saved = { id: 42, ...base };
    mockDb.dbAddSighting.mockReturnValue(saved);

    useLifelist.getState().add(base);

    expect(useLifelist.getState().sightings[0]).toBe(saved);
  });

  it('keeps existing sightings after the new one', () => {
    const first = { id: 1, ...base };
    const second = { id: 2, ...base, speciesId: 2 };
    mockDb.dbAddSighting.mockReturnValueOnce(first).mockReturnValueOnce(second);

    useLifelist.getState().add(base);
    useLifelist.getState().add({ ...base, speciesId: 2 });

    const { sightings } = useLifelist.getState();
    expect(sightings[0].id).toBe(2);
    expect(sightings[1].id).toBe(1);
  });
});

describe('remove', () => {
  it('removes the sighting with the given id', () => {
    useLifelist.setState({ sightings: [{ id: 1, ...base }, { id: 2, ...base, speciesId: 2 }] });

    useLifelist.getState().remove(1);

    const { sightings } = useLifelist.getState();
    expect(sightings).toHaveLength(1);
    expect(sightings[0].id).toBe(2);
  });

  it('calls dbDeleteSighting with the correct id', () => {
    useLifelist.setState({ sightings: [{ id: 5, ...base }] });

    useLifelist.getState().remove(5);

    expect(mockDb.dbDeleteSighting).toHaveBeenCalledWith(5);
  });
});

describe('update', () => {
  beforeEach(() => {
    useLifelist.setState({
      sightings: [
        { id: 1, ...base, lat: 10, lng: 20, notes: 'old', locationName: 'Sea' },
        { id: 2, ...base, speciesId: 2 },
      ],
    });
  });

  it('applies partial field changes to the matching sighting', () => {
    useLifelist.getState().update(1, { notes: 'updated' });

    const s = useLifelist.getState().sightings.find(x => x.id === 1)!;
    expect(s.notes).toBe('updated');
    expect(s.lat).toBe(10); // unchanged
  });

  it('leaves other sightings untouched', () => {
    useLifelist.getState().update(1, { notes: 'changed' });

    const other = useLifelist.getState().sightings.find(x => x.id === 2)!;
    expect(other.speciesId).toBe(2);
    expect(other.notes).toBeUndefined();
  });

  it('converts null lat/lng/locationName/notes to undefined', () => {
    useLifelist.getState().update(1, { lat: null, lng: null, locationName: null, notes: null });

    const s = useLifelist.getState().sightings.find(x => x.id === 1)!;
    expect(s.lat).toBeUndefined();
    expect(s.lng).toBeUndefined();
    expect(s.locationName).toBeUndefined();
    expect(s.notes).toBeUndefined();
  });

  it('replaces photoUris entirely', () => {
    useLifelist.setState({ sightings: [{ id: 1, ...base, photoUris: ['a.jpg', 'b.jpg'] }] });

    useLifelist.getState().update(1, { photoUris: ['c.jpg'] });

    expect(useLifelist.getState().sightings[0].photoUris).toEqual(['c.jpg']);
  });
});

describe('hasSeen', () => {
  it('returns true when a sighting with the speciesId exists', () => {
    useLifelist.setState({ sightings: [{ id: 1, ...base }] });

    expect(useLifelist.getState().hasSeen(base.speciesId)).toBe(true);
  });

  it('returns false when no sighting with that speciesId exists', () => {
    useLifelist.setState({ sightings: [{ id: 1, ...base }] });

    expect(useLifelist.getState().hasSeen(999)).toBe(false);
  });

  it('returns false on an empty list', () => {
    expect(useLifelist.getState().hasSeen(1)).toBe(false);
  });
});
