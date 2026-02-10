import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Audio } from 'expo-av';
import {
  Alert,
  Animated,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View
} from 'react-native';
import { PinchGestureHandler, State } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Instrument } from '@cifras/chords';
import {
  encodeSharedSongVersion,
  extractChords,
  normalizeSearch,
  tokenizeLine,
  transposeChord,
  transposeTokens
} from '@cifras/shared';
import ChordDiagram from './ChordDiagram';
import { supabase } from '../lib/supabase';
import { colors, radii, shadows } from '../lib/theme';

const MONO_FONT = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'monospace'
});

const INSTRUMENT_LABEL = 'Violão & Guitarra';
const INSTRUMENTS = [INSTRUMENT_LABEL, 'Teclado', 'Ukulele', 'Cavaco', 'Viola caipira'] as const;
const SUPPORTED_INSTRUMENTS = new Set<string>([INSTRUMENT_LABEL, 'Teclado', 'Ukulele']);
const CHORD_LINE_SCALE = 1;
const CHORD_INLINE_SCALE = 1;
const SPEED_MIN = 0.25;
const SPEED_MAX = 2.5;

function chordToKeyboardNotesPt(rawChord: string): string[] {
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

type ParsedCifra = {
  cleanText: string;
  composers: string[];
  reviewers: string[];
};

function compactNormalize(value: string) {
  return normalizeSearch(value).replace(/\s+/g, '');
}

function isJunkScrapeLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return false;

  const normalized = compactNormalize(trimmed);

  // Credits block (we extract and render separately).
  if (normalized.startsWith('composicao')) return true;
  if (normalized.startsWith('colaboracaoerevisao')) return true;

  // Views line: "11.258.341 exibições"
  if (/^\d+(?:\.\d+)*exibicoes$/u.test(normalized)) return true;

  // Never show scraped source URLs in the app.
  if (/https?:\/\//iu.test(trimmed)) return true;
  if (/cifraclub\.com|letras\.mus\.br|palcomp3/iu.test(trimmed)) return true;

  // UI leftovers from the scraped page.
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
    'montagensparacanhoto'
  ];
  return contains.some((marker) => normalized.includes(marker));
}

function parseCredits(lines: string[]) {
  const blob = lines.join('\n');
  const compact = blob.replace(/\s+/g, ' ').trim();

  const composerMatch = compact.match(/Composi(?:c|ç)ão(?:\s+de|\s*:)\s+(.+?)(?:\.|\n|$)/iu);
  const composersRaw = composerMatch?.[1]?.trim() ?? '';
  const composers = composersRaw
    ? composersRaw
        .replace(/Esta informação.*$/iu, '')
        .split(/\s*\/\s*|\s*,\s*/u)
        .map((name) => name.trim())
        .filter(Boolean)
    : [];

  const reviewers: string[] = [];
  const startIndex = lines.findIndex((line) => compactNormalize(line).startsWith('colaboracaoerevisao'));
  if (startIndex !== -1) {
    // Support single-line format: "Colaboração e revisão: Fulano, Sicrano"
    const inline = String(lines[startIndex] ?? '');
    const inlineParts = inline.split(/:\s*/u);
    if (inlineParts.length >= 2) {
      const restInline = inlineParts.slice(1).join(':').trim();
      if (restInline) {
        for (const part of restInline.split(/\s*\/\s*|\s*,\s*/u).map((name) => name.trim()).filter(Boolean)) {
          reviewers.push(part);
        }
      }
    }

    for (let i = startIndex + 1; i < lines.length; i += 1) {
      const raw = lines[i] ?? '';
      const value = raw.trim().replace(/\s+/g, ' ');
      if (!value) continue;
      const normalized = compactNormalize(value);

      if (isJunkScrapeLine(value) || normalized.includes('exibicoes')) break;
      if (value.startsWith('+')) continue;
      if (/^\d+$/u.test(normalized)) continue;

      // Avoid capturing headings.
      if (normalized.startsWith('colaboracaoerevisao')) continue;

      // Some scrapes bring reviewers in a single comma-separated line.
      for (const part of value.split(/\s*,\s*/u).map((name) => name.trim()).filter(Boolean)) {
        reviewers.push(part);
      }
      if (reviewers.length >= 12) break;
    }
  }

  const uniqueReviewers = Array.from(new Set(reviewers));
  return { composers, reviewers: uniqueReviewers };
}

function parseAndCleanCifra(raw: string): ParsedCifra {
  const lines = raw.split(/\r?\n/);
  const start = lines.findIndex((line) => isJunkScrapeLine(line));
  const main = (start === -1 ? lines : lines.slice(0, start)).join('\n').trim();
  const rest = start === -1 ? [] : lines.slice(start);

  const { composers, reviewers } = parseCredits(rest);
  return { cleanText: main, composers, reviewers };
}

export type SongData = {
  id: string;
  title: string;
  lyrics_chords: string;
  original_key: string;
  tuning: string | null;
  capo: number | null;
  category: string | null;
  views?: number | null;
  artists?: { name: string } | null;
};

