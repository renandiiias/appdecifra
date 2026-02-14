import { describe, expect, it } from 'vitest';
import {
  buildSearchTerms,
  normalizeSearch,
  rankSongSearchResults,
  scoreSongSearchResult,
  splitSearchTokens
} from '../src/search';

describe('normalizeSearch', () => {
  it('normalizes accents and repeated spaces', () => {
    expect(normalizeSearch('  Águas   Puras  ')).toBe('aguas puras');
  });
});

describe('splitSearchTokens', () => {
  it('removes punctuation, deduplicates and keeps meaningful tokens', () => {
    expect(splitSearchTokens('  quao,  grande! grande  e? 2 ')).toEqual(['quao', 'grande']);
  });
});

describe('buildSearchTerms', () => {
  it('includes full query plus tokens', () => {
    expect(buildSearchTerms('  Deus Proverá  Sempre ')).toEqual([
      'deus provera sempre',
      'deus',
      'provera',
      'sempre'
    ]);
  });
});

describe('rankSongSearchResults', () => {
  const songs = [
    {
      id: '1',
      title: 'Graca Infinita',
      title_search: 'graca infinita',
      views: 80,
      artists: { name: 'Ministerio Vida' }
    },
    {
      id: '2',
      title: 'Infinita Graca',
      title_search: 'infinita graca',
      views: 250,
      artists: { name: 'Coral Esperanca' }
    },
    {
      id: '3',
      title: 'Ao Unico',
      title_search: 'ao unico',
      views: 1000,
      artists: { name: 'Graca Infinita Worship' }
    }
  ];

  it('prioritizes exact phrase in title', () => {
    const ranked = rankSongSearchResults(songs, 'graca infinita');
    expect(ranked[0]?.id).toBe('1');
  });

  it('still scores artist matches', () => {
    const ranked = rankSongSearchResults(songs, 'worship graca');
    expect(ranked[0]?.id).toBe('3');
  });

  it('rewards fuzzy matches for typos', () => {
    const typoScore = scoreSongSearchResult(songs[0], 'graca infinta');
    const wrongScore = scoreSongSearchResult(songs[1], 'graca infinta');
    expect(typoScore).toBeGreaterThan(wrongScore);
  });
});
