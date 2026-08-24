import {
  getNearbySpecies, searchTaxa, getWikipediaSummary, getIucnStatus,
  MARINE_TAXON_IDS, MARINE_GROUPS, marineGroupFor,
} from '../inaturalist';
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
    // one response per marine taxon group: first returns taxon 1 with count 5, second the same taxon with 10
    const groups = Array.from({ length: MARINE_TAXON_IDS.length }, (_, i) =>
      ({ results: i === 0 ? [nearby(1, 5)] : i === 1 ? [nearby(1, 10)] : [] })
    );
    mockFetch(groups);

    const result = await getNearbySpecies(0, 0);

    expect(result).toHaveLength(1);
    expect(result[0].count).toBe(10);
  });

  it('sorts results by count descending', async () => {
    const groups = Array.from({ length: MARINE_TAXON_IDS.length }, (_, i) =>
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
// MARINE_GROUPS / marineGroupFor
// ---------------------------------------------------------------------------

describe('MARINE_GROUPS', () => {
  // Comb jellies (Ctenophora) are their own phylum, so Cnidaria does not cover
  // them. Dropping 51508 makes Mnemiopsis leidyi and Beroe ovata — both common
  // in the Black Sea — unreachable from Nearby and Search alike.
  it('covers Ctenophora as well as Cnidaria', () => {
    expect(MARINE_TAXON_IDS).toContain(51508);
    expect(MARINE_TAXON_IDS).toContain(47534);
  });

  it('covers nudibranchs and sea snakes', () => {
    expect(MARINE_TAXON_IDS).toContain(47113);  // Nudibranchia
    expect(MARINE_TAXON_IDS).toContain(1630892); // Hydrophiini (true sea snakes)
    expect(MARINE_TAXON_IDS).toContain(492347);  // Laticaudinae (sea kraits)
  });

  it('has no duplicate groups — each one costs a parallel request', () => {
    expect(new Set(MARINE_TAXON_IDS).size).toBe(MARINE_TAXON_IDS.length);
  });

  it('labels every group', () => {
    for (const g of MARINE_GROUPS) expect(g.label).toBeTruthy();
  });
});

describe('marineGroupFor', () => {
  // Real ancestor_ids from the iNaturalist API. These are the species whose
  // groups `iconic_taxon_name` reports as plain "Animalia", which is why the
  // map legend collapsed them all into "Other".
  const cases: [string, number, number[], string][] = [
    ['Mnemiopsis leidyi',      180788, [48460, 1, 51508, 117708, 152925],       'Comb Jellies'],
    ['Carcharodon carcharias',  50870, [48460, 1, 2, 355675, 196614, 47273],    'Sharks & Rays'],
    ['Aurelia aurita',          48332, [48460, 1, 47534, 48332, 551480],        'Jellyfish & Corals'],
    ['Asterias rubens',         48903, [48460, 1, 47549, 481959, 47668],        'Starfish & Urchins'],
    ['Hypselodoris bullockii',  50217, [48460, 1, 47115, 47114, 47113, 801476], 'Sea Slugs'],
    ['Hydrophis platurus',      35201, [48460, 1, 2, 355675, 30403, 492346, 1630892], 'Sea Snakes'],
    ['Laticauda colubrina',     68343, [48460, 1, 2, 355675, 30403, 492347, 35236],   'Sea Snakes'],
  ];

  it.each(cases)('buckets %s by ancestry', (_name, id, ancestor_ids, label) => {
    expect(marineGroupFor({ id, ancestor_ids })?.label).toBe(label);
  });

  it('merges Cetacea and Sirenia into one legend label', () => {
    expect(marineGroupFor({ id: 1, ancestor_ids: [152871] })?.label).toBe('Marine Mammals');
    expect(marineGroupFor({ id: 1, ancestor_ids: [46306] })?.label).toBe('Marine Mammals');
  });

  it('matches a group taxon itself, which is absent from its own ancestor_ids', () => {
    expect(marineGroupFor({ id: 47178, ancestor_ids: [48460, 1, 2] })?.label).toBe('Fish');
  });

  // Hydrophiinae (492346) is mostly terrestrial Australian elapids, so it is
  // deliberately not a group — only its marine tribe Hydrophiini is.
  it('does not bucket terrestrial elapids as sea snakes', () => {
    expect(marineGroupFor({ id: 1, ancestor_ids: [30403, 492346] })).toBeUndefined();
  });

  it('returns undefined for taxa outside every group', () => {
    expect(marineGroupFor({ id: 52800, ancestor_ids: [48460, 47126, 211194] })).toBeUndefined();
    expect(marineGroupFor({ id: 1 })).toBeUndefined();
    expect(marineGroupFor(undefined)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// searchTaxa
// ---------------------------------------------------------------------------

const taxonWithCount = (id: number, count: number): INatTaxon => ({ id, name: `Species ${id}`, observations_count: count });

describe('searchTaxa', () => {
  it('deduplicates across groups — first occurrence wins', async () => {
    const groups = Array.from({ length: MARINE_TAXON_IDS.length }, (_, i) =>
      ({ results: i === 0 ? [taxonWithCount(1, 100)] : i === 1 ? [taxonWithCount(1, 999)] : [] })
    );
    mockFetch(groups);

    const result = await searchTaxa('clownfish');

    expect(result.filter(t => t.id === 1)).toHaveLength(1);
    expect(result.find(t => t.id === 1)!.observations_count).toBe(100);
  });

  it('sorts by observations_count descending', async () => {
    const groups = Array.from({ length: MARINE_TAXON_IDS.length }, (_, i) =>
      ({ results: i === 0 ? [taxonWithCount(1, 5), taxonWithCount(2, 50), taxonWithCount(3, 20)] : [] })
    );
    mockFetch(groups);

    const result = await searchTaxa('fish');

    expect(result.map(t => t.observations_count)).toEqual([50, 20, 5]);
  });

  it('caps results at 30', async () => {
    const many = Array.from({ length: 40 }, (_, i) => taxonWithCount(i + 1, 40 - i));
    const groups = Array.from({ length: MARINE_TAXON_IDS.length }, (_, i) => ({ results: i === 0 ? many : [] }));
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
  let mod: any; // re-imported after resetModules to pick up EXPO_PUBLIC_IUCN_TOKEN

  beforeAll(() => {
    process.env.EXPO_PUBLIC_IUCN_TOKEN = 'test-token';
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
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
