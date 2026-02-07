export type Token = { type: 'chord' | 'text'; value: string };

const NOTES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NOTES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const NOTE_TO_INDEX: Record<string, number> = {
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

const SUFFIX_RE = /^(maj|min|m|dim|aug|sus|add)?(2|4|5|6|7|9|11|13)?(b5|#5|b9|#9)?$/i;

const TOKEN_RE = /\S+/g;

export function isNote(value: string): boolean {
  return NOTE_TO_INDEX[value] !== undefined;
}

function splitMainAndBass(token: string): { main: string; bass: string | null } {
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

export function isChordToken(token: string): boolean {
  const { main, bass } = splitMainAndBass(token);
  if (!isChordMain(main)) return false;
  if (bass && !bass.match(/^[A-G][#b]?$/)) return false;

  return true;
}

function normalizeSuffix(value: string): string {
  const compact = value
    .replace(/\s+/g, '')
    // pt-BR convention: 7M == maj7 (keep original in output, normalize only for validation)
    .replace(/7M/g, 'maj7')
    .replace(/M7/g, 'maj7')
    // Some sources use "7m" instead of "m7" for minor 7 chords.
    .replace(/7m/g, 'min7')
    .replace(/m7/g, 'min7')
    .replace(/maj/gi, 'maj')
    .replace(/min/gi, 'min')
    .replace(/sus/gi, 'sus')
    .replace(/add/gi, 'add')
    .replace(/dim/gi, 'dim')
    .replace(/aug/gi, 'aug');
  return compact;
}

function splitSuffixParens(suffix: string): { main: string; parens: string[] } {
  const parens: string[] = [];
  let main = '';
  let i = 0;
  while (i < suffix.length) {
    const ch = suffix[i];
    if (ch === '(') {
      const end = suffix.indexOf(')', i + 1);
      if (end === -1) {
        // Unbalanced parens, treat the rest as a literal suffix.
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

function isValidSuffixParen(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  // Allow common tension notation: (2) (11) (4/9) (b13) (#11)
  return /^[0-9#b/+\-.]+$/i.test(v);
}

function isChordMain(value: string): boolean {
  const match = value.match(/^([A-G])([#b])?(.*)$/);
  if (!match) return false;
  const suffix = match[3] ?? '';
  if (suffix.length === 0) return true;

  const { main, parens } = splitSuffixParens(suffix);
  if (parens.length > 0 && !parens.every(isValidSuffixParen)) return false;

  const normalized = normalizeSuffix(main);
  if (normalized.length === 0) return parens.length > 0;
  return SUFFIX_RE.test(normalized) || isCommonComplexSuffix(normalized);
}

function isCommonComplexSuffix(suffix: string): boolean {
  const normalized = normalizeSuffix(suffix).toLowerCase();
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

export function transposeNote(note: string, semitones: number, preferFlats: boolean): string {
  const index = NOTE_TO_INDEX[note];
  if (index === undefined) return note;
  const nextIndex = (index + semitones + 1200) % 12;
  return preferFlats ? NOTES_FLAT[nextIndex] : NOTES_SHARP[nextIndex];
}

export function transposeChord(chord: string, semitones: number): string {
  const { main, bass } = splitMainAndBass(chord);
  const match = main.match(/^([A-G])([#b])?(.*)$/);
  if (!match) return chord;
  const root = `${match[1]}${match[2] ?? ''}`;
  const suffix = match[3] ?? '';
  const preferFlats = root.includes('b') || (!root.includes('#') && semitones < 0);
  const newRoot = transposeNote(root, semitones, preferFlats);
  let transposed = `${newRoot}${suffix}`;
  if (bass) {
    const bassMatch = bass.match(/^([A-G])([#b])?$/);
    if (!bassMatch) return `${transposed}/${bass}`;
    const bassNote = `${bassMatch[1]}${bassMatch[2] ?? ''}`;
    const bassPreferFlats = bassNote.includes('b') || preferFlats;
    const newBass = transposeNote(bassNote, semitones, bassPreferFlats);
    transposed = `${transposed}/${newBass}`;
  }
  return transposed;
}

export function transposeText(input: string, semitones: number): string {
  return input
    .split(/\r?\n/)
    .map((line) => transposeLine(line, semitones))
    .join('\n');
}

export function transposeLine(line: string, semitones: number): string {
  // Tokenize first so we can apply chord heuristics per-line (avoid false positives like "Amor").
  const tokens = tokenizeLine(line);
  return transposeTokens(tokens, semitones)
    .map((token) => token.value)
    .join('');
}

export function tokenizeLine(line: string): Token[] {
  if (isTablatureLine(line)) {
    return [{ type: 'text', value: line }];
  }

  type RawToken = {
    token: string;
    start: number;
    lead: string;
    core: string;
    trail: string;
    chordCandidate: boolean;
  };

  const rawTokens: RawToken[] = [];
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

  // Some chord sheets mix labels like "[Intro]" with a chord run. We treat a leading chord run specially.
  const leadingChordIndexes = new Set<number>();
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

  const tokens: Token[] = [];
  let index = 0;
  for (let i = 0; i < rawTokens.length; i += 1) {
    const item = rawTokens[i];
    const token = item.token;
    const start = item.start;
    if (start > index) {
      tokens.push({ type: 'text', value: line.slice(index, start) });
    }

    const shouldBeChord = (() => {
      if (!item.core || !item.chordCandidate) return false;
      if (lineIsChordy) return true;
      // Always allow multi-character chords (Am, A9, D/F#...) even when the line has lyrics.
      if (item.core.length > 1) return true;

      // Single-letter chords are ambiguous in pt-BR ("A" and "E" are common words).
      if (item.core === 'A' || item.core === 'E') {
        return chordCandidateCount >= 2 && leadingChordRun >= 2 && leadingChordIndexes.has(i);
      }

      // Other single-letter chords (C, D, F, G, B) are unlikely to be lyric words.
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
  if (index < line.length) {
    tokens.push({ type: 'text', value: line.slice(index) });
  }
  return tokens;
}

export function extractChords(text: string): string[] {
  const chords = new Set<string>();
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    for (const token of tokenizeLine(line)) {
      if (token.type === 'chord') {
        chords.add(token.value);
      }
    }
  }
  return Array.from(chords);
}

export function transposeTokens(tokens: Token[], semitones: number): Token[] {
  return tokens.map((token) =>
    token.type === 'chord'
      ? { ...token, value: transposeChord(token.value, semitones) }
      : token
  );
}

function isTablatureLine(line: string): boolean {
  const start = line.trimStart();
  // e|--0-- etc (common ASCII tab). Require a dash or digit to avoid false positives.
  return /^[eEADGB]\|/.test(start) && /[-0-9]/.test(start);
}

function stripToken(token: string): { lead: string; core: string; trail: string } {
  const leadMatch = token.match(/^[^A-Ga-g]*/);
  // Keep unicode letters/numbers inside the core so words like "Amor" don't become "A" + "mor".
  const trailMatch = token.match(/[^\p{L}\p{N}#b/()]*$/u);
  const lead = leadMatch ? leadMatch[0] : '';
  const trail = trailMatch ? trailMatch[0] : '';
  let core = token.slice(lead.length, token.length - trail.length);

  // If a token wraps a chord with outer ")" (ex: "(C9)"), keep chord parens but move unmatched ")" to the trail.
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
