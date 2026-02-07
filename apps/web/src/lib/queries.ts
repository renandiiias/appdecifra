import { normalizeSearch, slugify } from '@cifras/shared';
import type { Artist, Song } from '@cifras/shared';
import { getSupabaseServer } from './supabaseServer';

export type SongWithArtist = Song & { artists?: { name: string } | null };

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
  let query = supabase.from('songs').select('*, artists(name)').order('views', { ascending: false });

  if (params?.artistId) {
    query = query.eq('artist_id', params.artistId);
  }

  if (params?.search) {
    const search = normalizeSearch(params.search);
    query = query.ilike('title_search', `%${search}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data as SongWithArtist[] | null) ?? [];
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