function isChordLine(tokens: ReturnType<typeof tokenizeLine>) {
  const hasChord = tokens.some((t) => t.type === 'chord');
  const hasNonSpaceText = tokens.some((t) => t.type !== 'chord' && t.value.trim().length > 0);
  return hasChord && !hasNonSpaceText;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

const KEY_NOTES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const;
const KEY_NOTE_TO_INDEX: Record<string, number> = {
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

function getKeyRoot(value: string) {
  const match = value.trim().match(/^([A-G])([#b])?/u);
  if (!match) return null;
  return `${match[1]}${match[2] ?? ''}`;
}

function isMinorKey(value: string) {
  const v = value.trim();
  return /m/i.test(v) && !/maj/i.test(v);
}

function getSemitoneDelta(fromRoot: string, toRoot: string) {
  const from = KEY_NOTE_TO_INDEX[fromRoot];
  const to = KEY_NOTE_TO_INDEX[toRoot];
  if (from === undefined || to === undefined) return null;
  let delta = to - from;
  if (delta > 6) delta -= 12;
  if (delta < -6) delta += 12;
  return delta;
}

export default function CifraView({
  song,
  isFavorite,
  onToggleFavorite,
  onBack,
  onOpenMaintenance,
  onOpenTuner
}: {
  song: SongData;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  onBack?: () => void;
  onOpenMaintenance?: () => void;
  onOpenTuner?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const scrollRef = useRef<ScrollView | null>(null);
  const scrollY = useRef(0);

  const [lyricsOnly, setLyricsOnly] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [keyOpen, setKeyOpen] = useState(false);
  const optionsScrollRef = useRef<ScrollView | null>(null);
  const tabsOptionsCardYRef = useRef<number | null>(null);
  const tabsToggleRowYRef = useRef<number | null>(null);
  const optionsSheetHeight = Math.round(windowHeight * 0.52);
  const optionsTranslateY = useRef(new Animated.Value(optionsSheetHeight)).current;
  const optionsBackdropOpacity = useRef(new Animated.Value(0)).current;
  const optionsDragStartY = useRef(0);

  const [semitones, setSemitones] = useState(0);
  const [fontScale, setFontScale] = useState(1);
  const userAdjustedFontScaleRef = useRef(false);
  const didAutoFitRef = useRef<string | null>(null);
  const [autoScroll, setAutoScroll] = useState(false);
  const [scrollSpeed, setScrollSpeed] = useState(0.75);
  const [speedTrackWidth, setSpeedTrackWidth] = useState(0);
  const speedTrackRef = useRef<View | null>(null);
  const speedTrackLeftRef = useRef(0);
  const speedTrackWidthRef = useRef(0);
  const isAdjustingSpeedRef = useRef(false);

  const [showDiagrams, setShowDiagrams] = useState(true);
  const [leftHanded, setLeftHanded] = useState(false);
  const [showTabs, setShowTabs] = useState(true);
  const [selectedChord, setSelectedChord] = useState<string | null>(null);

  const [instrumentOpen, setInstrumentOpen] = useState(false);
  const [instrument, setInstrument] = useState(INSTRUMENT_LABEL);
  const [tuningOpen, setTuningOpen] = useState(false);
  const [tuningMode, setTuningMode] = useState<'Padrão' | 'Meio tom abaixo'>('Padrão');
  const [capoOpen, setCapoOpen] = useState(false);
  const [capoValue, setCapoValue] = useState<number>(song.capo ?? 0);
  const [textSizeOpen, setTextSizeOpen] = useState(false);

  const [metronomeOpen, setMetronomeOpen] = useState(false);
  const [metronomeEnabled, setMetronomeEnabled] = useState(false);
  const [metronomeBpm, setMetronomeBpm] = useState(90);
  const metronomeSoundRef = useRef<Audio.Sound | null>(null);
  const metronomeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [videoLessonOpen, setVideoLessonOpen] = useState(false);
  const [videoLessonName, setVideoLessonName] = useState('');
  const [videoLessonEmail, setVideoLessonEmail] = useState('');
  const [videoLessonWhatsapp, setVideoLessonWhatsapp] = useState('');
  const [videoLessonYoutube, setVideoLessonYoutube] = useState('');
  const [videoLessonMessage, setVideoLessonMessage] = useState('');

  const [claimOpen, setClaimOpen] = useState(false);
  const [claimName, setClaimName] = useState('');
  const [claimEmail, setClaimEmail] = useState('');
  const [claimWhatsapp, setClaimWhatsapp] = useState('');
  const [claimInstagram, setClaimInstagram] = useState('');
  const [claimMessage, setClaimMessage] = useState('');
  const [claimExtra, setClaimExtra] = useState('');
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestKind, setSuggestKind] = useState<'letra' | 'cifra'>('letra');
  const [suggestText, setSuggestText] = useState('');

  const [personalOpen, setPersonalOpen] = useState(false);
  const [personalUserId, setPersonalUserId] = useState<string | null>(null);
  const [personalEnabled, setPersonalEnabled] = useState(false);
  const [personalText, setPersonalText] = useState<string | null>(null);
  const [personalDraftEnabled, setPersonalDraftEnabled] = useState(false);
  const [personalDraftText, setPersonalDraftText] = useState('');

  const closePersonalEditor = useCallback(() => {
    Keyboard.dismiss();
    setPersonalOpen(false);
  }, []);

  useEffect(() => {
    if (!personalOpen) Keyboard.dismiss();
  }, [personalOpen]);

  const fontScaleRef = useRef(fontScale);
  useEffect(() => {
    fontScaleRef.current = fontScale;
  }, [fontScale]);

  const scrollSpeedRef = useRef(scrollSpeed);
  useEffect(() => {
    scrollSpeedRef.current = scrollSpeed;
  }, [scrollSpeed]);

  const pinchBaseScale = useRef(1);
  const pinchLastScale = useRef(1);
  const pinchRaf = useRef<number | null>(null);

  useEffect(() => {
    userAdjustedFontScaleRef.current = false;
    didAutoFitRef.current = null;
    pinchBaseScale.current = 1;
    pinchLastScale.current = 1;
    setFontScale(1);
    setMetronomeEnabled(false);
  }, [song.id]);

  useEffect(() => {
    setCapoValue(song.capo ?? 0);
  }, [song.id, song.capo]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user.id ?? null;
      if (!mounted) return;
      setPersonalUserId(uid);

      if (!uid) {
        setPersonalEnabled(false);
        setPersonalText(null);
        return;
      }

      const key = `cifra_crista:personal_song_version:v1:${uid}:${song.id}`;
      const raw = await AsyncStorage.getItem(key);
      if (!mounted) return;

      if (!raw) {
        setPersonalEnabled(false);
        setPersonalText(null);
        return;
      }

      try {
        const parsed = JSON.parse(raw);
        const text = typeof parsed?.text === 'string' ? parsed.text : null;
        setPersonalText(text);
        setPersonalEnabled(Boolean(parsed?.enabled) && Boolean(text));
      } catch {
        // Backward compat: treat raw string as the edited content.
        setPersonalText(raw);
        setPersonalEnabled(true);
      }
    })().catch(() => {
      // ignore
    });

    return () => {
      mounted = false;
    };
  }, [song.id]);

  useEffect(() => {
    if (!autoScroll) return;

    let raf: number | null = null;
    let lastTs: number | null = null;

    const tick = (ts: number) => {
      if (lastTs === null) lastTs = ts;
      const dt = Math.min(40, ts - lastTs);
      lastTs = ts;

      // Pause autoscroll while the user is adjusting the speed slider to prevent gesture jank.
      if (!isAdjustingSpeedRef.current) {
        const speedPer30Ms = scrollSpeedRef.current;
        const delta = (speedPer30Ms / 30) * dt;
        scrollY.current += delta;
        scrollRef.current?.scrollTo({ y: scrollY.current, animated: false });
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, [autoScroll]);

  const clearMetronomeTimer = useCallback(() => {
    if (metronomeIntervalRef.current) {
      clearInterval(metronomeIntervalRef.current as any);
      metronomeIntervalRef.current = null;
    }
  }, []);

  const ensureMetronomeSound = useCallback(async () => {
    if (metronomeSoundRef.current) return metronomeSoundRef.current;

    try {
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
    } catch {
      // ignore
    }

    const { sound } = await Audio.Sound.createAsync(
      require('../../assets/metronome/click.wav'),
      { volume: 1.0 }
    );
    metronomeSoundRef.current = sound;
    return sound;
  }, []);

  useEffect(() => {
    return () => {
      clearMetronomeTimer();
      metronomeSoundRef.current?.unloadAsync().catch(() => {});
      metronomeSoundRef.current = null;
    };
  }, [clearMetronomeTimer]);

  useEffect(() => {
    if (!metronomeEnabled) {
      clearMetronomeTimer();
      return;
    }

    let cancelled = false;
    (async () => {
      const sound = await ensureMetronomeSound();
      if (cancelled) return;

      clearMetronomeTimer();
      const bpm = clamp(metronomeBpm, 40, 240);
      const intervalMs = Math.max(80, Math.round(60000 / bpm));

      sound.replayAsync().catch(() => {});
      metronomeIntervalRef.current = setInterval(() => {
        sound.replayAsync().catch(() => {});
      }, intervalMs);
    })().catch(() => {
      setMetronomeEnabled(false);
      clearMetronomeTimer();
    });

    return () => {
      cancelled = true;
      clearMetronomeTimer();
    };
  }, [clearMetronomeTimer, ensureMetronomeSound, metronomeBpm, metronomeEnabled]);

  const rawForRender =
    personalUserId && personalEnabled && typeof personalText === 'string' && personalText.trim().length
      ? personalText
      : song.lyrics_chords;

  const parsedOriginal = useMemo(() => parseAndCleanCifra(song.lyrics_chords), [song.lyrics_chords]);
  const parsedRender = useMemo(() => parseAndCleanCifra(rawForRender), [rawForRender]);
  const cifraText = parsedRender.cleanText || rawForRender;
  const lines = useMemo(() => cifraText.split(/\r?\n/), [cifraText]);
  const tokens = useMemo(() => lines.map((line) => tokenizeLine(line)), [lines]);
  const transposedTokens = useMemo(
    () => tokens.map((line) => transposeTokens(line, semitones)),
    [tokens, semitones]
  );

  const chords = useMemo(() => {
    const list = extractChords(cifraText).map((chord) => transposeChord(chord, semitones));
    return Array.from(new Set(list));
  }, [cifraText, semitones]);
  const chordsTop = chords.slice(0, 8);

  const currentKey = transposeChord(song.original_key, semitones);
  const shapeKey = currentKey;
  const soundingKey = capoValue ? transposeChord(shapeKey, capoValue) : shapeKey;
  const artistName = song.artists?.name ?? 'Artista';
  const originalIsMinor = isMinorKey(song.original_key);
  const diagramVariant: 'inline' | 'modal' = 'inline';
  const diagramVariantModal: 'inline' | 'modal' = 'modal';

  const textSizePercent = Math.round(fontScale * 100);
  const capoLabel = capoValue ? `${capoValue}ª casa` : 'Sem capo';
  const tuningLabel = tuningMode === 'Meio tom abaixo' ? 'Meio tom abaixo' : 'Padrão';
  const composers = parsedOriginal.composers.length ? parsedOriginal.composers : parsedRender.composers;
  const reviewers = parsedOriginal.reviewers.length ? parsedOriginal.reviewers : parsedRender.reviewers;
  const speedPercent = Math.round((scrollSpeed / 0.75) * 100);
  const speedNorm = clamp((scrollSpeed - SPEED_MIN) / (SPEED_MAX - SPEED_MIN), 0, 1);

  useEffect(() => {
    if (userAdjustedFontScaleRef.current) return;
    if (didAutoFitRef.current === song.id) return;
    if (semitones !== 0) return;

    const firstBlank = lines.findIndex((line) => line.trim().length === 0);
    const end = firstBlank === -1 ? Math.min(lines.length, transposedTokens.length) : Math.min(firstBlank, transposedTokens.length);
    if (end <= 0) return;

    let maxLen = 0;
    for (let i = 0; i < end; i += 1) {
      const lineTokens = transposedTokens[i];
      if (!lineTokens) continue;
      const text = lineTokens.map((t) => t.value).join('');
      maxLen = Math.max(maxLen, text.length);
    }

    // Fit only against the first stanza to reduce line wraps on initial view.
    const available = windowWidth - 32; // sheet paddingHorizontal = 16 * 2
    const baseFontSize = 18;
    const approxCharWidth = 0.62;
    const fitScale = Math.min(1, available / (Math.max(1, maxLen) * approxCharWidth * baseFontSize));
    const next = clamp(Number(fitScale.toFixed(2)), 0.55, 1.6);

    if (next < 0.99) {
      setFontScale(next);
      pinchBaseScale.current = next;
    }
    didAutoFitRef.current = song.id;
  }, [lines, song.id, semitones, transposedTokens, windowWidth]);

  const shareSong = async () => {
    try {
      const explicitWebUrl = process.env.EXPO_PUBLIC_WEB_URL;
      const baseWebUrl = explicitWebUrl ?? process.env.EXPO_PUBLIC_WEB_TUNER_URL;
      const hostUri =
        (Constants.expoConfig as any)?.hostUri ||
        (Constants.expoGoConfig as any)?.debuggerHost ||
        (Constants as any)?.manifest?.debuggerHost ||
        (Constants as any)?.manifest2?.extra?.expoClient?.hostUri ||
        '';
      const host = typeof hostUri === 'string' ? hostUri.split(':')[0] : '';
      const rawBase = explicitWebUrl
        ? explicitWebUrl.replace(/\/$/u, '')
        : baseWebUrl
          ? baseWebUrl.replace(/\/afinador\/?$/u, '').replace(/\/$/u, '')
          : null;
      const baseUrl =
        host && rawBase && /localhost|127\\.0\\.0\\.1/u.test(rawBase)
          ? rawBase.replace(/localhost|127\\.0\\.0\\.1/u, host)
          : rawBase;
      const webUrl = baseUrl ? `${baseUrl}/cifra/${song.id}` : null;
      await Share.share({
        message: webUrl ? `${song.title} - ${artistName}\n${webUrl}` : `${song.title} - ${artistName}`
      });
    } catch {
      // ignore
    }
  };

  const ensureLoggedIn = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user ?? null;
    if (!user) {
      Alert.alert('Entre para continuar', 'Faça login na aba Conta para usar essa função.');
      return null;
    }
    return user;
  }, []);

  const openVideoLessonRequest = useCallback(async () => {
    const user = await ensureLoggedIn();
    if (!user) return;

    const suggestedName =
      typeof user.user_metadata?.name === 'string'
        ? user.user_metadata.name
        : typeof user.user_metadata?.full_name === 'string'
          ? user.user_metadata.full_name
          : '';

    setVideoLessonName((prev) => prev || suggestedName || '');
    setVideoLessonEmail((prev) => prev || user.email || '');
    setVideoLessonOpen(true);
  }, [ensureLoggedIn]);

  const submitVideoLessonRequest = useCallback(async () => {
    const user = await ensureLoggedIn();
    if (!user) return;

    const name = videoLessonName.trim();
    const email = (videoLessonEmail.trim() || user.email || '').trim();
    const whatsapp = videoLessonWhatsapp.trim();
    const youtubeRaw = videoLessonYoutube.trim();
    const youtube_url =
      youtubeRaw && !/^https?:\/\//u.test(youtubeRaw) ? `https://${youtubeRaw}` : youtubeRaw;
    const message = videoLessonMessage.trim();

    if (!name) return Alert.alert('Seu nome', 'Digite seu nome para enviar a candidatura.');
    if (!email) return Alert.alert('Email', 'Digite seu email para contato.');
    if (!youtube_url) return Alert.alert('Link do YouTube', 'Cole o link da videoaula.');

    const record = {
      song_id: song.id,
      song_title: song.title,
      artist: artistName,
      user_id: user.id,
      name,
      email,
      whatsapp,
      youtube_url,
      message,
      created_at: new Date().toISOString()
    };

    const { error: reqErr } = await supabase.from('song_video_lesson_requests').insert(record as any);
    if (!reqErr) {
      setVideoLessonOpen(false);
      setVideoLessonYoutube('');
      setVideoLessonMessage('');
      Alert.alert('Enviado', 'Recebemos sua candidatura. Vamos analisar e entrar em contato.');
      return;
    }

    try {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      const meta = data.user?.user_metadata ?? {};
      const list = Array.isArray((meta as any).song_video_lesson_requests)
        ? (meta as any).song_video_lesson_requests
        : [];
      const next = [...list, record].slice(-50);
      const { error: updateErr } = await supabase.auth.updateUser({ data: { ...meta, song_video_lesson_requests: next } });
      if (updateErr) throw updateErr;
      setVideoLessonOpen(false);
      setVideoLessonYoutube('');
      setVideoLessonMessage('');
      Alert.alert('Enviado', 'Recebemos sua candidatura. Vamos analisar e entrar em contato.');
    } catch {
      Alert.alert('Erro', 'Não foi possível enviar agora. Tente novamente em instantes.');
    }
  }, [ensureLoggedIn, artistName, song.id, song.title, videoLessonEmail, videoLessonMessage, videoLessonName, videoLessonWhatsapp, videoLessonYoutube]);

  const openClaim = useCallback(async () => {
    const user = await ensureLoggedIn();
    if (!user) return;

    const suggestedName =
      typeof user.user_metadata?.name === 'string'
        ? user.user_metadata.name
        : typeof user.user_metadata?.full_name === 'string'
          ? user.user_metadata.full_name
          : '';

    setClaimName((prev) => prev || suggestedName || '');
    setClaimEmail((prev) => prev || user.email || '');
    setClaimOpen(true);
  }, [ensureLoggedIn]);

  const submitClaim = useCallback(async () => {
    const user = await ensureLoggedIn();
    if (!user) return;

    const name = claimName.trim();
    const email = (claimEmail.trim() || user.email || '').trim();
    const whatsapp = claimWhatsapp.trim();
    const instagram = claimInstagram.trim();
    const message = claimMessage.trim();
    const extra = claimExtra.trim();

    if (!name) return Alert.alert('Seu nome', 'Digite seu nome para enviar a solicitação.');
    if (!message) return Alert.alert('Mensagem', 'Explique rapidamente sua reivindicação.');

    const record = {
      song_id: song.id,
      song_title: song.title,
      artist: artistName,
      user_id: user.id,
      name,
      email,
      whatsapp,
      instagram,
      message,
      extra,
      created_at: new Date().toISOString()
    };

    // Best effort: write to a first-class table if it exists.
    // If the table is not created yet, fallback to user metadata (still Supabase-backed).
    const { error: claimErr } = await supabase.from('song_claim_requests').insert(record as any);
    if (!claimErr) {
      setClaimOpen(false);
      Alert.alert('Enviado', 'Recebemos sua solicitação. Vamos analisar em breve.');
      return;
    }

    try {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      const meta = data.user?.user_metadata ?? {};
      const list = Array.isArray((meta as any).song_claim_requests) ? (meta as any).song_claim_requests : [];
      const next = [...list, record].slice(-25);
      const { error: updateErr } = await supabase.auth.updateUser({ data: { ...meta, song_claim_requests: next } });
      if (updateErr) throw updateErr;
      setClaimOpen(false);
      Alert.alert('Enviado', 'Recebemos sua solicitação. Vamos analisar em breve.');
    } catch {
      Alert.alert('Erro', 'Não foi possível enviar agora. Tente novamente em instantes.');
    }
  }, [
    ensureLoggedIn,
    artistName,
    claimEmail,
    claimExtra,
    claimInstagram,
    claimMessage,
    claimName,
    claimWhatsapp,
    song.id,
    song.title
  ]);

  const openSuggestion = useCallback(async () => {
    const user = await ensureLoggedIn();
    if (!user) return;
    setSuggestOpen(true);
  }, [ensureLoggedIn]);

  const submitSuggestion = useCallback(async () => {
    const user = await ensureLoggedIn();
    if (!user) return;
    const text = suggestText.trim();
    if (!text) return Alert.alert('Sugestão', 'Descreva a alteração que você sugere.');

    const record = {
      song_id: song.id,
      song_title: song.title,
      artist: artistName,
      user_id: user.id,
      kind: suggestKind,
      text,
      created_at: new Date().toISOString()
    };

    const { error: sugErr } = await supabase.from('song_suggestions').insert(record as any);
    if (!sugErr) {
      setSuggestOpen(false);
      setSuggestText('');
      Alert.alert('Obrigado', 'Recebemos sua sugestão. Vamos revisar.');
      return;
    }

    try {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      const meta = data.user?.user_metadata ?? {};
      const list = Array.isArray((meta as any).song_suggestions) ? (meta as any).song_suggestions : [];
      const next = [...list, record].slice(-50);
      const { error: updateErr } = await supabase.auth.updateUser({ data: { ...meta, song_suggestions: next } });
      if (updateErr) throw updateErr;
      setSuggestOpen(false);
      setSuggestText('');
      Alert.alert('Obrigado', 'Recebemos sua sugestão. Vamos revisar.');
    } catch {
      Alert.alert('Erro', 'Não foi possível enviar agora. Tente novamente em instantes.');
    }
  }, [ensureLoggedIn, artistName, song.id, song.title, suggestKind, suggestText]);

  const openPersonalEditor = useCallback(async () => {
    const user = await ensureLoggedIn();
    if (!user) return;

    const baseText = parsedOriginal.cleanText || song.lyrics_chords;
    const current = typeof personalText === 'string' && personalText.trim().length ? personalText : baseText;
    setPersonalDraftText(current);
    setPersonalDraftEnabled(Boolean(personalEnabled && personalText));
    setPersonalOpen(true);
  }, [ensureLoggedIn, parsedOriginal.cleanText, personalEnabled, personalText, song.lyrics_chords]);

  const savePersonalEditor = useCallback(async () => {
    const user = await ensureLoggedIn();
    if (!user) return;

    Keyboard.dismiss();
    const text = String(personalDraftText ?? '').replace(/\s+$/u, '');
    if (!text.trim()) return Alert.alert('Texto', 'Sua versao nao pode ficar vazia.');

    const key = `cifra_crista:personal_song_version:v1:${user.id}:${song.id}`;
    const payload = { enabled: Boolean(personalDraftEnabled), text, updatedAt: new Date().toISOString() };
    await AsyncStorage.setItem(key, JSON.stringify(payload));

    setPersonalUserId(user.id);
    setPersonalText(text);
    setPersonalEnabled(Boolean(personalDraftEnabled));
    setPersonalOpen(false);
    Alert.alert('Salvo', personalDraftEnabled ? 'Sua versao esta ativa.' : 'Sua versao foi salva (desativada).');
  }, [ensureLoggedIn, personalDraftEnabled, personalDraftText, song.id]);

  const deletePersonalEditor = useCallback(async () => {
    const user = await ensureLoggedIn();
    if (!user) return;

    const key = `cifra_crista:personal_song_version:v1:${user.id}:${song.id}`;
    await AsyncStorage.removeItem(key);
    setPersonalEnabled(false);
    setPersonalText(null);
    setPersonalDraftEnabled(false);
    setPersonalDraftText(parsedOriginal.cleanText || song.lyrics_chords);
    Alert.alert('Pronto', 'Sua versao foi removida.');
  }, [ensureLoggedIn, parsedOriginal.cleanText, song.id, song.lyrics_chords]);

  const sharePersonalEditor = useCallback(async () => {
    const user = await ensureLoggedIn();
    if (!user) return;

    const text = String(personalDraftText ?? '').replace(/\s+$/u, '');
    if (!text.trim()) return;

    const baseWebUrl = process.env.EXPO_PUBLIC_WEB_TUNER_URL;
    const hostUri =
      (Constants.expoConfig as any)?.hostUri ||
      (Constants.expoGoConfig as any)?.debuggerHost ||
      (Constants as any)?.manifest?.debuggerHost ||
      (Constants as any)?.manifest2?.extra?.expoClient?.hostUri ||
      '';
    const host = typeof hostUri === 'string' ? hostUri.split(':')[0] : '';
    const rawBase = baseWebUrl ? baseWebUrl.replace(/\/afinador\/?$/u, '').replace(/\/$/u, '') : '';
    const base =
      host && /localhost|127\\.0\\.0\\.1/u.test(rawBase) ? rawBase.replace(/localhost|127\\.0\\.0\\.1/u, host) : rawBase;

    const encoded = encodeSharedSongVersion(text);
    if (!base || !encoded) {
      await Share.share({ message: `Minha versao: ${song.title} - ${artistName}\n\n${text}` });
      return;
    }

    const url = `${base}/cifra/${song.id}?v=${encoded}`;
    // Safety: very large payloads can create broken links. Fall back to sharing text.
    if (url.length > 7500) {
      await Share.share({ message: `Minha versao: ${song.title} - ${artistName}\n\n${text}` });
      return;
    }

    await Share.share({ message: `Minha versao: ${song.title} - ${artistName}\n${url}` });
  }, [ensureLoggedIn, artistName, personalDraftText, song.id, song.title]);

  const animateOptionsIn = () => {
    optionsTranslateY.setValue(optionsSheetHeight);
    optionsBackdropOpacity.setValue(0);
    Animated.parallel([
      Animated.spring(optionsTranslateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 110,
        friction: 18
      }),
      Animated.timing(optionsBackdropOpacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true
      })
    ]).start();
  };

  const closeOptions = (afterCloseOrEvent?: unknown) => {
    const afterClose = typeof afterCloseOrEvent === 'function' ? (afterCloseOrEvent as () => void) : undefined;
    Animated.parallel([
      Animated.timing(optionsTranslateY, {
        toValue: optionsSheetHeight,
        duration: 180,
        useNativeDriver: true
      }),
      Animated.timing(optionsBackdropOpacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true
      })
    ]).start(({ finished }) => {
      if (!finished) return;
      setOptionsOpen(false);
      if (afterClose) requestAnimationFrame(afterClose);
    });
  };

  const openOptions = () => {
    setOptionsOpen(true);
    requestAnimationFrame(() => animateOptionsIn());
  };
  const openOptionsToTabs = () => {
    openOptions();

    const start = Date.now();
    const tryScroll = () => {
      const base = tabsOptionsCardYRef.current;
      const row = tabsToggleRowYRef.current;
      if (base !== null && row !== null) {
        optionsScrollRef.current?.scrollTo({ y: Math.max(0, base + row - 24), animated: true });
        return;
      }
      if (Date.now() - start < 1600) requestAnimationFrame(tryScroll);
    };

    // Wait for the sheet animation + layout pass before scrolling.
    setTimeout(() => {
      tryScroll();
    }, 420);
  };
  const openKey = () => setKeyOpen(true);
  const closeKey = () => setKeyOpen(false);

  const onPinchGestureEvent = useCallback((event: any) => {
    const { scale, state } = event.nativeEvent ?? {};
    if (state !== State.ACTIVE && state !== State.BEGAN) return;
    if (typeof scale !== 'number' || !Number.isFinite(scale)) return;

    pinchLastScale.current = scale;

    if (pinchRaf.current !== null) return;
    pinchRaf.current = requestAnimationFrame(() => {
      pinchRaf.current = null;
      const next = clamp(pinchBaseScale.current * pinchLastScale.current, 0.55, 1.6);
      userAdjustedFontScaleRef.current = true;
      setFontScale(next);
    });
  }, []);

  const onPinchStateChange = useCallback(
    (event: any) => {
      const { state, scale } = event.nativeEvent ?? {};
      if (state === State.BEGAN) {
        pinchBaseScale.current = fontScaleRef.current;
        pinchLastScale.current = 1;
        return;
      }
      if (state !== State.END && state !== State.CANCELLED && state !== State.FAILED) return;
      if (typeof scale !== 'number' || !Number.isFinite(scale)) return;

      if (pinchRaf.current !== null) {
        cancelAnimationFrame(pinchRaf.current);
        pinchRaf.current = null;
      }

      const next = clamp(pinchBaseScale.current * scale, 0.55, 1.6);
      pinchBaseScale.current = next;
      userAdjustedFontScaleRef.current = true;
      setFontScale(next);
    },
    [fontScaleRef]
  );

  const optionsPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) => {
          const dy = gesture.dy;
          const dx = gesture.dx;
          return dy > 6 && Math.abs(dy) > Math.abs(dx);
        },
        onPanResponderGrant: () => {
          optionsTranslateY.stopAnimation((value) => {
            optionsDragStartY.current = typeof value === 'number' ? value : 0;
          });
        },
        onPanResponderMove: (_, gesture) => {
          const next = Math.max(0, optionsDragStartY.current + gesture.dy);
          optionsTranslateY.setValue(next);
          const progress = 1 - Math.min(1, next / optionsSheetHeight);
          optionsBackdropOpacity.setValue(progress);
        },
        onPanResponderRelease: (_, gesture) => {
          const shouldClose = gesture.dy > Math.max(56, optionsSheetHeight * 0.16) || gesture.vy > 0.95;
          if (shouldClose) {
            closeOptions();
            return;
          }
          Animated.parallel([
            Animated.spring(optionsTranslateY, {
              toValue: 0,
              useNativeDriver: true,
              tension: 110,
              friction: 18
            }),
            Animated.timing(optionsBackdropOpacity, {
              toValue: 1,
              duration: 120,
              useNativeDriver: true
            })
          ]).start();
        }
      }),
    [optionsBackdropOpacity, optionsSheetHeight, optionsTranslateY]
  );

  const updateSpeedFromPageX = useCallback((pageX: number) => {
    const width = speedTrackWidthRef.current || speedTrackWidth;
    if (!Number.isFinite(width) || width <= 0) return;
    const left = speedTrackLeftRef.current;
    const x = pageX - left;
    const norm = clamp(x / width, 0, 1);
    const next = SPEED_MIN + norm * (SPEED_MAX - SPEED_MIN);
    setScrollSpeed(clamp(Number(next.toFixed(2)), SPEED_MIN, SPEED_MAX));
  }, [speedTrackWidth]);

  const speedPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          isAdjustingSpeedRef.current = true;
          speedTrackRef.current?.measureInWindow((x, _y, w) => {
            speedTrackLeftRef.current = x;
            speedTrackWidthRef.current = w;
            const pageX = event.nativeEvent.pageX ?? event.nativeEvent.locationX ?? 0;
            updateSpeedFromPageX(pageX);
          });
        },
        onPanResponderMove: (event) => {
          const pageX = event.nativeEvent.pageX ?? event.nativeEvent.locationX ?? 0;
          updateSpeedFromPageX(pageX);
        },
        onPanResponderRelease: () => {
          isAdjustingSpeedRef.current = false;
        },
        onPanResponderTerminate: () => {
          isAdjustingSpeedRef.current = false;
        }
      }),
    [updateSpeedFromPageX]
  );

  return (
    <View style={styles.screen}>
      <View style={[styles.nav, { paddingTop: insets.top + 6 }]}>
        <TouchableOpacity
          style={styles.navBack}
          onPress={() => {
            if (onBack) return onBack();
          }}
        >
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </TouchableOpacity>
      </View>

      <View style={{ flex: 1 }}>
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={{
            paddingTop: insets.top + 56,
            paddingBottom: insets.bottom + 160
          }}
          onScroll={(event) => {
            scrollY.current = event.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={16}
        >
          <View style={styles.header}>
          <View style={styles.titleRow}>
            <View style={{ flex: 1, gap: 6 }}>
              <View style={styles.titleLine}>
                <Text style={styles.title}>{song.title}</Text>
                <TouchableOpacity
                  style={styles.titleLikeButton}
                  onPress={() => onToggleFavorite?.()}
                  disabled={!onToggleFavorite}
                  activeOpacity={0.8}
                  hitSlop={{ top: 10, left: 10, right: 10, bottom: 10 }}
                  accessibilityRole="button"
                  accessibilityLabel={isFavorite ? 'Desfavoritar' : 'Favoritar'}
                >
                  <Ionicons
                    name={isFavorite ? 'heart' : 'heart-outline'}
                    size={20}
                    color={isFavorite ? colors.accent : colors.muted}
                  />
                </TouchableOpacity>
              </View>
              <Text style={styles.artist}>{artistName}</Text>
            </View>

            <TouchableOpacity
              style={styles.videoThumb}
              onPress={() => {
                void openVideoLessonRequest();
              }}
              activeOpacity={0.85}
            >
              <Image
                source={{
                  uri: 'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?auto=format&fit=crop&w=360&q=80'
                }}
                style={styles.videoThumbImage}
              />
              <View style={styles.videoThumbOverlay} />
              <View style={styles.videoThumbPlay}>
                <Ionicons name="play" size={16} color="#fff" />
              </View>
            </TouchableOpacity>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.modeRowScroll}
            contentContainerStyle={styles.modeRow}
          >
            <TouchableOpacity
              style={[styles.modePill, lyricsOnly ? styles.modePillActive : null]}
              onPress={() => setLyricsOnly((v) => !v)}
            >
              <Text style={lyricsOnly ? styles.modeTextActive : styles.modeText}>Letra</Text>
            </TouchableOpacity>
          </ScrollView>

          {showDiagrams ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chordsRow}>
              {chordsTop.map((chord) => (
                <TouchableOpacity
                  key={chord}
                  style={styles.chordCard}
                  onPress={() => setSelectedChord(chord)}
                  activeOpacity={0.85}
                >
                  <Text
                    style={styles.chordCardTitle}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                    adjustsFontSizeToFit
                    minimumFontScale={0.72}
                  >
                    {chord}
                  </Text>
                  <View style={styles.chordCardDiagram}>
                    {instrument === 'Teclado' ? (
                      <Text style={styles.keyboardNotes} numberOfLines={2}>
                        {chordToKeyboardNotesPt(chord).join(' \u2022 ') || 'Notas em breve'}
                      </Text>
                    ) : (
                      <ChordDiagram
                        chord={chord}
                        instrument={(instrument === 'Ukulele' ? 'ukulele' : 'guitar') as Instrument}
                        leftHanded={leftHanded}
                        variant={diagramVariant}
                      />
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : null}

          <TouchableOpacity style={styles.keyRow} onPress={openKey} activeOpacity={0.85}>
            <Text style={styles.keyLabel}>Tom:</Text>
            <Text style={styles.keyValue}>{soundingKey}</Text>
            <Ionicons name="chevron-down" size={18} color={colors.muted} />
          </TouchableOpacity>

          {capoValue ? (
            <Text style={styles.keySub}>Forma dos acordes no tom de {shapeKey}</Text>
          ) : null}

          {capoValue ? (
            <View style={styles.capoRow}>
              <Ionicons name="swap-horizontal-outline" size={16} color={colors.muted} />
              <Text style={styles.capoRowText}>Capotraste na {capoValue}ª casa</Text>
            </View>
          ) : null}
        </View>

        <PinchGestureHandler onHandlerStateChange={onPinchStateChange} onGestureEvent={onPinchGestureEvent}>
          <View>
            <View style={styles.sheet}>
          {(() => {
            const rendered: any[] = [];
            const baseFontSize = Math.round(18 * fontScale);
            const baseLineHeight = Math.round(28 * fontScale);
            const inlineChordFontSize = Math.round(baseFontSize * CHORD_INLINE_SCALE);

            const looksLikeTabLine = (rawLine: string) => {
              const tabLine = rawLine.trimStart();
              return /^[eEADGB]\|/u.test(tabLine) && /[-0-9]/u.test(tabLine) && tabLine.includes('|');
            };

            const looksLikeTabHeader = (rawLine: string) => {
              const trimmed = rawLine.trim();
              return /^\[tab\b/iu.test(trimmed);
            };

            const looksLikeTabMeta = (rawLine: string) => {
              const trimmed = rawLine.trim();
              if (!trimmed) return true;
              return /^parte\s+\d+/iu.test(trimmed);
            };

            const looksLikeStrummingLine = (rawLine: string) => {
              const trimmed = rawLine.trim();
              if (!trimmed) return false;

              if (/bpm/iu.test(trimmed)) return true;

              const hasArrow = /[↑↓]/u.test(trimmed);
              if (hasArrow && !/[a-zÀ-ÿ]/iu.test(trimmed)) return true;

              // Number markers often scraped from the rhythm grid.
              if (!/[a-zÀ-ÿ]/iu.test(trimmed) && /^[0-9\s|.·,:;+\-]+$/u.test(trimmed)) return true;

              return false;
            };

            for (let index = 0; index < transposedTokens.length; index += 1) {
              const line = transposedTokens[index];
              const rawLine = lines[index] ?? '';

              if (looksLikeStrummingLine(rawLine)) continue;

              if (looksLikeTabHeader(rawLine) || looksLikeTabLine(rawLine)) {
                // Group the whole TAB section into a single horizontally-scrollable block.
                let j = index;
                const block: string[] = [];
                while (j < lines.length) {
                  const candidate = lines[j] ?? '';

                  if (looksLikeStrummingLine(candidate)) break;

                  const next = lines[j + 1] ?? '';
                  const tokenLine = transposedTokens[j];
                  const chordOnly = tokenLine ? isChordLine(tokenLine) : false;
                  const chordLineIsNearTab =
                    chordOnly && (looksLikeTabLine(next) || looksLikeTabMeta(next) || looksLikeTabLine(lines[j - 1] ?? ''));

                  if (looksLikeTabHeader(candidate) || looksLikeTabLine(candidate) || looksLikeTabMeta(candidate) || chordLineIsNearTab) {
                    block.push(candidate);
                    j += 1;
                    continue;
                  }
                  break;
                }

                if (showTabs) {
                  const tabText = block.join('\n');
                  const maxLen = block.reduce((acc, line) => Math.max(acc, String(line ?? '').length), 0);
                  const available = windowWidth - 32 - 24 - 2;
                  const desiredFontSize = Math.round(15 * fontScale);
                  const fitFontSize =
                    maxLen > 0 ? Math.floor(available / Math.max(1, maxLen * 0.62)) : desiredFontSize;
                  const tabFontSize = clamp(Math.min(desiredFontSize, fitFontSize), 9, desiredFontSize);

                  rendered.push(
                    <Pressable
                      key={`tab-${index}`}
                      style={styles.tabScroll}
                      onPress={openOptionsToTabs}
                      accessibilityRole="button"
                      accessibilityLabel="Opções de tablaturas"
                    >
                      <Text
                        style={[
                          styles.tabText,
                          {
                            fontFamily: MONO_FONT,
                            fontSize: tabFontSize,
                            lineHeight: Math.round(tabFontSize * 1.35)
                          }
                        ]}
                      >
                        {tabText}
                      </Text>
                    </Pressable>
                  );
                }

                index = j - 1;
                continue;
              }

              if (lyricsOnly && isChordLine(line)) continue;
              const chordOnly = isChordLine(line);
              const lineStyle = chordOnly ? styles.sheetChordLine : styles.sheetLyricLine;
              const computedFontSize = chordOnly ? Math.round(baseFontSize * CHORD_LINE_SCALE) : baseFontSize;
              const computedLineHeight = chordOnly ? Math.round(baseLineHeight * CHORD_LINE_SCALE) : baseLineHeight;

              rendered.push(
                <Text
                  key={`line-${index}`}
                  style={[
                    styles.sheetLine,
                    lineStyle,
                    {
                      fontFamily: MONO_FONT,
                      fontSize: computedFontSize,
                      lineHeight: computedLineHeight
                    }
                  ]}
                >
                  {line.map((token, idx) => {
                    if (token.type === 'chord') {
                      if (lyricsOnly) return null;
                      const chordStyle = chordOnly
                        ? styles.sheetChord
                        : [styles.sheetChord, { fontSize: inlineChordFontSize }];
                      return (
                        <Text
                          key={`${index}-${idx}`}
                          style={chordStyle}
                          onPress={() => setSelectedChord(token.value)}
                        >
                          {token.value}
                        </Text>
                      );
                    }
                    return (
                      <Text key={`${index}-${idx}`} style={styles.sheetText}>
                        {token.value}
                      </Text>
                    );
                  })}
                </Text>
              );
            }

            return rendered;
          })()}
            </View>

            {composers.length || reviewers.length ? (
              <View style={styles.credits}>
                {composers.length ? (
                  <View style={{ gap: 6 }}>
                    <Text style={styles.creditLabel}>Composição</Text>
                    <Text style={styles.creditValue}>{composers.join(', ')}</Text>
                  </View>
                ) : null}
                {reviewers.length ? (
                  <View style={{ gap: 6 }}>
                    <Text style={styles.creditLabel}>Colaboração e revisão</Text>
                    <Text style={styles.creditValue}>
                      {reviewers.length <= 4
                        ? reviewers.join(', ')
                        : `${reviewers.slice(0, 3).join(', ')} e mais ${reviewers.length - 3}`}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        </PinchGestureHandler>

        <View style={styles.actionCards}>
          <View style={styles.actionCard}>
            <Text style={styles.actionCardTitle}>Receba créditos por esta música</Text>
            <Text style={styles.actionCardText}>
              Se você é compositor(a), intérprete ou representante, envie uma solicitação para vincular esta música ao seu perfil.
            </Text>
            <TouchableOpacity style={styles.actionCardButton} onPress={openClaim} activeOpacity={0.9}>
              <Text style={styles.actionCardButtonText}>Reivindicar música</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.actionCard}>
            <Text style={styles.actionCardTitle}>Encontrou algo errado?</Text>
            <Text style={styles.actionCardText}>
              Ajude a melhorar: envie uma sugestão de correção de letra ou cifra.
            </Text>
            <TouchableOpacity style={styles.actionCardButtonSecondary} onPress={openSuggestion} activeOpacity={0.9}>
              <Text style={styles.actionCardButtonTextSecondary}>Sugerir alteração</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.metaChips}>
          <View style={styles.metaChip}>
            <Ionicons name="mic-outline" size={14} color={colors.muted} />
            <Text style={styles.metaChipText}>Afinação: {tuningLabel}</Text>
          </View>
          <View style={styles.metaChip}>
            <Ionicons name="swap-horizontal-outline" size={14} color={colors.muted} />
            <Text style={styles.metaChipText}>Capo: {capoLabel}</Text>
          </View>
        </View>
        </ScrollView>
      </View>

      {autoScroll ? (
        <View style={[styles.speedPill, { bottom: insets.bottom + 92 }]}>
          <View style={styles.speedHeader}>
            <Text style={styles.speedTitle}>Rolagem</Text>
            <View style={styles.speedHeaderRight}>
              <Text style={styles.speedValue}>{speedPercent}%</Text>
              <TouchableOpacity
                style={styles.aiChip}
                onPress={() => Alert.alert('Em breve', 'Rolagem inteligente (IA) será adicionada em breve.')}
              >
                <Text style={styles.aiChipText}>IA</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View
            style={styles.speedTrack}
            ref={(node) => {
              speedTrackRef.current = node;
            }}
            onLayout={(event) => {
              const w = event.nativeEvent.layout.width;
              setSpeedTrackWidth(w);
              speedTrackWidthRef.current = w;
              requestAnimationFrame(() => {
                speedTrackRef.current?.measureInWindow((x, _y, w2) => {
                  speedTrackLeftRef.current = x;
                  speedTrackWidthRef.current = w2;
                });
              });
            }}
            {...speedPanResponder.panHandlers}
          >
            <View style={[styles.speedFill, { width: speedTrackWidth * speedNorm }]} />
            <View
              style={[
                styles.speedThumb,
                { left: Math.max(0, speedTrackWidth - 24) * speedNorm }
              ]}
            />
          </View>
        </View>
      ) : null}

      <View style={[styles.floatingBar, { bottom: insets.bottom + 12 }]}>
        <TouchableOpacity style={styles.floatingItem} onPress={openKey}>
          <Ionicons name="musical-notes-outline" size={20} color={colors.text} />
          <Text style={styles.floatingLabel}>Tom</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.floatingItem} onPress={() => setAutoScroll((v) => !v)}>
          <Ionicons name={autoScroll ? 'chevron-down-circle' : 'chevron-down-circle-outline'} size={20} color={colors.text} />
          <Text style={styles.floatingLabel}>Rolagem</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.floatingItem}
          onPress={() => Alert.alert('Em breve', 'Vamos adicionar o link do YouTube para esta música.')}
        >
          <Ionicons name="play-circle-outline" size={20} color={colors.text} />
          <Text style={styles.floatingLabel}>Ouvir</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.floatingItem} onPress={openOptions}>
          <Ionicons name="options-outline" size={20} color={colors.text} />
          <Text style={styles.floatingLabel}>Opções</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={optionsOpen} transparent animationType="none" onRequestClose={closeOptions}>
        <View style={styles.modalRoot}>
          <Animated.View style={[styles.modalBackdrop, { opacity: optionsBackdropOpacity }]} />
          <Pressable style={StyleSheet.absoluteFillObject} onPress={closeOptions} />
          <Animated.View
            style={[
              styles.optionsSheet,
              {
                paddingBottom: insets.bottom + 16,
                height: optionsSheetHeight,
                transform: [{ translateY: optionsTranslateY }]
              }
            ]}
          >
            <View style={styles.sheetGrabArea} {...optionsPanResponder.panHandlers}>
              <View style={styles.sheetHandle} />
            </View>
            <ScrollView
              ref={(node) => {
                optionsScrollRef.current = node;
              }}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 8 }}
              bounces={false}
            >
              <Text style={styles.optionsTitle}>Opções</Text>

              <View style={styles.quickRow}>
                <TouchableOpacity
                  style={styles.quickItem}
                  onPress={() => {
                    closeOptions(() => onToggleFavorite?.());
                  }}
                >
                  <View style={styles.quickIcon}>
                    <Ionicons
                      name={isFavorite ? 'heart' : 'heart-outline'}
                      size={18}
                      color={isFavorite ? colors.accent : colors.text}
                    />
                  </View>
                  <Text style={styles.quickLabel}>{isFavorite ? 'Favoritado' : 'Favoritar'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.quickItem}
                  onPress={() => {
                    closeOptions(() => {
                      void shareSong();
                    });
                  }}
                >
                  <View style={styles.quickIcon}>
                    <Ionicons name="share-outline" size={18} color={colors.text} />
                  </View>
                  <Text style={styles.quickLabel}>Compartilhar</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.videoRow}
                onPress={() => {
                  closeOptions(() => {
                    void openVideoLessonRequest();
                  });
                }}
                activeOpacity={0.9}
              >
                <View style={styles.videoRowLeft}>
                  <Ionicons name="videocam-outline" size={18} color={colors.muted} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.videoRowText}>Adicionar videoaula</Text>
                    <Text style={styles.videoRowSub}>Ganhe créditos no app</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </TouchableOpacity>

              <View style={styles.optionsCard}>
                <TouchableOpacity
                  style={styles.optionRow}
                  onPress={() => {
                    closeOptions(() => {
                      void openPersonalEditor();
                    });
                  }}
                  activeOpacity={0.85}
                >
                  <View style={styles.optionLeft}>
                    <Ionicons name="create-outline" size={18} color={colors.text} />
                    <View style={styles.optionTitleStack}>
                      <Text style={styles.optionTitle}>Editar</Text>
                      <Text style={styles.optionSubtitle}>Pra mim mesmo</Text>
                    </View>
                  </View>
                  <Text style={styles.optionValue}>
                    {personalText ? (personalEnabled ? 'Ativo' : 'Salvo') : 'Não configurado'}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.optionRow}
                  onPress={() => {
                    closeOptions(() => setInstrumentOpen(true));
                  }}
                  activeOpacity={0.85}
                >
                  <View style={styles.optionLeft}>
                    <Ionicons name="musical-notes-outline" size={18} color={colors.text} />
                    <Text style={styles.optionTitle}>Diagramas</Text>
                  </View>
                  <Text style={styles.optionValue}>{showDiagrams ? instrument : 'Ocultos'}</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.optionRow}
                  onPress={() => {
                    closeOptions(openKey);
                  }}
                >
                  <View style={styles.optionLeft}>
                    <Ionicons name="add-circle-outline" size={18} color={colors.text} />
                    <Text style={styles.optionTitle}>Tom</Text>
                  </View>
                  <Text style={styles.optionValue}>{soundingKey}</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.optionRow}
                  onPress={() => {
                    closeOptions(() => setTuningOpen(true));
                  }}
                  activeOpacity={0.85}
                >
                  <View style={styles.optionLeft}>
                    <Ionicons name="settings-outline" size={18} color={colors.text} />
                    <Text style={styles.optionTitle}>Afinação</Text>
                  </View>
                  <Text style={styles.optionValue}>{tuningLabel}</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.optionRow}
                  onPress={() => {
                    closeOptions(() => setCapoOpen(true));
                  }}
                  activeOpacity={0.85}
                >
                  <View style={styles.optionLeft}>
                    <Ionicons name="swap-horizontal-outline" size={18} color={colors.text} />
                    <Text style={styles.optionTitle}>Capotraste</Text>
                  </View>
                  <Text style={styles.optionValue}>{capoLabel}</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.optionRow}
                  onPress={() => {
                    closeOptions(() => setTextSizeOpen(true));
                  }}
                  activeOpacity={0.85}
                >
                  <View style={styles.optionLeft}>
                    <Ionicons name="text-outline" size={18} color={colors.text} />
                    <Text style={styles.optionTitle}>Aparência do texto</Text>
                  </View>
                  <Text style={styles.optionValue}>{textSizePercent}%</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                </TouchableOpacity>
              </View>

              <View style={styles.optionsCard}>
                <TouchableOpacity
                  style={styles.optionRow}
                  onPress={() => {
                    closeOptions(() => onOpenTuner?.());
                  }}
                >
                  <View style={styles.optionLeft}>
                    <Ionicons name="mic-outline" size={18} color={colors.text} />
                    <Text style={styles.optionTitle}>Afinador</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.optionRow}
                  onPress={() => {
                    closeOptions(() => setMetronomeOpen(true));
                  }}
                >
                  <View style={styles.optionLeft}>
                    <Ionicons name="time-outline" size={18} color={colors.text} />
                    <Text style={styles.optionTitle}>Metrônomo</Text>
                  </View>
                  <Text style={styles.optionValue}>{metronomeEnabled ? `Tocando · ${metronomeBpm} BPM` : `${metronomeBpm} BPM`}</Text>
                </TouchableOpacity>
              </View>

              <View
                style={styles.optionsCard}
                onLayout={(event) => {
                  tabsOptionsCardYRef.current = event.nativeEvent.layout.y;
                }}
              >
                <View style={styles.toggleRow}>
                  <Text style={styles.toggleText}>Acordes para canhotos</Text>
                  <Switch value={leftHanded} onValueChange={setLeftHanded} />
                </View>
                <View
                  style={styles.toggleRow}
                  onLayout={(event) => {
                    tabsToggleRowYRef.current = event.nativeEvent.layout.y;
                  }}
                >
                  <Text style={styles.toggleText}>Tablaturas nas cifras</Text>
                  <Switch value={showTabs} onValueChange={setShowTabs} />
                </View>
              </View>

              <TouchableOpacity
                style={styles.resetButton}
                onPress={() => {
                  setSemitones(0);
                  userAdjustedFontScaleRef.current = false;
                  didAutoFitRef.current = null;
                  pinchBaseScale.current = 1;
                  setFontScale(1);
                  setAutoScroll(false);
                  setScrollSpeed(0.75);
                  setShowDiagrams(true);
                  setLeftHanded(false);
                  setLyricsOnly(false);
                  setShowTabs(true);
                  setTuningMode('Padrão');
                  setCapoValue(song.capo ?? 0);
                  setInstrument(INSTRUMENT_LABEL);
                }}
              >
                <Ionicons name="refresh-outline" size={18} color={colors.text} />
                <Text style={styles.resetText}>Restaurar padrões</Text>
              </TouchableOpacity>
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>

      <Modal
        visible={instrumentOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setInstrumentOpen(false)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setInstrumentOpen(false)}>
          <Pressable
            style={styles.panelModal}
            onPress={(event) => {
              event.stopPropagation();
            }}
          >
            <Text style={styles.panelTitle}>Diagramas</Text>
            <View style={styles.panelCard}>
              <View style={styles.toggleRow}>
                <Text style={styles.toggleText}>Mostrar diagramas</Text>
                <Switch value={showDiagrams} onValueChange={setShowDiagrams} />
              </View>

              {showDiagrams ? (
                <View style={{ paddingTop: 6 }}>
                  {INSTRUMENTS.map((label) => {
                    const disabled = !SUPPORTED_INSTRUMENTS.has(label);
                    const selected = instrument === label;
                    return (
                      <TouchableOpacity
                        key={label}
                        style={[styles.panelRow, disabled ? styles.panelRowDisabled : null]}
                        onPress={() => {
                          if (disabled) {
                            Alert.alert('Em breve', 'Por enquanto, os diagramas estão disponíveis para Violão & Guitarra, Teclado e Ukulele.');
                            return;
                          }
                          setInstrument(label);
                          setInstrumentOpen(false);
                        }}
                        activeOpacity={0.85}
                      >
                        <Text style={[styles.panelRowText, disabled ? styles.panelRowTextDisabled : null]}>
                          {label}
                        </Text>
                        {selected ? <Ionicons name="checkmark" size={18} color={colors.accent} /> : null}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : null}
            </View>

            <TouchableOpacity style={styles.closeButton} onPress={() => setInstrumentOpen(false)}>
              <Text style={styles.closeButtonText}>Fechar</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={tuningOpen} transparent animationType="fade" onRequestClose={() => setTuningOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setTuningOpen(false)}>
          <Pressable
            style={styles.panelModal}
            onPress={(event) => {
              event.stopPropagation();
            }}
          >
            <Text style={styles.panelTitle}>Afinação</Text>
            <View style={styles.panelCard}>
              {([
                { label: 'Padrão', value: 'Padrão', detail: 'E A D G B E' },
                { label: 'Meio tom abaixo', value: 'Meio tom abaixo', detail: 'Eb Ab Db Gb Bb Eb' }
              ] as const).map((opt) => {
                const selected = tuningMode === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={styles.panelRow}
                    onPress={() => {
                      setTuningMode(opt.value);
                      setTuningOpen(false);
                    }}
                    activeOpacity={0.85}
                  >
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={styles.panelRowText}>{opt.label}</Text>
                      <Text style={styles.panelRowSub}>{opt.detail}</Text>
                    </View>
                    {selected ? <Ionicons name="checkmark" size={18} color={colors.accent} /> : null}
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={() => setTuningOpen(false)}>
              <Text style={styles.closeButtonText}>Fechar</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={capoOpen} transparent animationType="fade" onRequestClose={() => setCapoOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setCapoOpen(false)}>
          <Pressable
            style={styles.panelModal}
            onPress={(event) => {
              event.stopPropagation();
            }}
          >
            <Text style={styles.panelTitle}>Capotraste</Text>
            <View style={styles.panelCard}>
              <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
                {Array.from({ length: 13 }).map((_, i) => {
                  const label = i === 0 ? 'Sem capo' : `${i}ª casa`;
                  const selected = capoValue === i;
                  return (
                    <TouchableOpacity
                      key={`capo-${i}`}
                      style={styles.panelRow}
                      onPress={() => {
                        setCapoValue(i);
                        setCapoOpen(false);
                      }}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.panelRowText}>{label}</Text>
                      {selected ? <Ionicons name="checkmark" size={18} color={colors.accent} /> : null}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={() => setCapoOpen(false)}>
              <Text style={styles.closeButtonText}>Fechar</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={textSizeOpen} transparent animationType="fade" onRequestClose={() => setTextSizeOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setTextSizeOpen(false)}>
          <Pressable
            style={styles.panelModal}
            onPress={(event) => {
              event.stopPropagation();
            }}
          >
            <Text style={styles.panelTitle}>Aparência do texto</Text>
            <View style={styles.panelCard}>
              <View style={styles.textSizeRow}>
                <TouchableOpacity
                  style={styles.textSizeButton}
                  onPress={() => {
                    userAdjustedFontScaleRef.current = true;
                    setFontScale((v) => clamp(Number((v - 0.05).toFixed(2)), 0.55, 1.6));
                  }}
                >
                  <Ionicons name="remove" size={18} color={colors.text} />
                </TouchableOpacity>
                <Text style={styles.textSizeValue}>{textSizePercent}%</Text>
                <TouchableOpacity
                  style={styles.textSizeButton}
                  onPress={() => {
                    userAdjustedFontScaleRef.current = true;
                    setFontScale((v) => clamp(Number((v + 0.05).toFixed(2)), 0.55, 1.6));
                  }}
                >
                  <Ionicons name="add" size={18} color={colors.text} />
                </TouchableOpacity>
              </View>

              <View style={styles.presetRow}>
                {[70, 85, 100, 115, 135, 150].map((pct) => {
                  const selected = textSizePercent === pct;
                  return (
                    <TouchableOpacity
                      key={`pct-${pct}`}
                      style={[styles.presetChip, selected ? styles.presetChipActive : null]}
                      onPress={() => {
                        userAdjustedFontScaleRef.current = true;
                        setFontScale(clamp(pct / 100, 0.55, 1.6));
                      }}
                      activeOpacity={0.85}
                    >
                      <Text style={selected ? styles.presetChipTextActive : styles.presetChipText}>{pct}%</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={() => setTextSizeOpen(false)}>
              <Text style={styles.closeButtonText}>Fechar</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={metronomeOpen} transparent animationType="fade" onRequestClose={() => setMetronomeOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setMetronomeOpen(false)}>
          <Pressable
            style={styles.panelModal}
            onPress={(event) => {
              event.stopPropagation();
            }}
          >
            <Text style={styles.panelTitle}>Metrônomo</Text>
            <View style={styles.formCard}>
              <Text style={styles.formHint}>
                Ajuste o BPM e inicie. Você pode fechar esta janela e continuar tocando com o metrônomo ligado.
              </Text>

              <View style={styles.metronomeRow}>
                <TouchableOpacity
                  style={styles.metronomeStep}
                  onPress={() => setMetronomeBpm((v) => clamp(v - 5, 40, 240))}
                  activeOpacity={0.85}
                >
                  <Ionicons name="remove" size={18} color={colors.text} />
                </TouchableOpacity>
                <View style={styles.metronomeCenter}>
                  <Text style={styles.metronomeBpm}>{metronomeBpm}</Text>
                  <Text style={styles.metronomeUnit}>BPM</Text>
                </View>
                <TouchableOpacity
                  style={styles.metronomeStep}
                  onPress={() => setMetronomeBpm((v) => clamp(v + 5, 40, 240))}
                  activeOpacity={0.85}
                >
                  <Ionicons name="add" size={18} color={colors.text} />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={metronomeEnabled ? styles.metronomeStop : styles.primaryButton}
                onPress={() => setMetronomeEnabled((v) => !v)}
                activeOpacity={0.9}
              >
                <Text style={metronomeEnabled ? styles.metronomeStopText : styles.primaryButtonText}>
                  {metronomeEnabled ? 'Parar metrônomo' : 'Iniciar metrônomo'}
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.closeButton} onPress={() => setMetronomeOpen(false)} activeOpacity={0.9}>
              <Text style={styles.closeButtonText}>Fechar</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={personalOpen} transparent animationType="fade" onRequestClose={closePersonalEditor}>
        <Pressable style={styles.sheetBackdrop} onPress={closePersonalEditor}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
            style={{ width: '100%' }}
          >
            <Pressable
              style={[
                styles.panelModal,
                {
                  maxHeight: Math.round(windowHeight * 0.86),
                  paddingBottom: Math.max(insets.bottom, 12)
                }
              ]}
              onPress={(event) => {
                event.stopPropagation();
              }}
            >
              <View style={styles.editorHeaderRow}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={styles.panelTitle}>Editar (pra mim mesmo)</Text>
                  <Text style={styles.editorSubtitle}>
                    Salva só para você. Ative ou desative quando quiser.
                  </Text>
                </View>
                <TouchableOpacity style={styles.iconButton} onPress={closePersonalEditor} hitSlop={10}>
                  <Ionicons name="close" size={20} color={colors.text} />
                </TouchableOpacity>
              </View>

              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                contentContainerStyle={{ paddingBottom: 12 }}
              >
                <View style={styles.formCard}>
                  <View style={styles.toggleRow}>
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={styles.toggleText}>Usar minha versão</Text>
                      <Text style={styles.toggleHint}>
                        Quando ligado, esta versão aparece ao abrir a música.
                      </Text>
                    </View>
                    <Switch value={personalDraftEnabled} onValueChange={setPersonalDraftEnabled} />
                  </View>

                  <TextInput
                    style={[styles.formInput, styles.personalEditor]}
                    placeholder="Cole ou edite a cifra aqui"
                    placeholderTextColor={colors.muted}
                    value={personalDraftText}
                    onChangeText={setPersonalDraftText}
                    multiline
                    autoCorrect={false}
                    autoCapitalize="none"
                  />

                  <View style={styles.personalActionsRow}>
                    <TouchableOpacity
                      style={styles.personalChip}
                      onPress={() => setPersonalDraftText(parsedOriginal.cleanText || song.lyrics_chords)}
                      activeOpacity={0.9}
                    >
                      <Ionicons name="refresh-outline" size={16} color={colors.text} />
                      <Text style={styles.personalChipText}>Restaurar original</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.personalChip} onPress={sharePersonalEditor} activeOpacity={0.9}>
                      <Ionicons name="share-outline" size={16} color={colors.text} />
                      <Text style={styles.personalChipText}>Compartilhar</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </ScrollView>

              <View style={styles.editorFooter}>
                <TouchableOpacity style={styles.primaryButton} onPress={savePersonalEditor} activeOpacity={0.9}>
                  <Text style={styles.primaryButtonText}>Salvar</Text>
                </TouchableOpacity>

                {personalText ? (
                  <TouchableOpacity
                    style={styles.actionCardButtonSecondary}
                    onPress={deletePersonalEditor}
                    activeOpacity={0.9}
                  >
                    <Text style={styles.actionCardButtonTextSecondary}>Apagar minha versão</Text>
                  </TouchableOpacity>
                ) : null}

                <TouchableOpacity style={styles.closeButton} onPress={closePersonalEditor} activeOpacity={0.9}>
                  <Text style={styles.closeButtonText}>Fechar</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      <Modal visible={videoLessonOpen} transparent animationType="fade" onRequestClose={() => setVideoLessonOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setVideoLessonOpen(false)}>
          <Pressable
            style={styles.panelModal}
            onPress={(event) => {
              event.stopPropagation();
            }}
          >
            <Text style={styles.panelTitle}>Adicionar videoaula</Text>
            <View style={styles.formCard}>
              <Text style={styles.formHint}>
                Envie o link do YouTube e seus dados. Se aprovada, sua videoaula aparece no app com créditos.
              </Text>

              <TextInput
                style={styles.formInput}
                placeholder="Seu nome"
                placeholderTextColor={colors.muted}
                value={videoLessonName}
                onChangeText={setVideoLessonName}
                autoCapitalize="words"
              />
              <TextInput
                style={styles.formInput}
                placeholder="Email"
                placeholderTextColor={colors.muted}
                value={videoLessonEmail}
                onChangeText={setVideoLessonEmail}
                autoCapitalize="none"
                keyboardType="email-address"
              />
              <TextInput
                style={styles.formInput}
                placeholder="WhatsApp (opcional)"
                placeholderTextColor={colors.muted}
                value={videoLessonWhatsapp}
                onChangeText={setVideoLessonWhatsapp}
              />
              <TextInput
                style={styles.formInput}
                placeholder="Link do YouTube"
                placeholderTextColor={colors.muted}
                value={videoLessonYoutube}
                onChangeText={setVideoLessonYoutube}
                autoCapitalize="none"
              />
              <TextInput
                style={[styles.formInput, styles.formArea]}
                placeholder="Mensagem (opcional)"
                placeholderTextColor={colors.muted}
                value={videoLessonMessage}
                onChangeText={setVideoLessonMessage}
                multiline
              />
            </View>

            <View style={{ gap: 10, marginTop: 12 }}>
              <TouchableOpacity style={styles.primaryButton} onPress={submitVideoLessonRequest} activeOpacity={0.9}>
                <Text style={styles.primaryButtonText}>Enviar candidatura</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.closeButton} onPress={() => setVideoLessonOpen(false)} activeOpacity={0.9}>
                <Text style={styles.closeButtonText}>Fechar</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={claimOpen} transparent animationType="fade" onRequestClose={() => setClaimOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setClaimOpen(false)}>
          <Pressable
            style={styles.panelModal}
            onPress={(event) => {
              event.stopPropagation();
            }}
          >
            <Text style={styles.panelTitle}>Reivindicar música</Text>
            <View style={styles.formCard}>
              <Text style={styles.formHint}>
                Preencha as informações para o time validar e vincular esta música ao seu perfil.
              </Text>

              <TextInput
                style={styles.formInput}
                placeholder="Seu nome"
                placeholderTextColor={colors.muted}
                value={claimName}
                onChangeText={setClaimName}
                autoCapitalize="words"
              />
              <TextInput
                style={styles.formInput}
                placeholder="Email"
                placeholderTextColor={colors.muted}
                value={claimEmail}
                onChangeText={setClaimEmail}
                autoCapitalize="none"
                keyboardType="email-address"
              />
              <TextInput
                style={styles.formInput}
                placeholder="WhatsApp (opcional)"
                placeholderTextColor={colors.muted}
                value={claimWhatsapp}
                onChangeText={setClaimWhatsapp}
              />
              <TextInput
                style={styles.formInput}
                placeholder="Instagram (opcional)"
                placeholderTextColor={colors.muted}
                value={claimInstagram}
                onChangeText={setClaimInstagram}
                autoCapitalize="none"
              />
              <TextInput
                style={[styles.formInput, styles.formArea]}
                placeholder="Mensagem"
                placeholderTextColor={colors.muted}
                value={claimMessage}
                onChangeText={setClaimMessage}
                multiline
              />
              <TextInput
                style={[styles.formInput, styles.formArea]}
                placeholder="Links e detalhes (opcional)"
                placeholderTextColor={colors.muted}
                value={claimExtra}
                onChangeText={setClaimExtra}
                multiline
              />
            </View>

            <TouchableOpacity style={styles.primaryButton} onPress={submitClaim} activeOpacity={0.9}>
              <Text style={styles.primaryButtonText}>Enviar solicitação</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.closeButton} onPress={() => setClaimOpen(false)}>
              <Text style={styles.closeButtonText}>Fechar</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={suggestOpen} transparent animationType="fade" onRequestClose={() => setSuggestOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setSuggestOpen(false)}>
          <Pressable
            style={styles.panelModal}
            onPress={(event) => {
              event.stopPropagation();
            }}
          >
            <Text style={styles.panelTitle}>Sugerir alteração</Text>
            <View style={styles.formCard}>
              <Text style={styles.formHint}>
                Seja bem específico: indique o trecho e o que deve mudar.
              </Text>

              <View style={styles.kindRow}>
                {[
                  { key: 'letra' as const, label: 'Letra' },
                  { key: 'cifra' as const, label: 'Cifra/Acordes' }
                ].map(({ key, label }) => {
                  const selected = suggestKind === key;
                  return (
                    <TouchableOpacity
                      key={key}
                      style={[styles.kindChip, selected ? styles.kindChipActive : null]}
                      onPress={() => setSuggestKind(key)}
                      activeOpacity={0.9}
                    >
                      <Text style={selected ? styles.kindChipTextActive : styles.kindChipText}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TextInput
                style={[styles.formInput, styles.formArea]}
                placeholder="Descreva sua sugestão"
                placeholderTextColor={colors.muted}
                value={suggestText}
                onChangeText={setSuggestText}
                multiline
              />
            </View>

            <TouchableOpacity style={styles.primaryButton} onPress={submitSuggestion} activeOpacity={0.9}>
              <Text style={styles.primaryButtonText}>Enviar sugestão</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.closeButton} onPress={() => setSuggestOpen(false)}>
              <Text style={styles.closeButtonText}>Fechar</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={!!selectedChord} transparent animationType="fade" onRequestClose={() => setSelectedChord(null)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setSelectedChord(null)}>
          <Pressable
            style={styles.chordModal}
            onPress={(event) => {
              event.stopPropagation();
            }}
          >
            <Text style={styles.chordModalTitle}>{selectedChord}</Text>
            {selectedChord ? (
              instrument === 'Teclado' ? (
                <Text style={styles.keyboardNotesModal}>
                  {chordToKeyboardNotesPt(selectedChord).join(' \u2022 ') || 'Notas em breve'}
                </Text>
              ) : (
                <ChordDiagram
                  chord={selectedChord}
                  instrument={(instrument === 'Ukulele' ? 'ukulele' : 'guitar') as Instrument}
                  leftHanded={leftHanded}
                  variant={diagramVariantModal}
                />
              )
            ) : null}
            <TouchableOpacity style={styles.closeButton} onPress={() => setSelectedChord(null)}>
              <Text style={styles.closeButtonText}>Fechar</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={keyOpen} transparent animationType="fade" onRequestClose={closeKey}>
        <Pressable style={styles.sheetBackdrop} onPress={closeKey}>
          <Pressable style={styles.keyModal} onPress={() => {}}>
            <Text style={styles.keyModalTitle}>Tom</Text>
            <Text style={styles.keyModalSubtitle}>
              Tom original: <Text style={styles.keyModalStrong}>{capoValue ? transposeChord(song.original_key, capoValue) : song.original_key}</Text> · Atual:{' '}
              <Text style={styles.keyModalStrong}>{capoValue ? soundingKey : currentKey}</Text>
            </Text>
            {capoValue ? (
              <Text style={styles.keyModalHint}>
                Forma dos acordes: <Text style={styles.keyModalStrong}>{shapeKey}</Text>
              </Text>
            ) : null}
            <View style={styles.keyModalRow}>
              <TouchableOpacity style={styles.keyModalButton} onPress={() => setSemitones((s) => s - 1)}>
                <Text style={styles.keyModalButtonText}>-1</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.keyModalButton} onPress={() => setSemitones(0)}>
                <Text style={styles.keyModalButtonText}>Original</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.keyModalButton} onPress={() => setSemitones((s) => s + 1)}>
                <Text style={styles.keyModalButtonText}>+1</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.keyGrid}>
              {KEY_NOTES.map((note) => {
                const value = originalIsMinor ? `${note}m` : note;
                const currentRoot = getKeyRoot(capoValue ? soundingKey : currentKey);
                const valueRoot = getKeyRoot(value);
                const selected =
                  currentRoot !== null &&
                  valueRoot !== null &&
                  KEY_NOTE_TO_INDEX[currentRoot] === KEY_NOTE_TO_INDEX[valueRoot];

                return (
                  <TouchableOpacity
                    key={`key-${value}`}
                    style={[styles.keyChip, selected ? styles.keyChipActive : null]}
                    onPress={() => {
                      const baseDisplayKey = capoValue ? transposeChord(song.original_key, capoValue) : song.original_key;
                      const from = getKeyRoot(baseDisplayKey);
                      const to = getKeyRoot(value);
                      if (!from || !to) return;
                      const delta = getSemitoneDelta(from, to);
                      if (delta === null) return;
                      setSemitones(delta);
                    }}
                    activeOpacity={0.85}
                  >
                    <Text style={selected ? styles.keyChipTextActive : styles.keyChipText}>{value}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={closeKey}>
              <Text style={styles.closeButtonText}>Fechar</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  nav: { position: 'absolute', left: 0, right: 0, top: 0, zIndex: 20 },
  navBack: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },

  scroll: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 14 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  titleLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  title: { flex: 1, fontSize: 28, fontWeight: '900', color: colors.text },
  titleLikeButton: { padding: 4, marginTop: 4, alignSelf: 'flex-start' },
  artist: { color: colors.accent, fontWeight: '800', fontSize: 16 },

  videoThumb: {
    width: 84,
    height: 52,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#eaeaea'
  },
  videoThumbImage: { width: '100%', height: '100%' },
  videoThumbOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.2)' },
  videoThumbPlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },

  modeRowScroll: { marginTop: 14 },
  modeRow: { paddingHorizontal: 16, gap: 6, alignItems: 'center', flexDirection: 'row' },
  modePill: {
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: radii.pill,
    backgroundColor: '#f2f2f2'
  },
  modePillActive: { backgroundColor: '#141414' },
  modeText: { fontWeight: '800', color: colors.text, fontSize: 12 },
  modeTextActive: { fontWeight: '800', color: '#fff', fontSize: 12 },
  modeIconPill: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f2f2f2',
    alignItems: 'center',
    justifyContent: 'center'
  },
  modeMoreRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },

  instrumentRowScroll: { marginTop: 10, paddingLeft: 16 },
  instrumentRow: { paddingRight: 16, gap: 8, alignItems: 'center', flexDirection: 'row' },
  instrumentPill: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: '#f2f2f2',
    maxWidth: 160
  },
  instrumentPillActive: {
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accent
  },
  instrumentPillDisabled: {
    opacity: 0.45
  },
  instrumentText: { fontWeight: '800', color: colors.text, fontSize: 12 },
  instrumentTextActive: { fontWeight: '900', color: colors.accent, fontSize: 12 },
  instrumentTextDisabled: { fontWeight: '800', color: colors.muted, fontSize: 12 },

  chordsRow: { marginTop: 8, paddingLeft: 16 },
  chordCard: {
    width: 112,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 16,
    backgroundColor: 'transparent',
    borderWidth: 0,
    marginRight: 10,
    alignItems: 'center'
  },
  chordCardTitle: {
    color: colors.accent,
    fontWeight: '900',
    fontSize: 14,
    marginBottom: 4,
    textAlign: 'center'
  },
  chordCardDiagram: { height: 92, alignItems: 'center', justifyContent: 'center' },
  keyboardNotes: {
    color: colors.text,
    fontWeight: '800',
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
    paddingVertical: 0,
    paddingHorizontal: 6
  },

  keyRow: { marginTop: 16, flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  keyLabel: { fontSize: 22, fontWeight: '900', color: colors.text },
  keyValue: { fontSize: 22, fontWeight: '900', color: colors.accent },
  keySub: { marginTop: 6, color: colors.muted, fontWeight: '700' },
  capoRow: { marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  capoRowText: { color: colors.muted, fontWeight: '700' },

  sheet: { paddingHorizontal: 16, paddingTop: 18 },
  sheetLine: { color: colors.text },
  sheetChordLine: { color: colors.accent },
  sheetLyricLine: { color: colors.text },
  sheetChord: { color: colors.accent, fontWeight: '800' },
  sheetText: { color: colors.text },

  tabScroll: { marginTop: 10 },
  tabText: {
    color: colors.text,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignSelf: 'stretch'
  },

  credits: { paddingHorizontal: 16, paddingTop: 18, gap: 14 },
  creditLabel: { fontWeight: '900', color: colors.text, fontSize: 14 },
  creditValue: { color: colors.muted, fontWeight: '600', fontSize: 14, lineHeight: 20 },

  actionCards: { paddingHorizontal: 16, paddingTop: 18, gap: 12 },
  actionCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: 16,
    ...shadows.card
  },
  actionCardTitle: { fontWeight: '900', color: colors.text, fontSize: 16 },
  actionCardText: { color: colors.muted, fontWeight: '600', marginTop: 6, lineHeight: 20 },
  actionCardButton: {
    marginTop: 12,
    backgroundColor: colors.accentSoft,
    paddingVertical: 10,
    borderRadius: radii.pill,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border
  },
  actionCardButtonText: { color: colors.accent, fontWeight: '900' },
  actionCardButtonSecondary: {
    marginTop: 12,
    backgroundColor: colors.card,
    paddingVertical: 10,
    borderRadius: radii.pill,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border
  },
  actionCardButtonTextSecondary: { color: colors.text, fontWeight: '900' },

  metaChips: { paddingHorizontal: 16, paddingTop: 14, flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card
  },
  metaChipText: { color: colors.muted, fontWeight: '700' },

  speedPill: {
    position: 'absolute',
    right: 18,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    ...shadows.card
  },
  speedHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  speedTitle: { fontSize: 12, fontWeight: '900', color: colors.text },
  speedHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  speedValue: { fontWeight: '900', color: colors.text, minWidth: 54, textAlign: 'right' },
  aiChip: {
    borderRadius: radii.pill,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#f2f2f2',
    borderWidth: 1,
    borderColor: colors.border
  },
  aiChipText: { fontWeight: '900', color: colors.text, fontSize: 12 },
  speedTrack: {
    marginTop: 10,
    height: 18,
    borderRadius: 999,
    backgroundColor: '#f2f2f2',
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center'
  },
  speedFill: {
    height: 18,
    backgroundColor: colors.accent,
    borderRadius: 999
  },
  speedThumb: {
    position: 'absolute',
    top: -3,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: colors.border
  },

  floatingBar: {
    position: 'absolute',
    left: 18,
    right: 18,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
    ...shadows.card
  },
  floatingItem: { alignItems: 'center', gap: 6, paddingHorizontal: 6 },
  floatingLabel: { fontSize: 11, fontWeight: '800', color: colors.text },

  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)' },

  optionsSheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden'
  },
  sheetGrabArea: { paddingTop: 14, paddingBottom: 14, alignItems: 'center' },
  sheetHandle: {
    width: 44,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#d6d6d6',
    alignSelf: 'center',
    marginBottom: 10
  },
  optionsTitle: { fontSize: 22, fontWeight: '900', color: colors.text, marginBottom: 14 },

  quickRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  quickItem: { alignItems: 'center', gap: 8, flex: 1 },
  quickIcon: {
    width: 54,
    height: 40,
    borderRadius: 16,
    backgroundColor: '#f2f2f2',
    alignItems: 'center',
    justifyContent: 'center'
  },
  quickLabel: { fontWeight: '700', color: colors.text },

  videoRow: {
    marginTop: 10,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...shadows.card
  },
  videoRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  videoRowText: { fontWeight: '900', color: colors.text, fontSize: 18 },
  videoRowSub: { color: colors.muted, fontWeight: '700', marginTop: 2, fontSize: 12 },
  videoRowThumb: { width: 74, height: 44, borderRadius: 12, backgroundColor: '#eaeaea' },

  optionsCard: {
    marginTop: 14,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    overflow: 'hidden'
  },
  optionRow: {
    paddingVertical: 16,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  optionLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  optionTitleStack: { flexShrink: 1, minWidth: 0 },
  optionTitle: { fontWeight: '900', color: colors.text, fontSize: 16 },
  optionSubtitle: { color: colors.muted, fontWeight: '700', fontSize: 12, marginTop: 2 },
  optionValue: { color: colors.muted, fontWeight: '700' },

  toggleRow: {
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  toggleText: { fontWeight: '800', color: colors.text },
  toggleHint: { color: colors.muted, fontWeight: '700', fontSize: 12, lineHeight: 16 },

  editorHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  editorSubtitle: { color: colors.muted, fontWeight: '700' },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#f2f2f2',
    alignItems: 'center',
    justifyContent: 'center'
  },
  editorFooter: { gap: 10 },

  resetButton: {
    marginTop: 14,
    marginBottom: 8,
    borderRadius: radii.lg,
    backgroundColor: '#f2f2f2',
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10
  },
  resetText: { fontWeight: '900', color: colors.text },

  panelModal: {
    backgroundColor: colors.background,
    marginHorizontal: 16,
    marginBottom: 18,
    borderRadius: radii.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12
  },
  panelTitle: { fontSize: 20, fontWeight: '900', color: colors.text },
  panelCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    overflow: 'hidden'
  },
  panelRow: {
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  panelRowDisabled: { opacity: 0.5 },
  panelRowText: { fontWeight: '900', color: colors.text },
  panelRowTextDisabled: { color: colors.muted },
  panelRowSub: { color: colors.muted, fontWeight: '600' },

  formCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: 14,
    gap: 10
  },
  formHint: { color: colors.muted, fontWeight: '700', lineHeight: 18 },
  formInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    backgroundColor: '#fff',
    fontWeight: '700'
  },
  formArea: { minHeight: 84, textAlignVertical: 'top' },
  personalEditor: {
    minHeight: 260,
    textAlignVertical: 'top',
    fontFamily: MONO_FONT,
    fontWeight: '600',
    fontSize: 14,
    lineHeight: 20
  },
  personalActionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  personalChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#f2f2f2'
  },
  personalChipText: { fontWeight: '900', color: colors.text, fontSize: 12 },

  primaryButton: {
    backgroundColor: colors.accent,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: radii.pill,
    alignItems: 'center'
  },
  primaryButtonText: { color: '#fff', fontWeight: '900' },

  metronomeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 14 },
  metronomeStep: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f2f2f2',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border
  },
  metronomeCenter: { alignItems: 'center', justifyContent: 'center', minWidth: 90 },
  metronomeBpm: { fontWeight: '900', color: colors.text, fontSize: 34, lineHeight: 38 },
  metronomeUnit: { color: colors.muted, fontWeight: '800', fontSize: 12, marginTop: 2 },
  metronomeStop: {
    backgroundColor: colors.card,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: radii.pill,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border
  },
  metronomeStopText: { color: colors.text, fontWeight: '900' },

  kindRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  kindChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#f2f2f2'
  },
  kindChipActive: { backgroundColor: colors.text, borderColor: colors.text },
  kindChipText: { fontWeight: '900', color: colors.text, fontSize: 12 },
  kindChipTextActive: { fontWeight: '900', color: '#fff', fontSize: 12 },

  textSizeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 14 },
  textSizeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f2f2f2',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border
  },
  textSizeValue: { fontWeight: '900', color: colors.text, fontSize: 18, minWidth: 72, textAlign: 'center' },

  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 14 },
  presetChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#f2f2f2'
  },
  presetChipActive: { backgroundColor: colors.text, borderColor: colors.text },
  presetChipText: { fontWeight: '800', color: colors.text },
  presetChipTextActive: { fontWeight: '800', color: '#fff' },

  chordModal: {
    backgroundColor: colors.background,
    marginHorizontal: 24,
    marginBottom: 42,
    borderRadius: radii.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    gap: 12
  },
  chordModalTitle: { fontSize: 20, fontWeight: '900', color: colors.text },
  keyboardNotesModal: {
    color: colors.text,
    fontWeight: '800',
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'center',
    paddingHorizontal: 6
  },

  closeButton: { backgroundColor: colors.text, paddingVertical: 10, paddingHorizontal: 18, borderRadius: radii.pill },
  closeButtonText: { color: '#fff', fontWeight: '900' },

  keyModal: {
    backgroundColor: colors.background,
    marginHorizontal: 24,
    marginBottom: 42,
    borderRadius: radii.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    gap: 12
  },
  keyModalTitle: { fontSize: 20, fontWeight: '900', color: colors.text },
  keyModalSubtitle: { color: colors.muted, fontWeight: '700', textAlign: 'center' },
  keyModalHint: { color: colors.muted, fontWeight: '700', textAlign: 'center', marginTop: -4 },
  keyModalStrong: { color: colors.text, fontWeight: '900' },
  keyModalRow: { flexDirection: 'row', gap: 10, marginTop: 2 },
  keyModalButton: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#f2f2f2',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radii.pill
  },
  keyModalButtonText: { fontWeight: '900', color: colors.text },

  keyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center', paddingTop: 8 },
  keyChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card
  },
  keyChipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  keyChipText: { fontWeight: '900', color: colors.text },
  keyChipTextActive: { fontWeight: '900', color: colors.accent }
});
