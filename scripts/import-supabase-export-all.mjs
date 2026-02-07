#!/usr/bin/env node
/**
 * Bulk import artists + songs from a Supabase export folder (CSV) into app tables.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-supabase-export-all.mjs "/path/to/export"
 *
 * Flags:
 *   --no-reset        Do not delete existing artists/songs before import.
 *   --include-nochord Include rows without chords (default skips).
 *   --limit=N         Import only N songs (debug).
 */
import { createReadStream } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parse } from 'csv-parse';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.');
  process.exit(1);
}

const defaultDir = '/Users/renandiasoliveira/Desktop/scrape cifras/output/supabase_export_2026-02-07_143853';
const inputDir =
  process.argv[2] && !process.argv[2].startsWith('-') ? process.argv[2] : defaultDir;

const shouldReset = !process.argv.includes('--no-reset');
const includeNoChord = process.argv.includes('--include-nochord');
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : null;
if (limitArg && (!Number.isFinite(limit) || limit <= 0)) {
  console.error(`Invalid --limit value: ${limitArg}`);
  process.exit(1);
}

const artistsCsvPath = path.join(inputDir, 'artists.csv');
const songsCsvPath = path.join(inputDir, 'songs.csv');

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

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) return null;
  return await res.json();
}

function normalizeSearch(input) {
  return String(input ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeKey(key) {
  const match = String(key ?? '').trim().match(/^([A-G])([#b])?(m)?$/iu);
  if (!match) return String(key ?? '').trim() || 'C';
  return `${match[1].toUpperCase()}${match[2] ?? ''}${match[3] ? 'm' : ''}`;
}

function inferCategory(artist, title) {
  const a = normalizeSearch(artist);
  const t = normalizeSearch(title);
  if (a.includes('harpa')) return 'Harpa Cristã';
  if (a.includes('coral') || t.includes('hino')) return 'Hinos';
  if (t.includes('adoracao') || t.includes('adora')) return 'Adoração';
  return 'Louvor';
}

function isScrapeUrlLine(line) {
  const t = String(line ?? '').trim().toLowerCase();
  if (!t) return false;
  if (t.startsWith('http://') || t.startsWith('https://')) return true;
  if (t.includes('cifraclub.com.br')) return true;
  if (t.includes('www.')) return true;
  return false;
}

function cleanExportText(raw) {
  const lines = String(raw ?? '').split(/\r?\n/u);
  const out = [];
  let blank = 0;

  for (const lineRaw of lines) {
    const line = String(lineRaw ?? '').replace(/\s+$/u, '');
    const trimmed = line.trim();

    if (isScrapeUrlLine(trimmed)) continue;

    // "11.258.341 exibições"
    if (/^\d+(?:\.\d+)*\s+exibiç(?:ões|oes)$/iu.test(trimmed)) continue;

    if (!trimmed) {
      blank += 1;
      if (blank > 2) continue;
      out.push('');
      continue;
    }

    blank = 0;
    out.push(line);
  }

  return out.join('\n').trim();
}

function formatCreditsIntoText(baseText, row) {
  const text = cleanExportText(baseText);
  if (!text) return text;

  const normalized = normalizeSearch(text);
  const alreadyHasComposer = normalized.includes('composicao:') || normalized.includes('composição:');
  const alreadyHasReview = normalized.includes('colaboracao') || normalized.includes('colaboração');
  if (alreadyHasComposer || alreadyHasReview) return text;

  const credits = [];

  const composerRaw = String(row.composer_raw ?? '').trim();
  if (composerRaw) {
    const cleaned = composerRaw.replace(/\s*\/\s*/gu, ', ').replace(/\s+/gu, ' ').trim();
    credits.push(`Composição: ${cleaned}.`);
  }

  const collaboratorsRaw = String(row.collaborators ?? '').trim();
  if (collaboratorsRaw) {
    try {
      const parsed = JSON.parse(collaboratorsRaw);
      if (Array.isArray(parsed) && parsed.length) {
        const list = parsed.map((v) => String(v).trim()).filter(Boolean);
        if (list.length) credits.push(`Colaboração e revisão: ${list.join(', ')}.`);
      }
    } catch {
      // ignore
    }
  }

  if (!credits.length) return text;
  return `${text}\n\n${credits.join('\n')}`;
}

function truthyFlag(value) {
  const v = String(value ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'y';
}

function safeInt(value) {
  const n = Number(String(value ?? '').trim());
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

async function deleteAll() {
  // Order matters: songs first then artists (favorites cascade).
  await rest('DELETE', '/songs?id=neq.00000000-0000-0000-0000-000000000000', null, 'return=minimal');
  await rest('DELETE', '/artists?id=neq.00000000-0000-0000-0000-000000000000', null, 'return=minimal');
}

async function fetchArtistsMap() {
  const map = new Map();
  const pageSize = 1000;
  let offset = 0;
  while (true) {
    const q = new URLSearchParams({
      select: 'id,name,name_search',
      order: 'created_at.asc',
      limit: String(pageSize),
      offset: String(offset)
    });
    const rows = await rest('GET', `/artists?${q.toString()}`);
    if (!rows?.length) break;
    for (const row of rows) map.set(row.name_search, row.id);
    offset += rows.length;
    if (rows.length < pageSize) break;
  }
  return map;
}

async function insertArtistsFromCsv() {
  const seen = new Set();
  const batch = [];
  const batchSize = 500;
  let count = 0;

  const parser = createReadStream(artistsCsvPath).pipe(
    parse({ columns: true, relax_quotes: true, relax_column_count: true, bom: true })
  );

  for await (const row of parser) {
    const name = String(row.name ?? '').trim();
    if (!name) continue;
    const name_search = normalizeSearch(name);
    if (seen.has(name_search)) continue;
    seen.add(name_search);
    batch.push({ name, name_search });
    count += 1;

    if (batch.length >= batchSize) {
      await rest('POST', '/artists', batch, 'return=minimal');
      batch.length = 0;
      process.stdout.write(`Inserted artists: ${count}\r`);
    }
  }

  if (batch.length) {
    await rest('POST', '/artists', batch, 'return=minimal');
  }
  process.stdout.write(`Inserted artists: ${count}\n`);
}

async function importSongs(artistMap) {
  const batch = [];
  const batchSize = 200;
  let count = 0;

  const parser = createReadStream(songsCsvPath).pipe(
    parse({ columns: true, relax_quotes: true, relax_column_count: true, bom: true })
  );

  for await (const row of parser) {
    if (row.error) continue;
    if (!includeNoChord && !truthyFlag(row.has_chords)) continue;
    if (!row.text_clean) continue;

    const artistName = String(row.artist_name ?? '').trim() || 'Desconhecido';
    const name_search = normalizeSearch(artistName);
    let artistId = artistMap.get(name_search);
    if (!artistId) {
      // create on the fly (rare)
      const created = await rest('POST', '/artists', { name: artistName, name_search }, 'return=representation');
      artistId = created?.[0]?.id;
      if (artistId) artistMap.set(name_search, artistId);
    }
    if (!artistId) continue;

    const title = String(row.song_name ?? row.title ?? '').trim();
    if (!title) continue;

    const record = {
      title,
      title_search: normalizeSearch(title),
      artist_id: artistId,
      lyrics_chords: formatCreditsIntoText(String(row.text_clean ?? ''), row),
      original_key: normalizeKey(row.shape_key || row.key),
      tuning: String(row.tuning ?? '').trim() || 'E A D G B E',
      capo: safeInt(row.capo),
      category: inferCategory(artistName, title),
      views: safeInt(row.views) ?? 0
    };

    batch.push(record);
    count += 1;

    if (limit && count >= limit) break;

    if (batch.length >= batchSize) {
      await rest('POST', '/songs', batch, 'return=minimal');
      batch.length = 0;
      process.stdout.write(`Inserted songs: ${count}\r`);
    }
  }

  if (batch.length) {
    await rest('POST', '/songs', batch, 'return=minimal');
  }
  process.stdout.write(`Inserted songs: ${count}\n`);
}

console.log(`Import from: ${inputDir}`);
if (shouldReset) {
  console.log('Resetting songs + artists...');
  await deleteAll();
}

console.log('Importing artists...');
await insertArtistsFromCsv();

console.log('Refreshing artist map...');
const artistMap = await fetchArtistsMap();

console.log('Importing songs...');
await importSongs(artistMap);

console.log('Done.');
