import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

const filePath = process.argv[2];
if (!filePath) {
  throw new Error('Usage: ts-node import_csv.ts <file.csv>');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

const content = readFileSync(filePath, 'utf-8');
const lines = content.split(/\r?\n/).filter(Boolean);

const normalizeSearch = (input: string) =>
  input
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();

const parseLine = (line: string) => line.split(',').map((item) => item.trim());

const headers = parseLine(lines[0]);
const dataLines = headers.includes('title') ? lines.slice(1) : lines;

const getArtistId = async (name: string) => {
  const nameSearch = normalizeSearch(name);
  const { data: existing } = await supabase
    .from('artists')
    .select('id')
    .eq('name_search', nameSearch)
    .limit(1)
    .maybeSingle();

  if (existing?.id) return existing.id;

  const { data, error } = await supabase
    .from('artists')
    .insert({ name, name_search: nameSearch })
    .select('id')
    .single();

  if (error) throw error;
  return data.id;
};

(async () => {
  for (const line of dataLines) {
    const [title, artist, lyrics_chords, original_key, tuning, capo, category] = parseLine(line);
    if (!title || !artist || !lyrics_chords || !original_key) continue;

    const artistId = await getArtistId(artist);
    const payload = {
      title,
      title_search: normalizeSearch(title),
      artist_id: artistId,
      lyrics_chords,
      original_key,
      tuning: tuning || 'E A D G B E',
      capo: capo ? Number(capo) : null,
      category: category || null
    };

    const { error } = await supabase.from('songs').insert(payload);
    if (error) {
      console.error('Failed to insert song', title, error.message);
    } else {
      console.log('Inserted', title);
    }
  }
})();
