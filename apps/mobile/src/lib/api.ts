import { buildSearchTerms, normalizeSearch, rankSongSearchResults } from '@cifras/shared';
import { supabase } from './supabase';

// Important: list screens must NOT fetch `lyrics_chords` (large text) or the app will feel slow
// and can fail on poor connections. Fetch full song only in `fetchSong`.
const SONG_LIST_SELECT =
  'id,title,title_search,artist_id,category,views,original_key,tuning,capo,artists(name,name_search,verified_at)';
const SEARCH_RESULT_LIMIT = 80;
const SUGGESTION_RESULT_LIMIT = 8;

type SongSearchRpcRow = {
  id: string;
  title: string;
  title_search: string;
  artist_id: string | null;
  category: string | null;
  views: number | null;
  original_key: string;
  tuning: string | null;
  capo: number | null;
  artist_name: string | null;
  score?: number | null;
};

export type SearchSuggestion = {
  kind: 'song' | 'artist';
  label: string;
  value: string;
  score?: number | null;
};

type SuggestionRpcRow = {
  kind: string;
  label: string;
  value: string;
  score?: number | null;
};

function mapSongSearchRpcRow(row: SongSearchRpcRow) {
  return {
    id: row.id,
    title: row.title,
    title_search: row.title_search,
    artist_id: row.artist_id,
    category: row.category,
    views: row.views,
    original_key: row.original_key,
    tuning: row.tuning,
    capo: row.capo,
    artists: row.artist_name ? { name: row.artist_name, name_search: normalizeSearch(row.artist_name) } : null,
    score: row.score ?? null
  };
}

function mapSuggestionRpcRow(row: SuggestionRpcRow): SearchSuggestion | null {
  if (typeof row?.value !== 'string' || !row.value.trim()) return null;
  const kind = row.kind === 'artist' ? 'artist' : 'song';
  return {
    kind,
    label: typeof row.label === 'string' && row.label.trim() ? row.label : row.value,
    value: row.value,
    score: row.score ?? null
  };
}

async function fetchSongsViaRpc(search: string, limit = SEARCH_RESULT_LIMIT) {
  const { data, error } = await supabase.rpc('search_songs', {
    search_query: search,
    limit_count: limit
  });
  if (error) throw error;
  return ((data ?? []) as SongSearchRpcRow[]).map(mapSongSearchRpcRow);
}

async function fetchSongsFallback(search: string) {
  const baseQuery = () => supabase.from('songs').select(SONG_LIST_SELECT).order('views', { ascending: false });
  const terms = buildSearchTerms(search).slice(0, 6);
  if (!terms.length) return [];

  const [titleBuckets, artistBuckets, lyricsBuckets] = await Promise.all([
    Promise.all(terms.map((term) => baseQuery().ilike('title_search', `%${term}%`).limit(SEARCH_RESULT_LIMIT))),
    Promise.all(terms.map((term) => supabase.from('artists').select('id').ilike('name_search', `%${term}%`).limit(20))),
    Promise.all(terms.map((term) => baseQuery().ilike('lyrics_chords', `%${term}%`).limit(20)))
  ]);

  for (const bucket of titleBuckets) {
    if (bucket.error) throw bucket.error;
  }
  for (const bucket of artistBuckets) {
    if (bucket.error) throw bucket.error;
  }
  for (const bucket of lyricsBuckets) {
    if (bucket.error) throw bucket.error;
  }

  const byTitle = titleBuckets.flatMap((bucket) => bucket.data ?? []);
  const byLyrics = lyricsBuckets.flatMap((bucket) => bucket.data ?? []);
  const artistIds = Array.from(
    new Set(artistBuckets.flatMap((bucket) => (bucket.data ?? []).map((artist) => artist.id).filter(Boolean)))
  );

  let byArtist: any[] = [];
  if (artistIds.length) {
    const { data, error } = await baseQuery().in('artist_id', artistIds).limit(SEARCH_RESULT_LIMIT);
    if (error) throw error;
    byArtist = data ?? [];
  }

  const dedup = new Map<string, any>();
  for (const row of [...byTitle, ...byArtist, ...byLyrics]) dedup.set(row.id, row);
  return rankSongSearchResults(Array.from(dedup.values()), search).slice(0, SEARCH_RESULT_LIMIT);
}

async function fetchSearchSuggestionsViaRpc(search: string, limit = SUGGESTION_RESULT_LIMIT) {
  const { data, error } = await supabase.rpc('search_suggestions', {
    search_query: search,
    limit_count: limit
  });
  if (error) throw error;

  const mapped = ((data ?? []) as SuggestionRpcRow[])
    .map(mapSuggestionRpcRow)
    .filter((entry): entry is SearchSuggestion => Boolean(entry));
  return mapped.slice(0, limit);
}

export async function fetchSongs(search?: string, artistId?: string) {
  const baseQuery = () => supabase.from('songs').select(SONG_LIST_SELECT).order('views', { ascending: false });

  if (artistId) {
    const { data, error } = await baseQuery().eq('artist_id', artistId);
    if (error) throw error;
    return data ?? [];
  }

  if (!search) {
    const { data, error } = await baseQuery();
    if (error) throw error;
    return data ?? [];
  }

  const term = normalizeSearch(search);
  if (!term) return [];

  try {
    const rpcResults = await fetchSongsViaRpc(term, SEARCH_RESULT_LIMIT);
    if (rpcResults.length > 0) return rpcResults;
  } catch {
    // Fall through to local fallback when RPC is unavailable or not migrated yet.
  }

  return fetchSongsFallback(term);
}

export async function fetchSearchSuggestions(search: string, limit = SUGGESTION_RESULT_LIMIT) {
  const term = normalizeSearch(search);
  if (!term) return [];

  try {
    const rpcResults = await fetchSearchSuggestionsViaRpc(term, limit);
    if (rpcResults.length > 0) return rpcResults;
  } catch {
    // Fall through to local fallback when RPC is unavailable.
  }

  const [songs, artists] = await Promise.all([
    fetchSongsFallback(term),
    supabase.from('artists').select('name').ilike('name_search', `%${term}%`).limit(limit)
  ]);
  if (artists.error) throw artists.error;

  const songSuggestions: SearchSuggestion[] = songs.slice(0, limit).map((song: any) => ({
    kind: 'song',
    label: song.artists?.name ? `${song.title} - ${song.artists.name}` : song.title,
    value: song.title
  }));

  const artistSuggestions: SearchSuggestion[] = (artists.data ?? []).map((artist: any) => ({
    kind: 'artist',
    label: artist.name,
    value: artist.name
  }));

  const dedup = new Map<string, SearchSuggestion>();
  for (const suggestion of [...songSuggestions, ...artistSuggestions]) {
    if (!dedup.has(suggestion.value)) dedup.set(suggestion.value, suggestion);
  }
  return Array.from(dedup.values()).slice(0, limit);
}

export async function fetchSongsPage({
  page,
  pageSize,
  category
}: {
  page: number;
  pageSize: number;
  category?: string | null;
}) {
  const from = page * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('songs')
    .select(SONG_LIST_SELECT)
    .order('views', { ascending: false })
    .range(from, to);

  if (category) query = query.eq('category', category);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function fetchSong(id: string) {
  const { data, error } = await supabase
    .from('songs')
    .select('*, artists(name,verified_at,official_links,profile_highlight)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchArtists() {
  const { data, error } = await supabase.from('artists').select('*').order('name');
  if (error) throw error;
  return data ?? [];
}
