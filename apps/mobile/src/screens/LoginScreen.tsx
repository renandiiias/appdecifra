import { useEffect, useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  Alert,
  Linking,
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
import { fetchArtists } from '../lib/api';
import { normalizeSearch } from '@cifras/shared';

const SUPPORT_EMAIL = 'suporte@cifracrista.app';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [isArtist, setIsArtist] = useState(false);
  const [artistVerified, setArtistVerified] = useState(false);
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
  const tabBarHeight = useBottomTabBarHeight();

  useEffect(() => {
    let mounted = true;

    const syncSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      const user = data.session?.user ?? null;
      setUserEmail(user?.email ?? null);
      const name =
        (typeof user?.user_metadata?.name === 'string' && user.user_metadata.name) ||
        (typeof user?.user_metadata?.full_name === 'string' && user.user_metadata.full_name) ||
        '';
      setDisplayName(name);
      const artistFlag =
        typeof user?.user_metadata?.is_artist === 'boolean' ? user.user_metadata.is_artist : false;
      setIsArtist(artistFlag);
      const verifiedFlag =
        typeof user?.user_metadata?.artist_verified === 'boolean' ? user.user_metadata.artist_verified : false;
      setArtistVerified(verifiedFlag);
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
    if (!songClaimOpen) return;
    const q = songClaimQuery.trim();
    const timer = setTimeout(() => {
      searchSongsForClaim(q);
    }, 220);
    return () => clearTimeout(timer);
  }, [songClaimOpen, songClaimQuery]);

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
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Perfil</Text>
              <Text style={styles.subtitle}>Logado como {userEmail}</Text>
              <View style={styles.row}>
                <Ionicons name="person-outline" size={18} color={colors.muted} />
                <TextInput
                  style={styles.rowInput}
                  placeholder="Seu nome"
                  placeholderTextColor={colors.muted}
                  value={displayName}
                  onChangeText={setDisplayName}
                />
              </View>
              <TouchableOpacity style={styles.button} onPress={updateName}>
                <Text style={styles.buttonText}>Salvar nome</Text>
              </TouchableOpacity>
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

              <View style={styles.badgeRow}>
                <View style={[styles.badge, artistVerified ? styles.badgeOk : styles.badgeMuted]}>
                  <Ionicons
                    name={artistVerified ? 'checkmark-circle' : 'time-outline'}
                    size={14}
                    color={artistVerified ? '#065f46' : colors.muted}
                  />
                  <Text style={artistVerified ? styles.badgeTextOk : styles.badgeTextMuted}>
                    {artistVerified ? 'Verificado' : 'Nao verificado'}
                  </Text>
                </View>
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
  claimPickTextActive: { color: colors.accent, fontWeight: '900' }
});
