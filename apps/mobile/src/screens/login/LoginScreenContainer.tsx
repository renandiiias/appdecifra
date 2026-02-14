import { useEffect, useMemo, useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  Alert,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../lib/supabase';
import { colors, radii, shadows } from '../../lib/theme';
import { fetchArtists, fetchSongs } from '../../lib/api';
import Constants from 'expo-constants';
import { SUPPORT_EMAIL } from './constants';
import type { ChurchProfile, SetlistMember, SetlistSong, WorshipSetlist } from './types';
import { useLoginSession } from './hooks/useLoginSession';
import {
  loadChurchProfile,
  loadWorshipSetlists,
  removeChurchProfile,
  saveChurchProfile,
  saveWorshipSetlists
} from './services/storage';

function makeId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

type ContributionKind =
  | 'song_suggestion'
  | 'song_claim'
  | 'artist_claim'
  | 'video_lesson'
  | 'song_request'
  | 'feedback'
  | 'bug';

type ContributionItem = {
  id: string;
  kind: ContributionKind;
  title: string;
  subtitle?: string | null;
  status?: string | null;
  createdAt: string;
};

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { userEmail, setUserEmail, userId, setUserId, displayName, setDisplayName, isArtist, setIsArtist } =
    useLoginSession();
  const [signUpArtist, setSignUpArtist] = useState(false);
  const [claimOpen, setClaimOpen] = useState(false);
  const [claimLoading, setClaimLoading] = useState(false);
  const [claimQuery, setClaimQuery] = useState('');
  const [claimArtists, setClaimArtists] = useState<any[]>([]);
  const [claimSelected, setClaimSelected] = useState<any | null>(null);
  const [claimName, setClaimName] = useState('');
  const [claimWhatsapp, setClaimWhatsapp] = useState('');
  const [claimInstagram, setClaimInstagram] = useState('');
  const [claimMessage, setClaimMessage] = useState('');
  const [myArtistClaims, setMyArtistClaims] = useState<any[]>([]);
  const [songClaimOpen, setSongClaimOpen] = useState(false);
  const [songClaimLoading, setSongClaimLoading] = useState(false);
  const [songClaimQuery, setSongClaimQuery] = useState('');
  const [songClaimSongs, setSongClaimSongs] = useState<any[]>([]);
  const [songClaimSelected, setSongClaimSelected] = useState<any | null>(null);
  const [songClaimMessage, setSongClaimMessage] = useState('');
  const [songClaimExtra, setSongClaimExtra] = useState('');
  const [mySongClaims, setMySongClaims] = useState<any[]>([]);

  // Minhas contribuições (comunidade)
  const [contribOpen, setContribOpen] = useState(false);
  const [contribLoading, setContribLoading] = useState(false);
  const [contribError, setContribError] = useState<string | null>(null);
  const [contribItems, setContribItems] = useState<ContributionItem[]>([]);
  const [repScore, setRepScore] = useState<number | null>(null);

  // Pedidos de música (fila pública)
  const [songRequestOpen, setSongRequestOpen] = useState(false);
  const [songRequestTitle, setSongRequestTitle] = useState('');
  const [songRequestArtist, setSongRequestArtist] = useState('');
  const [songRequestLink, setSongRequestLink] = useState('');
  const [songRequestMessage, setSongRequestMessage] = useState('');
  const [songRequestSubmitting, setSongRequestSubmitting] = useState(false);

  const [songRequestsOpen, setSongRequestsOpen] = useState(false);
  const [songRequestsLoading, setSongRequestsLoading] = useState(false);
  const [songRequestsError, setSongRequestsError] = useState<string | null>(null);
  const [songRequests, setSongRequests] = useState<any[]>([]);
  const [songRequestVotes, setSongRequestVotes] = useState<Record<string, boolean>>({});
  const [songRequestsFilter, setSongRequestsFilter] = useState<'hot' | 'recent' | 'reviewing' | 'added'>('hot');

  // Igreja + grupo de louvor (MVP: armazenamento local; migrar para Supabase depois via migrations).
  const [churchOpen, setChurchOpen] = useState(false);
  const [churchProfile, setChurchProfile] = useState<ChurchProfile | null>(null);
  const [churchName, setChurchName] = useState('');
  const [churchInstagram, setChurchInstagram] = useState('');
  const [churchAddress, setChurchAddress] = useState('');
  const [churchWhatsapp, setChurchWhatsapp] = useState('');

  const [groupOpen, setGroupOpen] = useState(false);
  const [setlists, setSetlists] = useState<WorshipSetlist[]>([]);
  const [setlistEditorOpen, setSetlistEditorOpen] = useState(false);
  const [setlistDraftId, setSetlistDraftId] = useState<string | null>(null);
  const [setlistTitle, setSetlistTitle] = useState('');
  const [setlistScheduledAt, setSetlistScheduledAt] = useState('');
  const [setlistSongs, setSetlistSongs] = useState<SetlistSong[]>([]);
  const [setlistTeam, setSetlistTeam] = useState<SetlistMember[]>([]);
  const [songQuery, setSongQuery] = useState('');
  const [songResults, setSongResults] = useState<any[]>([]);
  const [songLoading, setSongLoading] = useState(false);
  const [memberName, setMemberName] = useState('');
  const [memberInstrument, setMemberInstrument] = useState('Voz');
  const tabBarHeight = useBottomTabBarHeight();

  const reputationLabel = useMemo(() => {
    const score = typeof repScore === 'number' ? repScore : null;
    if (score === null) return null;
    if (score <= -10) return { title: 'Restrito', hint: 'Suas contribuições podem aparecer menos para a comunidade.' };
    if (score < 10) return { title: 'Novo', hint: 'Comece contribuindo com correções e dicas curtas.' };
    if (score < 40) return { title: 'Contribuidor', hint: 'Boas contribuições ganham mais prioridade.' };
    if (score < 100) return { title: 'Confiável', hint: 'Algumas dicas podem ser aprovadas automaticamente.' };
    return { title: 'Referência', hint: 'Você ajuda a manter a base muito mais rápida.' };
  }, [repScore]);

  const [setlistShareOpen, setSetlistShareOpen] = useState(false);
  const [setlistShareLoading, setSetlistShareLoading] = useState(false);
  const [setlistShareError, setSetlistShareError] = useState<string | null>(null);
  const [setlistShareId, setSetlistShareId] = useState<string | null>(null);
  const [setlistShareUrl, setSetlistShareUrl] = useState<string | null>(null);

  const [setlistImportOpen, setSetlistImportOpen] = useState(false);
  const [setlistImportText, setSetlistImportText] = useState('');
  const [setlistImportLoading, setSetlistImportLoading] = useState(false);

  // Modelos (templates) da comunidade: publicar/remixar.
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<any[]>([]);

  const [templatePublishOpen, setTemplatePublishOpen] = useState(false);
  const [templatePublishFrom, setTemplatePublishFrom] = useState<WorshipSetlist | null>(null);
  const [templateTitle, setTemplateTitle] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [templateTags, setTemplateTags] = useState('');
  const [templateIncludeTeam, setTemplateIncludeTeam] = useState(true);
  const [templatePublishing, setTemplatePublishing] = useState(false);

  useEffect(() => {
    if (userEmail) {
      loadMyArtistClaims();
      loadMySongClaims();
    }
  }, [userEmail]);

  useEffect(() => {
    if (!contribOpen) return;
    loadMyContributions();
  }, [contribOpen]);

  useEffect(() => {
    if (!songRequestsOpen) return;
    loadSongRequests();
  }, [songRequestsOpen, songRequestsFilter]);

  useEffect(() => {
    if (!userId) {
      setRepScore(null);
      return;
    }

    let mounted = true;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('user_reputation')
          .select('score')
          .eq('user_id', userId)
          .maybeSingle();
        if (!mounted) return;
        if (error) {
          // Migration not applied yet: hide reputation.
          setRepScore(null);
          return;
        }
        const raw = (data as any)?.score;
        const value = typeof raw === 'number' ? raw : Number(raw ?? 0);
        setRepScore(Number.isFinite(value) ? value : 0);
      } catch {
        if (mounted) setRepScore(null);
      }
    })().catch(() => {});

    return () => {
      mounted = false;
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setChurchProfile(null);
      setSetlists([]);
      return;
    }

    let mounted = true;
    (async () => {
      try {
        const rawChurch = await loadChurchProfile(userId);
        if (!mounted) return;
        if (rawChurch) setChurchProfile(rawChurch);
        else setChurchProfile(null);
      } catch {
        if (mounted) setChurchProfile(null);
      }

      try {
        const rawSetlists = await loadWorshipSetlists(userId);
        if (!mounted) return;
        if (rawSetlists) setSetlists(rawSetlists);
        else setSetlists([]);
      } catch {
        if (mounted) setSetlists([]);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [userId]);

  useEffect(() => {
    if (!songClaimOpen) return;
    const q = songClaimQuery.trim();
    const timer = setTimeout(() => {
      searchSongsForClaim(q);
    }, 220);
    return () => clearTimeout(timer);
  }, [songClaimOpen, songClaimQuery]);

  useEffect(() => {
    if (!setlistEditorOpen) return;
    const q = songQuery.trim();
    if (!q) {
      setSongResults([]);
      return;
    }
    const timer = setTimeout(() => {
      (async () => {
        setSongLoading(true);
        try {
          const data = await fetchSongs(q);
          setSongResults((data ?? []).slice(0, 20));
        } catch {
          setSongResults([]);
        } finally {
          setSongLoading(false);
        }
      })();
    }, 220);
    return () => clearTimeout(timer);
  }, [setlistEditorOpen, songQuery]);

  const signIn = async () => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) Alert.alert('Erro', error.message);
    else setUserEmail(email);
  };

  const signUp = async () => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { is_artist: Boolean(signUpArtist) } }
    });
    if (error) Alert.alert('Erro', error.message);
    else Alert.alert('Conta criada', 'Verifique seu email para confirmar.');
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUserEmail(null);
    setUserId(null);
  };

  const openChurch = async () => {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user ?? null;
    if (!user) {
      Alert.alert('Entre para continuar', 'Faça login primeiro.');
      return;
    }

    setChurchName(churchProfile?.name ?? '');
    setChurchInstagram(churchProfile?.instagram ?? '');
    setChurchAddress(churchProfile?.address ?? '');
    setChurchWhatsapp(churchProfile?.whatsapp ?? '');
    setChurchOpen(true);
  };

  const saveChurch = async () => {
    if (!userId) return;
    const name = churchName.trim();
    if (!name) return Alert.alert('Igreja', 'Digite o nome da sua igreja.');

    const record: ChurchProfile = {
      name,
      instagram: churchInstagram.trim() || null,
      address: churchAddress.trim() || null,
      whatsapp: churchWhatsapp.trim() || null,
      updatedAt: new Date().toISOString()
    };

    try {
      await saveChurchProfile(userId, record);
      setChurchProfile(record);
      setChurchOpen(false);
      Keyboard.dismiss();
    } catch {
      Alert.alert('Erro', 'Não foi possível salvar agora.');
    }
  };

  const removeChurch = async () => {
    if (!userId) return;
    try {
      await removeChurchProfile(userId);
      setChurchProfile(null);
      setChurchOpen(false);
      Keyboard.dismiss();
    } catch {
      Alert.alert('Erro', 'Não foi possível remover agora.');
    }
  };

  const openGroup = async () => {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user ?? null;
    if (!user) {
      Alert.alert('Entre para continuar', 'Faça login primeiro.');
      return;
    }
    setGroupOpen(true);
  };

  const persistSetlists = async (next: WorshipSetlist[]) => {
    if (!userId) return;
    await saveWorshipSetlists(userId, next);
  };

  const openNewSetlist = () => {
    setSetlistDraftId(null);
    setSetlistTitle('');
    setSetlistScheduledAt('');
    setSetlistSongs([]);
    setSetlistTeam([]);
    setSongQuery('');
    setSongResults([]);
    setSongLoading(false);
    setMemberName('');
    setMemberInstrument('Voz');
    setSetlistEditorOpen(true);
  };

  const openEditSetlist = (id: string) => {
    const existing = setlists.find((s) => s.id === id);
    if (!existing) return;
    setSetlistDraftId(existing.id);
    setSetlistTitle(existing.title);
    setSetlistScheduledAt(existing.scheduledAt);
    setSetlistSongs(existing.songs ?? []);
    setSetlistTeam(existing.team ?? []);
    setSongQuery('');
    setSongResults([]);
    setSongLoading(false);
    setMemberName('');
    setMemberInstrument('Voz');
    setSetlistEditorOpen(true);
  };

  const addSongToSetlist = (song: any) => {
    if (!song?.id) return;
    const entry: SetlistSong = {
      id: String(song.id),
      title: String(song.title ?? 'Música'),
      artist: song?.artists?.name ?? null
    };
    setSetlistSongs((prev) => {
      if (prev.some((s) => s.id === entry.id)) return prev;
      return [...prev, entry];
    });
  };

  const moveSong = (id: string, dir: -1 | 1) => {
    setSetlistSongs((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      if (idx < 0) return prev;
      const nextIdx = idx + dir;
      if (nextIdx < 0 || nextIdx >= prev.length) return prev;
      const copy = [...prev];
      const [it] = copy.splice(idx, 1);
      copy.splice(nextIdx, 0, it);
      return copy;
    });
  };

  const removeSongFromSetlist = (id: string) => {
    setSetlistSongs((prev) => prev.filter((s) => s.id !== id));
  };

  const addMember = () => {
    const name = memberName.trim();
    if (!name) return;
    setSetlistTeam((prev) => [...prev, { name, instrument: memberInstrument }]);
    setMemberName('');
    setMemberInstrument('Voz');
  };

  const removeMember = (idx: number) => {
    setSetlistTeam((prev) => prev.filter((_, i) => i !== idx));
  };

  const saveSetlist = async () => {
    if (!userId) return;
    const title = setlistTitle.trim() || 'Culto';
    const scheduledAt = setlistScheduledAt.trim() || 'Data a definir';
    const now = new Date().toISOString();

    const record: WorshipSetlist = {
      id: setlistDraftId ?? makeId('setlist'),
      title,
      scheduledAt,
      songs: setlistSongs,
      team: setlistTeam,
      createdAt: now
    };

    const next = (() => {
      const copy = [...setlists];
      const idx = copy.findIndex((s) => s.id === record.id);
      if (idx >= 0) copy[idx] = record;
      else copy.unshift(record);
      return copy;
    })();

    try {
      await persistSetlists(next);
      setSetlists(next);
      setSetlistEditorOpen(false);
      Keyboard.dismiss();
    } catch {
      Alert.alert('Erro', 'Não foi possível salvar agora.');
    }
  };

  const deleteSetlist = async (id: string) => {
    if (!userId) return;
    const next = setlists.filter((s) => s.id !== id);
    await persistSetlists(next);
    setSetlists(next);
  };

  const shareSetlist = async (sl: WorshipSetlist) => {
    const buildWebSetlistUrl = (sharedId: string) => {
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
      return baseUrl ? `${baseUrl}/escala/${sharedId}` : null;
    };

    setSetlistShareError(null);
    setSetlistShareLoading(true);
    setSetlistShareOpen(true);
    setSetlistShareId(null);
    setSetlistShareUrl(null);

    // Try to create a shareable link in Supabase. If migrations aren't applied yet, fall back to text share.
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user ?? null;
      if (!user) throw new Error('not_authenticated');

      const payload = {
        songs: sl.songs ?? [],
        team: sl.team ?? []
      };

      const { data, error } = await supabase
        .from('shared_setlists')
        .insert({
          owner_user_id: user.id,
          title: sl.title,
          scheduled_at: sl.scheduledAt,
          church_name: churchProfile?.name ?? null,
          payload,
          is_public: true
        } as any)
        .select('id')
        .single();

      if (error) throw error;

      const sharedId = String((data as any)?.id ?? '').trim();
      const url = sharedId ? buildWebSetlistUrl(sharedId) : null;

      setSetlistShareId(sharedId || null);
      setSetlistShareUrl(url);
      setSetlistShareError(null);
      setSetlistShareLoading(false);
      return;
    } catch (err: any) {
      const msg = String(err?.message ?? err ?? '');
      const looksLikeMissingTable =
        /relation .*shared_setlists|schema cache|PGRST/iu.test(msg) || /does not exist/iu.test(msg);

      if (!looksLikeMissingTable) {
        setSetlistShareError('Não foi possível gerar link agora. Você ainda pode compartilhar por mensagem.');
      } else {
        setSetlistShareError('Atualize o banco (migrations) para gerar link/QR. Por enquanto, compartilhe por mensagem.');
      }

      // Fall back to text share immediately.
      const lines: string[] = [];
      lines.push(`Escala: ${sl.title}`);
      lines.push(`Quando: ${sl.scheduledAt}`);
      if (churchProfile?.name) lines.push(`Igreja: ${churchProfile.name}`);
      lines.push('');
      lines.push('Repertório:');
      if (!sl.songs.length) lines.push('- (vazio)');
      for (let i = 0; i < sl.songs.length; i += 1) {
        const s = sl.songs[i]!;
        lines.push(`${i + 1}. ${s.title}${s.artist ? ` — ${s.artist}` : ''}`);
      }
      lines.push('');
      lines.push('Equipe:');
      if (!sl.team.length) lines.push('- (vazio)');
      for (const m of sl.team) lines.push(`- ${m.name} (${m.instrument})`);

      setSetlistShareLoading(false);
      await Share.share({ message: lines.join('\n') });
    }
  };

  const extractUuid = (raw: string) => {
    const text = String(raw ?? '').trim();
    const m = text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/iu);
    return m ? m[0] : null;
  };

  const importSetlist = async () => {
    if (!userId) return Alert.alert('Entre para continuar', 'Faça login para importar escalas.');
    const sharedId = extractUuid(setlistImportText);
    if (!sharedId) return Alert.alert('Link inválido', 'Cole um link/ID válido de escala.');

    if (setlistImportLoading) return;
    setSetlistImportLoading(true);
    try {
      const { data, error } = await supabase
        .from('shared_setlists')
        .select('id,title,scheduled_at,church_name,payload,created_at')
        .eq('id', sharedId)
        .single();
      if (error) throw error;

      const payload = (data as any)?.payload ?? {};
      const songs = Array.isArray(payload?.songs) ? payload.songs : [];
      const team = Array.isArray(payload?.team) ? payload.team : [];

      // Avoid duplicates by sharedId.
      const exists = setlists.some((s) => String((s as any).sharedId ?? '') === sharedId);
      if (exists) {
        setSetlistImportOpen(false);
        setSetlistImportText('');
        Alert.alert('Já importada', 'Você já importou essa escala.');
        return;
      }

      const record: WorshipSetlist = {
        id: makeId('setlist_import'),
        sharedId,
        title: String((data as any)?.title ?? 'Escala'),
        scheduledAt: String((data as any)?.scheduled_at ?? 'Data a definir'),
        songs: songs
          .map((s: any) => ({
            id: String(s?.id ?? ''),
            title: String(s?.title ?? ''),
            artist: s?.artist ?? null
          }))
          .filter((s: any) => s.id && s.title),
        team: team
          .map((m: any) => ({ name: String(m?.name ?? ''), instrument: String(m?.instrument ?? '') }))
          .filter((m: any) => m.name && m.instrument),
        createdAt: new Date().toISOString()
      };

      const next = [record, ...setlists].slice(0, 80);
      await persistSetlists(next);
      setSetlists(next);

      setSetlistImportOpen(false);
      setSetlistImportText('');
      Alert.alert('Importado', 'A escala foi adicionada em “Escalas recentes”.');
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : 'Não foi possível importar agora.';
      Alert.alert('Erro', msg);
    } finally {
      setSetlistImportLoading(false);
    }
  };

  const loadTemplates = async () => {
    setTemplatesError(null);
    setTemplatesLoading(true);
    try {
      const { data, error } = await supabase
        .from('setlist_templates')
        .select('id,kind,title,description,tags,remix_count,created_at,payload')
        .eq('kind', 'setlist')
        .eq('is_public', true)
        .order('remix_count', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(40);
      if (error) throw error;
      setTemplates(data ?? []);
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : 'Não foi possível carregar os modelos agora.';
      setTemplatesError(msg);
      setTemplates([]);
    } finally {
      setTemplatesLoading(false);
    }
  };

  const openTemplates = async () => {
    setTemplatesOpen(true);
    await loadTemplates();
  };

  const openPublishTemplate = (sl: WorshipSetlist) => {
    setTemplatePublishFrom(sl);
    setTemplateTitle(sl.title || 'Modelo');
    setTemplateDescription('');
    setTemplateTags('ceia, vigilia, culto jovem');
    setTemplateIncludeTeam(true);
    setTemplatePublishOpen(true);
  };

  const publishTemplate = async () => {
    if (!userId) return Alert.alert('Entre para continuar', 'Faça login para publicar modelos.');
    const base = templatePublishFrom;
    if (!base) return;
    if (templatePublishing) return;

    const title = templateTitle.trim();
    const description = templateDescription.trim();
    const tags = templateTags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 12);

    if (!title) return Alert.alert('Título', 'Dê um nome para o modelo.');
    if (!base.songs?.length) return Alert.alert('Repertório', 'Adicione pelo menos 1 música antes de publicar.');

    setTemplatePublishing(true);
    try {
      const payload = {
        songs: base.songs ?? [],
        team: templateIncludeTeam ? (base.team ?? []) : []
      };

      const { error } = await supabase.from('setlist_templates').insert({
        owner_user_id: userId,
        kind: 'setlist',
        title,
        description: description || null,
        tags: tags.length ? tags : null,
        payload,
        is_public: true
      } as any);
      if (error) throw error;

      setTemplatePublishOpen(false);
      setTemplatePublishFrom(null);
      Alert.alert('Publicado', 'Seu modelo já está disponível para a comunidade.');
      void loadTemplates();
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : 'Não foi possível publicar agora.';
      Alert.alert('Erro', msg);
    } finally {
      setTemplatePublishing(false);
    }
  };

  const remixTemplate = async (tpl: any, sourceLabel?: string) => {
    if (!userId) return Alert.alert('Entre para continuar', 'Faça login para remixar modelos.');

    const payload = tpl?.payload ?? {};
    const songs = Array.isArray(payload?.songs) ? payload.songs : [];
    const team = Array.isArray(payload?.team) ? payload.team : [];
    const title = String(tpl?.title ?? sourceLabel ?? 'Modelo').trim() || 'Modelo';

    const record: WorshipSetlist = {
      id: makeId('setlist'),
      title,
      scheduledAt: 'Data a definir',
      songs: songs
        .map((s: any) => ({ id: String(s?.id ?? ''), title: String(s?.title ?? ''), artist: s?.artist ?? null }))
        .filter((s: any) => s.id && s.title),
      team: team
        .map((m: any) => ({ name: String(m?.name ?? ''), instrument: String(m?.instrument ?? '') }))
        .filter((m: any) => m.name && m.instrument),
      createdAt: new Date().toISOString()
    };

    try {
      const next = [record, ...setlists].slice(0, 80);
      await persistSetlists(next);
      setSetlists(next);
      setTemplatesOpen(false);

      // Best effort: record remix (if migrations applied).
      try {
        if (tpl?.id) {
          await (supabase as any).rpc('record_setlist_template_remix', { p_template_id: tpl.id });
        }
      } catch {
        // ignore
      }

      openEditSetlist(record.id);
    } catch {
      Alert.alert('Erro', 'Não foi possível remixar agora.');
    }
  };

  const loadMyArtistClaims = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user ?? null;
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('artist_claim_requests')
        .select('id,status,created_at,artists(name)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5);
      if (error) throw error;
      setMyArtistClaims(data ?? []);
      return;
    } catch {
      // Table may not exist yet (migrations not applied). Fallback to user_metadata.
    }

    try {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      const meta = data.user?.user_metadata ?? {};
      const list = Array.isArray((meta as any).artist_claim_requests) ? (meta as any).artist_claim_requests : [];
      setMyArtistClaims(list.slice(-5).reverse());
    } catch {
      setMyArtistClaims([]);
    }
  };

  const loadMySongClaims = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user ?? null;
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('song_claim_requests')
        .select('id,status,created_at,song_title,artist')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5);
      if (error) throw error;
      setMySongClaims(data ?? []);
      return;
    } catch {
      // Table may not exist yet. Fallback to user_metadata.
    }

    try {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      const meta = data.user?.user_metadata ?? {};
      const list = Array.isArray((meta as any).song_claim_requests) ? (meta as any).song_claim_requests : [];
      setMySongClaims(list.slice(-5).reverse());
    } catch {
      setMySongClaims([]);
    }
  };

  const toggleArtistMode = async () => {
    const next = !isArtist;
    setIsArtist(next);
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      const meta = data.user?.user_metadata ?? {};
      const { error: updateErr } = await supabase.auth.updateUser({ data: { ...meta, is_artist: next } });
      if (updateErr) throw updateErr;
    } catch (err: any) {
      setIsArtist(!next);
      Alert.alert('Erro', err?.message ?? 'Não foi possível atualizar agora.');
    }
  };

  const openArtistClaim = async () => {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user ?? null;
    if (!user) {
      Alert.alert('Entre para continuar', 'Faça login primeiro.');
      return;
    }

    setClaimSelected(null);
    setClaimQuery('');
    setClaimMessage('');
    setClaimWhatsapp('');
    setClaimInstagram('');

    const suggestedName =
      typeof user.user_metadata?.name === 'string'
        ? user.user_metadata.name
        : typeof user.user_metadata?.full_name === 'string'
          ? user.user_metadata.full_name
          : '';
    setClaimName(suggestedName || '');

    setClaimOpen(true);
    setClaimLoading(true);
    try {
      const list = await fetchArtists();
      setClaimArtists(list);
    } catch {
      setClaimArtists([]);
    } finally {
      setClaimLoading(false);
    }
  };

  const openSongClaim = async () => {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user ?? null;
    if (!user) {
      Alert.alert('Entre para continuar', 'Faça login primeiro.');
      return;
    }

    setSongClaimSelected(null);
    setSongClaimQuery('');
    setSongClaimMessage('');
    setSongClaimExtra('');
    setSongClaimSongs([]);
    setSongClaimOpen(true);
  };

  const searchSongsForClaim = async (q: string) => {
    const term = q.trim();
    if (!term) {
      setSongClaimSongs([]);
      return;
    }

    setSongClaimLoading(true);
    try {
      const data = await fetchSongs(term);
      setSongClaimSongs((data ?? []).slice(0, 20));
    } catch {
      setSongClaimSongs([]);
    } finally {
      setSongClaimLoading(false);
    }
  };

  const submitSongClaim = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user ?? null;
    if (!user) return Alert.alert('Entre para continuar', 'Faça login primeiro.');
    if (!songClaimSelected) return Alert.alert('Música', 'Selecione uma música para reivindicar.');

    const name = claimName.trim();
    if (!name) return Alert.alert('Seu nome', 'Digite seu nome.');
    const message = songClaimMessage.trim();
    if (!message) return Alert.alert('Mensagem', 'Explique sua reivindicação.');

    const record = {
      song_id: songClaimSelected.id,
      song_title: songClaimSelected.title,
      artist: songClaimSelected.artists?.name ?? 'Artista',
      user_id: user.id,
      name,
      email: (user.email || '').trim(),
      whatsapp: claimWhatsapp.trim() || null,
      instagram: claimInstagram.trim() || null,
      message,
      extra: songClaimExtra.trim() || null,
      status: 'pending',
      created_at: new Date().toISOString()
    };

    try {
      const { error } = await supabase.from('song_claim_requests').insert(record as any);
      if (!error) {
        Alert.alert('Enviado', 'Recebemos sua solicitação. Vamos analisar em breve.');
        setSongClaimOpen(false);
        loadMySongClaims();
        return;
      }
    } catch {
      // ignore
    }

    try {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      const meta = data.user?.user_metadata ?? {};
      const list = Array.isArray((meta as any).song_claim_requests) ? (meta as any).song_claim_requests : [];
      const next = [...list, record].slice(-25);
      const { error: updateErr } = await supabase.auth.updateUser({ data: { ...meta, song_claim_requests: next } });
      if (updateErr) throw updateErr;
      Alert.alert('Enviado', 'Recebemos sua solicitação. Vamos analisar em breve.');
      setSongClaimOpen(false);
      loadMySongClaims();
    } catch {
      Alert.alert('Erro', 'Não foi possível enviar agora. Tente novamente em instantes.');
    }
  };

  const submitArtistClaim = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user ?? null;
    if (!user) return Alert.alert('Entre para continuar', 'Faça login primeiro.');

    if (!claimSelected) return Alert.alert('Artista', 'Selecione o artista/ministério que você quer reivindicar.');
    const name = claimName.trim();
    if (!name) return Alert.alert('Seu nome', 'Digite seu nome.');
    const message = claimMessage.trim();
    if (!message) return Alert.alert('Mensagem', 'Explique sua reivindicação (ex: você é o artista ou representante).');

    const record = {
      artist_id: claimSelected.id,
      user_id: user.id,
      name,
      email: (user.email || '').trim(),
      whatsapp: claimWhatsapp.trim() || null,
      instagram: claimInstagram.trim() || null,
      message,
      status: 'pending',
      created_at: new Date().toISOString()
    };

    // Prefer the table if it exists. Fallback to user metadata while migrations aren't applied.
    try {
      const { error } = await supabase.from('artist_claim_requests').insert(record as any);
      if (!error) {
        Alert.alert('Enviado', 'Recebemos sua solicitação. Vamos analisar em breve.');
        setClaimOpen(false);
        loadMyArtistClaims();
        return;
      }
    } catch {
      // ignore
    }

    try {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      const meta = data.user?.user_metadata ?? {};
      const list = Array.isArray((meta as any).artist_claim_requests) ? (meta as any).artist_claim_requests : [];
      const next = [
        ...list,
        { ...record, artist_name: claimSelected.name }
      ].slice(-25);
      const { error: updateErr } = await supabase.auth.updateUser({ data: { ...meta, artist_claim_requests: next } });
      if (updateErr) throw updateErr;
      Alert.alert('Enviado', 'Recebemos sua solicitação. Vamos analisar em breve.');
      setClaimOpen(false);
      loadMyArtistClaims();
    } catch {
      Alert.alert('Erro', 'Não foi possível enviar agora. Tente novamente em instantes.');
    }
  };

  const openSupportEmail = async (subject: string, body: string) => {
    const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) return Linking.openURL(url);
    return Share.share({ message: `${subject}\n\n${body}` });
  };

  const LOCAL_CONTRIB_KEY = userId ? `cifra_crista:contributions_local:v1:${userId}` : null;

  const loadLocalContributions = async (): Promise<ContributionItem[]> => {
    if (!LOCAL_CONTRIB_KEY) return [];
    try {
      const raw = await AsyncStorage.getItem(LOCAL_CONTRIB_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? (parsed as ContributionItem[]) : [];
    } catch {
      return [];
    }
  };

  const trackLocalContribution = async (item: Omit<ContributionItem, 'id'>) => {
    if (!LOCAL_CONTRIB_KEY) return;
    try {
      const current = await loadLocalContributions();
      const next: ContributionItem[] = [{ ...item, id: makeId('local') }, ...current].slice(0, 60);
      await AsyncStorage.setItem(LOCAL_CONTRIB_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const openSupportEmailTracked = async (kind: ContributionKind, subject: string, body: string) => {
    await trackLocalContribution({
      kind,
      title: subject,
      subtitle: null,
      status: 'enviado',
      createdAt: new Date().toISOString()
    });
    return openSupportEmail(subject, body);
  };

  const statusLabelForSongRequest = (statusRaw?: string | null) => {
    const status = String(statusRaw ?? 'pending');
    if (status === 'added') return { label: 'Já temos', tone: 'added' as const };
    if (status === 'reviewing') return { label: 'Em revisão', tone: 'reviewing' as const };
    if (status === 'rejected') return { label: 'Rejeitado', tone: 'rejected' as const };
    return { label: 'Pedido', tone: 'pending' as const };
  };

  const loadSongRequests = async () => {
    setSongRequestsError(null);
    setSongRequestsLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user ?? null;
      if (!user) {
        setSongRequests([]);
        setSongRequestVotes({});
        setSongRequestsLoading(false);
        return;
      }

      let query = supabase.from('song_requests_queue').select('request_id,title,artist,status,upvotes,created_at');

      if (songRequestsFilter === 'reviewing') query = query.eq('status', 'reviewing');
      else if (songRequestsFilter === 'added') query = query.eq('status', 'added');
      else query = query.in('status', ['pending', 'reviewing', 'added']);

      if (songRequestsFilter === 'recent') query = query.order('created_at', { ascending: false });
      else query = query.order('upvotes', { ascending: false }).order('created_at', { ascending: false });

      const { data, error } = await query.limit(80);
      if (error) throw error;

      const rows = data ?? [];
      const ids = rows.map((r: any) => r.request_id).filter(Boolean);

      let votesMap: Record<string, boolean> = {};
      if (ids.length) {
        const { data: votes, error: votesErr } = await supabase
          .from('song_request_votes')
          .select('request_id')
          .eq('user_id', user.id)
          .in('request_id', ids);
        if (!votesErr) {
          votesMap = Object.fromEntries((votes ?? []).map((v: any) => [String(v.request_id), true]));
        }
      }

      setSongRequests(rows);
      setSongRequestVotes(votesMap);
    } catch (err: any) {
      const message = err instanceof Error ? err.message : 'Não foi possível carregar agora.';
      setSongRequestsError(message);
      setSongRequests([]);
      setSongRequestVotes({});
    } finally {
      setSongRequestsLoading(false);
    }
  };

  const toggleSongRequestUpvote = async (requestId: string) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user ?? null;
    if (!user) return Alert.alert('Entre para continuar', 'Faça login primeiro.');

    const id = String(requestId);
    const has = Boolean(songRequestVotes[id]);
    try {
      if (has) {
        const { error } = await supabase.from('song_request_votes').delete().eq('request_id', id).eq('user_id', user.id);
        if (error) throw error;
        const next = { ...songRequestVotes };
        delete next[id];
        setSongRequestVotes(next);
      } else {
        const { error } = await supabase.from('song_request_votes').insert({ request_id: id, user_id: user.id } as any);
        if (error) throw error;
        setSongRequestVotes({ ...songRequestVotes, [id]: true });
      }

      // Refresh counts (triggers update counts server-side).
      void loadSongRequests();
    } catch {
      Alert.alert('Erro', 'Não foi possível votar agora.');
    }
  };

  const submitSongRequest = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user ?? null;
    if (!user) return Alert.alert('Entre para continuar', 'Faça login primeiro.');

    const title = songRequestTitle.trim();
    const artist = songRequestArtist.trim();
    const referenceUrl = songRequestLink.trim() || null;
    const message = songRequestMessage.trim() || null;

    if (!title) return Alert.alert('Título', 'Digite o título da música.');
    if (!artist) return Alert.alert('Artista', 'Digite o artista/ministério.');

    setSongRequestSubmitting(true);
    try {
      const record = {
        user_id: user.id,
        title,
        artist,
        reference_url: referenceUrl,
        message,
        status: 'pending',
        created_at: new Date().toISOString()
      };

      const { error } = await supabase.from('song_requests').insert(record as any);
      if (!error) {
        Alert.alert('Enviado', 'Seu pedido entrou na fila da comunidade. Obrigado!');
        setSongRequestOpen(false);
        setSongRequestTitle('');
        setSongRequestArtist('');
        setSongRequestLink('');
        setSongRequestMessage('');
        loadMyContributions();
        loadSongRequests();
        return;
      }

      throw error;
    } catch {
      // Fallback: keep the current email-based flow if migrations are not applied yet.
      await openSupportEmailTracked(
        'song_request',
        'Sugestão de música - Cifra Cristã',
        `Qual música você quer ver aqui?\n\nTítulo: ${songRequestTitle.trim()}\nArtista/Ministério: ${songRequestArtist.trim()}\nLink de referência (opcional): ${songRequestLink.trim()}\n\nMensagem (opcional):\n${songRequestMessage.trim()}\n`
      );
    } finally {
      setSongRequestSubmitting(false);
    }
  };

  const formatStatus = (statusRaw?: string | null) => {
    const status = String(statusRaw ?? 'pending');
    if (status === 'approved') return { label: 'Aprovado', tone: 'approved' as const };
    if (status === 'rejected') return { label: 'Rejeitado', tone: 'rejected' as const };
    if (status === 'enviado') return { label: 'Enviado', tone: 'sent' as const };
    return { label: 'Pendente', tone: 'pending' as const };
  };

  const iconForKind = (kind: ContributionKind) => {
    switch (kind) {
      case 'song_suggestion':
        return 'create-outline';
      case 'song_claim':
        return 'ribbon-outline';
      case 'artist_claim':
        return 'person-outline';
      case 'video_lesson':
        return 'play-circle-outline';
      case 'song_request':
        return 'musical-note-outline';
      case 'feedback':
        return 'chatbubble-ellipses-outline';
      case 'bug':
        return 'bug-outline';
      default:
        return 'sparkles-outline';
    }
  };

  const loadMyContributions = async () => {
    setContribError(null);
    setContribLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user ?? null;
      if (!user) {
        setContribItems([]);
        setContribLoading(false);
        return;
      }

      const local = await loadLocalContributions();

      const results = await Promise.allSettled([
        supabase
          .from('song_suggestions')
          .select('id,status,created_at,song_title,artist,kind')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('song_claim_requests')
          .select('id,status,created_at,song_title,artist')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('artist_claim_requests')
          .select('id,status,created_at,artists(name)')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('song_video_lesson_requests')
          .select('id,status,created_at,song_title,artist,youtube_url')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50)
      ]);

      const suggestionsRes = results[0];
      const songClaimsRes = results[1];
      const artistClaimsRes = results[2];
      const videoLessonsRes = results[3];

      let suggestions: any[] = [];
      if (suggestionsRes.status === 'fulfilled' && !suggestionsRes.value.error) {
        suggestions = suggestionsRes.value.data ?? [];
      } else {
        // Fallback to user metadata when table isn't available yet.
        try {
          const { data, error } = await supabase.auth.getUser();
          if (error) throw error;
          const meta = data.user?.user_metadata ?? {};
          const list = Array.isArray((meta as any).song_suggestions) ? (meta as any).song_suggestions : [];
          suggestions = list;
        } catch {
          suggestions = [];
        }
      }

      let songClaims: any[] = [];
      if (songClaimsRes.status === 'fulfilled' && !songClaimsRes.value.error) {
        songClaims = songClaimsRes.value.data ?? [];
      } else {
        try {
          const { data, error } = await supabase.auth.getUser();
          if (error) throw error;
          const meta = data.user?.user_metadata ?? {};
          const list = Array.isArray((meta as any).song_claim_requests) ? (meta as any).song_claim_requests : [];
          songClaims = list;
        } catch {
          songClaims = [];
        }
      }

      let artistClaims: any[] = [];
      if (artistClaimsRes.status === 'fulfilled' && !artistClaimsRes.value.error) {
        artistClaims = artistClaimsRes.value.data ?? [];
      } else {
        try {
          const { data, error } = await supabase.auth.getUser();
          if (error) throw error;
          const meta = data.user?.user_metadata ?? {};
          const list = Array.isArray((meta as any).artist_claim_requests) ? (meta as any).artist_claim_requests : [];
          artistClaims = list;
        } catch {
          artistClaims = [];
        }
      }

      const videoLessons =
        videoLessonsRes.status === 'fulfilled' && !videoLessonsRes.value.error ? videoLessonsRes.value.data ?? [] : [];

      const mapped: ContributionItem[] = [];

      for (const row of suggestions) {
        const kind = String((row as any)?.kind ?? 'cifra');
        const label = kind === 'letra' ? 'Correção de letra' : 'Correção de cifra';
        mapped.push({
          id: String((row as any)?.id ?? makeId('sug')),
          kind: 'song_suggestion',
          title: `${label}: ${(row as any)?.song_title ?? 'Música'}`,
          subtitle: (row as any)?.artist ?? null,
          status: (row as any)?.status ?? 'pending',
          createdAt: String((row as any)?.created_at ?? new Date().toISOString())
        });
      }

      for (const row of songClaims) {
        mapped.push({
          id: String((row as any)?.id ?? makeId('claim')),
          kind: 'song_claim',
          title: `Reivindicação: ${(row as any)?.song_title ?? 'Música'}`,
          subtitle: (row as any)?.artist ?? null,
          status: (row as any)?.status ?? 'pending',
          createdAt: String((row as any)?.created_at ?? new Date().toISOString())
        });
      }

      for (const row of artistClaims) {
        const artistName = (row as any)?.artists?.name ?? (row as any)?.artist_name ?? 'Artista';
        mapped.push({
          id: String((row as any)?.id ?? makeId('aclaim')),
          kind: 'artist_claim',
          title: `Reivindicação de artista`,
          subtitle: artistName,
          status: (row as any)?.status ?? 'pending',
          createdAt: String((row as any)?.created_at ?? new Date().toISOString())
        });
      }

      for (const row of videoLessons) {
        mapped.push({
          id: String((row as any)?.id ?? makeId('video')),
          kind: 'video_lesson',
          title: `Videoaula: ${(row as any)?.song_title ?? 'Música'}`,
          subtitle: (row as any)?.artist ?? null,
          status: (row as any)?.status ?? 'pending',
          createdAt: String((row as any)?.created_at ?? new Date().toISOString())
        });
      }

      // Song requests (in-app queue). If table isn't created yet, these will be tracked locally via email fallback.
      try {
        const { data: reqs, error: reqErr } = await supabase
          .from('song_requests')
          .select('id,status,created_at,title,artist')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50);
        if (!reqErr) {
          for (const row of reqs ?? []) {
            mapped.push({
              id: String((row as any)?.id ?? makeId('req')),
              kind: 'song_request',
              title: `Pedido de música: ${(row as any)?.title ?? 'Música'}`,
              subtitle: (row as any)?.artist ?? null,
              status: (row as any)?.status ?? 'pending',
              createdAt: String((row as any)?.created_at ?? new Date().toISOString())
            });
          }
        }
      } catch {
        // ignore
      }

      const all = [...mapped, ...local].sort((a, b) => {
        const at = Date.parse(a.createdAt) || 0;
        const bt = Date.parse(b.createdAt) || 0;
        return bt - at;
      });

      setContribItems(all);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Não foi possível carregar agora.';
      setContribError(message);
      setContribItems([]);
    } finally {
      setContribLoading(false);
    }
  };

  const updateName = async () => {
    const name = displayName.trim();
    if (!name) return Alert.alert('Nome', 'Digite um nome para salvar.');
    const { error } = await supabase.auth.updateUser({ data: { name } });
    if (error) return Alert.alert('Erro', error.message);
    Alert.alert('Pronto', 'Nome atualizado.');
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: tabBarHeight + 24 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.pageHeader}>
          <Text style={styles.pageTitle}>Conta</Text>
        </View>

        {userEmail ? (
          <View style={{ gap: 14, paddingBottom: 24 }}>
            <View style={styles.profileCard}>
              <View style={styles.profileTopRow}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {(displayName.trim() || userEmail || '?').slice(0, 1).toUpperCase()}
                  </Text>
                </View>

                <View style={{ flex: 1, gap: 6 }}>
                  <TextInput
                    style={styles.profileNameInput}
                    placeholder="Seu nome"
                    placeholderTextColor={colors.muted}
                    value={displayName}
                    onChangeText={setDisplayName}
                  />
                  <Text style={styles.profileEmail}>{userEmail}</Text>
                </View>

                <TouchableOpacity style={styles.iconButton} onPress={signOut} activeOpacity={0.85}>
                  <Ionicons name="log-out-outline" size={18} color={colors.text} />
                </TouchableOpacity>
              </View>

              <View style={styles.profileButtonsRow}>
                <TouchableOpacity style={styles.pillPrimary} onPress={updateName} activeOpacity={0.9}>
                  <Ionicons name="checkmark" size={16} color="#fff" />
                  <Text style={styles.pillPrimaryText}>Salvar</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.pillSecondary} onPress={openChurch} activeOpacity={0.9}>
                  <Ionicons name="business-outline" size={16} color={colors.text} />
                  <Text style={styles.pillSecondaryText}>
                    {churchProfile?.name ? 'Minha igreja' : 'Cadastrar igreja'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.pillSecondary} onPress={openGroup} activeOpacity={0.9}>
                  <Ionicons name="people-outline" size={16} color={colors.text} />
                  <Text style={styles.pillSecondaryText}>Grupo de louvor</Text>
                </TouchableOpacity>
              </View>

              {churchProfile?.name ? (
                <View style={styles.profileHintRow}>
                  <Ionicons name="location-outline" size={14} color={colors.muted} />
                  <Text style={styles.profileHintText} numberOfLines={1}>
                    {churchProfile.name}
                    {churchProfile.instagram ? ` · @${churchProfile.instagram.replace(/^@/u, '')}` : ''}
                  </Text>
                </View>
              ) : (
                <View style={styles.profileHintRow}>
                  <Ionicons name="sparkles-outline" size={14} color={colors.muted} />
                  <Text style={styles.profileHintText}>
                    Cadastre sua igreja para montar escalas e compartilhar repertórios com o grupo.
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Perfil de artista</Text>
              <Text style={styles.subtitle}>
                Reivindique seu artista/ministério para vincular as músicas ao seu perfil.
              </Text>

              <View style={styles.toggleRow}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={styles.toggleTitle}>Sou artista</Text>
                  <Text style={styles.toggleHint}>
                    Verificação: em breve
                  </Text>
                </View>
                <Switch value={isArtist} onValueChange={toggleArtistMode} />
              </View>

              <TouchableOpacity style={styles.button} onPress={openArtistClaim}>
                <Text style={styles.buttonText}>Reivindicar artista/ministério</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.buttonSecondary}
                onPress={openSongClaim}
              >
                <Text style={styles.buttonTextSecondary}>Reivindicar música</Text>
              </TouchableOpacity>

              {myArtistClaims.length ? (
                <View style={{ marginTop: 14, gap: 8 }}>
                  <Text style={styles.subSectionTitle}>Minhas solicitações</Text>
                  {myArtistClaims.map((item: any) => {
                    const artistName = item?.artists?.name || item?.artist_name || 'Artista';
                    const status = String(item?.status || 'pending');
                    const statusLabel =
                      status === 'approved'
                        ? 'Aprovado'
                        : status === 'rejected'
                          ? 'Rejeitado'
                          : 'Pendente';
                    return (
                      <View key={String(item?.id || `${artistName}-${status}`)} style={styles.claimRow}>
                        <Text style={styles.claimTitle}>{artistName}</Text>
                        <Text style={styles.claimStatus}>{statusLabel}</Text>
                      </View>
                    );
                  })}
                </View>
              ) : null}

              {mySongClaims.length ? (
                <View style={{ marginTop: 10, gap: 8 }}>
                  <Text style={styles.subSectionTitle}>Minhas músicas reivindicadas</Text>
                  {mySongClaims.map((item: any) => {
                    const title = item?.song_title || 'Música';
                    const artist = item?.artist || '';
                    const status = String(item?.status || 'pending');
                    const statusLabel =
                      status === 'approved'
                        ? 'Aprovado'
                        : status === 'rejected'
                          ? 'Rejeitado'
                          : 'Pendente';
                    return (
                      <View key={String(item?.id || `${title}-${status}`)} style={styles.claimRow}>
                        <Text style={styles.claimTitle} numberOfLines={1}>
                          {title}{artist ? ` · ${artist}` : ''}
                        </Text>
                        <Text style={styles.claimStatus}>{statusLabel}</Text>
                      </View>
                    );
                  })}
                </View>
              ) : null}
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Feedback</Text>
              <TouchableOpacity
                style={styles.actionRow}
                onPress={() =>
                  openSupportEmailTracked(
                    'feedback',
                    'Feedback - Cifra Cristã (App)',
                    'Escreva aqui sua sugestão ou elogio.\\n\\nO que você estava tentando fazer?\\nO que aconteceu?'
                  )
                }
              >
                <View style={styles.actionLeft}>
                  <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.text} />
                  <Text style={styles.actionText}>Enviar feedback</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.muted} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionRow}
                onPress={() =>
                  openSupportEmailTracked(
                    'bug',
                    'Bug - Cifra Cristã (App)',
                    'Descreva o problema e, se possível, o passo a passo para reproduzir.\\n\\nModelo do celular:\\nVersão do iOS/Android:\\n'
                  )
                }
              >
                <View style={styles.actionLeft}>
                  <Ionicons name="bug-outline" size={18} color={colors.text} />
                  <Text style={styles.actionText}>Reportar problema</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.muted} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionRow}
                onPress={() => {
                  setSongRequestTitle('');
                  setSongRequestArtist('');
                  setSongRequestLink('');
                  setSongRequestMessage('');
                  setSongRequestOpen(true);
                }}
              >
                <View style={styles.actionLeft}>
                  <Ionicons name="musical-note-outline" size={18} color={colors.text} />
                  <Text style={styles.actionText}>Pedir música</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.muted} />
              </TouchableOpacity>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Comunidade</Text>
              <TouchableOpacity style={styles.actionRow} onPress={() => setContribOpen(true)}>
                <View style={styles.actionLeft}>
                  <Ionicons name="list-outline" size={18} color={colors.text} />
                  <Text style={styles.actionText}>Minhas contribuições</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.muted} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionRow}
                onPress={() => {
                  setSongRequestsFilter('hot');
                  setSongRequestsOpen(true);
                }}
              >
                <View style={styles.actionLeft}>
                  <Ionicons name="people-outline" size={18} color={colors.text} />
                  <Text style={styles.actionText}>Pedidos de música</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.muted} />
              </TouchableOpacity>
              <Text style={styles.helpText}>Sugestões, reivindicações, videoaulas e pedidos que você enviou.</Text>
              {reputationLabel ? (
                <View style={styles.reputationRow}>
                  <Text style={styles.reputationTitle}>
                    Reputação: {reputationLabel.title}
                    {typeof repScore === 'number' ? ` · ${repScore}` : ''}
                  </Text>
                  <Text style={styles.reputationHint}>{reputationLabel.hint}</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Sessão</Text>
              <TouchableOpacity style={[styles.buttonSecondary, { marginBottom: 0 }]} onPress={signOut}>
                <Text style={styles.buttonTextSecondary}>Sair</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Entrar</Text>
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor={colors.muted}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
            />
            <TextInput
              style={styles.input}
              placeholder="Senha"
              placeholderTextColor={colors.muted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
            <View style={styles.toggleRow}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.toggleTitle}>Sou artista</Text>
                <Text style={styles.toggleHint}>Aparece no seu perfil depois (verificação em breve).</Text>
              </View>
              <Switch value={signUpArtist} onValueChange={setSignUpArtist} />
            </View>
            <TouchableOpacity style={styles.button} onPress={signIn}>
              <Text style={styles.buttonText}>Entrar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.buttonSecondary} onPress={signUp}>
              <Text style={styles.buttonTextSecondary}>Criar conta</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      <Modal visible={churchOpen} transparent animationType="fade" onRequestClose={() => setChurchOpen(false)}>
        <Pressable
          style={styles.sheetOverlay}
          onPress={() => {
            Keyboard.dismiss();
            setChurchOpen(false);
          }}
        >
          <KeyboardAvoidingView
            style={{ width: '100%' }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <Pressable
              style={styles.sheetPanel}
              onPress={(event) => {
                event.stopPropagation();
              }}
            >
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>Minha igreja</Text>
                <TouchableOpacity
                  style={styles.iconButton}
                  onPress={() => {
                    Keyboard.dismiss();
                    setChurchOpen(false);
                  }}
                >
                  <Ionicons name="close" size={18} color={colors.text} />
                </TouchableOpacity>
              </View>

              <Text style={styles.sheetSubtitle}>
                Cadastre as informacoes da sua igreja para montar escalas, compartilhar repertorios e organizar o grupo
                de louvor.
              </Text>

              <View style={styles.formCard}>
                <TextInput
                  style={styles.input}
                  placeholder="Nome da igreja"
                  placeholderTextColor={colors.muted}
                  value={churchName}
                  onChangeText={setChurchName}
                  autoCapitalize="words"
                />
                <TextInput
                  style={styles.input}
                  placeholder="Instagram (opcional)"
                  placeholderTextColor={colors.muted}
                  value={churchInstagram}
                  onChangeText={setChurchInstagram}
                  autoCapitalize="none"
                />
                <TextInput
                  style={styles.input}
                  placeholder="Endereco (opcional)"
                  placeholderTextColor={colors.muted}
                  value={churchAddress}
                  onChangeText={setChurchAddress}
                />
                <TextInput
                  style={styles.input}
                  placeholder="WhatsApp (opcional)"
                  placeholderTextColor={colors.muted}
                  value={churchWhatsapp}
                  onChangeText={setChurchWhatsapp}
                />
              </View>

              <View style={styles.sheetActions}>
                <TouchableOpacity style={styles.button} onPress={saveChurch} activeOpacity={0.9}>
                  <Text style={styles.buttonText}>Salvar igreja</Text>
                </TouchableOpacity>
                {churchProfile ? (
                  <TouchableOpacity
                    style={[styles.buttonSecondary, { marginTop: 8 }]}
                    onPress={() => {
                      Alert.alert('Remover igreja?', 'Isso apaga a configuracao da sua igreja neste aparelho.', [
                        { text: 'Cancelar', style: 'cancel' },
                        { text: 'Remover', style: 'destructive', onPress: () => removeChurch() }
                      ]);
                    }}
                    activeOpacity={0.9}
                  >
                    <Text style={styles.buttonTextSecondary}>Remover configuracao</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      <Modal visible={groupOpen} transparent animationType="fade" onRequestClose={() => setGroupOpen(false)}>
        <Pressable
          style={styles.sheetOverlay}
          onPress={() => {
            Keyboard.dismiss();
            setGroupOpen(false);
          }}
        >
          <KeyboardAvoidingView
            style={{ width: '100%' }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <Pressable
              style={[styles.sheetPanel, styles.sheetPanelTall]}
              onPress={(event) => {
                event.stopPropagation();
              }}
            >
              <View style={styles.sheetHeader}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={styles.sheetTitle}>Grupo de louvor</Text>
                  <Text style={styles.sheetSubtitle} numberOfLines={2}>
                    Monte a escala do culto e compartilhe com o grupo. MVP local por enquanto; sincronizacao em breve.
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.iconButton}
                  onPress={() => {
                    Keyboard.dismiss();
                    setGroupOpen(false);
                  }}
                >
                  <Ionicons name="close" size={18} color={colors.text} />
                </TouchableOpacity>
              </View>

              <View style={styles.groupSummary}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.groupSummaryTitle}>Igreja</Text>
                  <Text style={styles.groupSummaryValue} numberOfLines={1}>
                    {churchProfile?.name ?? 'Nao configurada'}
                  </Text>
                </View>
                <TouchableOpacity style={styles.pillSecondary} onPress={openChurch} activeOpacity={0.9}>
                  <Ionicons name="settings-outline" size={16} color={colors.text} />
                  <Text style={styles.pillSecondaryText}>Editar</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.groupActionsRow}>
                <TouchableOpacity style={[styles.pillPrimary, styles.pillFlex]} onPress={openNewSetlist} activeOpacity={0.9}>
                  <Ionicons name="add" size={16} color="#fff" />
                  <Text style={styles.pillPrimaryText}>Criar escala</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.pillSecondary, styles.pillFlex]}
                  onPress={() => {
                    setSetlistImportOpen(true);
                    setSetlistImportText('');
                  }}
                  activeOpacity={0.9}
                >
                  <Ionicons name="download-outline" size={16} color={colors.text} />
                  <Text style={styles.pillSecondaryText}>Importar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.pillSecondary, styles.pillFlex]}
                  onPress={() => void openTemplates()}
                  activeOpacity={0.9}
                >
                  <Ionicons name="layers-outline" size={16} color={colors.text} />
                  <Text style={styles.pillSecondaryText}>Modelos</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={{ marginTop: 12 }} showsVerticalScrollIndicator={false}>
                <Text style={styles.sectionTitle}>Escalas recentes</Text>
                {setlists.length === 0 ? (
                  <Text style={styles.subtitle}>Crie sua primeira escala para ver aqui.</Text>
                ) : (
                  setlists.slice(0, 25).map((sl) => (
                    <View key={sl.id} style={styles.setlistRow}>
                      <TouchableOpacity
                        style={{ flex: 1, gap: 2 }}
                        onPress={() => openEditSetlist(sl.id)}
                        activeOpacity={0.85}
                      >
                        <Text style={styles.setlistTitle} numberOfLines={1}>
                          {sl.title}
                        </Text>
                        <Text style={styles.setlistMeta} numberOfLines={1}>
                          {sl.scheduledAt} · {sl.songs.length} musicas · {sl.team.length} pessoas
                        </Text>
                      </TouchableOpacity>
                      <View style={styles.setlistButtons}>
                        <TouchableOpacity style={styles.iconButton} onPress={() => shareSetlist(sl)} activeOpacity={0.85}>
                          <Ionicons name="share-outline" size={18} color={colors.text} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.iconButton}
                          onPress={() => openPublishTemplate(sl)}
                          activeOpacity={0.85}
                        >
                          <Ionicons name="layers-outline" size={18} color={colors.text} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.iconButton}
                          onPress={() =>
                            Alert.alert('Apagar escala?', 'Isso remove esta escala deste aparelho.', [
                              { text: 'Cancelar', style: 'cancel' },
                              { text: 'Apagar', style: 'destructive', onPress: () => deleteSetlist(sl.id) }
                            ])
                          }
                          activeOpacity={0.85}
                        >
                          <Ionicons name="trash-outline" size={18} color={colors.text} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))
                )}
              </ScrollView>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      <Modal visible={setlistEditorOpen} transparent animationType="fade" onRequestClose={() => setSetlistEditorOpen(false)}>
        <Pressable
          style={styles.sheetOverlay}
          onPress={() => {
            Keyboard.dismiss();
            setSetlistEditorOpen(false);
          }}
        >
          <KeyboardAvoidingView
            style={{ width: '100%' }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <Pressable
              style={[styles.sheetPanel, styles.sheetPanelTall]}
              onPress={(event) => {
                event.stopPropagation();
              }}
            >
              <View style={styles.sheetHeader}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={styles.sheetTitle}>{setlistDraftId ? 'Editar escala' : 'Nova escala'}</Text>
                  <Text style={styles.sheetSubtitle} numberOfLines={2}>
                    Monte o repertorio e a equipe. Depois, gere link/QR para o grupo importar no app.
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.iconButton}
                  onPress={() => {
                    Keyboard.dismiss();
                    setSetlistEditorOpen(false);
                  }}
                >
                  <Ionicons name="close" size={18} color={colors.text} />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <View style={styles.formCard}>
                  <TextInput
                    style={styles.input}
                    placeholder="Nome do culto (ex: Culto da noite)"
                    placeholderTextColor={colors.muted}
                    value={setlistTitle}
                    onChangeText={setSetlistTitle}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Quando (ex: Domingo 19h)"
                    placeholderTextColor={colors.muted}
                    value={setlistScheduledAt}
                    onChangeText={setSetlistScheduledAt}
                  />
                </View>

                <View style={styles.block}>
                  <Text style={styles.sectionTitle}>Repertorio</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Buscar musica para adicionar"
                    placeholderTextColor={colors.muted}
                    value={songQuery}
                    onChangeText={setSongQuery}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  {songLoading ? <Text style={styles.subtitle}>Buscando...</Text> : null}
                  {songQuery.trim() ? (
                    <View style={styles.resultsCard}>
                      {(songResults || []).slice(0, 8).map((s) => (
                        <TouchableOpacity
                          key={s.id}
                          style={styles.resultRow}
                          onPress={() => addSongToSetlist(s)}
                          activeOpacity={0.85}
                        >
                          <View style={{ flex: 1, gap: 2 }}>
                            <Text style={styles.resultTitle} numberOfLines={1}>
                              {s.title}
                            </Text>
                            <Text style={styles.resultMeta} numberOfLines={1}>
                              {s.artists?.name ?? 'Artista'}
                            </Text>
                          </View>
                          <Ionicons name="add-circle-outline" size={18} color={colors.accent} />
                        </TouchableOpacity>
                      ))}
                      {songResults.length === 0 && !songLoading ? (
                        <Text style={styles.subtitle}>Nenhum resultado.</Text>
                      ) : null}
                    </View>
                  ) : null}

                  <View style={styles.resultsCard}>
                    {setlistSongs.length === 0 ? (
                      <Text style={styles.subtitle}>Adicione musicas pela busca acima.</Text>
                    ) : (
                      setlistSongs.map((s, idx) => (
                        <View key={s.id} style={styles.setlistSongRow}>
                          <View style={{ flex: 1, gap: 2 }}>
                            <Text style={styles.resultTitle} numberOfLines={1}>
                              {idx + 1}. {s.title}
                            </Text>
                            <Text style={styles.resultMeta} numberOfLines={1}>
                              {s.artist ?? 'Artista'}
                            </Text>
                          </View>
                          <View style={styles.setlistButtons}>
                            <TouchableOpacity
                              style={styles.iconButton}
                              onPress={() => moveSong(s.id, -1)}
                              disabled={idx === 0}
                              activeOpacity={0.85}
                            >
                              <Ionicons name="chevron-up" size={18} color={idx === 0 ? colors.border : colors.text} />
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.iconButton}
                              onPress={() => moveSong(s.id, 1)}
                              disabled={idx === setlistSongs.length - 1}
                              activeOpacity={0.85}
                            >
                              <Ionicons
                                name="chevron-down"
                                size={18}
                                color={idx === setlistSongs.length - 1 ? colors.border : colors.text}
                              />
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.iconButton}
                              onPress={() => removeSongFromSetlist(s.id)}
                              activeOpacity={0.85}
                            >
                              <Ionicons name="close" size={18} color={colors.text} />
                            </TouchableOpacity>
                          </View>
                        </View>
                      ))
                    )}
                  </View>
                </View>

                <View style={styles.block}>
                  <Text style={styles.sectionTitle}>Equipe</Text>
                  <View style={styles.memberRow}>
                    <TextInput
                      style={[styles.input, { flex: 1, marginBottom: 0 }]}
                      placeholder="Nome (ex: Joao)"
                      placeholderTextColor={colors.muted}
                      value={memberName}
                      onChangeText={setMemberName}
                    />
                    <TouchableOpacity
                      style={styles.instrumentChip}
                      onPress={() =>
                        Alert.alert('Instrumento', 'Escolha rapido:', [
                          ...['Voz', 'Violao', 'Guitarra', 'Baixo', 'Teclado', 'Bateria', 'Cajon', 'Sopros'].map(
                            (label) => ({ text: label, onPress: () => setMemberInstrument(label) })
                          ),
                          { text: 'Cancelar', style: 'cancel' }
                        ])
                      }
                      activeOpacity={0.85}
                    >
                      <Text style={styles.instrumentChipText}>{memberInstrument}</Text>
                      <Ionicons name="chevron-down" size={14} color={colors.muted} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.iconButton} onPress={addMember} activeOpacity={0.85}>
                      <Ionicons name="add" size={18} color={colors.text} />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.resultsCard}>
                    {setlistTeam.length === 0 ? (
                      <Text style={styles.subtitle}>Adicione as pessoas e instrumentos.</Text>
                    ) : (
                      setlistTeam.map((m, idx) => (
                        <View key={`${m.name}-${idx}`} style={styles.setlistSongRow}>
                          <View style={{ flex: 1, gap: 2 }}>
                            <Text style={styles.resultTitle} numberOfLines={1}>
                              {m.name}
                            </Text>
                            <Text style={styles.resultMeta} numberOfLines={1}>
                              {m.instrument}
                            </Text>
                          </View>
                          <View style={styles.setlistButtons}>
                            <TouchableOpacity style={styles.iconButton} onPress={() => removeMember(idx)} activeOpacity={0.85}>
                              <Ionicons name="trash-outline" size={18} color={colors.text} />
                            </TouchableOpacity>
                          </View>
                        </View>
                      ))
                    )}
                  </View>
                </View>

                <View style={{ height: 12 }} />
              </ScrollView>

              <View style={styles.sheetActionsRow}>
                <TouchableOpacity style={styles.pillSecondary} onPress={() => setSetlistEditorOpen(false)} activeOpacity={0.9}>
                  <Text style={styles.pillSecondaryText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.pillPrimary} onPress={saveSetlist} activeOpacity={0.9}>
                  <Ionicons name="checkmark" size={16} color="#fff" />
                  <Text style={styles.pillPrimaryText}>Salvar escala</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      <Modal
        visible={setlistImportOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSetlistImportOpen(false)}
      >
        <Pressable
          style={styles.sheetOverlay}
          onPress={() => {
            Keyboard.dismiss();
            setSetlistImportOpen(false);
          }}
        >
          <KeyboardAvoidingView style={{ width: '100%' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <Pressable
              style={styles.sheetPanel}
              onPress={(event) => {
                event.stopPropagation();
              }}
            >
              <View style={styles.sheetHeader}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={styles.sheetTitle}>Importar escala</Text>
                  <Text style={styles.sheetSubtitle} numberOfLines={2}>
                    Cole o link (ou ID) compartilhado para adicionar esta escala em “Escalas recentes”.
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.iconButton}
                  onPress={() => {
                    Keyboard.dismiss();
                    setSetlistImportOpen(false);
                  }}
                >
                  <Ionicons name="close" size={18} color={colors.text} />
                </TouchableOpacity>
              </View>

              <View style={styles.formCard}>
                <TextInput
                  style={styles.input}
                  placeholder="https://.../escala/..."
                  placeholderTextColor={colors.muted}
                  value={setlistImportText}
                  onChangeText={setSetlistImportText}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="go"
                  onSubmitEditing={importSetlist}
                />
              </View>

              <View style={styles.sheetActionsRow}>
                <TouchableOpacity
                  style={styles.pillSecondary}
                  onPress={() => setSetlistImportOpen(false)}
                  activeOpacity={0.9}
                >
                  <Text style={styles.pillSecondaryText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.pillPrimary}
                  onPress={importSetlist}
                  activeOpacity={0.9}
                  disabled={setlistImportLoading}
                >
                  <Ionicons name="download-outline" size={16} color="#fff" />
                  <Text style={styles.pillPrimaryText}>{setlistImportLoading ? 'Importando...' : 'Importar'}</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      <Modal
        visible={setlistShareOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSetlistShareOpen(false)}
      >
        <Pressable
          style={styles.sheetOverlay}
          onPress={() => {
            Keyboard.dismiss();
            setSetlistShareOpen(false);
          }}
        >
          <KeyboardAvoidingView style={{ width: '100%' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <Pressable
              style={styles.sheetPanel}
              onPress={(event) => {
                event.stopPropagation();
              }}
            >
              <View style={styles.sheetHeader}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={styles.sheetTitle}>Compartilhar escala</Text>
                  <Text style={styles.sheetSubtitle} numberOfLines={2}>
                    Use o QR code ou envie o link. Quem receber pode importar em Conta → Grupo de louvor → Importar.
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.iconButton}
                  onPress={() => {
                    Keyboard.dismiss();
                    setSetlistShareOpen(false);
                  }}
                >
                  <Ionicons name="close" size={18} color={colors.text} />
                </TouchableOpacity>
              </View>

              {setlistShareError ? (
                <View style={styles.shareNotice}>
                  <Text style={styles.shareNoticeText}>{setlistShareError}</Text>
                </View>
              ) : null}

              {setlistShareLoading ? (
                <Text style={styles.subtitle}>Gerando link...</Text>
              ) : setlistShareUrl ? (
                <View style={styles.qrWrap}>
                  <Image
                    source={{
                      uri: `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(setlistShareUrl)}`
                    }}
                    style={styles.qrImage}
                  />
                  <Text style={styles.shareLink} numberOfLines={2}>
                    {setlistShareUrl}
                  </Text>
                  {setlistShareId ? (
                    <Text style={styles.shareCode} numberOfLines={1}>
                      Codigo: {setlistShareId}
                    </Text>
                  ) : null}
                </View>
              ) : setlistShareId ? (
                <View style={styles.qrWrap}>
                  <Text style={styles.shareCode} numberOfLines={2}>
                    Codigo: {setlistShareId}
                  </Text>
                </View>
              ) : null}

              <View style={styles.sheetActionsRow}>
                <TouchableOpacity
                  style={styles.pillSecondary}
                  onPress={() => setSetlistShareOpen(false)}
                  activeOpacity={0.9}
                >
                  <Text style={styles.pillSecondaryText}>Fechar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.pillPrimary}
                  onPress={() => {
                    if (setlistShareUrl) {
                      void Share.share({ message: setlistShareUrl });
                      return;
                    }
                    if (setlistShareId) {
                      void Share.share({ message: `Escala (codigo): ${setlistShareId}` });
                      return;
                    }
                    Alert.alert('Indisponível', 'Não foi possível gerar o link agora.');
                  }}
                  activeOpacity={0.9}
                  disabled={setlistShareLoading}
                >
                  <Ionicons name="share-outline" size={16} color="#fff" />
                  <Text style={styles.pillPrimaryText}>Compartilhar</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      <Modal
        visible={templatesOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setTemplatesOpen(false)}
      >
        <Pressable style={styles.sheetOverlay} onPress={() => setTemplatesOpen(false)}>
          <KeyboardAvoidingView style={{ width: '100%' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <Pressable
              style={[styles.sheetPanel, styles.sheetPanelTall]}
              onPress={(event) => {
                event.stopPropagation();
              }}
            >
              <View style={styles.sheetHeader}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={styles.sheetTitle}>Modelos da comunidade</Text>
                  <Text style={styles.sheetSubtitle} numberOfLines={2}>
                    Remixe um modelo para criar sua escala. Você também pode publicar a sua.
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.iconButton}
                  onPress={() => {
                    Keyboard.dismiss();
                    setTemplatesOpen(false);
                  }}
                >
                  <Ionicons name="close" size={18} color={colors.text} />
                </TouchableOpacity>
              </View>

              <View style={styles.resultsCard}>
                <Text style={[styles.sectionTitle, { marginBottom: 8 }]}>Sugeridos</Text>
                {[
                  { title: 'Ceia', tags: 'ceia, comunhão' },
                  { title: 'Vigília', tags: 'vigilia, oração' },
                  { title: 'Culto jovem', tags: 'jovem, avivamento' }
                ].map((t) => (
                  <TouchableOpacity
                    key={t.title}
                    style={styles.templateRow}
                    onPress={() =>
                      void remixTemplate(
                        { id: null, title: t.title, payload: { songs: [], team: [] } },
                        t.title
                      )
                    }
                    activeOpacity={0.85}
                  >
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={styles.resultTitle}>{t.title}</Text>
                      <Text style={styles.resultMeta}>{t.tags}</Text>
                    </View>
                    <View style={styles.templateActionPill}>
                      <Text style={styles.templateActionText}>Usar</Text>
                      <Ionicons name="chevron-forward" size={14} color={colors.muted} />
                    </View>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={{ marginTop: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={styles.sectionTitle}>Mais remixes</Text>
                  <TouchableOpacity style={styles.iconButton} onPress={loadTemplates} activeOpacity={0.85}>
                    <Ionicons name="refresh" size={18} color={templatesLoading ? colors.muted : colors.text} />
                  </TouchableOpacity>
                </View>

                {templatesError ? (
                  <View style={styles.contribErrorBox}>
                    <Text style={styles.contribErrorTitle}>Não foi possível carregar</Text>
                    <Text style={styles.contribErrorText}>{templatesError}</Text>
                  </View>
                ) : null}

                <ScrollView style={{ marginTop: 10, maxHeight: 360 }} showsVerticalScrollIndicator={false}>
                  {templatesLoading ? (
                    <Text style={styles.subtitle}>Carregando...</Text>
                  ) : templates.length ? (
                    templates.map((tpl) => {
                      const payload = tpl?.payload ?? {};
                      const songs = Array.isArray(payload?.songs) ? payload.songs : [];
                      const tags = Array.isArray(tpl?.tags) ? tpl.tags.join(', ') : '';
                      return (
                        <View key={String(tpl.id)} style={styles.templateCard}>
                          <View style={{ flex: 1, gap: 4 }}>
                            <Text style={styles.templateTitle} numberOfLines={1}>
                              {String(tpl.title ?? 'Modelo')}
                            </Text>
                            <Text style={styles.templateMeta} numberOfLines={2}>
                              {songs.length} {songs.length === 1 ? 'música' : 'músicas'}
                              {tpl.remix_count ? ` · ${tpl.remix_count} remix` : ''}
                              {tags ? ` · ${tags}` : ''}
                            </Text>
                            {tpl.description ? (
                              <Text style={styles.templateDesc} numberOfLines={2}>
                                {String(tpl.description)}
                              </Text>
                            ) : null}
                          </View>
                          <TouchableOpacity
                            style={styles.templateRemixButton}
                            onPress={() => void remixTemplate(tpl)}
                            activeOpacity={0.9}
                          >
                            <Text style={styles.templateRemixText}>Remixar</Text>
                          </TouchableOpacity>
                        </View>
                      );
                    })
                  ) : (
                    <Text style={styles.subtitle}>Sem modelos ainda. Publique o seu a partir de uma escala.</Text>
                  )}
                </ScrollView>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      <Modal
        visible={templatePublishOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setTemplatePublishOpen(false)}
      >
        <Pressable
          style={styles.sheetOverlay}
          onPress={() => {
            Keyboard.dismiss();
            setTemplatePublishOpen(false);
          }}
        >
          <KeyboardAvoidingView style={{ width: '100%' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <Pressable
              style={styles.sheetPanel}
              onPress={(event) => {
                event.stopPropagation();
              }}
            >
              <View style={styles.sheetHeader}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={styles.sheetTitle}>Publicar modelo</Text>
                  <Text style={styles.sheetSubtitle} numberOfLines={2}>
                    Transforme esta escala em um modelo para outras pessoas remixarem.
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.iconButton}
                  onPress={() => {
                    Keyboard.dismiss();
                    setTemplatePublishOpen(false);
                  }}
                >
                  <Ionicons name="close" size={18} color={colors.text} />
                </TouchableOpacity>
              </View>

              <View style={styles.formCard}>
                <TextInput
                  style={styles.input}
                  placeholder="Título do modelo"
                  placeholderTextColor={colors.muted}
                  value={templateTitle}
                  onChangeText={setTemplateTitle}
                />
                <TextInput
                  style={[styles.input, { height: 84, textAlignVertical: 'top' }]}
                  placeholder="Descrição (opcional)"
                  placeholderTextColor={colors.muted}
                  value={templateDescription}
                  onChangeText={setTemplateDescription}
                  multiline
                />
                <TextInput
                  style={styles.input}
                  placeholder="Tags (ex: ceia, vigilia, culto jovem)"
                  placeholderTextColor={colors.muted}
                  value={templateTags}
                  onChangeText={setTemplateTags}
                  autoCapitalize="none"
                />
                <View style={styles.toggleRow}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={styles.toggleTitle}>Incluir equipe</Text>
                    <Text style={styles.toggleHint}>Se desligado, publica só o repertório.</Text>
                  </View>
                  <Switch value={templateIncludeTeam} onValueChange={setTemplateIncludeTeam} />
                </View>
              </View>

              <View style={styles.sheetActionsRow}>
                <TouchableOpacity style={styles.pillSecondary} onPress={() => setTemplatePublishOpen(false)} activeOpacity={0.9}>
                  <Text style={styles.pillSecondaryText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.pillPrimary}
                  onPress={publishTemplate}
                  activeOpacity={0.9}
                  disabled={templatePublishing}
                >
                  <Ionicons name="cloud-upload-outline" size={16} color="#fff" />
                  <Text style={styles.pillPrimaryText}>{templatePublishing ? 'Publicando...' : 'Publicar'}</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      {/* lightweight modal so we don't pull in more deps */}
      {claimOpen ? (
        <View style={styles.claimOverlay}>
          <View style={styles.claimSheet}>
            <View style={styles.claimHeader}>
              <Text style={styles.claimHeaderTitle}>Reivindicar artista</Text>
              <TouchableOpacity onPress={() => setClaimOpen(false)}>
                <Ionicons name="close" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.claimSearch}
              placeholder="Buscar artista/ministério"
              placeholderTextColor={colors.muted}
              value={claimQuery}
              onChangeText={setClaimQuery}
              autoCorrect={false}
              autoCapitalize="none"
            />

            <ScrollView style={{ maxHeight: 160, marginTop: 10 }} keyboardShouldPersistTaps="handled">
              {claimLoading ? (
                <Text style={styles.subtitle}>Carregando artistas...</Text>
              ) : (
                (claimArtists || [])
                  .filter((a) => {
                    const q = claimQuery.trim().toLowerCase();
                    if (!q) return true;
                    const hay = String(a?.name || '').toLowerCase();
                    return hay.includes(q);
                  })
                  .slice(0, 20)
                  .map((a) => {
                    const selected = claimSelected?.id === a.id;
                    return (
                      <TouchableOpacity
                        key={a.id}
                        style={[styles.claimPickRow, selected ? styles.claimPickRowActive : null]}
                        onPress={() => setClaimSelected(a)}
                      >
                        <Text style={selected ? styles.claimPickTextActive : styles.claimPickText}>
                          {a.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })
              )}
            </ScrollView>

            <View style={{ marginTop: 14, gap: 10 }}>
              <TextInput
                style={styles.input}
                placeholder="Seu nome"
                placeholderTextColor={colors.muted}
                value={claimName}
                onChangeText={setClaimName}
              />
              <TextInput
                style={styles.input}
                placeholder="WhatsApp (opcional)"
                placeholderTextColor={colors.muted}
                value={claimWhatsapp}
                onChangeText={setClaimWhatsapp}
              />
              <TextInput
                style={styles.input}
                placeholder="Instagram (opcional)"
                placeholderTextColor={colors.muted}
                value={claimInstagram}
                onChangeText={setClaimInstagram}
              />
              <TextInput
                style={[styles.input, { height: 92, textAlignVertical: 'top' }]}
                placeholder="Explique sua reivindicação (contato, links, contexto)"
                placeholderTextColor={colors.muted}
                value={claimMessage}
                onChangeText={setClaimMessage}
                multiline
              />
            </View>

            <TouchableOpacity style={[styles.button, { marginTop: 12 }]} onPress={submitArtistClaim}>
              <Text style={styles.buttonText}>Enviar solicitação</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {songClaimOpen ? (
        <View style={styles.claimOverlay}>
          <View style={styles.claimSheet}>
            <View style={styles.claimHeader}>
              <Text style={styles.claimHeaderTitle}>Reivindicar música</Text>
              <TouchableOpacity onPress={() => setSongClaimOpen(false)}>
                <Ionicons name="close" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.claimSearch}
              placeholder="Buscar música (título ou artista)"
              placeholderTextColor={colors.muted}
              value={songClaimQuery}
              onChangeText={setSongClaimQuery}
              autoCorrect={false}
              autoCapitalize="none"
            />

            <ScrollView style={{ maxHeight: 180, marginTop: 10 }} keyboardShouldPersistTaps="handled">
              {songClaimLoading ? (
                <Text style={styles.subtitle}>Buscando...</Text>
              ) : songClaimSongs.length === 0 ? (
                <Text style={styles.subtitle}>Digite acima para buscar.</Text>
              ) : (
                songClaimSongs.map((s) => {
                  const selected = songClaimSelected?.id === s.id;
                  return (
                    <TouchableOpacity
                      key={s.id}
                      style={[styles.claimPickRow, selected ? styles.claimPickRowActive : null]}
                      onPress={() => setSongClaimSelected(s)}
                    >
                      <Text style={selected ? styles.claimPickTextActive : styles.claimPickText}>
                        {s.title} · {s.artists?.name ?? 'Artista'}
                      </Text>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>

            <View style={{ marginTop: 14, gap: 10 }}>
              <TextInput
                style={styles.input}
                placeholder="Seu nome"
                placeholderTextColor={colors.muted}
                value={claimName}
                onChangeText={setClaimName}
              />
              <TextInput
                style={styles.input}
                placeholder="WhatsApp (opcional)"
                placeholderTextColor={colors.muted}
                value={claimWhatsapp}
                onChangeText={setClaimWhatsapp}
              />
              <TextInput
                style={styles.input}
                placeholder="Instagram (opcional)"
                placeholderTextColor={colors.muted}
                value={claimInstagram}
                onChangeText={setClaimInstagram}
              />
              <TextInput
                style={[styles.input, { height: 92, textAlignVertical: 'top' }]}
                placeholder="Explique sua reivindicação"
                placeholderTextColor={colors.muted}
                value={songClaimMessage}
                onChangeText={setSongClaimMessage}
                multiline
              />
              <TextInput
                style={[styles.input, { height: 72, textAlignVertical: 'top' }]}
                placeholder="Links e detalhes (opcional)"
                placeholderTextColor={colors.muted}
                value={songClaimExtra}
                onChangeText={setSongClaimExtra}
                multiline
              />
            </View>

            <TouchableOpacity style={[styles.button, { marginTop: 12 }]} onPress={submitSongClaim}>
              <Text style={styles.buttonText}>Enviar solicitação</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      <Modal visible={contribOpen} animationType="slide" onRequestClose={() => setContribOpen(false)}>
        <SafeAreaView style={styles.contribContainer}>
          <View style={styles.contribHeader}>
            <TouchableOpacity style={styles.iconButton} onPress={() => setContribOpen(false)} activeOpacity={0.85}>
              <Ionicons name="close" size={18} color={colors.text} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={styles.contribTitle}>Minhas contribuições</Text>
              <Text style={styles.contribSubtitle}>Status e histórico do que você já enviou.</Text>
            </View>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={loadMyContributions}
              activeOpacity={0.85}
              disabled={contribLoading}
            >
              <Ionicons name="refresh" size={18} color={contribLoading ? colors.muted : colors.text} />
            </TouchableOpacity>
          </View>

          {contribError ? (
            <View style={styles.contribErrorBox}>
              <Text style={styles.contribErrorTitle}>Não foi possível carregar</Text>
              <Text style={styles.contribErrorText}>{contribError}</Text>
            </View>
          ) : null}

          <FlatList
            data={contribItems}
            keyExtractor={(item) => item.id}
            onRefresh={loadMyContributions}
            refreshing={contribLoading}
            contentContainerStyle={{ paddingBottom: 28 }}
            ListEmptyComponent={
              contribLoading ? null : (
                <View style={styles.contribEmpty}>
                  <Text style={styles.contribEmptyTitle}>Sem contribuições ainda</Text>
                  <Text style={styles.contribEmptyText}>
                    Quando você enviar uma sugestão, reivindicação, videoaula ou pedido, vai aparecer aqui.
                  </Text>
                </View>
              )
            }
            renderItem={({ item }) => {
              const st = formatStatus(item.status);
              const toneStyle =
                st.tone === 'approved'
                  ? styles.contribPillApproved
                  : st.tone === 'rejected'
                    ? styles.contribPillRejected
                    : st.tone === 'sent'
                      ? styles.contribPillSent
                      : styles.contribPillPending;

              return (
                <View style={styles.contribRow}>
                  <View style={styles.contribIcon}>
                    <Ionicons name={iconForKind(item.kind) as any} size={18} color={colors.text} />
                  </View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={styles.contribRowTitle} numberOfLines={2}>
                      {item.title}
                    </Text>
                    {item.subtitle ? (
                      <Text style={styles.contribRowSub} numberOfLines={1}>
                        {item.subtitle}
                      </Text>
                    ) : null}
                    <Text style={styles.contribRowMeta} numberOfLines={1}>
                      {new Date(item.createdAt).toLocaleString()}
                    </Text>
                  </View>
                  <View style={[styles.contribPill, toneStyle]}>
                    <Text style={styles.contribPillText}>{st.label}</Text>
                  </View>
                </View>
              );
            }}
          />
        </SafeAreaView>
      </Modal>

      <Modal visible={songRequestOpen} transparent animationType="fade" onRequestClose={() => setSongRequestOpen(false)}>
        <Pressable style={styles.sheetOverlay} onPress={() => setSongRequestOpen(false)}>
          <KeyboardAvoidingView style={{ width: '100%' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <Pressable
              style={styles.sheetPanel}
              onPress={(event) => {
                event.stopPropagation();
              }}
            >
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>Pedir música</Text>
                <TouchableOpacity style={styles.iconButton} onPress={() => setSongRequestOpen(false)}>
                  <Ionicons name="close" size={18} color={colors.text} />
                </TouchableOpacity>
              </View>

              <Text style={styles.sheetSubtitle}>
                Seu pedido entra numa fila pública para a comunidade votar. O time revisa e marca como “em revisão” ou
                “já temos”.
              </Text>

              <View style={styles.formCard}>
                <TextInput
                  style={styles.input}
                  placeholder="Título da música"
                  placeholderTextColor={colors.muted}
                  value={songRequestTitle}
                  onChangeText={setSongRequestTitle}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Artista/Ministério"
                  placeholderTextColor={colors.muted}
                  value={songRequestArtist}
                  onChangeText={setSongRequestArtist}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Link de referência (opcional)"
                  placeholderTextColor={colors.muted}
                  value={songRequestLink}
                  onChangeText={setSongRequestLink}
                  autoCapitalize="none"
                />
                <TextInput
                  style={[styles.input, { height: 90, textAlignVertical: 'top' }]}
                  placeholder="Mensagem (opcional)"
                  placeholderTextColor={colors.muted}
                  value={songRequestMessage}
                  onChangeText={setSongRequestMessage}
                  multiline
                />
              </View>

              <TouchableOpacity
                style={[styles.button, { marginBottom: 0, opacity: songRequestSubmitting ? 0.7 : 1 }]}
                onPress={submitSongRequest}
                disabled={songRequestSubmitting}
              >
                <Text style={styles.buttonText}>{songRequestSubmitting ? 'Enviando...' : 'Enviar pedido'}</Text>
              </TouchableOpacity>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      <Modal visible={songRequestsOpen} animationType="slide" onRequestClose={() => setSongRequestsOpen(false)}>
        <SafeAreaView style={styles.contribContainer}>
          <View style={styles.contribHeader}>
            <TouchableOpacity style={styles.iconButton} onPress={() => setSongRequestsOpen(false)} activeOpacity={0.85}>
              <Ionicons name="close" size={18} color={colors.text} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={styles.contribTitle}>Pedidos de música</Text>
              <Text style={styles.contribSubtitle}>Vote para priorizar o que deve entrar na base.</Text>
            </View>
            <TouchableOpacity style={styles.iconButton} onPress={loadSongRequests} activeOpacity={0.85} disabled={songRequestsLoading}>
              <Ionicons name="refresh" size={18} color={songRequestsLoading ? colors.muted : colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingHorizontal: 16, paddingTop: 12 }}>
            {[
              { key: 'hot' as const, label: 'Em alta' },
              { key: 'recent' as const, label: 'Recentes' },
              { key: 'reviewing' as const, label: 'Em revisão' },
              { key: 'added' as const, label: 'Já temos' }
            ].map((tab) => {
              const active = songRequestsFilter === tab.key;
              return (
                <TouchableOpacity
                  key={tab.key}
                  style={[styles.kindChip, active ? styles.kindChipActive : null, { marginRight: 10 }]}
                  onPress={() => setSongRequestsFilter(tab.key)}
                >
                  <Text style={active ? styles.kindChipTextActive : styles.kindChipText}>{tab.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {songRequestsError ? (
            <View style={styles.contribErrorBox}>
              <Text style={styles.contribErrorTitle}>Não foi possível carregar</Text>
              <Text style={styles.contribErrorText}>{songRequestsError}</Text>
            </View>
          ) : null}

          <FlatList
            data={songRequests}
            keyExtractor={(item) => String(item.request_id)}
            onRefresh={loadSongRequests}
            refreshing={songRequestsLoading}
            contentContainerStyle={{ paddingBottom: 28 }}
            ListEmptyComponent={
              songRequestsLoading ? null : (
                <View style={styles.contribEmpty}>
                  <Text style={styles.contribEmptyTitle}>Sem pedidos</Text>
                  <Text style={styles.contribEmptyText}>Ainda não há pedidos nessa lista.</Text>
                </View>
              )
            }
            renderItem={({ item }) => {
              const id = String(item.request_id);
              const up = Number(item.upvotes ?? 0);
              const has = Boolean(songRequestVotes[id]);
              const st = statusLabelForSongRequest(item.status);
              const pillStyle =
                st.tone === 'added'
                  ? styles.reqPillAdded
                  : st.tone === 'reviewing'
                    ? styles.reqPillReviewing
                    : st.tone === 'rejected'
                      ? styles.reqPillRejected
                      : styles.reqPillPending;

              return (
                <View style={styles.reqRow}>
                  <TouchableOpacity
                    style={[styles.reqVote, has ? styles.reqVoteActive : null]}
                    onPress={() => toggleSongRequestUpvote(id)}
                    activeOpacity={0.9}
                  >
                    <Ionicons name="arrow-up" size={16} color={has ? '#fff' : colors.text} />
                    <Text style={has ? styles.reqVoteTextActive : styles.reqVoteText}>{up}</Text>
                  </TouchableOpacity>

                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={styles.reqTitle} numberOfLines={2}>
                      {item.title}
                    </Text>
                    <Text style={styles.reqArtist} numberOfLines={1}>
                      {item.artist}
                    </Text>
                    <Text style={styles.reqMeta} numberOfLines={1}>
                      {new Date(String(item.created_at)).toLocaleString()}
                    </Text>
                  </View>

                  <View style={[styles.contribPill, pillStyle]}>
                    <Text style={styles.contribPillText}>{st.label}</Text>
                  </View>
                </View>
              );
            }}
          />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  pageHeader: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10 },
  pageTitle: { fontSize: 24, fontWeight: '900', color: colors.text },
  profileCard: {
    marginHorizontal: 16,
    marginTop: 6,
    backgroundColor: colors.card,
    padding: 16,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card
  },
  profileTopRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: '#bbf7d0',
    alignItems: 'center',
    justifyContent: 'center'
  },
  avatarText: { color: colors.accent, fontWeight: '900', fontSize: 18 },
  profileNameInput: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.text,
    paddingVertical: 0,
    paddingHorizontal: 0
  },
  profileEmail: { color: colors.muted, fontWeight: '700' },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.chip,
    borderWidth: 1,
    borderColor: colors.border
  },
  profileButtonsRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  pillPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radii.pill,
    backgroundColor: colors.accent
  },
  pillPrimaryText: { color: '#fff', fontWeight: '900' },
  pillSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radii.pill,
    backgroundColor: colors.chip,
    borderWidth: 1,
    borderColor: colors.border
  },
  pillSecondaryText: { color: colors.text, fontWeight: '900' },

  kindChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.chip,
    borderWidth: 1,
    borderColor: colors.border
  },
  kindChipActive: { backgroundColor: colors.text, borderColor: colors.text },
  kindChipText: { fontWeight: '900', color: colors.text, fontSize: 12 },
  kindChipTextActive: { fontWeight: '900', color: '#fff', fontSize: 12 },

  profileHintRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  profileHintText: { color: colors.muted, fontWeight: '700', flex: 1 },
  card: {
    margin: 16,
    backgroundColor: colors.card,
    padding: 20,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card
  },
  sectionTitle: { fontSize: 16, fontWeight: '900', marginBottom: 10, color: colors.text },
  subtitle: { color: colors.muted, marginBottom: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12
  },
  rowInput: { flex: 1, color: colors.text, fontWeight: '700' },
  input: {
    backgroundColor: colors.card,
    padding: 12,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
    color: colors.text
  },
  button: {
    backgroundColor: colors.accent,
    padding: 12,
    borderRadius: radii.pill,
    alignItems: 'center',
    marginBottom: 8
  },
  buttonSecondary: {
    backgroundColor: colors.chip,
    padding: 12,
    borderRadius: radii.pill,
    alignItems: 'center'
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700'
  },
  buttonTextSecondary: {
    color: colors.text,
    fontWeight: '700'
  },
  actionRow: {
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  actionLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  actionText: { fontWeight: '800', color: colors.text },
  helpText: { color: colors.muted, marginTop: 10, fontWeight: '700' },
  reputationRow: {
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#f8f8f8',
    padding: 12
  },
  reputationTitle: { color: colors.text, fontWeight: '900' },
  reputationHint: { color: colors.muted, fontWeight: '800', marginTop: 2, lineHeight: 16, fontSize: 12 },

  toggleRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border
  },
  toggleTitle: { fontWeight: '900', color: colors.text },
  toggleHint: { color: colors.muted, fontWeight: '600' },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, marginBottom: 6 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radii.pill,
    borderWidth: 1
  },
  badgeOk: { backgroundColor: '#ecfdf5', borderColor: '#bbf7d0' },
  badgeMuted: { backgroundColor: '#f6f6f6', borderColor: colors.border },
  badgeTextOk: { color: '#065f46', fontWeight: '900' },
  badgeTextMuted: { color: colors.muted, fontWeight: '900' },

  contribContainer: { flex: 1, backgroundColor: colors.background },
  contribHeader: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.card
  },
  contribTitle: { fontSize: 18, fontWeight: '900', color: colors.text },
  contribSubtitle: { color: colors.muted, marginTop: 2, fontWeight: '700', fontSize: 12 },
  contribRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background
  },
  contribIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f2f2f2',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border
  },
  contribRowTitle: { color: colors.text, fontWeight: '900' },
  contribRowSub: { color: colors.muted, fontWeight: '700' },
  contribRowMeta: { color: colors.muted, fontWeight: '700', fontSize: 12 },
  contribPill: {
    alignSelf: 'flex-start',
    borderRadius: radii.pill,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1
  },
  contribPillText: { fontSize: 12, fontWeight: '900', color: colors.text },
  contribPillPending: { backgroundColor: '#fff', borderColor: colors.border },
  contribPillApproved: { backgroundColor: '#ecfdf3', borderColor: '#34d399' },
  contribPillRejected: { backgroundColor: '#fef2f2', borderColor: '#fb7185' },
  contribPillSent: { backgroundColor: colors.accentSoft, borderColor: colors.border },

  contribEmpty: { padding: 24, gap: 10, alignItems: 'center', justifyContent: 'center' },
  contribEmptyTitle: { fontSize: 18, fontWeight: '900', color: colors.text, textAlign: 'center' },
  contribEmptyText: { color: colors.muted, fontWeight: '700', textAlign: 'center' },
  contribErrorBox: {
    margin: 16,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#fff',
    padding: 14,
    gap: 8
  },
  contribErrorTitle: { fontWeight: '900', color: colors.text },
  contribErrorText: { color: colors.muted, fontWeight: '700' },

  reqRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background
  },
  reqVote: {
    width: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#fff',
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4
  },
  reqVoteActive: { backgroundColor: colors.text, borderColor: colors.text },
  reqVoteText: { fontWeight: '900', color: colors.text },
  reqVoteTextActive: { fontWeight: '900', color: '#fff' },
  reqTitle: { color: colors.text, fontWeight: '900' },
  reqArtist: { color: colors.muted, fontWeight: '800' },
  reqMeta: { color: colors.muted, fontWeight: '700', fontSize: 12 },

  reqPillPending: { backgroundColor: '#fff', borderColor: colors.border },
  reqPillReviewing: { backgroundColor: colors.accentSoft, borderColor: colors.border },
  reqPillAdded: { backgroundColor: '#ecfdf3', borderColor: '#34d399' },
  reqPillRejected: { backgroundColor: '#fef2f2', borderColor: '#fb7185' },
  subSectionTitle: { fontWeight: '900', color: colors.text, marginTop: 2 },
  claimRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  claimTitle: { color: colors.text, fontWeight: '800' },
  claimStatus: { color: colors.muted, fontWeight: '800' },

  claimOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.25)',
    justifyContent: 'flex-end'
  },
  claimSheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border
  },
  claimHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  claimHeaderTitle: { fontSize: 18, fontWeight: '900', color: colors.text },
  claimSearch: {
    marginTop: 12,
    backgroundColor: colors.card,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text
  },
  claimPickRow: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8
  },
  claimPickRowActive: { backgroundColor: colors.accentSoft, borderColor: '#bbf7d0' },
  claimPickText: { color: colors.text, fontWeight: '800' },
  claimPickTextActive: { color: colors.accent, fontWeight: '900' },

  sheetOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.25)',
    justifyContent: 'flex-end'
  },
  sheetPanel: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border
  },
  sheetPanelTall: {
    maxHeight: '88%'
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  sheetTitle: { fontSize: 18, fontWeight: '900', color: colors.text },
  sheetSubtitle: { color: colors.muted, fontWeight: '700' },
  formCard: { marginTop: 12 },
  sheetActions: { marginTop: 12 },
  groupSummary: {
    marginTop: 12,
    padding: 12,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  groupSummaryTitle: { color: colors.muted, fontWeight: '800', fontSize: 12 },
  groupSummaryValue: { color: colors.text, fontWeight: '900', fontSize: 14 },
  groupActionsRow: { flexDirection: 'row', gap: 10, marginTop: 12, flexWrap: 'wrap' },
  pillFlex: { flexGrow: 1, flexBasis: 0, minWidth: 110 },
  setlistRow: {
    marginTop: 10,
    padding: 12,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  setlistTitle: { color: colors.text, fontWeight: '900' },
  setlistMeta: { color: colors.muted, fontWeight: '700' },
  setlistButtons: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  block: { marginTop: 14 },
  resultsCard: {
    marginTop: 10,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: 10
  },
  resultRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 8 },
  resultTitle: { color: colors.text, fontWeight: '900' },
  resultMeta: { color: colors.muted, fontWeight: '700', fontSize: 12 },
  setlistSongRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  instrumentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: radii.pill,
    backgroundColor: colors.chip,
    borderWidth: 1,
    borderColor: colors.border
  },
  instrumentChipText: { color: colors.text, fontWeight: '900' },
  sheetActionsRow: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 12
  },

  templateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  templateActionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.chip,
    borderWidth: 1,
    borderColor: colors.border
  },
  templateActionText: { fontWeight: '900', color: colors.text, fontSize: 12 },
  templateCard: {
    marginTop: 10,
    padding: 12,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  templateTitle: { fontWeight: '900', color: colors.text },
  templateMeta: { color: colors.muted, fontWeight: '800', fontSize: 12 },
  templateDesc: { color: colors.text, fontWeight: '700', fontSize: 12, lineHeight: 16 },
  templateRemixButton: {
    borderRadius: radii.pill,
    backgroundColor: colors.text,
    paddingVertical: 10,
    paddingHorizontal: 12
  },
  templateRemixText: { color: '#fff', fontWeight: '900' },

  shareNotice: {
    marginTop: 12,
    padding: 12,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#fafafa'
  },
  shareNoticeText: { color: colors.muted, fontWeight: '700' },
  qrWrap: { marginTop: 12, alignItems: 'center', gap: 10 },
  qrImage: { width: 240, height: 240, borderRadius: 18, backgroundColor: '#fff' },
  shareLink: { color: colors.text, fontWeight: '900', textAlign: 'center' },
  shareCode: { color: colors.muted, fontWeight: '900', textAlign: 'center' }
});
