const SEARCH_TOKEN_MAX = 6;
const SEARCH_TOKEN_MIN_LENGTH = 2;
const SEARCH_SANITIZE_REGEX = /[^a-z0-9\s]/g;

function squeezeWhitespace(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toSearchableText(input: string): string {
  return squeezeWhitespace(normalizeSearch(input).replace(SEARCH_SANITIZE_REGEX, ' '));
}

function hasWordBoundaryMatch(haystack: string, token: string): boolean {
  if (!haystack || !token) return false;
  const regex = new RegExp(`(^|\\s)${escapeRegExp(token)}(\\s|$)`);
  return regex.test(haystack);
}

function diceCoefficient(left: string, right: string): number {
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.length < 2 || right.length < 2) return 0;

  const leftBigrams = new Map<string, number>();
  for (let i = 0; i < left.length - 1; i += 1) {
    const bigram = left.slice(i, i + 2);
    leftBigrams.set(bigram, (leftBigrams.get(bigram) ?? 0) + 1);
  }

  let intersection = 0;
  for (let i = 0; i < right.length - 1; i += 1) {
    const bigram = right.slice(i, i + 2);
    const count = leftBigrams.get(bigram) ?? 0;
    if (count > 0) {
      leftBigrams.set(bigram, count - 1);
      intersection += 1;
    }
  }

  return (2 * intersection) / (left.length + right.length - 2);
}

export type SongSearchCandidate = {
  id?: string;
  title?: string | null;
  title_search?: string | null;
  views?: number | null;
  artists?: { name?: string | null; name_search?: string | null } | null;
  artist_name?: string | null;
};

export function stripAccents(input: string): string {
  return input.normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

export function normalizeSearch(input: string): string {
  return squeezeWhitespace(stripAccents(input).toLowerCase());
}

export function splitSearchTokens(input: string, maxTokens = SEARCH_TOKEN_MAX): string[] {
  const normalized = toSearchableText(input);
  if (!normalized) return [];

  return Array.from(
    new Set(
      normalized
        .split(' ')
        .map((token) => token.trim())
        .filter((token) => token.length >= SEARCH_TOKEN_MIN_LENGTH)
    )
  ).slice(0, maxTokens);
}

export function buildSearchTerms(input: string, maxTokens = SEARCH_TOKEN_MAX): string[] {
  const normalized = toSearchableText(input);
  if (!normalized) return [];

  const terms = [normalized, ...splitSearchTokens(normalized, maxTokens)];
  return Array.from(new Set(terms));
}

export function scoreSongSearchResult(song: SongSearchCandidate, query: string): number {
  const normalizedQuery = toSearchableText(query);
  if (!normalizedQuery) return 0;

  const titleSearch = toSearchableText(song.title_search ?? song.title ?? '');
  const artistSource = song.artists?.name_search ?? song.artists?.name ?? song.artist_name ?? '';
  const artistSearch = toSearchableText(artistSource);
  const tokens = splitSearchTokens(normalizedQuery);
  const views = typeof song.views === 'number' ? song.views : 0;

  let score = 0;

  if (titleSearch === normalizedQuery) score += 1500;
  else if (titleSearch.startsWith(normalizedQuery)) score += 900;
  else if (titleSearch.includes(normalizedQuery)) score += 650;

  if (artistSearch === normalizedQuery) score += 700;
  else if (artistSearch.startsWith(normalizedQuery)) score += 420;
  else if (artistSearch.includes(normalizedQuery)) score += 220;

  let matchedTokens = 0;
  for (const token of tokens) {
    const inTitle = titleSearch.includes(token);
    const inArtist = artistSearch.includes(token);

    if (inTitle || inArtist) matchedTokens += 1;
    if (inTitle) score += hasWordBoundaryMatch(titleSearch, token) ? 130 : 85;
    if (inArtist) score += hasWordBoundaryMatch(artistSearch, token) ? 75 : 45;
  }

  if (tokens.length > 0) {
    if (matchedTokens === tokens.length) score += 260;
    else score += (matchedTokens / tokens.length) * 120;
  }

  score += Math.max(diceCoefficient(titleSearch, normalizedQuery), diceCoefficient(artistSearch, normalizedQuery)) * 240;
  score += Math.log(Math.max(views, 0) + 1) * 10;

  return score;
}

export function rankSongSearchResults<T extends SongSearchCandidate>(songs: T[], query: string): T[] {
  const normalizedQuery = toSearchableText(query);
  if (!normalizedQuery) return [...songs];

  return [...songs]
    .map((song, index) => ({
      song,
      index,
      score: scoreSongSearchResult(song, normalizedQuery),
      views: typeof song.views === 'number' ? song.views : 0
    }))
    .sort((left, right) => right.score - left.score || right.views - left.views || left.index - right.index)
    .map((entry) => entry.song);
}

export function slugify(input: string): string {
  return normalizeSearch(input)
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
