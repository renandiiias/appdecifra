import { describe, expect, it } from 'vitest';
import {
  extractChords,
  tokenizeLine,
  transposeChord,
  transposeLine,
  transposeText
} from '../src/chords';

describe('transposeChord', () => {
  it('transposes basic chords', () => {
    expect(transposeChord('C', 2)).toBe('D');
    expect(transposeChord('Am', 2)).toBe('Bm');
  });

  it('handles sharps and flats', () => {
    expect(transposeChord('F#', 1)).toBe('G');
    expect(transposeChord('Bb', 2)).toBe('C');
  });

  it('handles slash chords', () => {
    expect(transposeChord('D/F#', 2)).toBe('E/G#');
    expect(transposeChord('Bb/D', -2)).toBe('Ab/C');
  });

  it('preserves suffixes', () => {
    expect(transposeChord('Cmaj7', 1)).toBe('C#maj7');
    expect(transposeChord('Dm7', -2)).toBe('Cm7');
  });

  it('supports pt-BR major7 notation (7M) and tensions', () => {
    expect(transposeChord('F7M', 2)).toBe('G7M');
    expect(transposeChord('C7M', 2)).toBe('D7M');
    expect(transposeChord('F7M/C', 2)).toBe('G7M/D');
    expect(transposeChord('F7M(2)/C', 2)).toBe('G7M(2)/D');
  });

  it('does not treat slashes inside parentheses as slash chords', () => {
    expect(transposeChord('E7(4/9)', -2)).toBe('D7(4/9)');
  });
});

describe('transposeLine', () => {
  it('transposes only chord tokens', () => {
    const line = 'C   G/B   Am';
    expect(transposeLine(line, 1)).toBe('C#   G#/C   A#m');
  });

  it('keeps lyric words intact', () => {
    const line = 'Amor e paz';
    expect(transposeLine(line, 2)).toBe('Amor e paz');
  });

  it('keeps tablature lines intact', () => {
    const line = 'E|--0--2--3--|';
    expect(transposeLine(line, 2)).toBe(line);
  });

  it('keeps wrapper parentheses intact while transposing chords', () => {
    expect(transposeLine('(C9)', 2)).toBe('(D9)');
    expect(transposeLine('C9)', 2)).toBe('D9)');
  });
});

describe('tokenizeLine', () => {
  it('splits chords and text', () => {
    const tokens = tokenizeLine('C   G/B  Aleluia');
    expect(tokens.filter((t) => t.type === 'chord').map((t) => t.value)).toEqual(['C', 'G/B']);
  });

  it('recognizes suffixes with tensions and 7M notation', () => {
    const tokens = tokenizeLine('F7M/C  D9(11)  E7(4/9)  F7M(2)/C');
    expect(tokens.filter((t) => t.type === 'chord').map((t) => t.value)).toEqual([
      'F7M/C',
      'D9(11)',
      'E7(4/9)',
      'F7M(2)/C'
    ]);
  });
});

describe('extractChords', () => {
  it('extracts unique chords', () => {
    const chords = extractChords('C G\nAm C');
    expect(chords.sort()).toEqual(['Am', 'C', 'G']);
  });
});

describe('transposeText', () => {
  it('transposes multi-line text', () => {
    const text = 'C G\nAm F';
    expect(transposeText(text, -2)).toBe('Bb F\nGm Eb');
  });
});
