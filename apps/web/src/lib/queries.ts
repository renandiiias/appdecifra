import { buildSearchTerms, normalizeSearch, rankSongSearchResults, slugify } from '@cifras/shared';
import type { Artist, Song } from '@cifras/shared';
import { getSupabaseServer } from './supabaseServer';

export type SongWithArtist = Song & { artists?: { name: string; name_search?: string } | null };
export type SongListItemWithArtist = Pick<
  Song,
  'id' | 'title' | 'title_search' | 'artist_id' | 'category' | 'views' | 'original_key' | 'tuning' | 'capo'
> &
  {
    artists?: { name: string; name_search?: string } | null;
  };
const SONG_LIST_SELECT = 'id,title,title_search,artist_id,category,views,original_key,tuning,capo,artists(name,name_search)';
const SEARCH_RESULT_LIMIT = 120;

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
};

function mapSongSearchRpcRow(row: SongSearchRpcRow): SongListItemWithArtist {
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
    artists: row.artist_name ? { name: row.artist_name } : null
  };
}

async function getSongsViaRpc(search: string) {
  const supabase = getSupabaseServer();
  const { data, error } = await (supabase as any).rpc('search_songs', {
    search_query: search,
    limit_count: SEARCH_RESULT_LIMIT
  });
  if (error) throw error;
  return ((data as SongSearchRpcRow[] | null) ?? []).map(mapSongSearchRpcRow);
}

async function getSongsFallback(search: string) {
  const supabase = getSupabaseServer();
  const baseQuery = () =>
    supabase
      .from('songs')
      .select(SONG_LIST_SELECT)
      .order('views', { ascending: false });

  const terms = buildSearchTerms(search).slice(0, 6);
  if (!terms.length) return [];

  const [titleBuckets, artistBuckets, lyricsBuckets] = await Promise.all([
    Promise.all(terms.map((term) => baseQuery().ilike('title_search', `%${term}%`).limit(SEARCH_RESULT_LIMIT))),
    Promise.all(terms.map((term) => supabase.from('artists').select('id').ilike('name_search', `%${term}%`).limit(30))),
    Promise.all(terms.map((term) => baseQuery().ilike('lyrics_chords', `%${term}%`).limit(30)))
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

  const byTitle = titleBuckets.flatMap((bucket) => (bucket.data as SongListItemWithArtist[] | null) ?? []);
  const byLyrics = lyricsBuckets.flatMap((bucket) => (bucket.data as SongListItemWithArtist[] | null) ?? []);
  const artistIds = Array.from(
    new Set(
      artistBuckets.flatMap((bucket) =>
        ((bucket.data as { id: string }[] | null) ?? [])
          .map((artist) => artist.id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0)
      )
    )
  );

  let byArtist: SongListItemWithArtist[] = [];
  if (artistIds.length) {
    const { data, error } = await baseQuery().in('artist_id', artistIds).limit(SEARCH_RESULT_LIMIT);
    if (error) throw error;
    byArtist = (data as SongListItemWithArtist[] | null) ?? [];
  }

  const dedup = new Map<string, SongListItemWithArtist>();
  for (const row of [...byTitle, ...byArtist, ...byLyrics]) dedup.set(row.id, row);
  return rankSongSearchResults(Array.from(dedup.values()), search).slice(0, SEARCH_RESULT_LIMIT);
}

export async function getArtists() {
  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from('artists')
    .select('*')
    .order('name');
  if (error) throw error;
  return (data as Artist[] | null) ?? [];
}

export async function getArtistBySlug(slug: string) {
  const artists = await getArtists();
  return artists.find((artist: Artist) => slugify(artist.name) === slug) ?? null;
}

export async function getSongs(params?: { search?: string; artistId?: string }) {
  const supabase = getSupabaseServer();
  let query = supabase.from('songs').select(SONG_LIST_SELECT).order('views', { ascending: false });

  if (params?.artistId) {
    query = query.eq('artist_id', params.artistId);
  }

  if (params?.search) {
    const search = normalizeSearch(params.search);
    if (!search) return [];
    try {
      const rpcResults = await getSongsViaRpc(search);
      if (rpcResults.length > 0) return rpcResults;
    } catch {
      // Fall through to fallback when RPC is unavailable.
    }
    return getSongsFallback(search);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data as SongListItemWithArtist[] | null) ?? [];
}

export async function getSongById(id: string) {
  const supabase = getSupabaseServer();
  const { data, error } = await supabase.from('songs').select('*, artists(name)').eq('id', id).single();
  if (error) return null;
  return data as SongWithArtist;
}

export async function getArtistSongs(artistId: string) {
  return getSongs({ artistId });
}

export async function getSharedPlaylistById(id: string) {
  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from('shared_playlists')
    .select('id,title,description,is_public,created_at')
    .eq('id', id)
    .single();
  if (error) return null;
  return data as any;
}

export async function getSharedPlaylistSongs(id: string) {
  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from('shared_playlist_items')
    .select('song_id,added_at,songs(id,title,category,artists(name))')
    .eq('playlist_id', id)
    .order('added_at', { ascending: false })
    .limit(600);
  if (error) return [];
  return (data as any[] | null) ?? [];
}

export async function getSharedSetlistById(id: string) {
  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from('shared_setlists')
    .select('id,title,scheduled_at,church_name,payload,is_public,created_at')
    .eq('id', id)
    .single();
  if (error) return null;
  return data as any;
}
