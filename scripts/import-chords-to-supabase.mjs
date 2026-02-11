#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.');
  process.exit(1);
}

const thisFile = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(thisFile), '..');
const guitarDbPath = path.join(repoRoot, 'packages/chords/src/chords-db.json');
const ukuleleDbPath = path.join(repoRoot, 'packages/chords/src/ukulele-db.json');

const guitarDb = JSON.parse(fs.readFileSync(guitarDbPath, 'utf8'));
const ukuleleDb = JSON.parse(fs.readFileSync(ukuleleDbPath, 'utf8'));

function normalizeChordNameForDb(raw) {
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

function selectPreferredShape(shapes) {
  const scored = shapes.map((shape) => {
    const fretted = shape.positions.filter((p) => p > 0);
    const baseFret = shape.baseFret ?? (fretted.length ? Math.min(...fretted) : 1);
    const muted = shape.positions.filter((p) => p < 0).length;
    const maxFret = fretted.length ? Math.max(...fretted) : 0;
    const score = (baseFret || 1) * 100 + muted * 10 + maxFret;
    return { shape, score };
  });

  scored.sort((a, b) => a.score - b.score);
  return scored[0]?.shape ?? shapes[0];
}

function buildRows(instrument, db) {
  const rows = [];
  for (const [name, variants] of Object.entries(db)) {
    if (!Array.isArray(variants) || variants.length === 0) continue;
    const best = selectPreferredShape(variants);
    if (!Array.isArray(best.positions) || best.positions.length === 0) continue;
    rows.push({
      instrument,
      chord_name: name,
      normalized_name: normalizeChordNameForDb(name),
      positions: best.positions,
      fingers: Array.isArray(best.fingers) && best.fingers.length ? best.fingers : null,
      base_fret: typeof best.baseFret === 'number' ? best.baseFret : null,
      source: 'dataset'
    });
  }
  return rows;
}

async function upsertRows(rows) {
  const endpoint = `${SUPABASE_URL.replace(/\/$/u, '')}/rest/v1/chord_shapes?on_conflict=instrument,normalized_name`;
  const batchSize = 500;
  let done = 0;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify(batch)
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Supabase upsert failed (${res.status}): ${body.slice(0, 500)}`);
    }

    done += batch.length;
    process.stdout.write(`\rUploaded ${done}/${rows.length}`);
  }
  process.stdout.write('\n');
}

async function main() {
  const guitarRows = buildRows('guitar', guitarDb);
  const ukuleleRows = buildRows('ukulele', ukuleleDb);
  const rows = [...guitarRows, ...ukuleleRows];

  console.log(`Prepared ${rows.length} rows (${guitarRows.length} guitar, ${ukuleleRows.length} ukulele).`);
  await upsertRows(rows);
  console.log('Chord import completed.');
}

main().catch((error) => {
  console.error(error?.message ?? error);
  process.exit(1);
});
