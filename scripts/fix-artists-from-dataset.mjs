#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import process from 'node:process';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.');
  process.exit(1);
}

const datasetDir =
  process.argv[2] && !process.argv[2].startsWith('-')
    ? process.argv[2]
    : '/Users/renandiasoliveira/Desktop/cifras/cifraclub_top100_artists_top10_2026-02-05_221020';

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
    throw new Error(
      `Supabase REST ${method} ${urlPath} failed: ${res.status} ${res.statusText}${text ? `\n${text}` : ''}`
    );
  }

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) return null;
  return await res.json();
}

async function fetchAll(urlPath) {
  const out = [];
  let offset = 0;
  const limit = 1000;
  while (true) {
    const joiner = urlPath.includes('?') ? '&' : '?';
    const page = await rest('GET', `${urlPath}${joiner}limit=${limit}&offset=${offset}`, undefined, undefined);
    out.push(...(page ?? []));
    if (!page || page.length < limit) break;
    offset += limit;
  }
  return out;
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

function isJunkScrapeLine(line) {
  const trimmed = String(line ?? '').trim();
  if (!trimmed) return false;

  const normalized = compactNormalize(trimmed);

  // Credits block (we keep composer + reviewers, but drop everything else).
  if (normalized.startsWith('composicaode')) return false;
  if (normalized.startsWith('colaboracaoerevisao')) return false;

  // Views line: "11.258.341 exibições"
  if (/^\d+(?:\.\d+)*exibicoes$/u.test(normalized)) return true;

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
    if (normalized === 'videoaula' || normalized === 'cifraclubpro' || normalized === 'afinadoronline') break;
    if (isJunkScrapeLine(line)) continue;
    out.push(line);
  }

  while (out.length && !String(out[out.length - 1] ?? '').trim()) out.pop();
  return out.join('\n').trim();
}

function sha1(input) {
  return crypto.createHash('sha1').update(String(input ?? ''), 'utf8').digest('hex');
}

