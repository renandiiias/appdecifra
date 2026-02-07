import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

function stripAccents(input) {
  return input.normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

function normalizeSearch(input) {
  return stripAccents(input).toLowerCase().trim();
}

const NOTES = new Set(['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B']);
const SUFFIX_RE = /^(maj|min|m|dim|aug|sus|add)?(2|4|5|6|7|9|11|13)?(b5|#5|b9|#9)?$/i;
const TOKEN_RE = /\S+/g;

function splitMainAndBass(token) {
  let depth = 0;
  for (let i = 0; i < token.length; i += 1) {
    const ch = token[i];
    if (ch === '(') depth += 1;
    if (ch === ')' && depth > 0) depth -= 1;
    if (ch === '/' && depth === 0) {
      return { main: token.slice(0, i), bass: token.slice(i + 1) || null };
    }
  }
  return { main: token, bass: null };
}

function normalizeSuffix(value) {
  return value
    .replace(/\s+/g, '')
    .replace(/7M/g, 'maj7')
    .replace(/M7/g, 'maj7')
    .replace(/7m/g, 'min7')
    .replace(/m7/g, 'min7')
    .replace(/maj/gi, 'maj')
    .replace(/min/gi, 'min')
    .replace(/sus/gi, 'sus')
    .replace(/add/gi, 'add')
    .replace(/dim/gi, 'dim')
    .replace(/aug/gi, 'aug');
}

function splitSuffixParens(suffix) {
  const parens = [];
  let main = '';
  let i = 0;
  while (i < suffix.length) {
    const ch = suffix[i];
    if (ch === '(') {
      const end = suffix.indexOf(')', i + 1);
      if (end === -1) {
        main += suffix.slice(i);
        break;
      }
      parens.push(suffix.slice(i + 1, end));
      i = end + 1;
      continue;
    }
    main += ch;
    i += 1;
  }
  return { main, parens };
}

function isValidSuffixParen(value) {
  const v = value.trim();
  if (!v) return false;
  return /^[0-9#b/+\-.]+$/i.test(v);
}

function isCommonComplexSuffix(normalizedSuffix) {
  const normalized = normalizeSuffix(normalizedSuffix).toLowerCase();
  const common = new Set([
    'maj7',
    'maj9',
    'maj13',
    'min7',
    'min9',
    'min11',
    'min13',
    'm7',
    'm9',
    'm11',
    'm13',
    'm7b5',
    'dim7',
    'aug7',
    'sus2',
    'sus4',
    'add9',
    'add2',
    'add4'
  ]);
  return common.has(normalized);
}

function isChordMain(value) {
  const match = value.match(/^([A-G])([#b])?(.*)$/);
  if (!match) return false;
  const root = `${match[1]}${match[2] ?? ''}`;
  if (!NOTES.has(root)) return false;
  const suffix = match[3] ?? '';
  if (!suffix) return true;

  const { main, parens } = splitSuffixParens(suffix);
  if (parens.length > 0 && !parens.every(isValidSuffixParen)) return false;

  const normalized = normalizeSuffix(main);
  if (!normalized) return parens.length > 0;
  return SUFFIX_RE.test(normalized) || isCommonComplexSuffix(normalized);
}

function isChordToken(token) {
  const { main, bass } = splitMainAndBass(token);
  if (!isChordMain(main)) return false;
  if (bass && !bass.match(/^[A-G][#b]?$/)) return false;
  return true;
}

function stripToken(token) {
  const leadMatch = token.match(/^[^A-Ga-g]*/);
  const trailMatch = token.match(/[^\p{L}\p{N}#b/()]*$/u);
  const lead = leadMatch ? leadMatch[0] : '';
  const trail = trailMatch ? trailMatch[0] : '';
  let core = token.slice(lead.length, token.length - trail.length);

  // Move unmatched trailing ")" out of the core so "(C9)" is preserved as lead "(" + core "C9" + trail ")".
  let extraTrail = '';
  while (core.endsWith(')')) {
    const openCount = (core.match(/\(/g) ?? []).length;
    const closeCount = (core.match(/\)/g) ?? []).length;
    if (closeCount <= openCount) break;
    core = core.slice(0, -1);
    extraTrail = `)${extraTrail}`;
  }

  return { lead, core, trail: `${extraTrail}${trail}` };
}

function isTablatureLine(line) {
  const start = line.trimStart();
  return /^[eEADGB]\|/.test(start) && /[-0-9]/.test(start);
}

function tokenizeLine(line) {
  if (isTablatureLine(line)) return [{ type: 'text', value: line }];

  const rawTokens = [];
  for (const match of line.matchAll(TOKEN_RE)) {
    const token = match[0];
    const start = match.index ?? 0;
    const { lead, core, trail } = stripToken(token);
    rawTokens.push({
      token,
      start,
      lead,
      core,
      trail,
      chordCandidate: Boolean(core) && isChordToken(core)
    });
  }

  const meaningful = rawTokens.filter((item) => item.core.length > 0);
  const chordCandidates = meaningful.filter((item) => item.chordCandidate);
  const chordCandidateCount = chordCandidates.length;
  const meaningfulCount = meaningful.length;
  const chordRatio = meaningfulCount === 0 ? 0 : chordCandidateCount / meaningfulCount;
  const lineIsChordy = chordCandidateCount > 0 && chordRatio >= 0.6;

  const leadingChordIndexes = new Set();
  let leadingChordRun = 0;
  for (let i = 0; i < rawTokens.length; i += 1) {
    const item = rawTokens[i];
    if (!item.core) continue;
    if (item.chordCandidate) {
      leadingChordIndexes.add(i);
      leadingChordRun += 1;
      continue;
    }
    break;
  }

  const tokens = [];
  let index = 0;
  for (let i = 0; i < rawTokens.length; i += 1) {
    const item = rawTokens[i];
    const token = item.token;
    const start = item.start;
    if (start > index) tokens.push({ type: 'text', value: line.slice(index, start) });

    const shouldBeChord = (() => {
      if (!item.core || !item.chordCandidate) return false;
      if (lineIsChordy) return true;
      if (item.core.length > 1) return true;

      if (item.core === 'A' || item.core === 'E') {
        return chordCandidateCount >= 2 && leadingChordRun >= 2 && leadingChordIndexes.has(i);
      }

      return true;
    })();

    if (shouldBeChord) {
      if (item.lead) tokens.push({ type: 'text', value: item.lead });
      tokens.push({ type: 'chord', value: item.core });
      if (item.trail) tokens.push({ type: 'text', value: item.trail });
    } else {
      tokens.push({ type: 'text', value: token });
    }
    index = start + token.length;
  }

  if (index < line.length) tokens.push({ type: 'text', value: line.slice(index) });
  return tokens;
}

function extractChords(text) {
  const chords = [];
  const seen = new Set();
  for (const line of text.split(/\r?\n/)) {
    for (const token of tokenizeLine(line)) {
      if (token.type !== 'chord') continue;
      if (seen.has(token.value)) continue;
      seen.add(token.value);
      chords.push(token.value);
    }
  }
  return chords;
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing env vars: SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY');
}

const argv = process.argv.slice(2);
const rootDir = argv.find((arg) => !arg.startsWith('--'));
const recursive = argv.includes('--recursive');
const allowSecular = argv.includes('--allow-secular');

function getFlagValue(flag) {
  const withEqPrefix = `${flag}=`;
  const eq = argv.find((arg) => arg.startsWith(withEqPrefix));
  if (eq) return eq.slice(withEqPrefix.length);

  const idx = argv.indexOf(flag);
  if (idx !== -1) {
    const next = argv[idx + 1];
    if (next && !next.startsWith('--')) return next;
  }
  return null;
}

const maxInsertedRaw = getFlagValue('--max-inserted');
const maxInserted =
  maxInsertedRaw == null
    ? null
    : (() => {
        const n = Number(maxInsertedRaw);
        if (!Number.isFinite(n) || n <= 0) throw new Error(`Invalid --max-inserted value: ${maxInsertedRaw}`);
        return Math.floor(n);
      })();

if (!rootDir) {
  console.log('Usage: node scripts/import-local-txt.mjs <folder> [--recursive] [--allow-secular] [--max-inserted N]');
  console.log('');
  console.log('Env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

function walkTxtFiles(dir) {
  const entries = readdirSync(dir);
  const out = [];
  for (const entry of entries) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (recursive) out.push(...walkTxtFiles(full));
      continue;
    }
    if (!entry.toLowerCase().endsWith('.txt')) continue;
    out.push(full);
  }
  return out;
}

function titleCaseFromSlug(slug) {
  const spaced = slug.replace(/[-_]+/g, ' ').trim();
  if (!spaced) return null;
  return spaced
    .split(/\s+/)
    .map((word) => (word.length ? word[0].toUpperCase() + word.slice(1) : word))
    .join(' ');
}

function parseArtistTitle(filePath, baseDir) {
  const baseName = path.basename(filePath, path.extname(filePath));
  const rankMatch = baseName.match(/^(\d+)\s*-\s*/u);
  const rank = rankMatch ? Number(rankMatch[1]) : null;
  const withoutIndex = baseName.replace(/^\d+\s*-\s*/u, '').trim();
  const parts = withoutIndex.split(/\s+-\s+/u).filter(Boolean);

  if (parts.length >= 2) {
    return { artist: parts[0].trim(), title: parts.slice(1).join(' - ').trim(), rank };
  }

  const title = withoutIndex.trim();
  const parent = path.basename(path.dirname(filePath));
  const baseFolder = path.basename(baseDir);
  const artistFromFolder =
    parent && parent !== baseFolder && parent !== 'txt' ? titleCaseFromSlug(parent) : null;
  return { artist: artistFromFolder ?? 'Desconhecido', title, rank };
}

function inferCategory({ artist, filePath }) {
  const haystack = normalizeSearch(`${artist} ${filePath}`);
  if (haystack.includes('harpa')) return 'Hinos';
  if (haystack.includes('congreg')) return 'Congregacional';
  if (haystack.includes('worship') || haystack.includes('ador')) return 'Adoração';
  return 'Louvor';
}

function inferViewsFromRank(rank) {
  if (!rank || !Number.isFinite(rank)) return null;
  // Deterministic popularity so "Músicas em alta" has stable ordering in the MVP.
  const base = 12_000_000;
  const step = 200_000;
  return Math.max(0, Math.round(base - rank * step));
}

function inferOriginalKey(text) {
  const chords = extractChords(text);
  const first = chords[0];
  if (!first) return 'C';

  const main = first.split('/')[0] ?? first;
  const match = main.match(/^([A-G])([#b])?/);
  if (!match) return 'C';

  const root = `${match[1]}${match[2] ?? ''}`;
  const suffix = main.slice(root.length).toLowerCase();
  const minor = suffix.startsWith('m') && !suffix.startsWith('maj');
  return minor ? `${root}m` : root;
}

function shouldSkipSong({ artist, title, filePath }) {
  if (allowSecular) return false;
  const haystack = normalizeSearch(`${artist} ${title} ${filePath}`);
  // Minimal guardrail for the sample folder (keeps the MVP 100% gospel by default).
  const blocked = [/legiao\s+urbana/u, /charlie\s+brown/u, /bruno\s+.*marrone/u];
  return blocked.some((re) => re.test(haystack));
}

async function getOrCreateArtistId(name) {
  const nameSearch = normalizeSearch(name);
  const { data: existing, error: existingError } = await supabase
    .from('artists')
    .select('id')
    .eq('name_search', nameSearch)
    .limit(1)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing?.id) return existing.id;

  const { data: created, error: insertError } = await supabase
    .from('artists')
    .insert({ name, name_search: nameSearch })
    .select('id')
    .single();

  if (insertError) throw insertError;
  return created.id;
}

async function upsertSong({ title, artistId, lyricsChords, originalKey, tuning, capo, category, views }) {
  const titleSearch = normalizeSearch(title);
  const { data: existing, error: existingError } = await supabase
    .from('songs')
    .select('id')
    .eq('title_search', titleSearch)
    .eq('artist_id', artistId)
    .limit(1)
    .maybeSingle();

  if (existingError) throw existingError;

  const payload = {
    title,
    title_search: titleSearch,
    artist_id: artistId,
    lyrics_chords: lyricsChords,
    original_key: originalKey,
    tuning,
    capo,
    category
  };

  if (views != null) payload.views = views;

  if (existing?.id) {
    const { error: updateError } = await supabase.from('songs').update(payload).eq('id', existing.id);
    if (updateError) throw updateError;
    return { mode: 'updated', id: existing.id };
  }

  const { data: inserted, error: insertError } = await supabase
    .from('songs')
    .insert(payload)
    .select('id')
    .single();
  if (insertError) throw insertError;
  return { mode: 'inserted', id: inserted.id };
}

(async () => {
  const files = walkTxtFiles(rootDir);
  if (files.length === 0) {
    console.log(`No .txt files found in: ${rootDir}`);
    process.exit(1);
  }

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const filePath of files) {
    const { artist, title, rank } = parseArtistTitle(filePath, rootDir);
    if (!title) continue;

    if (shouldSkipSong({ artist, title, filePath })) {
      skipped += 1;
      continue;
    }

    const lyricsChords = readFileSync(filePath, 'utf-8').trim();
    if (!lyricsChords) {
      skipped += 1;
      continue;
    }

    try {
      const artistId = await getOrCreateArtistId(artist);
      const result = await upsertSong({
        title,
        artistId,
        lyricsChords,
        originalKey: inferOriginalKey(lyricsChords),
        tuning: 'E A D G B E',
        capo: null,
        category: inferCategory({ artist, filePath }),
        views: inferViewsFromRank(rank)
      });
      if (result.mode === 'inserted') inserted += 1;
      else updated += 1;

      if (maxInserted != null && inserted >= maxInserted) break;
    } catch (err) {
      failed += 1;
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Failed: ${artist} - ${title} (${path.basename(filePath)}): ${message}`);
    }
  }

  console.log('');
  console.log('Import finished');
  console.log(`Inserted: ${inserted}`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Failed: ${failed}`);
})();
