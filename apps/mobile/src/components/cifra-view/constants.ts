import { Platform } from 'react-native';

export const MONO_FONT = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'monospace'
});

export const INSTRUMENT_LABEL = 'Violão & Guitarra';
export const INSTRUMENTS = [INSTRUMENT_LABEL, 'Teclado', 'Ukulele', 'Cavaco', 'Viola caipira'] as const;
export const SUPPORTED_INSTRUMENTS = new Set<string>([INSTRUMENT_LABEL, 'Teclado', 'Ukulele']);
export const CHORD_LINE_SCALE = 1;
export const CHORD_INLINE_SCALE = 1;
export const SPEED_MIN = 0.25;
export const SPEED_MAX = 2.5;

export const KEY_NOTES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const;
export const KEY_NOTE_TO_INDEX: Record<string, number> = {
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
