import { normalizeSearch } from '@cifras/shared';
import { supabase } from './supabase';

export type Instrument = 'guitar' | 'ukulele';
export type ChordShape = {
  name: string;
  positions: number[];
  fingers?: number[];
  baseFret?: number;
};

// Important: list screens must NOT fetch `lyrics_chords` (large text) or the app will feel slow
// and can fail on poor connections. Fetch full song only in `fetchSong`.
const SONG_LIST_SELECT = 'id,title,artist_id,category,views,original_key,tuning,capo,artists(name)';
const chordShapeCache = new Map<string, ChordShape | null>();
let localChordModulePromise:
  | Promise<{ getChordShapeForInstrument: (name: string, instrument: Instrument) => ChordShape | null }>
  | null = null;

async function getLocalChordShape(name: string, instrument: Instrument): Promise<ChordShape | null> {
  if (!localChordModulePromise) {
    localChordModulePromise = import('../../../../packages/chords/src/index').then((mod: any) => ({
      getChordShapeForInstrument: mod.getChordShapeForInstrument as (name: string, instrument: Instrument) => ChordShape | null
    }));
  }
  const mod = await localChordModulePromise;
  return mod.getChordShapeForInstrument(name, instrument);
}

function normalizeChordNameForDb(raw: string): string {
  const trimmed = String(raw ?? '').trim().replace(/\s+/gu, '');
  if (!trimmed) return trimmed;

  const noParen = trimmed.replace(/\(.*?\)/gu, '');
  const match = noParen.match(/^([A-Ga-g])([#b])?(.*)$/u);
  if (!match) return noParen;

  const root = `${match[1].toUpperCase()}${match[2] ?? ''}`;
  let suffix = String(match[3] ?? '');

  suffix = suffix.replace(/º|°/gu, 'dim').replace(/ø/gu, 'm7b5');
  suffix = suffix.replace(/7M/giu, 'maj7').replace(/M7/gu, 'maj7');

  if (suffix.toLowerCase() === 'major') suffix = '';
  if (suffix.toLowerCase().startsWith('major')) suffix = `maj${suffix.slice(5)}`;
  if (suffix.toLowerCase() === 'minor') suffix = 'm';
  if (suffix.toLowerCase().startsWith('minor')) suffix = `m${suffix.slice(5)}`;

  return `${root}${suffix}`;
}

function chordDbCandidates(name: string): string[] {
  const trimmed = String(name ?? '').trim();
  if (!trimmed) return [];

  const base = normalizeChordNameForDb(trimmed);
  const candidates = new Set<string>();
  candidates.add(base);

  if (base.includes('/')) {
    const [main] = base.split('/');
    if (main) candidates.add(main);
  }

  return Array.from(candidates);
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

export async function fetchChordShape(name: string, instrument: Instrument = 'guitar'): Promise<ChordShape | null> {
  const candidates = chordDbCandidates(name);
  if (!candidates.length) return null;

  const cacheKey = `${instrument}:${candidates.join('|')}`;
  if (chordShapeCache.has(cacheKey)) return chordShapeCache.get(cacheKey) ?? null;

  const { data, error } = await supabase
    .from('chord_shapes')
    .select('chord_name,normalized_name,positions,fingers,base_fret')
    .eq('instrument', instrument)
    .in('normalized_name', candidates);

  if (error) {
    // Temporary fallback while the remote table is not available in all envs.
    const local = await getLocalChordShape(name, instrument);
    chordShapeCache.set(cacheKey, local);
    return local;
  }
  const rows = (data ?? []) as Array<{
    chord_name: string;
    normalized_name: string;
    positions: number[] | null;
    fingers: number[] | null;
    base_fret: number | null;
  }>;

  const byName = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const key = String(row.normalized_name ?? '').trim();
    if (!key) continue;
    const existing = byName.get(key);
    if (!existing) {
      byName.set(key, row);
      continue;
    }
    // Prefer lower-position shapes when duplicates exist.
    const a = existing.base_fret ?? 999;
    const b = row.base_fret ?? 999;
    if (b < a) byName.set(key, row);
  }

  const match = candidates.map((candidate) => byName.get(candidate)).find(Boolean);
  if (!match || !Array.isArray(match.positions) || !match.positions.length) {
    const local = await getLocalChordShape(name, instrument);
    chordShapeCache.set(cacheKey, local);
    return local;
  }

  const shape: ChordShape = {
    name: String(match.chord_name || name),
    positions: match.positions,
    ...(Array.isArray(match.fingers) && match.fingers.length ? { fingers: match.fingers } : null),
    ...(typeof match.base_fret === 'number' && match.base_fret > 0 ? { baseFret: match.base_fret } : null)
  };

  chordShapeCache.set(cacheKey, shape);
  return shape;
}
