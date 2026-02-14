import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Audio } from 'expo-av';
import {
  Alert,
  Animated,
  Image,
  Linking,
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
import { encodeSharedSongVersion, extractChords, tokenizeLine, transposeChord, transposeTokens } from '@cifras/shared';
import ChordDiagram from '../ChordDiagram';
import { supabase } from '../../lib/supabase';
import { colors, radii, shadows } from '../../lib/theme';
import {
  CHORD_INLINE_SCALE,
  CHORD_LINE_SCALE,
  INSTRUMENT_LABEL,
  INSTRUMENTS,
  KEY_NOTES,
  KEY_NOTE_TO_INDEX,
  MONO_FONT,
  SPEED_MAX,
  SPEED_MIN,
  SUPPORTED_INSTRUMENTS
} from './constants';
import type { CifraViewProps } from './types';
import { isChordLine, parseAndCleanCifra } from './utils/cifraParser';
import { chordToKeyboardNotesPt, clamp, getKeyRoot, getSemitoneDelta, isMinorKey } from './utils/musicTheory';

export default function CifraView({
  song,
  isFavorite,
  onToggleFavorite,
  onBack,
  onOpenTuner
}: CifraViewProps) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const scrollRef = useRef<ScrollView | null>(null);
  const scrollY = useRef(0);

  const [lyricsOnly, setLyricsOnly] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [optionsInteractable, setOptionsInteractable] = useState(false);
  const [keyOpen, setKeyOpen] = useState(false);
  const optionsScrollRef = useRef<ScrollView | null>(null);
  const tabsOptionsCardYRef = useRef<number | null>(null);
  const tabsToggleRowYRef = useRef<number | null>(null);
  const optionsSheetHeight = Math.round(windowHeight * 0.52);
  const optionsTranslateY = useRef(new Animated.Value(optionsSheetHeight)).current;
  const optionsBackdropOpacity = useRef(new Animated.Value(0)).current;
  const optionsDragStartY = useRef(0);
  const optionsSeqRef = useRef(0);

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
  const [suggestContext, setSuggestContext] = useState<string | null>(null);
  const [suggestContextLine, setSuggestContextLine] = useState<number | null>(null);

  const [communitySugOpen, setCommunitySugOpen] = useState(false);
  const [communitySugLoading, setCommunitySugLoading] = useState(false);
  const [communitySugError, setCommunitySugError] = useState<string | null>(null);
  const [communitySugItems, setCommunitySugItems] = useState<any[]>([]);
  const [communitySugVotes, setCommunitySugVotes] = useState<Record<string, number>>({});

  const [videoLessonsOpen, setVideoLessonsOpen] = useState(false);
  const [videoLessonSubmitOpen, setVideoLessonSubmitOpen] = useState(false);
  const [videoLessonsLoading, setVideoLessonsLoading] = useState(false);
  const [videoLessonsError, setVideoLessonsError] = useState<string | null>(null);
  const [videoLessons, setVideoLessons] = useState<any[]>([]);
  const [videoLessonName, setVideoLessonName] = useState('');
  const [videoLessonEmail, setVideoLessonEmail] = useState('');
  const [videoLessonWhatsapp, setVideoLessonWhatsapp] = useState('');
  const [videoLessonUrl, setVideoLessonUrl] = useState('');
  const [videoLessonMessage, setVideoLessonMessage] = useState('');
  const [videoLessonSubmitting, setVideoLessonSubmitting] = useState(false);

  const [contribProfileOpen, setContribProfileOpen] = useState(false);
  const [contribProfileName, setContribProfileName] = useState<string | null>(null);
  const [contribProfileRole, setContribProfileRole] = useState<'composer' | 'reviewer' | null>(null);
  const [contribProfileLoading, setContribProfileLoading] = useState(false);
  const [contribProfileError, setContribProfileError] = useState<string | null>(null);
  const [contribProfileCount, setContribProfileCount] = useState<number | null>(null);
  const [contribProfileSongs, setContribProfileSongs] = useState<any[]>([]);
  const contribCountCacheRef = useRef<Map<string, number>>(new Map());
  const [reviewerCounts, setReviewerCounts] = useState<Record<string, number>>({});

  const [communityVersionsOpen, setCommunityVersionsOpen] = useState(false);
  const [communityVersionsLoading, setCommunityVersionsLoading] = useState(false);
  const [communityVersionsError, setCommunityVersionsError] = useState<string | null>(null);
  const [communityVersions, setCommunityVersions] = useState<any[]>([]);
  const [communityVersionLikes, setCommunityVersionLikes] = useState<Record<string, boolean>>({});
  const [forkParentVersionId, setForkParentVersionId] = useState<string | null>(null);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyItems, setHistoryItems] = useState<any[]>([]);
  const [historyDiffOpen, setHistoryDiffOpen] = useState(false);
  const [historyDiffTitle, setHistoryDiffTitle] = useState<string>('');
  const [historyDiffOps, setHistoryDiffOps] = useState<any[]>([]);

  const [tagsOpen, setTagsOpen] = useState(false);
  const [tagsLoading, setTagsLoading] = useState(false);
  const [tagsError, setTagsError] = useState<string | null>(null);
  const [tagCounts, setTagCounts] = useState<Record<string, { value: string; votes: number }[]>>({});
  const [myTagVotes, setMyTagVotes] = useState<Record<string, Set<string>>>({});

  const [executionTipsOpen, setExecutionTipsOpen] = useState(false);
  const [executionTipsTab, setExecutionTipsTab] = useState<'approved' | 'queue'>('approved');
  const [executionTipsLoading, setExecutionTipsLoading] = useState(false);
  const [executionTipsError, setExecutionTipsError] = useState<string | null>(null);
  const [executionTipsApproved, setExecutionTipsApproved] = useState<any[]>([]);
  const [executionTipsQueue, setExecutionTipsQueue] = useState<any[]>([]);
  const [executionTipVotes, setExecutionTipVotes] = useState<Record<string, number>>({});
  const [executionTipSubmitOpen, setExecutionTipSubmitOpen] = useState(false);
  const [executionTipKind, setExecutionTipKind] = useState<'entrada' | 'levada' | 'transicao' | 'geral'>('geral');
  const [executionTipText, setExecutionTipText] = useState('');
  const [executionTipSubmitting, setExecutionTipSubmitting] = useState(false);

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
      require('../../../assets/metronome/click.wav'),
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
  const artistVerified = Boolean(song.artists && (song.artists as any).verified_at);
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

  const sortedReviewers = useMemo(() => {
    if (!reviewers.length) return reviewers;
    const indexMap = new Map(reviewers.map((name, idx) => [name, idx]));
    return [...reviewers].sort((a, b) => {
      const ca = reviewerCounts[a];
      const cb = reviewerCounts[b];
      const va = Number.isFinite(ca) ? ca : -1;
      const vb = Number.isFinite(cb) ? cb : -1;
      if (va !== vb) return vb - va;
      return (indexMap.get(a) ?? 0) - (indexMap.get(b) ?? 0);
    });
  }, [reviewerCounts, reviewers]);

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

  const extractYoutubeId = useCallback((rawUrl: string) => {
    const url = String(rawUrl ?? '').trim();
    if (!url) return null;

    // Common patterns:
    // - https://youtu.be/VIDEOID
    // - https://www.youtube.com/watch?v=VIDEOID
    // - https://www.youtube.com/shorts/VIDEOID
    // - https://www.youtube.com/embed/VIDEOID
    const m1 = url.match(/youtu\.be\/([a-zA-Z0-9_-]{6,})/u);
    if (m1?.[1]) return m1[1];
    const m2 = url.match(/[?&]v=([a-zA-Z0-9_-]{6,})/u);
    if (m2?.[1]) return m2[1];
    const m3 = url.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{6,})/u);
    if (m3?.[1]) return m3[1];
    const m4 = url.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{6,})/u);
    if (m4?.[1]) return m4[1];
    return null;
  }, []);

  const ensureLoggedIn = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user ?? null;
    if (!user) {
      Alert.alert('Entre para continuar', 'Faça login na aba Conta para usar essa função.');
      return null;
    }
    return user;
  }, []);

  const savePersonalText = useCallback(
    async (userId: string, text: string, enabled: boolean) => {
      const key = `cifra_crista:personal_song_version:v1:${userId}:${song.id}`;
      const payload = { enabled: Boolean(enabled), text, updatedAt: new Date().toISOString() };
      await AsyncStorage.setItem(key, JSON.stringify(payload));
      setPersonalUserId(userId);
      setPersonalText(text);
      setPersonalEnabled(Boolean(enabled));
    },
    [song.id]
  );

  const loadVideoLessons = useCallback(async () => {
    setVideoLessonsError(null);
    setVideoLessonsLoading(true);
    try {
      const { data, error } = await supabase
        .from('song_video_lessons_public')
        .select('request_id,youtube_url,approved_at,created_at')
        .eq('song_id', song.id)
        .order('approved_at', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(30);
      if (error) throw error;
      setVideoLessons(data ?? []);
    } catch (err: any) {
      const message = err instanceof Error ? err.message : 'Não foi possível carregar agora.';
      setVideoLessonsError(message);
      setVideoLessons([]);
    } finally {
      setVideoLessonsLoading(false);
    }
  }, [song.id]);

  useEffect(() => {
    void loadVideoLessons();
  }, [loadVideoLessons]);

  const loadExecutionTips = useCallback(async () => {
    setExecutionTipsError(null);
    setExecutionTipsLoading(true);
    try {
      const { data: approved, error: approvedErr } = await supabase
        .from('song_execution_tips_public')
        .select('tip_id,kind,text,upvotes,downvotes,approved_at,created_at')
        .eq('song_id', song.id)
        .order('upvotes', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(60);
      if (approvedErr) throw approvedErr;

      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user ?? null;

      let queue: any[] = [];
      if (user) {
        const { data: pending, error: queueErr } = await supabase
          .from('song_execution_tips_queue')
          .select('tip_id,kind,excerpt,upvotes,downvotes,created_at')
          .eq('song_id', song.id)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(60);
        if (!queueErr) queue = pending ?? [];
      }

      const allTipIds = [...(approved ?? []), ...queue].map((t: any) => String(t.tip_id)).filter(Boolean);
      let votesMap: Record<string, number> = {};
      if (user && allTipIds.length) {
        const { data: votes, error: votesErr } = await supabase
          .from('song_execution_tip_votes')
          .select('tip_id,vote')
          .eq('user_id', user.id)
          .in('tip_id', allTipIds);
        if (!votesErr) {
          votesMap = Object.fromEntries((votes ?? []).map((v: any) => [String(v.tip_id), Number(v.vote)]));
        }
      }

      setExecutionTipsApproved(approved ?? []);
      setExecutionTipsQueue(queue);
      setExecutionTipVotes(votesMap);
    } catch (err: any) {
      const message = err instanceof Error ? err.message : 'Não foi possível carregar agora.';
      setExecutionTipsError(message);
      setExecutionTipsApproved([]);
      setExecutionTipsQueue([]);
      setExecutionTipVotes({});
    } finally {
      setExecutionTipsLoading(false);
    }
  }, [song.id]);

  const openExecutionTipSubmit = useCallback(async () => {
    const user = await ensureLoggedIn();
    if (!user) return;
    setExecutionTipKind('geral');
    setExecutionTipText('');
    setExecutionTipSubmitOpen(true);
  }, [ensureLoggedIn]);

  const submitExecutionTip = useCallback(async () => {
    const user = await ensureLoggedIn();
    if (!user) return;
    if (executionTipSubmitting) return;

    const text = String(executionTipText ?? '').trim();
    if (!text) return Alert.alert('Dica', 'Digite uma dica curta (entrada, levada, transição...).');
    if (text.length > 400) return Alert.alert('Dica muito longa', 'Tente resumir para até 400 caracteres.');

    setExecutionTipSubmitting(true);
    try {
      const { error } = await supabase.from('song_execution_tip_requests').insert({
        song_id: song.id,
        song_title: song.title,
        artist: artistName,
        user_id: user.id,
        kind: executionTipKind,
        text,
        status: 'pending'
      } as any);
      if (error) throw error;

      setExecutionTipSubmitOpen(false);
      setExecutionTipText('');
      Alert.alert('Obrigado', 'Recebemos sua dica. Ela vai para moderação e votação.');
      void loadExecutionTips();
    } catch {
      Alert.alert('Erro', 'Não foi possível enviar agora. Tente novamente em instantes.');
    } finally {
      setExecutionTipSubmitting(false);
    }
  }, [artistName, ensureLoggedIn, executionTipKind, executionTipSubmitting, executionTipText, loadExecutionTips, song.id, song.title]);

  const toggleExecutionTipVote = useCallback(
    async (tipId: string, vote: 1 | -1) => {
      const user = await ensureLoggedIn();
      if (!user) return;

      const id = String(tipId);
      const current = Number(executionTipVotes[id] ?? 0);
      try {
        if (current === vote) {
          const { error } = await supabase
            .from('song_execution_tip_votes')
            .delete()
            .eq('tip_id', id)
            .eq('user_id', user.id);
          if (error) throw error;
          const next = { ...executionTipVotes };
          delete next[id];
          setExecutionTipVotes(next);
        } else {
          const { error } = await supabase.from('song_execution_tip_votes').upsert(
            { tip_id: id, user_id: user.id, vote } as any,
            { onConflict: 'tip_id,user_id' }
          );
          if (error) throw error;
          setExecutionTipVotes({ ...executionTipVotes, [id]: vote });
        }
        void loadExecutionTips();
      } catch {
        Alert.alert('Erro', 'Não foi possível votar agora. Tente novamente.');
      }
    },
    [ensureLoggedIn, executionTipVotes, loadExecutionTips]
  );

  const openVideoLessonSubmit = useCallback(async () => {
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
    setVideoLessonWhatsapp((prev) => prev || '');
    setVideoLessonUrl('');
    setVideoLessonMessage('');
    setVideoLessonSubmitOpen(true);
  }, [ensureLoggedIn]);

  const submitVideoLesson = useCallback(async () => {
    const user = await ensureLoggedIn();
    if (!user) return;
    if (videoLessonSubmitting) return;

    const name = videoLessonName.trim();
    const email = (videoLessonEmail.trim() || user.email || '').trim();
    const whatsapp = videoLessonWhatsapp.trim();
    const youtubeUrl = videoLessonUrl.trim();
    const message = videoLessonMessage.trim();

    if (!name) return Alert.alert('Seu nome', 'Digite seu nome para enviar a videoaula.');
    if (!email) return Alert.alert('Email', 'Digite um email para contato.');
    if (!youtubeUrl) return Alert.alert('Link do YouTube', 'Cole o link do YouTube aqui.');

    const youtubeId = extractYoutubeId(youtubeUrl);
    if (!youtubeId) return Alert.alert('Link inválido', 'Esse link não parece ser do YouTube. Tente copiar o link do vídeo.');

    setVideoLessonSubmitting(true);
    try {
      const record = {
        song_id: song.id,
        song_title: song.title,
        artist: artistName,
        user_id: user.id,
        name,
        email,
        whatsapp: whatsapp || null,
        youtube_url: youtubeUrl,
        message: message || null,
        created_at: new Date().toISOString()
      };

      const { error } = await supabase.from('song_video_lesson_requests').insert(record as any);
      if (error) {
        const code = (error as any)?.code;
        const msg = String((error as any)?.message ?? '');
        if (code === '23505' || /unique|duplicate/iu.test(msg)) {
          Alert.alert('Já enviado', 'Você já enviou uma videoaula para esta música. Ela aparece em “Minhas contribuições”.');
          setVideoLessonSubmitOpen(false);
          return;
        }
        throw error;
      }

      setVideoLessonSubmitOpen(false);
      Alert.alert('Enviado', 'Recebemos sua videoaula. Vamos revisar e, se aprovar, ela aparece aqui.');
    } catch {
      Alert.alert('Erro', 'Não foi possível enviar agora. Tente novamente em instantes.');
    } finally {
      setVideoLessonSubmitting(false);
    }
  }, [
    artistName,
    ensureLoggedIn,
    extractYoutubeId,
    song.id,
    song.title,
    videoLessonEmail,
    videoLessonMessage,
    videoLessonName,
    videoLessonSubmitting,
    videoLessonUrl,
    videoLessonWhatsapp
  ]);

  const openYoutube = useCallback(async (url: string) => {
    const finalUrl = String(url ?? '').trim();
    if (!finalUrl) return;
    try {
      await Linking.openURL(finalUrl);
    } catch {
      Alert.alert('Erro', 'Não foi possível abrir o link.');
    }
  }, []);

  const diffLines = useCallback((aText: string, bText: string) => {
    const a = String(aText ?? '').split(/\r?\n/u);
    const b = String(bText ?? '').split(/\r?\n/u);

    // Myers diff on lines (O(ND)) - good enough for typical chord sheets.
    const n = a.length;
    const m = b.length;
    const max = n + m;
    const v = new Map<number, number>();
    v.set(1, 0);
    const trace: Map<number, number>[] = [];

    const getV = (k: number) => v.get(k) ?? 0;
    const setV = (k: number, x: number) => v.set(k, x);

    let dFound = 0;
    for (let d = 0; d <= max; d += 1) {
      const snapshot = new Map<number, number>();
      for (const [k, x] of v.entries()) snapshot.set(k, x);
      trace.push(snapshot);

      for (let k = -d; k <= d; k += 2) {
        let x: number;
        if (k === -d || (k !== d && getV(k - 1) < getV(k + 1))) {
          x = getV(k + 1);
        } else {
          x = getV(k - 1) + 1;
        }
        let y = x - k;
        while (x < n && y < m && a[x] === b[y]) {
          x += 1;
          y += 1;
        }
        setV(k, x);
        if (x >= n && y >= m) {
          dFound = d;
          d = max + 1;
          break;
        }
      }
    }

    // Backtrack.
    let x = n;
    let y = m;
    const ops: { op: 'eq' | 'ins' | 'del'; text: string }[] = [];
    for (let d = dFound; d >= 0; d -= 1) {
      const vv = trace[d] ?? new Map<number, number>();
      const k = x - y;
      let prevK: number;
      if (k === -d || (k !== d && (vv.get(k - 1) ?? 0) < (vv.get(k + 1) ?? 0))) {
        prevK = k + 1;
      } else {
        prevK = k - 1;
      }
      const prevX = vv.get(prevK) ?? 0;
      const prevY = prevX - prevK;

      while (x > prevX && y > prevY) {
        ops.push({ op: 'eq', text: a[x - 1] ?? '' });
        x -= 1;
        y -= 1;
      }

      if (d === 0) break;

      if (x === prevX) {
        ops.push({ op: 'ins', text: b[y - 1] ?? '' });
        y -= 1;
      } else {
        ops.push({ op: 'del', text: a[x - 1] ?? '' });
        x -= 1;
      }
    }

    ops.reverse();
    return ops;
  }, []);

  const loadSongHistory = useCallback(async () => {
    setHistoryError(null);
    setHistoryLoading(true);
    try {
      const { data, error } = await supabase
        .from('song_versions')
        .select('id,version_no,created_at,source')
        .eq('song_id', song.id)
        .order('version_no', { ascending: false })
        .limit(40);
      if (error) throw error;
      setHistoryItems(data ?? []);
    } catch (err: any) {
      const message = err instanceof Error ? err.message : 'Não foi possível carregar agora.';
      setHistoryError(message);
      setHistoryItems([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [song.id]);

  const openHistoryDiff = useCallback(
    async (versionNo: number) => {
      try {
        // Compare vN with v(N-1). If missing, compare vN with current song text.
        const { data: curr, error: currErr } = await supabase
          .from('song_versions')
          .select('version_no,text')
          .eq('song_id', song.id)
          .eq('version_no', versionNo)
          .single();
        if (currErr) throw currErr;

        const { data: prev } = await supabase
          .from('song_versions')
          .select('version_no,text')
          .eq('song_id', song.id)
          .eq('version_no', Math.max(1, versionNo - 1))
          .maybeSingle();

        const aText = String((prev as any)?.text ?? song.lyrics_chords);
        const bText = String((curr as any)?.text ?? song.lyrics_chords);
        const aLabel = prev ? `v${(prev as any).version_no}` : 'atual';
        const bLabel = `v${versionNo}`;

        setHistoryDiffTitle(`${aLabel} → ${bLabel}`);
        setHistoryDiffOps(diffLines(aText, bText));
        setHistoryDiffOpen(true);
      } catch {
        Alert.alert('Erro', 'Não foi possível gerar a comparação agora.');
      }
    },
    [diffLines, song.id, song.lyrics_chords]
  );

  const applySongVersionToMine = useCallback(
    async (versionNo: number) => {
      const user = await ensureLoggedIn();
      if (!user) return;
      try {
        const { data, error } = await supabase
          .from('song_versions')
          .select('text')
          .eq('song_id', song.id)
          .eq('version_no', versionNo)
          .single();
        if (error) throw error;
        await savePersonalText(user.id, String((data as any)?.text ?? ''), true);
        Alert.alert('Pronto', `v${versionNo} foi salva como “minha versão” e está ativa.`);
      } catch {
        Alert.alert('Erro', 'Não foi possível aplicar essa versão agora.');
      }
    },
    [ensureLoggedIn, savePersonalText, song.id]
  );

  const countContributorSongs = useCallback(async (name: string, role: 'composer' | 'reviewer') => {
    const key = `${role}:${name}`;
    const cached = contribCountCacheRef.current.get(key);
    if (typeof cached === 'number') return cached;

    const base = supabase.from('songs').select('id', { count: 'exact', head: true }).ilike('lyrics_chords', `%${name}%`);
    const query =
      role === 'reviewer'
        ? base.ilike('lyrics_chords', '%Colabora%')
        : base.ilike('lyrics_chords', '%Composi%');

    const { count } = await query;
    const value = typeof count === 'number' ? count : 0;
    contribCountCacheRef.current.set(key, value);
    return value;
  }, []);

  const TAG_OPTIONS = useMemo(() => {
    return {
      difficulty: [
        { value: 'iniciante', label: 'Iniciante' },
        { value: 'intermediario', label: 'Intermediário' },
        { value: 'avancado', label: 'Avançado' }
      ],
      vibe: [
        { value: 'adoracao', label: 'Adoração' },
        { value: 'celebracao', label: 'Celebração' }
      ],
      rhythm: [
        { value: 'balada', label: 'Balada' },
        { value: 'pop_rock', label: 'Pop/Rock' },
        { value: 'reggae', label: 'Reggae' },
        { value: 'seis_oitavos', label: '6/8' }
      ],
      bpm: [
        { value: '60', label: '60' },
        { value: '72', label: '72' },
        { value: '80', label: '80' },
        { value: '90', label: '90' },
        { value: '100', label: '100' },
        { value: '110', label: '110' },
        { value: '120', label: '120' },
        { value: '140', label: '140' }
      ],
      capo: Array.from({ length: 8 }).map((_, i) => ({ value: String(i), label: i === 0 ? 'Sem capo' : `${i}ª` })),
      instrument: [
        { value: 'voz', label: 'Voz' },
        { value: 'violao', label: 'Violão' },
        { value: 'guitarra', label: 'Guitarra' },
        { value: 'baixo', label: 'Baixo' },
        { value: 'teclado', label: 'Teclado' },
        { value: 'bateria', label: 'Bateria' },
        { value: 'cajon', label: 'Cajón' },
        { value: 'ukulele', label: 'Ukulele' }
      ]
    };
  }, []);

  const loadSongTags = useCallback(async () => {
    setTagsError(null);
    setTagsLoading(true);
    try {
      const { data, error } = await supabase
        .from('song_tag_counts')
        .select('key,value,votes')
        .eq('song_id', song.id)
        .order('votes', { ascending: false })
        .limit(250);
      if (error) throw error;

      const grouped: Record<string, { value: string; votes: number }[]> = {};
      for (const row of data ?? []) {
        const k = String((row as any).key ?? '');
        const v = String((row as any).value ?? '');
        const votes = Number((row as any).votes ?? 0);
        if (!k || !v) continue;
        if (!grouped[k]) grouped[k] = [];
        grouped[k].push({ value: v, votes });
      }

      for (const k of Object.keys(grouped)) {
        grouped[k] = grouped[k].sort((a, b) => b.votes - a.votes).slice(0, 8);
      }
      setTagCounts(grouped);

      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user ?? null;
      if (!user) {
        setMyTagVotes({});
        return;
      }

      const { data: votes, error: votesErr } = await supabase
        .from('song_tag_votes')
        .select('key,value')
        .eq('song_id', song.id)
        .eq('user_id', user.id)
        .limit(200);
      if (votesErr) {
        setMyTagVotes({});
        return;
      }

      const mine: Record<string, Set<string>> = {};
      for (const row of votes ?? []) {
        const k = String((row as any).key ?? '');
        const v = String((row as any).value ?? '');
        if (!k || !v) continue;
        if (!mine[k]) mine[k] = new Set();
        mine[k].add(v);
      }
      setMyTagVotes(mine);
    } catch (err: any) {
      const message = err instanceof Error ? err.message : 'Não foi possível carregar agora.';
      setTagsError(message);
      setTagCounts({});
      setMyTagVotes({});
    } finally {
      setTagsLoading(false);
    }
  }, [song.id]);

  const setSingleTagVote = useCallback(
    async (key: string, value: string) => {
      const user = await ensureLoggedIn();
      if (!user) return;

      try {
        await supabase.from('song_tag_votes').delete().eq('song_id', song.id).eq('user_id', user.id).eq('key', key);
        const { error } = await supabase.from('song_tag_votes').insert({
          song_id: song.id,
          user_id: user.id,
          key,
          value
        } as any);
        if (error) throw error;
        void loadSongTags();
      } catch {
        Alert.alert('Erro', 'Não foi possível votar agora. Tente novamente.');
      }
    },
    [ensureLoggedIn, loadSongTags, song.id]
  );

  const toggleMultiTagVote = useCallback(
    async (key: string, value: string) => {
      const user = await ensureLoggedIn();
      if (!user) return;

      const mine = myTagVotes[key] ?? new Set();
      const has = mine.has(value);

      try {
        if (has) {
          const { error } = await supabase
            .from('song_tag_votes')
            .delete()
            .eq('song_id', song.id)
            .eq('user_id', user.id)
            .eq('key', key)
            .eq('value', value);
          if (error) throw error;
        } else {
          const { error } = await supabase.from('song_tag_votes').insert({
            song_id: song.id,
            user_id: user.id,
            key,
            value
          } as any);
          if (error) throw error;
        }
        void loadSongTags();
      } catch {
        Alert.alert('Erro', 'Não foi possível votar agora. Tente novamente.');
      }
    },
    [ensureLoggedIn, loadSongTags, myTagVotes, song.id]
  );

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!reviewers.length) {
        if (mounted) setReviewerCounts({});
        return;
      }
      const pairs = await Promise.all(
        reviewers.map(async (name) => {
          try {
            const c = await countContributorSongs(name, 'reviewer');
            return [name, c] as const;
          } catch {
            return [name, 0] as const;
          }
        })
      );
      if (!mounted) return;
      setReviewerCounts(Object.fromEntries(pairs));
    })().catch(() => {});

    return () => {
      mounted = false;
    };
  }, [countContributorSongs, reviewers, song.id]);

  const openContributorProfile = useCallback(
    async (name: string, role: 'composer' | 'reviewer') => {
      const label = role === 'reviewer' ? 'Colaboração e revisão' : 'Composição';
      setContribProfileName(name);
      setContribProfileRole(role);
      setContribProfileOpen(true);
      setContribProfileError(null);
      setContribProfileSongs([]);
      setContribProfileCount(null);
      setContribProfileLoading(true);

      try {
        const count = await countContributorSongs(name, role);

        const base = supabase
          .from('songs')
          .select('id,title,views,artists(name)')
          .ilike('lyrics_chords', `%${name}%`);
        const query =
          role === 'reviewer'
            ? base.ilike('lyrics_chords', '%Colabora%')
            : base.ilike('lyrics_chords', '%Composi%');

        const { data, error } = await query.order('views', { ascending: false }).limit(40);
        if (error) throw error;

        setContribProfileCount(count);
        setContribProfileSongs(data ?? []);
        setContribProfileError(null);
      } catch (err: any) {
        const message =
          err instanceof Error ? err.message : `Não foi possível carregar o perfil de ${name} agora.`;
        setContribProfileError(message);
        setContribProfileSongs([]);
        setContribProfileCount(null);
        Alert.alert('Erro', `Não foi possível carregar ${label}. Tente novamente.`);
      } finally {
        setContribProfileLoading(false);
      }
    },
    [countContributorSongs]
  );

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
    setSuggestContext(null);
    setSuggestContextLine(null);
    setSuggestOpen(true);
  }, [ensureLoggedIn]);

  const openSuggestionForLine = useCallback(
    async (lineIndex: number, kindGuess: 'letra' | 'cifra') => {
      const user = await ensureLoggedIn();
      if (!user) return;

      const safeIndex = clamp(lineIndex, 0, Math.max(0, transposedTokens.length - 1));

      const renderLineForContext = (idx: number) => {
        const tokenLine = transposedTokens[idx];
        if (!tokenLine) return '';
        if (kindGuess === 'letra') {
          return tokenLine
            .filter((t) => t.type !== 'chord')
            .map((t) => t.value)
            .join('')
            .replace(/\s+$/u, '');
        }
        return tokenLine.map((t) => t.value).join('').replace(/\s+$/u, '');
      };

      const contextIndexes = [safeIndex - 1, safeIndex, safeIndex + 1].filter(
        (idx) => idx >= 0 && idx < transposedTokens.length
      );
      const snippet = contextIndexes
        .map((idx) => renderLineForContext(idx))
        .filter((line) => line.trim().length > 0)
        .join('\n');

      setSuggestKind(kindGuess);
      setSuggestText('');
      setSuggestContext(snippet || renderLineForContext(safeIndex));
      setSuggestContextLine(safeIndex);
      setSuggestOpen(true);
    },
    [ensureLoggedIn, transposedTokens]
  );

  const submitSuggestion = useCallback(async () => {
    const user = await ensureLoggedIn();
    if (!user) return;
    const text = suggestText.trim();
    if (!text) return Alert.alert('Sugestão', 'Descreva a alteração que você sugere.');

    const finalText = suggestContext
      ? `Trecho (linha ${typeof suggestContextLine === 'number' ? suggestContextLine + 1 : '?'})\n${suggestContext}\n\nSugestão\n${text}`
      : text;

    const record = {
      song_id: song.id,
      song_title: song.title,
      artist: artistName,
      user_id: user.id,
      kind: suggestKind,
      text: finalText,
      created_at: new Date().toISOString()
    };

    const { error: sugErr } = await supabase.from('song_suggestions').insert(record as any);
    if (!sugErr) {
      setSuggestOpen(false);
      setSuggestText('');
      setSuggestContext(null);
      setSuggestContextLine(null);
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
      setSuggestContext(null);
      setSuggestContextLine(null);
      Alert.alert('Obrigado', 'Recebemos sua sugestão. Vamos revisar.');
    } catch {
      Alert.alert('Erro', 'Não foi possível enviar agora. Tente novamente em instantes.');
    }
  }, [ensureLoggedIn, artistName, song.id, song.title, suggestContext, suggestContextLine, suggestKind, suggestText]);

  const loadCommunitySuggestions = useCallback(async () => {
    setCommunitySugError(null);
    setCommunitySugLoading(true);
    try {
      const user = await ensureLoggedIn();
      if (!user) {
        setCommunitySugItems([]);
        setCommunitySugVotes({});
        setCommunitySugLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('song_suggestions_queue')
        .select('suggestion_id,kind,excerpt,upvotes,downvotes,created_at')
        .eq('song_id', song.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(30);
      if (error) throw error;

      const items = data ?? [];
      const ids = items.map((row: any) => row.suggestion_id).filter(Boolean);

      let votesMap: Record<string, number> = {};
      if (ids.length) {
        const { data: votes, error: votesErr } = await supabase
          .from('song_suggestion_votes')
          .select('suggestion_id,vote')
          .eq('user_id', user.id)
          .in('suggestion_id', ids);
        if (!votesErr) {
          votesMap = Object.fromEntries((votes ?? []).map((v: any) => [String(v.suggestion_id), Number(v.vote)]));
        }
      }

      setCommunitySugItems(items);
      setCommunitySugVotes(votesMap);
    } catch (err: any) {
      const message = err instanceof Error ? err.message : 'Não foi possível carregar agora.';
      setCommunitySugError(message);
      setCommunitySugItems([]);
      setCommunitySugVotes({});
    } finally {
      setCommunitySugLoading(false);
    }
  }, [ensureLoggedIn, song.id]);

  const toggleCommunityVote = useCallback(
    async (suggestionId: string, vote: 1 | -1) => {
      const user = await ensureLoggedIn();
      if (!user) return;

      const id = String(suggestionId);
      const current = Number(communitySugVotes[id] ?? 0);
      try {
        if (current === vote) {
          const { error } = await supabase
            .from('song_suggestion_votes')
            .delete()
            .eq('suggestion_id', id)
            .eq('user_id', user.id);
          if (error) throw error;

          const nextVotes = { ...communitySugVotes };
          delete nextVotes[id];
          setCommunitySugVotes(nextVotes);
        } else {
          const { error } = await supabase.from('song_suggestion_votes').upsert(
            {
              suggestion_id: id,
              user_id: user.id,
              vote
            } as any,
            { onConflict: 'suggestion_id,user_id' }
          );
          if (error) throw error;
          setCommunitySugVotes({ ...communitySugVotes, [id]: vote });
        }

        // Refresh counts (triggers update counts server-side).
        void loadCommunitySuggestions();
      } catch {
        Alert.alert('Erro', 'Não foi possível votar agora. Tente novamente.');
      }
    },
    [communitySugVotes, ensureLoggedIn, loadCommunitySuggestions]
  );

  const openPersonalEditor = useCallback(async () => {
    const user = await ensureLoggedIn();
    if (!user) return;

    const baseText = parsedOriginal.cleanText || song.lyrics_chords;
    const current = typeof personalText === 'string' && personalText.trim().length ? personalText : baseText;
    setPersonalDraftText(current);
    setPersonalDraftEnabled(Boolean(personalEnabled && personalText));
    setForkParentVersionId(null);
    setPersonalOpen(true);
  }, [ensureLoggedIn, parsedOriginal.cleanText, personalEnabled, personalText, song.lyrics_chords]);

  const savePersonalEditor = useCallback(async () => {
    const user = await ensureLoggedIn();
    if (!user) return;

    Keyboard.dismiss();
    const text = String(personalDraftText ?? '').replace(/\s+$/u, '');
    if (!text.trim()) return Alert.alert('Texto', 'Sua versao nao pode ficar vazia.');

    await savePersonalText(user.id, text, Boolean(personalDraftEnabled));
    setPersonalOpen(false);
    Alert.alert('Salvo', personalDraftEnabled ? 'Sua versao esta ativa.' : 'Sua versao foi salva (desativada).');
  }, [ensureLoggedIn, personalDraftEnabled, personalDraftText, savePersonalText]);

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

  const loadCommunityVersions = useCallback(async () => {
    setCommunityVersionsError(null);
    setCommunityVersionsLoading(true);
    try {
      const { data, error } = await supabase
        .from('song_public_versions')
        .select('id,title,excerpt,text,like_count,fork_count,parent_version_id,created_at')
        .eq('song_id', song.id)
        .eq('is_public', true)
        .order('like_count', { ascending: false })
        .order('fork_count', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(40);
      if (error) throw error;

      const versions = data ?? [];
      setCommunityVersions(versions);

      // Likes are per-user; best-effort if logged in.
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user ?? null;
      if (!user || !versions.length) {
        setCommunityVersionLikes({});
        return;
      }

      const ids = versions.map((v: any) => v.id).filter(Boolean);
      const { data: likes, error: likesErr } = await supabase
        .from('song_public_version_likes')
        .select('version_id')
        .eq('user_id', user.id)
        .in('version_id', ids);
      if (!likesErr) {
        const map: Record<string, boolean> = {};
        for (const row of likes ?? []) map[String((row as any).version_id)] = true;
        setCommunityVersionLikes(map);
      } else {
        setCommunityVersionLikes({});
      }
    } catch (err: any) {
      const message = err instanceof Error ? err.message : 'Não foi possível carregar agora.';
      setCommunityVersionsError(message);
      setCommunityVersions([]);
      setCommunityVersionLikes({});
    } finally {
      setCommunityVersionsLoading(false);
    }
  }, [song.id]);

  const toggleCommunityVersionLike = useCallback(
    async (versionId: string) => {
      const user = await ensureLoggedIn();
      if (!user) return;

      const id = String(versionId);
      const liked = Boolean(communityVersionLikes[id]);

      try {
        if (liked) {
          const { error } = await supabase
            .from('song_public_version_likes')
            .delete()
            .eq('version_id', id)
            .eq('user_id', user.id);
          if (error) throw error;
          const next = { ...communityVersionLikes };
          delete next[id];
          setCommunityVersionLikes(next);
        } else {
          const { error } = await supabase.from('song_public_version_likes').insert({
            version_id: id,
            user_id: user.id
          } as any);
          if (error) throw error;
          setCommunityVersionLikes({ ...communityVersionLikes, [id]: true });
        }

        // Refresh counts (trigger updates the aggregate).
        void loadCommunityVersions();
      } catch {
        Alert.alert('Erro', 'Não foi possível curtir agora. Tente novamente.');
      }
    },
    [communityVersionLikes, ensureLoggedIn, loadCommunityVersions]
  );

  const publishCommunityVersion = useCallback(async () => {
    const user = await ensureLoggedIn();
    if (!user) return;

    Keyboard.dismiss();
    const text = String(personalDraftText ?? '').replace(/\s+$/u, '');
    if (!text.trim()) return Alert.alert('Texto', 'Sua versao nao pode ficar vazia.');

    const excerpt = text.trim().slice(0, 280);
    try {
      const record: any = {
        song_id: song.id,
        owner_user_id: user.id,
        title: null,
        text,
        excerpt,
        is_public: true,
        parent_version_id: forkParentVersionId || null
      };
      const { error } = await supabase.from('song_public_versions').insert(record);
      if (error) throw error;

      setForkParentVersionId(null);
      Alert.alert('Publicado', 'Sua versão agora está disponível como “versão da comunidade”.');
      setCommunityVersionsOpen(true);
      void loadCommunityVersions();
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : 'Não foi possível publicar agora.';
      Alert.alert('Erro', msg);
    }
  }, [ensureLoggedIn, forkParentVersionId, loadCommunityVersions, personalDraftText, song.id]);

  const applyCommunityVersion = useCallback(
    async (text: string) => {
      const user = await ensureLoggedIn();
      if (!user) return;

      const finalText = String(text ?? '').replace(/\s+$/u, '');
      if (!finalText.trim()) return;

      await savePersonalText(user.id, finalText, true);
      Alert.alert('Pronto', 'Essa versão foi salva como “minha versão” e está ativa.');
    },
    [ensureLoggedIn, savePersonalText]
  );

  const forkCommunityVersion = useCallback(
    async (version: any) => {
      const user = await ensureLoggedIn();
      if (!user) return;

      const id = String(version?.id ?? '').trim();
      const text = String(version?.text ?? '').replace(/\s+$/u, '');
      if (!id || !text.trim()) return;

      // Record fork event (best effort).
      try {
        await supabase.from('song_public_version_forks').insert({
          version_id: id,
          user_id: user.id
        } as any);
      } catch {
        // ignore
      }

      setForkParentVersionId(id);
      setPersonalDraftText(text);
      setPersonalDraftEnabled(true);
      setPersonalOpen(true);
      setCommunityVersionsOpen(false);
      Alert.alert('Fork iniciado', 'Edite e depois toque em “Publicar para comunidade” para criar sua versão.');
    },
    [ensureLoggedIn]
  );

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
    optionsTranslateY.stopAnimation();
    optionsBackdropOpacity.stopAnimation();
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
    optionsSeqRef.current += 1;
    const seq = optionsSeqRef.current;
    setOptionsInteractable(false);
    optionsTranslateY.stopAnimation();
    optionsBackdropOpacity.stopAnimation();
    let finalized = false;
    const finalize = () => {
      if (finalized) return;
      finalized = true;
      if (seq !== optionsSeqRef.current) return;
      setOptionsOpen(false);
      if (afterClose) requestAnimationFrame(afterClose);
    };
    const fallback = setTimeout(finalize, 260);
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
      clearTimeout(fallback);
      if (!finished) {
        finalize();
        return;
      }
      finalize();
    });
  };

  const openOptions = () => {
    optionsSeqRef.current += 1;
    const seq = optionsSeqRef.current;
    setOptionsInteractable(true);
    setOptionsOpen(true);
    requestAnimationFrame(() => {
      if (seq !== optionsSeqRef.current) return;
      animateOptionsIn();
    });
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
              <View style={styles.artistRow}>
                <Text style={styles.artist}>{artistName}</Text>
                {artistVerified ? (
                  <View style={styles.verifiedPill}>
                    <Ionicons name="checkmark-circle" size={14} color="#fff" />
                    <Text style={styles.verifiedPillText}>Verificado</Text>
                  </View>
                ) : null}
              </View>
            </View>

            <TouchableOpacity
              style={styles.videoThumb}
              onPress={() => {
                void shareSong();
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
                <Ionicons name="share-outline" size={16} color="#fff" />
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

          {videoLessonsLoading ? (
            <View style={styles.videoBanner}>
              <Text style={styles.videoBannerTitle}>Videoaulas</Text>
              <Text style={styles.videoBannerSub}>Carregando...</Text>
            </View>
          ) : videoLessons.length ? (
            <TouchableOpacity
              style={styles.videoBanner}
              onPress={() => {
                setVideoLessonsOpen(true);
              }}
              activeOpacity={0.9}
            >
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.videoBannerTitle}>Videoaulas</Text>
                <Text style={styles.videoBannerSub}>
                  {videoLessons.length} aula{videoLessons.length === 1 ? '' : 's'} aprovada{videoLessons.length === 1 ? '' : 's'}
                </Text>
              </View>
              <View style={styles.videoBannerThumb}>
                <Image
                  source={{
                    uri: (() => {
                      const first = videoLessons[0];
                      const id = extractYoutubeId(String(first?.youtube_url ?? ''));
                      return id
                        ? `https://img.youtube.com/vi/${id}/hqdefault.jpg`
                        : 'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?auto=format&fit=crop&w=360&q=80';
                    })()
                  }}
                  style={styles.videoBannerThumbImg}
                />
                <View style={styles.videoBannerThumbOverlay} />
                <Ionicons name="play" size={16} color="#fff" />
              </View>
            </TouchableOpacity>
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
                  onLongPress={() => {
                    const guess: 'letra' | 'cifra' = chordOnly ? 'cifra' : 'letra';
                    void openSuggestionForLine(index, guess);
                  }}
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
                    <View style={styles.creditChips}>
                      {composers.map((name) => (
                        <TouchableOpacity
                          key={`composer-${name}`}
                          style={styles.creditChip}
                          onPress={() => void openContributorProfile(name, 'composer')}
                          activeOpacity={0.9}
                        >
                          <Text style={styles.creditChipText}>{name}</Text>
                          <Ionicons name="chevron-forward" size={14} color={colors.muted} />
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                ) : null}
                {reviewers.length ? (
                  <View style={{ gap: 6 }}>
                    <Text style={styles.creditLabel}>Colaboração e revisão</Text>
                    <View style={styles.creditChips}>
                      {sortedReviewers.map((name) => {
                        const c = reviewerCounts[name];
                        const suffix = typeof c === 'number' && c > 0 ? ` · ${c}` : '';
                        return (
                          <TouchableOpacity
                            key={`reviewer-${name}`}
                            style={styles.creditChip}
                            onPress={() => void openContributorProfile(name, 'reviewer')}
                            activeOpacity={0.9}
                          >
                            <Text style={styles.creditChipText} numberOfLines={1}>
                              {name}
                              <Text style={styles.creditChipMeta}>{suffix}</Text>
                            </Text>
                            <Ionicons name="chevron-forward" size={14} color={colors.muted} />
                          </TouchableOpacity>
                        );
                      })}
                    </View>
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

          <View style={styles.actionCard}>
            <Text style={styles.actionCardTitle}>Sugestões da comunidade</Text>
            <Text style={styles.actionCardText}>
              Outras pessoas já enviaram correções. Vote em “confere” ou “não confere” para priorizar a revisão.
            </Text>
            <TouchableOpacity
              style={styles.actionCardButtonSecondary}
              onPress={() => {
                setCommunitySugOpen(true);
                void loadCommunitySuggestions();
              }}
              activeOpacity={0.9}
            >
              <Text style={styles.actionCardButtonTextSecondary}>Ver e votar</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.actionCard}>
            <Text style={styles.actionCardTitle}>Versões da comunidade</Text>
            <Text style={styles.actionCardText}>
              Pessoas publicaram versões alternativas desta cifra. Você pode curtir, salvar nos seus, ou forkar e publicar uma nova.
            </Text>
            <TouchableOpacity
              style={styles.actionCardButtonSecondary}
              onPress={() => {
                setCommunityVersionsOpen(true);
                void loadCommunityVersions();
              }}
              activeOpacity={0.9}
            >
              <Text style={styles.actionCardButtonTextSecondary}>Ver versões</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.actionCard}>
            <Text style={styles.actionCardTitle}>Histórico e comparação</Text>
            <Text style={styles.actionCardText}>
              Toda mudança aprovada vira uma versão. Compare o que mudou antes de editar para evitar guerra de edição.
            </Text>
            <TouchableOpacity
              style={styles.actionCardButtonSecondary}
              onPress={() => {
                setHistoryOpen(true);
                void loadSongHistory();
              }}
              activeOpacity={0.9}
            >
              <Text style={styles.actionCardButtonTextSecondary}>Ver histórico</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.actionCard}>
            <Text style={styles.actionCardTitle}>Tags da comunidade</Text>
            <Text style={styles.actionCardText}>
              Ajude a rotular esta música: dificuldade, vibe, ritmo, andamento, instrumentos e capo sugerido.
            </Text>
            <TouchableOpacity
              style={styles.actionCardButtonSecondary}
              onPress={() => {
                setTagsOpen(true);
                void loadSongTags();
              }}
              activeOpacity={0.9}
            >
              <Text style={styles.actionCardButtonTextSecondary}>Ver e votar</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.actionCard}>
            <Text style={styles.actionCardTitle}>Dicas de execução</Text>
            <Text style={styles.actionCardText}>
              Dicas curtas para tocar melhor: entrada, levada, transição, ou “macetes”. As dicas passam por moderação.
            </Text>

            <TouchableOpacity
              style={styles.actionCardButtonSecondary}
              onPress={() => {
                setExecutionTipsOpen(true);
                void loadExecutionTips();
              }}
              activeOpacity={0.9}
            >
              <Text style={styles.actionCardButtonTextSecondary}>Ver dicas</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionCardButton}
              onPress={() => void openExecutionTipSubmit()}
              activeOpacity={0.9}
            >
              <Text style={styles.actionCardButtonText}>Enviar dica</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.actionCard}>
            <Text style={styles.actionCardTitle}>Videoaulas (YouTube)</Text>
            <Text style={styles.actionCardText}>
              Envie uma videoaula tocando ou ensinando essa música. As aprovadas aparecem aqui para a comunidade.
            </Text>

            {videoLessons.length ? (
              <TouchableOpacity
                style={styles.actionCardButtonSecondary}
                onPress={() => setVideoLessonsOpen(true)}
                activeOpacity={0.9}
              >
                <Text style={styles.actionCardButtonTextSecondary}>Ver videoaulas</Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              style={styles.actionCardButton}
              onPress={() => void openVideoLessonSubmit()}
              activeOpacity={0.9}
            >
              <Text style={styles.actionCardButtonText}>Enviar videoaula</Text>
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
                activeOpacity={1}
              >
                <Text style={styles.aiChipText}>Manual</Text>
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
          onPress={openSuggestion}
        >
          <Ionicons name="create-outline" size={20} color={colors.text} />
          <Text style={styles.floatingLabel}>Sugerir</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.floatingItem} onPress={openOptions}>
          <Ionicons name="options-outline" size={20} color={colors.text} />
          <Text style={styles.floatingLabel}>Opções</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={optionsOpen} transparent animationType="none" onRequestClose={closeOptions}>
        <View style={styles.modalRoot}>
          <Animated.View style={[styles.modalBackdrop, { opacity: optionsBackdropOpacity }]} />
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={closeOptions}
            pointerEvents={optionsInteractable ? 'auto' : 'none'}
          />
          <Animated.View
            style={[
              styles.optionsSheet,
              {
                paddingBottom: insets.bottom + 16,
                height: optionsSheetHeight,
                transform: [{ translateY: optionsTranslateY }]
              }
            ]}
            pointerEvents={optionsInteractable ? 'auto' : 'none'}
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
                  {INSTRUMENTS.filter((label) => SUPPORTED_INSTRUMENTS.has(label)).map((label) => {
                    const selected = instrument === label;
                    return (
                      <TouchableOpacity
                        key={label}
                        style={styles.panelRow}
                        onPress={() => {
                          setInstrument(label);
                          setInstrumentOpen(false);
                        }}
                        activeOpacity={0.85}
                      >
                        <Text style={styles.panelRowText}>{label}</Text>
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

                    <TouchableOpacity style={styles.personalChip} onPress={() => void publishCommunityVersion()} activeOpacity={0.9}>
                      <Ionicons name="earth-outline" size={16} color={colors.text} />
                      <Text style={styles.personalChipText}>Publicar</Text>
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

      <Modal
        visible={communityVersionsOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCommunityVersionsOpen(false)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setCommunityVersionsOpen(false)}>
          <Pressable
            style={styles.panelModal}
            onPress={(event) => {
              event.stopPropagation();
            }}
          >
            <View style={styles.communityHeader}>
              <Text style={styles.panelTitle}>Versões da comunidade</Text>
              <TouchableOpacity style={styles.contextRemove} onPress={() => setCommunityVersionsOpen(false)} activeOpacity={0.85}>
                <Ionicons name="close" size={18} color={colors.muted} />
              </TouchableOpacity>
            </View>

            {communityVersionsError ? (
              <View style={styles.contextBox}>
                <Text style={styles.contextTitle}>Não foi possível carregar</Text>
                <Text style={styles.contextHint}>{communityVersionsError}</Text>
              </View>
            ) : null}

            {communityVersionsLoading ? (
              <Text style={styles.formHint}>Carregando...</Text>
            ) : communityVersions.length ? (
              <ScrollView style={{ maxHeight: 420 }}>
                {communityVersions.map((v: any, idx: number) => {
                  const id = String(v.id);
                  const liked = Boolean(communityVersionLikes[id]);
                  const likes = Number(v.like_count ?? 0);
                  const forks = Number(v.fork_count ?? 0);
                  const label = v.title ? String(v.title) : `Versão ${idx + 1}`;
                  return (
                    <View key={id} style={styles.communityRow}>
                      <View style={styles.communityTop}>
                        <Text style={styles.communityKind}>{label}</Text>
                        <Text style={styles.communityCounts}>Curtidas: {likes} · Forks: {forks}</Text>
                      </View>
                      <Text style={styles.communityExcerpt}>{String(v.excerpt ?? '').trim()}</Text>
                      <View style={styles.communityActions}>
                        <TouchableOpacity
                          style={[styles.voteButton, liked ? styles.voteButtonActiveYes : null]}
                          onPress={() => void toggleCommunityVersionLike(id)}
                          activeOpacity={0.9}
                        >
                          <Text style={styles.voteText}>{liked ? 'Curtido' : 'Curtir'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.voteButton}
                          onPress={() => void applyCommunityVersion(String(v.text ?? ''))}
                          activeOpacity={0.9}
                        >
                          <Text style={styles.voteText}>Salvar nos meus</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.voteButton}
                          onPress={() => void forkCommunityVersion(v)}
                          activeOpacity={0.9}
                        >
                          <Text style={styles.voteText}>Forkar</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            ) : (
              <Text style={styles.formHint}>Ainda não há versões publicadas para esta música.</Text>
            )}

            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => void loadCommunityVersions()}
              activeOpacity={0.9}
              disabled={communityVersionsLoading}
            >
              <Text style={styles.primaryButtonText}>Atualizar</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={historyOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setHistoryOpen(false)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setHistoryOpen(false)}>
          <Pressable
            style={styles.panelModal}
            onPress={(event) => {
              event.stopPropagation();
            }}
          >
            <View style={styles.communityHeader}>
              <Text style={styles.panelTitle}>Histórico de versões</Text>
              <TouchableOpacity style={styles.contextRemove} onPress={() => setHistoryOpen(false)} activeOpacity={0.85}>
                <Ionicons name="close" size={18} color={colors.muted} />
              </TouchableOpacity>
            </View>

            {historyError ? (
              <View style={styles.contextBox}>
                <Text style={styles.contextTitle}>Não foi possível carregar</Text>
                <Text style={styles.contextHint}>{historyError}</Text>
              </View>
            ) : null}

            {historyLoading ? (
              <Text style={styles.formHint}>Carregando...</Text>
            ) : historyItems.length ? (
              <ScrollView style={{ maxHeight: 420 }}>
                {historyItems.map((row: any) => {
                  const vno = Number(row.version_no ?? 0);
                  const src = row.source ? String(row.source) : '';
                  return (
                    <View key={String(row.id)} style={styles.communityRow}>
                      <View style={styles.communityTop}>
                        <Text style={styles.communityKind}>v{vno}</Text>
                        <Text style={styles.communityCounts}>{src ? src : 'versão'}</Text>
                      </View>
                      <View style={styles.communityActions}>
                        <TouchableOpacity
                          style={styles.voteButton}
                          onPress={() => void openHistoryDiff(vno)}
                          activeOpacity={0.9}
                        >
                          <Text style={styles.voteText}>Comparar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.voteButton}
                          onPress={() => void applySongVersionToMine(vno)}
                          activeOpacity={0.9}
                        >
                          <Text style={styles.voteText}>Salvar nos meus</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            ) : (
              <Text style={styles.formHint}>Sem histórico ainda.</Text>
            )}

            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => void loadSongHistory()}
              activeOpacity={0.9}
              disabled={historyLoading}
            >
              <Text style={styles.primaryButtonText}>Atualizar</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={historyDiffOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setHistoryDiffOpen(false)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setHistoryDiffOpen(false)}>
          <Pressable
            style={styles.panelModal}
            onPress={(event) => {
              event.stopPropagation();
            }}
          >
            <View style={styles.communityHeader}>
              <Text style={styles.panelTitle}>Diff {historyDiffTitle}</Text>
              <TouchableOpacity style={styles.contextRemove} onPress={() => setHistoryDiffOpen(false)} activeOpacity={0.85}>
                <Ionicons name="close" size={18} color={colors.muted} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 520 }}>
              {historyDiffOps.map((op: any, idx: number) => {
                const kind = op.op;
                const line = String(op.text ?? '');
                const prefix = kind === 'ins' ? '+ ' : kind === 'del' ? '- ' : '  ';
                const style =
                  kind === 'ins' ? styles.diffIns : kind === 'del' ? styles.diffDel : styles.diffEq;
                return (
                  <Text key={`d-${idx}`} style={[styles.diffLine, style]}>{prefix}{line || ' '}</Text>
                );
              })}
            </ScrollView>

            <TouchableOpacity style={styles.closeButton} onPress={() => setHistoryDiffOpen(false)} activeOpacity={0.9}>
              <Text style={styles.closeButtonText}>Fechar</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={tagsOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setTagsOpen(false)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setTagsOpen(false)}>
          <Pressable
            style={styles.panelModal}
            onPress={(event) => {
              event.stopPropagation();
            }}
          >
            <View style={styles.communityHeader}>
              <Text style={styles.panelTitle}>Tags da comunidade</Text>
              <TouchableOpacity style={styles.contextRemove} onPress={() => setTagsOpen(false)} activeOpacity={0.85}>
                <Ionicons name="close" size={18} color={colors.muted} />
              </TouchableOpacity>
            </View>

            {tagsError ? (
              <View style={styles.contextBox}>
                <Text style={styles.contextTitle}>Não foi possível carregar</Text>
                <Text style={styles.contextHint}>{tagsError}</Text>
              </View>
            ) : null}

            <ScrollView style={{ maxHeight: 520 }} showsVerticalScrollIndicator={false}>
              {tagsLoading ? <Text style={styles.formHint}>Carregando...</Text> : null}

              {(
                [
                  { key: 'difficulty', title: 'Dificuldade', mode: 'single' as const, options: TAG_OPTIONS.difficulty },
                  { key: 'vibe', title: 'Vibe', mode: 'single' as const, options: TAG_OPTIONS.vibe },
                  { key: 'rhythm', title: 'Ritmo', mode: 'single' as const, options: TAG_OPTIONS.rhythm },
                  { key: 'bpm', title: 'Andamento (BPM)', mode: 'single' as const, options: TAG_OPTIONS.bpm },
                  { key: 'capo', title: 'Capo sugerido', mode: 'single' as const, options: TAG_OPTIONS.capo },
                  { key: 'instrument', title: 'Instrumentos', mode: 'multi' as const, options: TAG_OPTIONS.instrument }
                ] as const
              ).map((section) => {
                const top = tagCounts[section.key] ?? [];
                const mine = myTagVotes[section.key] ?? new Set();
                return (
                  <View key={section.key} style={{ marginTop: 12 }}>
                    <Text style={styles.creditLabel}>{section.title}</Text>
                    {top.length ? (
                      <Text style={styles.formHint}>
                        Mais votados: {top.map((t) => `${t.value} (${t.votes})`).join(' · ')}
                      </Text>
                    ) : (
                      <Text style={styles.formHint}>Sem votos ainda.</Text>
                    )}
                    <View style={styles.tagChipRow}>
                      {section.options.map((opt) => {
                        const selected = mine.has(opt.value);
                        return (
                          <TouchableOpacity
                            key={`${section.key}-${opt.value}`}
                            style={[styles.tagChip, selected ? styles.tagChipActive : null]}
                            onPress={() => {
                              if (section.mode === 'multi') void toggleMultiTagVote(section.key, opt.value);
                              else void setSingleTagVote(section.key, opt.value);
                            }}
                            activeOpacity={0.9}
                          >
                            <Text style={selected ? styles.tagChipTextActive : styles.tagChipText}>
                              {opt.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                );
              })}

              <View style={{ height: 6 }} />
            </ScrollView>

            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => void loadSongTags()}
              activeOpacity={0.9}
              disabled={tagsLoading}
            >
              <Text style={styles.primaryButtonText}>Atualizar</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={executionTipsOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setExecutionTipsOpen(false)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setExecutionTipsOpen(false)}>
          <Pressable
            style={styles.panelModal}
            onPress={(event) => {
              event.stopPropagation();
            }}
          >
            <View style={styles.communityHeader}>
              <Text style={styles.panelTitle}>Dicas de execução</Text>
              <TouchableOpacity style={styles.contextRemove} onPress={() => setExecutionTipsOpen(false)} activeOpacity={0.85}>
                <Ionicons name="close" size={18} color={colors.muted} />
              </TouchableOpacity>
            </View>

            <View style={styles.segRow}>
              {([
                { key: 'approved' as const, label: 'Aprovadas' },
                { key: 'queue' as const, label: 'Em votação' }
              ] as const).map((tab) => {
                const active = executionTipsTab === tab.key;
                return (
                  <TouchableOpacity
                    key={tab.key}
                    style={[styles.segButton, active ? styles.segButtonActive : null]}
                    onPress={() => setExecutionTipsTab(tab.key)}
                    activeOpacity={0.9}
                  >
                    <Text style={active ? styles.segTextActive : styles.segText}>{tab.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {executionTipsError ? (
              <View style={styles.contextBox}>
                <Text style={styles.contextTitle}>Não foi possível carregar</Text>
                <Text style={styles.contextHint}>{executionTipsError}</Text>
              </View>
            ) : null}

            {executionTipsLoading ? <Text style={styles.formHint}>Carregando...</Text> : null}

            <ScrollView style={{ maxHeight: 520 }} showsVerticalScrollIndicator={false}>
              {executionTipsTab === 'approved' ? (
                executionTipsApproved.length ? (
                  executionTipsApproved.map((row: any) => {
                    const id = String(row.tip_id);
                    const kind = String(row.kind ?? 'geral');
                    const text = String(row.text ?? '');
                    const up = Number(row.upvotes ?? 0);
                    const down = Number(row.downvotes ?? 0);
                    const myVote = Number(executionTipVotes[id] ?? 0);
                    return (
                      <View key={`tip-ok-${id}`} style={styles.communityRow}>
                        <View style={styles.communityTop}>
                          <View style={styles.tipKindPill}>
                            <Text style={styles.tipKindText}>{kind}</Text>
                          </View>
                          <Text style={styles.communityCounts}>{up} útil · {down} não útil</Text>
                        </View>
                        <Text style={styles.communityExcerpt}>{text}</Text>
                        <View style={styles.communityActions}>
                          <TouchableOpacity
                            style={[styles.voteButton, myVote === 1 ? styles.voteButtonActiveYes : null]}
                            onPress={() => void toggleExecutionTipVote(id, 1)}
                            activeOpacity={0.9}
                          >
                            <Text style={styles.voteText}>Útil</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.voteButton, myVote === -1 ? styles.voteButtonActiveNo : null]}
                            onPress={() => void toggleExecutionTipVote(id, -1)}
                            activeOpacity={0.9}
                          >
                            <Text style={styles.voteText}>Não útil</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })
                ) : (
                  <Text style={styles.formHint}>Sem dicas aprovadas ainda.</Text>
                )
              ) : executionTipsQueue.length ? (
                executionTipsQueue.map((row: any) => {
                  const id = String(row.tip_id);
                  const kind = String(row.kind ?? 'geral');
                  const text = String(row.excerpt ?? '');
                  const up = Number(row.upvotes ?? 0);
                  const down = Number(row.downvotes ?? 0);
                  const myVote = Number(executionTipVotes[id] ?? 0);
                  return (
                    <View key={`tip-q-${id}`} style={styles.communityRow}>
                      <View style={styles.communityTop}>
                        <View style={styles.tipKindPill}>
                          <Text style={styles.tipKindText}>{kind}</Text>
                        </View>
                        <Text style={styles.communityCounts}>{up} útil · {down} não útil</Text>
                      </View>
                      <Text style={styles.communityExcerpt}>{text}</Text>
                      <View style={styles.communityActions}>
                        <TouchableOpacity
                          style={[styles.voteButton, myVote === 1 ? styles.voteButtonActiveYes : null]}
                          onPress={() => void toggleExecutionTipVote(id, 1)}
                          activeOpacity={0.9}
                        >
                          <Text style={styles.voteText}>Útil</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.voteButton, myVote === -1 ? styles.voteButtonActiveNo : null]}
                          onPress={() => void toggleExecutionTipVote(id, -1)}
                          activeOpacity={0.9}
                        >
                          <Text style={styles.voteText}>Não útil</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })
              ) : (
                <Text style={styles.formHint}>
                  Sem dicas na fila. Entre e envie uma dica curta para ajudar.
                </Text>
              )}

              <View style={{ height: 6 }} />
            </ScrollView>

            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => void loadExecutionTips()}
              activeOpacity={0.9}
              disabled={executionTipsLoading}
            >
              <Text style={styles.primaryButtonText}>Atualizar</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={executionTipSubmitOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setExecutionTipSubmitOpen(false)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setExecutionTipSubmitOpen(false)}>
          <Pressable
            style={styles.panelModal}
            onPress={(event) => {
              event.stopPropagation();
            }}
          >
            <Text style={styles.panelTitle}>Enviar dica</Text>
            <View style={styles.formCard}>
              <Text style={styles.formHint}>
                Dica curta e objetiva. Ex.: “entra só voz no 1º compasso”, “levada pop 4/4”, “transição no pré pro refrão”.
              </Text>

              <View style={styles.tagChipRow}>
                {([
                  { key: 'geral' as const, label: 'Geral' },
                  { key: 'entrada' as const, label: 'Entrada' },
                  { key: 'levada' as const, label: 'Levada' },
                  { key: 'transicao' as const, label: 'Transição' }
                ] as const).map((opt) => {
                  const selected = executionTipKind === opt.key;
                  return (
                    <TouchableOpacity
                      key={opt.key}
                      style={[styles.tagChip, selected ? styles.tagChipActive : null]}
                      onPress={() => setExecutionTipKind(opt.key)}
                      activeOpacity={0.9}
                    >
                      <Text style={selected ? styles.tagChipTextActive : styles.tagChipText}>{opt.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TextInput
                style={[styles.formInput, styles.formArea]}
                placeholder="Digite sua dica..."
                placeholderTextColor={colors.muted}
                value={executionTipText}
                onChangeText={setExecutionTipText}
                multiline
                maxLength={400}
              />
              <Text style={styles.formHint}>{String(executionTipText ?? '').length}/400</Text>
            </View>

            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => void submitExecutionTip()}
              activeOpacity={0.9}
              disabled={executionTipSubmitting}
            >
              <Text style={styles.primaryButtonText}>{executionTipSubmitting ? 'Enviando...' : 'Enviar'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.closeButton} onPress={() => setExecutionTipSubmitOpen(false)} activeOpacity={0.9}>
              <Text style={styles.closeButtonText}>Fechar</Text>
            </TouchableOpacity>
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

              {suggestContext ? (
                <View style={styles.contextBox}>
                  <View style={styles.contextHeader}>
                    <Text style={styles.contextTitle}>
                      Trecho selecionado{typeof suggestContextLine === 'number' ? ` (linha ${suggestContextLine + 1})` : ''}
                    </Text>
                    <TouchableOpacity
                      style={styles.contextRemove}
                      onPress={() => {
                        setSuggestContext(null);
                        setSuggestContextLine(null);
                      }}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="close" size={16} color={colors.muted} />
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.contextText}>{suggestContext}</Text>
                  <Text style={styles.contextHint}>Dica: segure o dedo em outra linha para trocar o trecho.</Text>
                </View>
              ) : null}

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
                placeholder={suggestContext ? 'O que você mudaria nesse trecho?' : 'Descreva sua sugestão'}
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

      <Modal
        visible={communitySugOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCommunitySugOpen(false)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setCommunitySugOpen(false)}>
          <Pressable
            style={styles.panelModal}
            onPress={(event) => {
              event.stopPropagation();
            }}
          >
            <View style={styles.communityHeader}>
              <Text style={styles.panelTitle}>Sugestões da comunidade</Text>
              <TouchableOpacity style={styles.contextRemove} onPress={() => setCommunitySugOpen(false)} activeOpacity={0.85}>
                <Ionicons name="close" size={18} color={colors.muted} />
              </TouchableOpacity>
            </View>

            {communitySugError ? (
              <View style={styles.contextBox}>
                <Text style={styles.contextTitle}>Não foi possível carregar</Text>
                <Text style={styles.contextHint}>{communitySugError}</Text>
              </View>
            ) : null}

            {communitySugLoading ? (
              <Text style={styles.formHint}>Carregando...</Text>
            ) : communitySugItems.length ? (
              <ScrollView style={{ maxHeight: 420 }}>
                {communitySugItems.map((item: any) => {
                  const id = String(item.suggestion_id);
                  const myVote = Number(communitySugVotes[id] ?? 0);
                  const up = Number(item.upvotes ?? 0);
                  const down = Number(item.downvotes ?? 0);
                  const kindLabel = item.kind === 'cifra' ? 'Cifra' : 'Letra';

                  return (
                    <View key={id} style={styles.communityRow}>
                      <View style={styles.communityTop}>
                        <Text style={styles.communityKind}>{kindLabel}</Text>
                        <Text style={styles.communityCounts}>Confere: {up} · Não confere: {down}</Text>
                      </View>
                      <Text style={styles.communityExcerpt}>{String(item.excerpt ?? '').trim()}</Text>
                      <View style={styles.communityActions}>
                        <TouchableOpacity
                          style={[styles.voteButton, myVote === 1 ? styles.voteButtonActiveYes : null]}
                          onPress={() => void toggleCommunityVote(id, 1)}
                          activeOpacity={0.9}
                        >
                          <Text style={styles.voteText}>Confere</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.voteButton, myVote === -1 ? styles.voteButtonActiveNo : null]}
                          onPress={() => void toggleCommunityVote(id, -1)}
                          activeOpacity={0.9}
                        >
                          <Text style={styles.voteText}>Não confere</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            ) : (
              <Text style={styles.formHint}>Sem sugestões pendentes para esta música.</Text>
            )}

            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => void loadCommunitySuggestions()}
              activeOpacity={0.9}
              disabled={communitySugLoading}
            >
              <Text style={styles.primaryButtonText}>Atualizar</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={videoLessonsOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setVideoLessonsOpen(false)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setVideoLessonsOpen(false)}>
          <Pressable
            style={styles.panelModal}
            onPress={(event) => {
              event.stopPropagation();
            }}
          >
            <View style={styles.communityHeader}>
              <Text style={styles.panelTitle}>Videoaulas</Text>
              <TouchableOpacity
                style={styles.contextRemove}
                onPress={() => setVideoLessonsOpen(false)}
                activeOpacity={0.85}
              >
                <Ionicons name="close" size={18} color={colors.muted} />
              </TouchableOpacity>
            </View>

            {videoLessonsError ? (
              <View style={styles.contextBox}>
                <Text style={styles.contextTitle}>Não foi possível carregar</Text>
                <Text style={styles.contextHint}>{videoLessonsError}</Text>
              </View>
            ) : null}

            {videoLessonsLoading ? (
              <Text style={styles.formHint}>Carregando...</Text>
            ) : videoLessons.length ? (
              <ScrollView style={{ maxHeight: 420 }}>
                {videoLessons.map((item: any) => {
                  const url = String(item.youtube_url ?? '').trim();
                  const id = extractYoutubeId(url);
                  const thumb = id
                    ? `https://img.youtube.com/vi/${id}/hqdefault.jpg`
                    : 'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?auto=format&fit=crop&w=360&q=80';

                  return (
                    <TouchableOpacity
                      key={String(item.request_id)}
                      style={styles.videoRow}
                      onPress={() => void openYoutube(url)}
                      activeOpacity={0.9}
                    >
                      <View style={styles.videoRowThumb}>
                        <Image source={{ uri: thumb }} style={styles.videoRowThumbImg} />
                        <View style={styles.videoRowThumbOverlay} />
                        <Ionicons name="play" size={14} color="#fff" />
                      </View>
                      <View style={{ flex: 1, gap: 4 }}>
                        <Text style={styles.videoRowTitle}>Abrir no YouTube</Text>
                        <Text style={styles.videoRowSub} numberOfLines={1}>
                          {url}
                        </Text>
                      </View>
                      <Ionicons name="open-outline" size={18} color={colors.muted} />
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            ) : (
              <Text style={styles.formHint}>Ainda não há videoaulas aprovadas para esta música.</Text>
            )}

            <TouchableOpacity style={styles.primaryButton} onPress={() => void loadVideoLessons()} activeOpacity={0.9}>
              <Text style={styles.primaryButtonText}>Atualizar</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionCardButtonSecondary}
              onPress={() => {
                setVideoLessonsOpen(false);
                void openVideoLessonSubmit();
              }}
              activeOpacity={0.9}
            >
              <Text style={styles.actionCardButtonTextSecondary}>Enviar videoaula</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={videoLessonSubmitOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setVideoLessonSubmitOpen(false)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setVideoLessonSubmitOpen(false)}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
            style={{ width: '100%' }}
          >
            <Pressable
              style={[
                styles.panelModal,
                {
                  maxHeight: Math.round(windowHeight * 0.9),
                  paddingBottom: Math.max(insets.bottom, 12)
                }
              ]}
              onPress={(event) => {
                event.stopPropagation();
              }}
            >
              <Text style={styles.panelTitle}>Enviar videoaula</Text>
              <View style={styles.formCard}>
                <Text style={styles.formHint}>
                  Envie um link do YouTube ensinando ou tocando essa música. Depois da aprovação, ele aparece na lista.
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
                  value={videoLessonUrl}
                  onChangeText={setVideoLessonUrl}
                  autoCapitalize="none"
                  autoCorrect={false}
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

              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() => void submitVideoLesson()}
                activeOpacity={0.9}
                disabled={videoLessonSubmitting}
              >
                <Text style={styles.primaryButtonText}>{videoLessonSubmitting ? 'Enviando...' : 'Enviar'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.closeButton} onPress={() => setVideoLessonSubmitOpen(false)}>
                <Text style={styles.closeButtonText}>Fechar</Text>
              </TouchableOpacity>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      <Modal
        visible={contribProfileOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setContribProfileOpen(false)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setContribProfileOpen(false)}>
          <Pressable
            style={styles.panelModal}
            onPress={(event) => {
              event.stopPropagation();
            }}
          >
            <View style={styles.communityHeader}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.panelTitle}>{contribProfileName || 'Perfil'}</Text>
                <Text style={styles.formHint}>
                  {contribProfileRole === 'reviewer' ? 'Colaboração e revisão' : 'Composição'}
                  {typeof contribProfileCount === 'number' ? ` · ${contribProfileCount} música${contribProfileCount === 1 ? '' : 's'}` : ''}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.contextRemove}
                onPress={() => setContribProfileOpen(false)}
                activeOpacity={0.85}
              >
                <Ionicons name="close" size={18} color={colors.muted} />
              </TouchableOpacity>
            </View>

            {contribProfileError ? (
              <View style={styles.contextBox}>
                <Text style={styles.contextTitle}>Não foi possível carregar</Text>
                <Text style={styles.contextHint}>{contribProfileError}</Text>
              </View>
            ) : null}

            {contribProfileLoading ? (
              <Text style={styles.formHint}>Carregando...</Text>
            ) : contribProfileSongs.length ? (
              <ScrollView style={{ maxHeight: 420 }}>
                {contribProfileSongs.map((s: any) => (
                  <View key={String(s.id)} style={styles.contribRow}>
                    <Text style={styles.contribSongTitle}>{String(s.title ?? '')}</Text>
                    <Text style={styles.contribSongArtist}>{String(s.artists?.name ?? 'Artista')}</Text>
                  </View>
                ))}
              </ScrollView>
            ) : (
              <Text style={styles.formHint}>Sem resultados para mostrar.</Text>
            )}

            {contribProfileName && contribProfileRole ? (
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() => void openContributorProfile(contribProfileName, contribProfileRole)}
                activeOpacity={0.9}
                disabled={contribProfileLoading}
              >
                <Text style={styles.primaryButtonText}>Atualizar</Text>
              </TouchableOpacity>
            ) : null}
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
          <Pressable
            style={styles.keyModal}
            onPress={(event) => {
              event.stopPropagation();
            }}
          >
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
  artistRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  verifiedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: '#141414'
  },
  verifiedPillText: { color: '#fff', fontWeight: '900', fontSize: 12 },

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

  videoBanner: {
    marginTop: 14,
    borderRadius: 18,
    padding: 14,
    backgroundColor: '#141414',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  videoBannerTitle: { fontWeight: '900', color: '#fff', fontSize: 16 },
  videoBannerSub: { fontWeight: '800', color: 'rgba(255,255,255,0.82)', fontSize: 12 },
  videoBannerThumb: {
    width: 84,
    height: 52,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center'
  },
  videoBannerThumbImg: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  videoBannerThumbOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.28)' },

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
  creditChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  creditChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#fff',
    paddingVertical: 8,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: '100%'
  },
  creditChipText: { fontWeight: '900', color: colors.text, maxWidth: 260 },
  creditChipMeta: { fontWeight: '900', color: colors.muted },

  contribRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee'
  },
  contribSongTitle: { fontWeight: '900', color: colors.text },
  contribSongArtist: { fontWeight: '800', color: colors.muted, marginTop: 2, fontSize: 12 },

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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee'
  },
  videoRowThumb: {
    width: 72,
    height: 44,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#eaeaea',
    alignItems: 'center',
    justifyContent: 'center'
  },
  videoRowThumbImg: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  videoRowThumbOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.22)' },
  videoRowTitle: { fontWeight: '900', color: colors.text },
  videoRowSub: { fontWeight: '800', color: colors.muted, fontSize: 12 },

  diffLine: { fontFamily: MONO_FONT, fontSize: 12, lineHeight: 18, paddingVertical: 2 },
  diffEq: { color: colors.text },
  diffIns: { color: '#0b7a32' },
  diffDel: { color: '#b42318' },

  tagChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  tagChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card
  },
  tagChipActive: { backgroundColor: colors.text, borderColor: colors.text },
  tagChipText: { fontWeight: '900', color: colors.text, fontSize: 12 },
  tagChipTextActive: { fontWeight: '900', color: '#fff', fontSize: 12 },

  segRow: {
    flexDirection: 'row',
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden'
  },
  segButton: { flex: 1, paddingVertical: 10, alignItems: 'center', backgroundColor: colors.card },
  segButtonActive: { backgroundColor: colors.text },
  segText: { fontWeight: '900', color: colors.text, fontSize: 12 },
  segTextActive: { fontWeight: '900', color: '#fff', fontSize: 12 },

  tipKindPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: '#f2f2f2',
    borderWidth: 1,
    borderColor: colors.border
  },
  tipKindText: { fontWeight: '900', color: colors.text, fontSize: 12 },

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
  contextBox: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    padding: 12,
    gap: 8
  },
  contextHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  contextTitle: { color: colors.text, fontWeight: '900' },
  contextRemove: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center'
  },
  contextText: { color: colors.text, fontWeight: '700', lineHeight: 18 },
  contextHint: { color: colors.muted, fontWeight: '700', fontSize: 12 },
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

  communityHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  communityRow: {
    marginTop: 10,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: 12,
    gap: 10
  },
  communityTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  communityKind: { color: colors.text, fontWeight: '900' },
  communityCounts: { color: colors.muted, fontWeight: '800', fontSize: 12 },
  communityExcerpt: { color: colors.text, fontWeight: '700', lineHeight: 18 },
  communityActions: { flexDirection: 'row', gap: 10 },
  voteButton: {
    flex: 1,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background
  },
  voteButtonActiveYes: { backgroundColor: '#ecfdf3', borderColor: '#34d399' },
  voteButtonActiveNo: { backgroundColor: '#fef2f2', borderColor: '#fb7185' },
  voteText: { color: colors.text, fontWeight: '900' },

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
