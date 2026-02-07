#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.');
  process.exit(1);
}

const inputDir =
  process.argv[2] && !process.argv[2].startsWith('-')
    ? process.argv[2]
    : '/Users/renandiasoliveira/Desktop/cifras';

const shouldReset = !process.argv.includes('--no-reset');
const keepAllArtists = process.argv.includes('--all');
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const limitIndex = process.argv.findIndex((arg) => arg === '--limit');
const limitRaw = limitArg ? limitArg.split('=')[1] : limitIndex !== -1 ? process.argv[limitIndex + 1] : null;
const limit = limitRaw ? Number(limitRaw) : null;
if (limitRaw && (!Number.isFinite(limit) || limit <= 0)) {
  console.error(`Invalid --limit value: ${limitRaw}`);
  process.exit(1);
}

// Heuristic safeguard: the goal of this MVP is 100% Christian songs.
// If you intentionally want to import everything, pass --all.
const EXCLUDED_ARTIST_SEARCH = new Set(['legiao urbana', 'bruno marrone', 'charlie brown jr.']);

const restBase = `${SUPABASE_URL.replace(/\/$/u, '')}/rest/v1`;
const restHeaders = {
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json'
};

async function rest(method, urlPath, body, prefer) {
  const res = await fetch(`${restBase}${urlPath}`, {
    method,
    headers: {
      ...restHeaders,
      ...(prefer ? { Prefer: prefer } : null)
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : null)
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Supabase REST ${method} ${urlPath} failed: ${res.status} ${res.statusText}${text ? `\n${text}` : ''}`);
  }

  // PostgREST returns empty body for return=minimal.
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) return null;
  return await res.json();
}

function normalizeSearch(input) {
  return String(input)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function compactNormalize(value) {
  return normalizeSearch(value).replace(/\s+/g, '');
}

function titleCaseArtist(input) {
  const raw = String(input ?? '').trim().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ');
  if (!raw) return 'Desconhecido';
  const lower = raw.toLowerCase();
  const small = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);
  return lower
    .split(' ')
    .map((w, idx) => {
      if (idx !== 0 && small.has(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(' ');
}

function parseFilename(filePath, rootDir) {
  const base = path.basename(filePath, path.extname(filePath));
  const withoutPrefix = base.replace(/^\s*\d+\s*-\s*/u, '').trim();
  const parts = withoutPrefix.split(' - ').map((p) => p.trim()).filter(Boolean);

  if (parts.length < 2) {
    // Many datasets are organized as: .../txt/<artist-slug>/<rank - song>.txt
    // In that case, infer the artist from the parent directory.
    const parent = path.basename(path.dirname(filePath));
    const parent2 = path.basename(path.dirname(path.dirname(filePath)));
    const candidate =
      parent && parent !== path.basename(rootDir) && parent !== 'txt' && parent !== 'songs' ? parent : parent2;
    const artist = candidate ? titleCaseArtist(candidate) : 'Desconhecido';
    return { artist, title: withoutPrefix };
  }

  const [artist, ...rest] = parts;
  return { artist, title: rest.join(' - ') };
}

function normalizeKey(key) {
  const match = String(key).trim().match(/^([A-G])([#b])?(m)?$/iu);
  if (!match) return String(key).trim();
  return `${match[1].toUpperCase()}${match[2] ?? ''}${match[3] ? 'm' : ''}`;
}

function detectOriginalKey(text) {
  const lines = String(text).split(/\r?\n/);

  for (const line of lines.slice(0, 40)) {
    const m = line.match(/\bTom\s*[:：]\s*([A-G](?:#|b)?m?)\b/iu);
    if (m?.[1]) return normalizeKey(m[1]);
  }

  for (const line of lines.slice(0, 30)) {
    const m = line.trim().match(/^([A-G](?:#|b)?m?)$/iu);
    if (m?.[1]) return normalizeKey(m[1]);
  }

  for (const line of lines.slice(0, 60)) {
    const m = line.match(/(^|\s)([A-G](?:#|b)?m?)(?=\s|$|\/|\d|\(|\[)/u);
    if (m?.[2]) return normalizeKey(m[2]);
  }

  return 'C';
}

function inferCategory(artist, title) {
  const a = normalizeSearch(artist);
  const t = normalizeSearch(title);

  if (a.includes('harpa')) return 'Harpa Cristã';
  if (a.includes('coral') || t.includes('hino')) return 'Hinos';
  if (t.includes('adoracao') || t.includes('adora')) return 'Adoração';
  return 'Louvor';
}

function isJunkScrapeLine(line) {
  const trimmed = String(line ?? '').trim();
  if (!trimmed) return false;

  const normalized = compactNormalize(trimmed);

  // Credits block (we keep composer + reviewers, but drop everything else).
  if (normalized.startsWith('composicaode')) return false;
  if (normalized.startsWith('colaboracaoerevisao')) return false;

  // Views line: "11.258.341 exibições"
  if (/^\d+(?:\.\d+)*exibicoes$/u.test(normalized)) return true;

  // UI leftovers from scraped pages.
  const exact = new Set([
    'videoaula',
    'simplificarcifra',
    'autorolagem',
    'texto',
    'restaurar',
    'acordes',
    'afinacao',
    'capotraste',
    'exibir',
    'adicionaralista',
    'metronomo',
    'dicionario',
    'baixarcifra',
    'cifraclubpro',
    'cancelar',
    'ok',
    'cancelarok'
  ]);
  if (exact.has(normalized)) return true;

  const contains = [
    'repetir',
    'modoteatro',
    'visualizacaopadrao',
    'miniplayer',
    'outrosvideos',
    'exibircifraemduascolunas',
    'diagramasnocorpodacifra',
    'diagramasnofimdacifra',
    'montagensparacanhoto',
    'afinadoronline'
  ];
  return contains.some((marker) => normalized.includes(marker));
}

function cleanCifraText(raw) {
  const lines = String(raw ?? '').split(/\r?\n/);
  const out = [];

  for (const line of lines) {
    const normalized = compactNormalize(line);

    // Hard stop: after these markers the rest is always UI noise.
    if (normalized === 'videoaula' || normalized === 'cifraclubpro' || normalized === 'afinadoronline') break;

    if (isJunkScrapeLine(line)) continue;
    out.push(line);
  }

  // Trim trailing empty lines.
  while (out.length && !String(out[out.length - 1] ?? '').trim()) out.pop();
  return out.join('\n').trim();
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function resetLibrary() {
  console.log('Resetting public library tables (favorites, songs, artists)...');

  // Deleting songs will cascade delete favorites (favorites.song_id -> songs.id ON DELETE CASCADE).
  await rest('DELETE', '/songs?id=not.is.null', undefined, 'return=minimal');
  await rest('DELETE', '/artists?id=not.is.null', undefined, 'return=minimal');
  console.log('Reset complete.');
}

function findJsonDataset(dirOrFile) {
  try {
    const stats = statSync(dirOrFile);
    if (stats.isFile() && dirOrFile.toLowerCase().endsWith('.json')) return dirOrFile;
    if (stats.isDirectory()) {
      const candidate = path.join(dirOrFile, 'top_artists_top_songs.json');
      try {
        const s2 = statSync(candidate);
        if (s2.isFile()) return candidate;
      } catch {
        return null;
      }
    }
  } catch {
    return null;
  }
  return null;
}

function walkTxtFiles(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (entry.isFile() && entry.name.toLowerCase().endsWith('.txt')) out.push(full);
    }
  }
  return out.sort((a, b) => a.localeCompare(b));
}

async function main() {
  const jsonPath = findJsonDataset(inputDir);
  let parsedSongs = [];

  if (jsonPath) {
    const jsonRaw = readFileSync(jsonPath, 'utf-8');
    const dataset = JSON.parse(jsonRaw);
    const artists = Array.isArray(dataset?.artists) ? dataset.artists : [];
    const songs = [];

    for (const artist of artists) {
      const rows = Array.isArray(artist?.songs) ? artist.songs : [];
      for (const row of rows) {
        if (row?.error) continue;
        const artistName = row?.artist || artist?.artist_name || 'Desconhecido';
        const title = row?.song || row?.title || 'Sem título';
        const txtPath = row?.clean_txt_path;
        const raw = txtPath ? readFileSync(txtPath, 'utf-8') : String(row?.cifra ?? '');
        const cleaned = cleanCifraText(raw);

        const artistSearch = normalizeSearch(artistName);
        if (!keepAllArtists && EXCLUDED_ARTIST_SEARCH.has(artistSearch)) {
          console.log(`Skipping (non-gospel): ${artistName} - ${title}`);
          continue;
        }

        songs.push({
          fileName: txtPath ? path.basename(txtPath) : `${artistName} - ${title}`,
          artist: artistName,
          artist_search: artistSearch,
          title,
          title_search: normalizeSearch(title),
          lyrics_chords: cleaned || raw,
          original_key: detectOriginalKey(cleaned || raw),
          tuning: row?.tuning || 'E A D G B E',
          capo: row?.capo ?? null,
          category: inferCategory(artistName, title),
          views: typeof row?.views === 'number' ? row.views : null
        });
      }
    }

    // Sort deterministically: prefer the dataset views, then title.
    songs.sort((a, b) => {
      const av = typeof a.views === 'number' ? a.views : -1;
      const bv = typeof b.views === 'number' ? b.views : -1;
      if (bv !== av) return bv - av;
      return a.title.localeCompare(b.title);
    });

    const limited = typeof limit === 'number' ? songs.slice(0, limit) : songs;
    parsedSongs = limited;
    console.log(`Using JSON dataset: ${path.basename(jsonPath)} (${parsedSongs.length} songs)`);
  } else {
    const files = walkTxtFiles(inputDir);
    if (!files.length) throw new Error(`No .txt files found in: ${inputDir}`);
    console.log(`Found ${files.length} .txt files in: ${inputDir}`);

    parsedSongs = files
      .map((fullPath) => {
        const raw = readFileSync(fullPath, 'utf-8');
        const cleaned = cleanCifraText(raw);
        const { artist, title } = parseFilename(fullPath, inputDir);
        const artistSearch = normalizeSearch(artist);

        if (!keepAllArtists && EXCLUDED_ARTIST_SEARCH.has(artistSearch)) {
          console.log(`Skipping (non-gospel): ${artist} - ${title}`);
          return null;
        }

        const originalKey = detectOriginalKey(cleaned || raw);
        const category = inferCategory(artist, title);

        return {
          fileName: path.basename(fullPath),
          artist,
          artist_search: artistSearch,
          title,
          title_search: normalizeSearch(title),
          lyrics_chords: cleaned || raw,
          original_key: originalKey,
          tuning: 'E A D G B E',
          capo: null,
          category
        };
      })
      .filter(Boolean);
  }

  // Keep a deterministic "chart" for the Home screen.
  parsedSongs.forEach((song, index) => {
    // If dataset provides a views number, keep it. Otherwise generate a stable sort key.
    if (typeof song.views !== 'number') song.views = Math.max(0, 50000 - index * 900);
  });

  const artistMap = new Map();
  for (const song of parsedSongs) {
    if (!artistMap.has(song.artist_search)) {
      artistMap.set(song.artist_search, { name: song.artist, name_search: song.artist_search });
    }
  }

  if (shouldReset) {
    await resetLibrary();
  } else {
    console.log('Skipping reset (because --no-reset).');
  }

  const artistsPayload = Array.from(artistMap.values());
  console.log(`Inserting artists: ${artistsPayload.length}`);

  const artistIdBySearch = new Map();
  for (const group of chunk(artistsPayload, 100)) {
    const data = await rest('POST', '/artists', group, 'return=representation');
    for (const row of data ?? []) {
      artistIdBySearch.set(row.name_search, row.id);
    }
  }

  console.log(`Inserting songs: ${parsedSongs.length}`);

  const songsPayload = parsedSongs.map((song) => {
    const artistId = artistIdBySearch.get(song.artist_search);
    if (!artistId) {
      throw new Error(`Missing artist id for: ${song.artist} (${song.fileName})`);
    }

    return {
      title: song.title,
      title_search: song.title_search,
      artist_id: artistId,
      lyrics_chords: song.lyrics_chords,
      original_key: song.original_key,
      tuning: song.tuning,
      capo: song.capo,
      category: song.category,
      views: song.views
    };
  });

  for (const group of chunk(songsPayload, 25)) {
    await rest('POST', '/songs', group, 'return=minimal');
  }

  const previewSongs = await rest(
    'GET',
    '/songs?select=title,original_key,views&order=views.desc&limit=5',
    undefined,
    undefined
  );
  const previewArtists = await rest('GET', '/artists?select=name&order=name&limit=5', undefined, undefined);
  console.log('Preview artists:', (previewArtists ?? []).map((a) => a.name).join(' | '));
  console.log('Preview songs:', (previewSongs ?? []).map((s) => `${s.title} (${s.original_key})`).join(' | '));
  console.log('Import complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
