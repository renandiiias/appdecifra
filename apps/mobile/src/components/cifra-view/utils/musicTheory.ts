import { normalizeSearch } from '@cifras/shared';
import { KEY_NOTE_TO_INDEX } from '../constants';

export function chordToKeyboardNotesPt(rawChord: string): string[] {
  const chord = String(rawChord ?? '').trim().replace(/\s+/gu, '');
  if (!chord) return [];

  const main = chord.split('/')[0] ?? chord;
  const match = main.match(/^([A-Ga-g])([#b])?(.*)$/u);
  if (!match) return [];

  const root = `${match[1].toUpperCase()}${match[2] ?? ''}`;
  const suffixRaw = String(match[3] ?? '');
  const suffix = suffixRaw.replace(/\(.*?\)/gu, '').toLowerCase();

  const semis: Record<string, number> = {
    C: 0,
    'C#': 1,
    Db: 1,
    D: 2,
    'D#': 3,
    Eb: 3,
    E: 4,
    F: 5,
    'F#': 6,
    Gb: 6,
    G: 7,
    'G#': 8,
    Ab: 8,
    A: 9,
    'A#': 10,
    Bb: 10,
    B: 11
  };

  const rootSemi = semis[root];
  if (rootSemi === undefined) return [];

  const isMaj7 = /maj7/u.test(suffix);
  const isM7 = !isMaj7 && /m7/u.test(suffix);
  const is7 = !isMaj7 && !isM7 && /7/u.test(suffix);
  const isDim = /dim|º|°/u.test(suffix);
  const isAug = /aug|\+/u.test(suffix);
  const isSus2 = /sus2/u.test(suffix);
  const isSus4 = /sus4/u.test(suffix);
  const isMinor = /m/u.test(suffix) && !/maj/u.test(suffix) && !isDim;

  const intervals: number[] = [];
  if (isSus2) intervals.push(0, 2, 7);
  else if (isSus4) intervals.push(0, 5, 7);
  else if (isDim) intervals.push(0, 3, 6);
  else if (isAug) intervals.push(0, 4, 8);
  else if (isMinor) intervals.push(0, 3, 7);
  else intervals.push(0, 4, 7);

  if (isMaj7) intervals.push(11);
  else if (is7 || isM7) intervals.push(10);

  if (/add9|9/u.test(suffix)) intervals.push(14);

  const chroma = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
  const toSolfege = (n: string) => {
    const map: Record<string, string> = {
      C: 'Dó',
      'C#': 'Dó#',
      D: 'Ré',
      'D#': 'Ré#',
      E: 'Mi',
      F: 'Fá',
      'F#': 'Fá#',
      G: 'Sol',
      'G#': 'Sol#',
      A: 'Lá',
      'A#': 'Lá#',
      B: 'Si'
    };
    return map[n] ?? n;
  };

  const notes = Array.from(
    new Set(
      intervals
        .map((i) => chroma[(rootSemi + i) % 12])
        .filter(Boolean)
    )
  ) as string[];

  return notes.map(toSolfege);
}

export function compactNormalize(value: string) {
  return normalizeSearch(value).replace(/\s+/g, '');
}

export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function getKeyRoot(value: string) {
  const match = value.trim().match(/^([A-G])([#b])?/u);
  if (!match) return null;
  return `${match[1]}${match[2] ?? ''}`;
}

export function isMinorKey(value: string) {
  const v = value.trim();
  return /m/i.test(v) && !/maj/i.test(v);
}

export function getSemitoneDelta(fromRoot: string, toRoot: string) {
  const from = KEY_NOTE_TO_INDEX[fromRoot];
  const to = KEY_NOTE_TO_INDEX[toRoot];
  if (from === undefined || to === undefined) return null;
  let delta = to - from;
  if (delta > 6) delta -= 12;
  if (delta < -6) delta += 12;
  return delta;
}
