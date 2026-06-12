import { getTaxonPhotoUrl } from '../index';
import type { INatTaxon } from '../index';

describe('getTaxonPhotoUrl', () => {
  it('returns medium_url when present', () => {
    const taxon: INatTaxon = { id: 1, name: 'x', default_photo: { medium_url: 'https://img/medium.jpg' } };
    expect(getTaxonPhotoUrl(taxon)).toBe('https://img/medium.jpg');
  });

  it('falls back to url with square replaced by medium', () => {
    const taxon: INatTaxon = { id: 1, name: 'x', default_photo: { url: 'https://img/square.jpg' } };
    expect(getTaxonPhotoUrl(taxon)).toBe('https://img/medium.jpg');
  });

  it('prefers medium_url over the url fallback', () => {
    const taxon: INatTaxon = {
      id: 1, name: 'x',
      default_photo: { medium_url: 'https://img/medium.jpg', url: 'https://img/square.jpg' },
    };
    expect(getTaxonPhotoUrl(taxon)).toBe('https://img/medium.jpg');
  });

  it('returns undefined when taxon has no default_photo', () => {
    expect(getTaxonPhotoUrl({ id: 1, name: 'x' })).toBeUndefined();
  });

  it('returns undefined when taxon is undefined', () => {
    expect(getTaxonPhotoUrl(undefined)).toBeUndefined();
  });

  it('returns undefined when default_photo has no url fields', () => {
    const taxon: INatTaxon = { id: 1, name: 'x', default_photo: { attribution: 'author' } };
    expect(getTaxonPhotoUrl(taxon)).toBeUndefined();
  });
});
