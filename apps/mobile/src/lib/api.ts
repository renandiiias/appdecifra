import { normalizeSearch } from '@cifras/shared';
import { supabase } from './supabase';

// Important: list screens must NOT fetch `lyrics_chords` (large text) or the app will feel slow
// and can fail on poor connections. Fetch full song only in `fetchSong`.
const SONG_LIST_SELECT = 'id,title,artist_id,category,views,original_key,tuning,capo,artists(name)';

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
  const pattern = `%${term}%`;

  // Search by title and artist name (accent/case-insensitive via *_search columns).
  const [{ data: byTitle, error: titleError }, { data: matchedArtists, error: artistsError }] = await Promise.all([
    baseQuery().ilike('title_search', pattern),
    supabase.from('artists').select('id').ilike('name_search', pattern)
  ]);

  if (titleError) throw titleError;
  if (artistsError) throw artistsError;

  const artistIds = (matchedArtists ?? []).map((a) => a.id).filter(Boolean);
  let byArtist: any[] = [];
  if (artistIds.length) {
    const { data, error } = await baseQuery().in('artist_id', artistIds);
    if (error) throw error;
    byArtist = data ?? [];
  }

  const dedup = new Map<string, any>();
  for (const row of [...(byTitle ?? []), ...byArtist]) dedup.set(row.id, row);
  return Array.from(dedup.values());
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
  const { data, error } = await supabase.from('songs').select('*, artists(name)').eq('id', id).single();
  if (error) throw error;
  return data;
}

export async function fetchArtists() {
  const { data, error } = await supabase.from('artists').select('*').order('name');
  if (error) throw error;
  return data ?? [];
}
