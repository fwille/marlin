import { getNearbySpecies, searchTaxa, getWikipediaSummary, getIucnStatus } from '../inaturalist';
import type { NearbySpecies, INatTaxon } from '@/types';

// ---------------------------------------------------------------------------
// fetch mock helpers
// ---------------------------------------------------------------------------

function mockFetch(responses: unknown[]) {
  let call = 0;
  global.fetch = jest.fn(() => {
    const body = responses[call++ % responses.length];
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(''),
    } as Response);
  });
}

function mockFetchAlways(body: unknown) {
  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(body), text: () => Promise.resolve('') } as Response)
  );
}

afterEach(() => jest.restoreAllMocks());

// ---------------------------------------------------------------------------
// getNearbySpecies
// ---------------------------------------------------------------------------

const taxon = (id: number): INatTaxon => ({ id, name: `Species ${id}` });
const nearby = (id: number, count: number): NearbySpecies => ({ count, taxon: taxon(id) });

describe('getNearbySpecies', () => {
  it('deduplicates across groups — keeps the entry with the higher count', async () => {
    // 9 marine taxon groups: first returns taxon 1 with count 5, second returns same taxon with 10
    const groups = Array.from({ length: 9 }, (_, i) =>
      ({ results: i === 0 ? [nearby(1, 5)] : i === 1 ? [nearby(1, 10)] : [] })
    );
    mockFetch(groups);

    const result = await getNearbySpecies(0, 0);

    expect(result).toHaveLength(1);
    expect(result[0].count).toBe(10);
  });

  it('sorts results by count descending', async () => {
    const groups = Array.from({ length: 9 }, (_, i) =>
      ({ results: i === 0 ? [nearby(1, 3), nearby(2, 10), nearby(3, 7)] : [] })
    );
    mockFetch(groups);

    const result = await getNearbySpecies(0, 0);

    expect(result.map(r => r.count)).toEqual([10, 7, 3]);
  });

  it('treats a failed group as empty rather than rejecting', async () => {
    global.fetch = jest.fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValue({ ok: true, json: () => Promise.resolve({ results: [nearby(1, 5)] }), text: () => Promise.resolve('') } as Response);

    const result = await getNearbySpecies(0, 0);

    expect(result.some(r => r.taxon.id === 1)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// searchTaxa
// ---------------------------------------------------------------------------

const taxonWithCount = (id: number, count: number): INatTaxon => ({ id, name: `Species ${id}`, observations_count: count });

describe('searchTaxa', () => {
  it('deduplicates across groups — first occurrence wins', async () => {
    const groups = Array.from({ length: 9 }, (_, i) =>
      ({ results: i === 0 ? [taxonWithCount(1, 100)] : i === 1 ? [taxonWithCount(1, 999)] : [] })
    );
    mockFetch(groups);

    const result = await searchTaxa('clownfish');

    expect(result.filter(t => t.id === 1)).toHaveLength(1);
    expect(result.find(t => t.id === 1)!.observations_count).toBe(100);
  });

  it('sorts by observations_count descending', async () => {
    const groups = Array.from({ length: 9 }, (_, i) =>
      ({ results: i === 0 ? [taxonWithCount(1, 5), taxonWithCount(2, 50), taxonWithCount(3, 20)] : [] })
    );
    mockFetch(groups);

    const result = await searchTaxa('fish');

    expect(result.map(t => t.observations_count)).toEqual([50, 20, 5]);
  });

  it('caps results at 30', async () => {
    const many = Array.from({ length: 40 }, (_, i) => taxonWithCount(i + 1, 40 - i));
    const groups = Array.from({ length: 9 }, (_, i) => ({ results: i === 0 ? many : [] }));
    mockFetch(groups);

    const result = await searchTaxa('fish');

    expect(result.length).toBeLessThanOrEqual(30);
  });
});

// ---------------------------------------------------------------------------
// getWikipediaSummary
// ---------------------------------------------------------------------------

describe('getWikipediaSummary', () => {
  it('extracts the extract from the first page', async () => {
    mockFetchAlways({
      query: { pages: { '123': { extract: '  A clownfish lives in coral reefs.  ' } } },
    });

    const result = await getWikipediaSummary('https://en.wikipedia.org/wiki/Amphiprion_ocellaris');

    expect(result).toBe('A clownfish lives in coral reefs.');
  });

  it('strips hash fragments from the Wikipedia title', async () => {
    mockFetchAlways({ query: { pages: { '1': { extract: 'text' } } } });

    await getWikipediaSummary('https://en.wikipedia.org/wiki/Clownfish#Ecology');

    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain('titles=Clownfish');
    expect(url).not.toContain('%23');
  });

  it('throws when there is no /wiki/ segment in the URL', async () => {
    await expect(getWikipediaSummary('https://en.wikipedia.org/Clownfish')).rejects.toThrow();
  });

  it('throws when the extract is empty', async () => {
    mockFetchAlways({ query: { pages: { '1': { extract: '' } } } });

    await expect(getWikipediaSummary('https://en.wikipedia.org/wiki/Something')).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// getIucnStatus — code normalisation
// IUCN_TOKEN is a module-level constant read at load time, so tests that need
// a token use jest.resetModules() + require() to get a freshly initialised module.
// ---------------------------------------------------------------------------

const iucnResponse = (code: string) => ({
  assessments: [{ latest: true, red_list_category_code: code, url: null }],
  taxon: {},
});

describe('getIucnStatus without a token', () => {
  it('returns null when no token is configured', async () => {
    expect(await getIucnStatus('Amphiprion ocellaris')).toBeNull();
  });

  it('returns null for single-word scientific names', async () => {
    expect(await getIucnStatus('Amphiprion')).toBeNull();
  });
});

describe('getIucnStatus IUCN legacy code normalisation', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mod: any;

  beforeAll(() => {
    process.env.EXPO_PUBLIC_IUCN_TOKEN = 'test-token';
    jest.resetModules();
    mod = require('../inaturalist');
  });

  afterAll(() => {
    delete process.env.EXPO_PUBLIC_IUCN_TOKEN;
    jest.resetModules();
  });

  it('passes modern codes through unchanged', async () => {
    mockFetchAlways(iucnResponse('VU'));
    expect((await mod.getIucnStatus('Amphiprion ocellaris'))?.status).toBe('VU');
  });

  it('normalises LR/LC to LC', async () => {
    mockFetchAlways(iucnResponse('LR/lc'));
    expect((await mod.getIucnStatus('Amphiprion ocellaris'))?.status).toBe('LC');
  });

  it('normalises LR/NT and LR/CD to NT', async () => {
    mockFetchAlways(iucnResponse('LR/nt'));
    expect((await mod.getIucnStatus('Amphiprion ocellaris'))?.status).toBe('NT');

    mockFetchAlways(iucnResponse('LR/cd'));
    expect((await mod.getIucnStatus('Amphiprion ocellaris'))?.status).toBe('NT');
  });
});
