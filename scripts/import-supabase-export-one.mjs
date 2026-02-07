#!/usr/bin/env node
/**
 * Import/update a single song from a Supabase export folder (CSV) into the app tables:
 * - public.artists
 * - public.songs
 *
 * This is intended for a "smoke test" before importing everything.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-supabase-export-one.mjs "/path/to/export"
 *
 * Optional:
 *   --artist "Isaías Saad" --song "Bondade de Deus"   (forces matching row)
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

const artistIdx = process.argv.findIndex((arg) => arg === '--artist');
const songIdx = process.argv.findIndex((arg) => arg === '--song');
const artistWanted = artistIdx !== -1 ? process.argv[artistIdx + 1] : null;
const songWanted = songIdx !== -1 ? process.argv[songIdx + 1] : null;
const debug = process.argv.includes('--debug') || process.env.DEBUG_IMPORT === '1';

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

async function pickSongRow() {
  let best = null;
  let bestViews = -1;

  const parser = createReadStream(songsCsvPath).pipe(
    parse({
      columns: true,
      relax_quotes: true,
      relax_column_count: true,
      bom: true
    })
  );

  for await (const row of parser) {
    if (row.error) continue;
    if (!truthyFlag(row.has_chords)) continue;
    if (!row.text_clean) continue;

    if (artistWanted && normalizeSearch(row.artist_name) !== normalizeSearch(artistWanted)) continue;
    if (songWanted && normalizeSearch(row.song_name) !== normalizeSearch(songWanted)) continue;

    const views = safeInt(row.views) ?? 0;
    if (views > bestViews) {
      best = row;
      bestViews = views;
    }
  }

  if (!best) {
    throw new Error(
      `No valid song found in export (songs.csv). Tried filters: artist=${artistWanted ?? '(any)'}, song=${songWanted ?? '(any)'}`
    );
  }

  return best;
}

async function ensureArtist(artistName) {
  const name = String(artistName ?? '').trim() || 'Desconhecido';
  const name_search = normalizeSearch(name);

  const q = new URLSearchParams({
    select: 'id,name',
    name_search: `eq.${name_search}`,
    limit: '1'
  });
  const existing = await rest('GET', `/artists?${q.toString()}`);
  if (existing?.[0]?.id) return existing[0];

  const created = await rest('POST', '/artists', { name, name_search }, 'return=representation');
  if (!created?.[0]?.id) throw new Error('Failed to create artist (no id returned).');
  return created[0];
}

async function upsertSongForArtist(artistId, song) {
  const title = String(song.song_name ?? song.title ?? '').trim();
  if (!title) throw new Error('Missing song title in export row.');

  const title_search = normalizeSearch(title);

  const findQ = new URLSearchParams({
    select: 'id,views',
    artist_id: `eq.${artistId}`,
    title_search: `eq.${title_search}`,
    order: 'views.desc.nullslast',
    limit: '1'
  });
  const found = await rest('GET', `/songs?${findQ.toString()}`);

  const payload = {
    lyrics_chords: formatCreditsIntoText(String(song.text_clean ?? ''), song),
    // Cifra Club often exposes the "shape key" (the chords shown) and a "sounding key" (Tom).
    // Our MVP schema only has one key field, so we store the shape key to keep chords/transposition consistent.
    // When capo is present, the UI can derive the sounding key as transpose(shapeKey, capo).
    original_key: normalizeKey(song.shape_key || song.key),
    tuning: String(song.tuning ?? '').trim() || 'E A D G B E',
    capo: safeInt(song.capo),
    views: safeInt(song.views) ?? 0,
    category: inferCategory(song.artist_name, title)
  };

  if (found?.[0]?.id) {
    const id = found[0].id;
    await rest('PATCH', `/songs?id=eq.${id}`, payload, 'return=minimal');
    return { action: 'updated', id };
  }

  const created = await rest(
    'POST',
    '/songs',
    {
      title,
      title_search,
      artist_id: artistId,
      ...payload
    },
    'return=representation'
  );
  if (!created?.[0]?.id) throw new Error('Failed to create song (no id returned).');
  return { action: 'inserted', id: created[0].id };
}

const row = await pickSongRow();
const artist = await ensureArtist(row.artist_name);
const result = await upsertSongForArtist(artist.id, row);

console.log(JSON.stringify({
  ok: true,
  action: result.action,
  song_id: result.id,
  artist: artist.name,
  title: row.song_name,
  key: row.key,
  capo: row.capo,
  tuning: row.tuning,
  views: row.views,
  ...(debug ? { source_url: row.canonical_url || row.final_url || row.url || null } : null)
}, null, 2));
