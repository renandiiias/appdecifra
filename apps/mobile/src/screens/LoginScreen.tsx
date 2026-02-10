import { useEffect, useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Alert,
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
import { supabase } from '../lib/supabase';
import { colors, radii, shadows } from '../lib/theme';
import { fetchArtists, fetchSongs } from '../lib/api';
import { normalizeSearch } from '@cifras/shared';

const SUPPORT_EMAIL = 'suporte@cifracrista.app';

type ChurchProfile = {
  name: string;
  instagram?: string | null;
  address?: string | null;
  whatsapp?: string | null;
  updatedAt: string;
};

type SetlistSong = { id: string; title: string; artist?: string | null };
type SetlistMember = { name: string; instrument: string };
type WorshipSetlist = {
  id: string;
  title: string;
  scheduledAt: string;
  songs: SetlistSong[];
  team: SetlistMember[];
  createdAt: string;
};

function makeId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [isArtist, setIsArtist] = useState(false);
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

  useEffect(() => {
    let mounted = true;

    const syncSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      const user = data.session?.user ?? null;
      setUserEmail(user?.email ?? null);
      setUserId(user?.id ?? null);
      const name =
        (typeof user?.user_metadata?.name === 'string' && user.user_metadata.name) ||
        (typeof user?.user_metadata?.full_name === 'string' && user.user_metadata.full_name) ||
        '';
      setDisplayName(name);
      const artistFlag =
        typeof user?.user_metadata?.is_artist === 'boolean' ? user.user_metadata.is_artist : false;
      setIsArtist(artistFlag);
    };

    syncSession();
    const { data: sub } = supabase.auth.onAuthStateChange(() => syncSession());
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (userEmail) {
      loadMyArtistClaims();
      loadMySongClaims();
    }
  }, [userEmail]);

  useEffect(() => {
    if (!userId) {
      setChurchProfile(null);
      setSetlists([]);
      return;
    }

    let mounted = true;
    (async () => {
      try {
        const rawChurch = await AsyncStorage.getItem(`cifra_crista:church_profile:v1:${userId}`);
        if (!mounted) return;
        if (rawChurch) setChurchProfile(JSON.parse(rawChurch));
        else setChurchProfile(null);
      } catch {
        if (mounted) setChurchProfile(null);
      }

      try {
        const rawSetlists = await AsyncStorage.getItem(`cifra_crista:worship_setlists:v1:${userId}`);
        if (!mounted) return;
        if (rawSetlists) setSetlists(JSON.parse(rawSetlists));
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
      await AsyncStorage.setItem(`cifra_crista:church_profile:v1:${userId}`, JSON.stringify(record));
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
      await AsyncStorage.removeItem(`cifra_crista:church_profile:v1:${userId}`);
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
    await AsyncStorage.setItem(`cifra_crista:worship_setlists:v1:${userId}`, JSON.stringify(next));
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

    return Share.share({ message: lines.join('\n') });
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
    const term = normalizeSearch(q.trim());
    if (!term) {
      setSongClaimSongs([]);
      return;
    }

    const pattern = `%${term}%`;
    setSongClaimLoading(true);
    try {
      const [{ data: byTitle, error: byTitleErr }, { data: matchedArtists, error: matchedArtistsErr }] =
        await Promise.all([
          supabase
            .from('songs')
            .select('id,title,category,artist_id,artists(name)')
            .ilike('title_search', pattern)
            .order('views', { ascending: false })
            .limit(20),
          supabase.from('artists').select('id').ilike('name_search', pattern).limit(10)
        ]);
      if (byTitleErr) throw byTitleErr;
      if (matchedArtistsErr) throw matchedArtistsErr;

      let byArtist: any[] = [];
      const ids = (matchedArtists ?? []).map((row) => row.id).filter(Boolean);
      if (ids.length) {
        const { data, error } = await supabase
          .from('songs')
          .select('id,title,category,artist_id,artists(name)')
          .in('artist_id', ids)
          .order('views', { ascending: false })
          .limit(20);
        if (error) throw error;
        byArtist = data ?? [];
      }

      const dedup = new Map<string, any>();
      for (const row of [...(byTitle ?? []), ...byArtist]) dedup.set(row.id, row);
      setSongClaimSongs(Array.from(dedup.values()).slice(0, 20));
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
                  openSupportEmail(
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
                  openSupportEmail(
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
                onPress={() =>
                  openSupportEmail(
                    'Sugestão de música - Cifra Cristã',
                    'Qual música você quer ver aqui?\\n\\nTítulo:\\nArtista/Ministério:\\nLink de referência (opcional):\\n'
                  )
                }
              >
                <View style={styles.actionLeft}>
                  <Ionicons name="musical-note-outline" size={18} color={colors.text} />
                  <Text style={styles.actionText}>Sugerir música</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.muted} />
              </TouchableOpacity>
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
                <TouchableOpacity style={styles.pillPrimary} onPress={openNewSetlist} activeOpacity={0.9}>
                  <Ionicons name="add" size={16} color="#fff" />
                  <Text style={styles.pillPrimaryText}>Criar escala</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.pillSecondary}
                  onPress={() => Alert.alert('Em breve', 'Entrar por codigo da igreja/grupo sera adicionado em breve.')}
                  activeOpacity={0.9}
                >
                  <Ionicons name="key-outline" size={16} color={colors.text} />
                  <Text style={styles.pillSecondaryText}>Entrar por codigo</Text>
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
                    Monte o repertorio e a equipe. Voce pode compartilhar por mensagem.
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
  groupActionsRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
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
  }
});