function inferCategory(artist, title) {
  const a = normalizeSearch(artist);
  const t = normalizeSearch(title);
  if (a.includes('harpa')) return 'Harpa Cristã';
  if (a.includes('coral') || t.includes('hino')) return 'Hinos';
  if (t.includes('adoracao') || t.includes('adora')) return 'Adoração';
  return 'Louvor';
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function main() {
  const datasetPath = path.join(datasetDir, 'top_artists_top_songs.json');
  const dataset = JSON.parse(readFileSync(datasetPath, 'utf-8'));
  const artists = Array.isArray(dataset?.artists) ? dataset.artists : [];

  // 1) Figure out the unknown artist id.
  const unknown = await rest('GET', '/artists?select=id,name_search&name=eq.Desconhecido&limit=1', undefined, undefined);
  const unknownArtistId = unknown?.[0]?.id;
  if (!unknownArtistId) throw new Error('Could not find artist row "Desconhecido" in public.artists.');

  // 2) Build canonical artist list from dataset.
  const datasetArtistBySearch = new Map();
  const datasetEntries = [];

  for (const a of artists) {
    const artistName = a?.artist_name || a?.artist || a?.name || 'Desconhecido';
    const artistSearch = normalizeSearch(artistName);
    if (!datasetArtistBySearch.has(artistSearch)) datasetArtistBySearch.set(artistSearch, artistName);

    const rows = Array.isArray(a?.songs) ? a.songs : [];
    for (const row of rows) {
      if (row?.error) continue;
      const txtPath = row?.clean_txt_path;
      if (!txtPath) continue;
      let raw = '';
      try {
        raw = readFileSync(txtPath, 'utf-8');
      } catch {
        continue;
      }
      const cleaned = cleanCifraText(raw);
      const hash = sha1(cleaned || raw);
      // Matching uses the filename-derived title because that's what the initial import used.
      const fileBase = path.basename(txtPath, path.extname(txtPath));
      const titleFromFile = fileBase.replace(/^\s*\d+\s*-\s*/u, '').trim() || (row?.song || row?.title || 'Sem título');
      const titleSearch = normalizeSearch(titleFromFile);
      datasetEntries.push({
        artistName,
        artistSearch,
        title: titleFromFile,
        titleSearch,
        hash,
        category: inferCategory(artistName, titleFromFile)
      });
    }
  }

  console.log(`Dataset loaded: ${datasetEntries.length} songs, ${datasetArtistBySearch.size} artists`);

  // 3) Ensure artists exist in Supabase and normalize existing names to the dataset's spelling.
  const existingArtists = await fetchAll('/artists?select=id,name,name_search');
  const artistIdBySearch = new Map(existingArtists.map((r) => [r.name_search, r.id]));

  // Rename existing where only spelling differs (same name_search).
  for (const row of existingArtists) {
    const canonical = datasetArtistBySearch.get(row.name_search);
    if (canonical && row.name !== canonical) {
      await rest('PATCH', `/artists?id=eq.${row.id}`, { name: canonical }, 'return=minimal');
    }
  }

  const toInsert = [];
  for (const [nameSearch, canonicalName] of datasetArtistBySearch.entries()) {
    if (artistIdBySearch.has(nameSearch)) continue;
    toInsert.push({ name: canonicalName, name_search: nameSearch });
  }

  for (const group of chunk(toInsert, 100)) {
    const inserted = await rest('POST', '/artists', group, 'return=representation');
    for (const row of inserted ?? []) artistIdBySearch.set(row.name_search, row.id);
  }

  console.log(`Artists ready. Inserted: ${toInsert.length}. Total artists now: ${artistIdBySearch.size}`);

  // 4) Fetch unknown songs and build a hash index to match against the dataset.
  const unknownSongs = await fetchAll(
    `/songs?select=id,title,title_search,lyrics_chords,artist_id,category&artist_id=eq.${unknownArtistId}`
  );

  const unknownByKey = new Map();
  for (const s of unknownSongs) {
    const cleaned = cleanCifraText(s.lyrics_chords);
    const hash = sha1(cleaned || s.lyrics_chords);
    const key = `${s.title_search}|${hash}`;
    unknownByKey.set(key, s);
  }

  // 5) Prepare updates (unknown -> canonical artist).
  const updates = [];
  let matched = 0;
  let unmatched = 0;

  for (const entry of datasetEntries) {
    const key = `${entry.titleSearch}|${entry.hash}`;
    const target = unknownByKey.get(key);
    if (!target) {
      unmatched += 1;
      continue;
    }
    const artistId = artistIdBySearch.get(entry.artistSearch);
    if (!artistId) continue;
    matched += 1;
    updates.push({
      songId: target.id,
      artistId,
      category: entry.category
    });
  }

  console.log(`Match results: matched=${matched}, unmatched=${unmatched}, unknownSongs=${unknownSongs.length}`);

  // 6) Apply patches.
  const seen = new Set();
  const uniqueUpdates = updates.filter((u) => {
    if (seen.has(u.songId)) return false;
    seen.add(u.songId);
    return true;
  });

  // Concurrency-limited patch loop.
  const concurrency = 10;
  let idx = 0;
  let ok = 0;
  let fail = 0;

  async function worker() {
    while (true) {
      const current = idx;
      idx += 1;
      if (current >= uniqueUpdates.length) return;
      const u = uniqueUpdates[current];
      try {
        await rest('PATCH', `/songs?id=eq.${u.songId}`, { artist_id: u.artistId, category: u.category }, 'return=minimal');
        ok += 1;
      } catch (e) {
        fail += 1;
        console.error('Patch failed for song', u.songId, e?.message ?? e);
      }
      if ((ok + fail) % 100 === 0) console.log(`Progress: ${ok + fail}/${uniqueUpdates.length}`);
    }
  }

  await Promise.all(Array.from({ length: concurrency }).map(() => worker()));

  console.log(`Updated songs: ok=${ok} fail=${fail}`);

  // 7) Post-check: how many unknown songs remain?
  const remaining = await rest(
    'GET',
    `/songs?select=id&artist_id=eq.${unknownArtistId}&limit=1`,
    undefined,
    'count=exact'
  );
  // We need content-range for accurate count; do a lightweight fetch with Prefer: count=exact.
  const res = await fetch(`${restBase}/songs?select=id&artist_id=eq.${unknownArtistId}&limit=1`, {
    headers: { ...restHeaders, Prefer: 'count=exact' }
  });
  console.log('Remaining unknown songs (content-range):', res.headers.get('content-range'));
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
