import { useCallback, useEffect, useMemo, useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  ActivityIndicator,
  FlatList,
  Image,
  ImageBackground,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useFocusEffect } from '@react-navigation/native';
import { normalizeSearch } from '@cifras/shared';
import { fetchArtists, fetchSongs } from '../lib/api';
import { colors, radii, shadows } from '../lib/theme';

const heroImages = [
  'https://images.unsplash.com/photo-1485579149621-3123dd979885?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=900&q=80'
];

const chartImages = [
  'https://images.unsplash.com/photo-1522199755839-a2bacb67c546?auto=format&fit=crop&w=200&q=80',
  'https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=200&q=80',
  'https://images.unsplash.com/photo-1485579149621-3123dd979885?auto=format&fit=crop&w=200&q=80',
  'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=200&q=80'
];

type CategoryTab = { label: string; value: string | null };

// Values MUST match what's stored in Supabase (`songs.category`).
const categoryTabs: CategoryTab[] = [
  { label: 'Todos', value: null },
  { label: 'Louvor', value: 'Louvor' },
  { label: 'Adoração', value: 'Adoracao' },
  { label: 'Hinos', value: 'Hinos' },
  { label: 'Harpa Cristã', value: 'Harpa Crista' }
];

type CuratedSongRef = { title: string; artist?: string };
type CuratedSelectionDef = {
  id: string;
  title: string;
  subtitle: string;
  songs: CuratedSongRef[];
};

const curatedSelectionDefs: CuratedSelectionDef[] = [
  {
    id: 'ceia',
    title: 'Ceia: sangue e aliança',
    subtitle: 'Pra aquele momento de gratidão e consagração.',
    songs: [
      { title: 'Nada Além do Sangue', artist: 'Fernandinho' },
      { title: 'Seu Sangue', artist: 'Fernandinho' },
      { title: 'O Poder da Cruz', artist: 'Aline Barros' },
      { title: 'Ousado Amor', artist: 'Isaías Saad' },
      { title: 'Pra Sempre', artist: 'Fernandinho' },
      { title: 'Te Agradeço', artist: 'Diante do Trono' },
      { title: 'Consagração', artist: 'Aline Barros' },
      { title: 'Porque Ele Vive', artist: 'Harpa Cristã' },
      { title: 'Ao Único', artist: 'Corinhos Evangélicos' }
    ]
  },
  {
    id: 'avivamento',
    title: 'Avivamento: fogo no altar',
    subtitle: 'Pra levantar a igreja e cantar com força.',
    songs: [
      { title: 'Atos 2', artist: 'Gabriela Rocha' },
      { title: 'Caia Fogo', artist: 'Fernandinho' },
      { title: 'Faz Chover', artist: 'Fernandinho' },
      { title: 'Santo Espírito', artist: 'Laura Souguellis' },
      { title: 'Espirito Santo', artist: 'Fernanda Brum' },
      { title: 'Vem Me Buscar', artist: 'Jefferson & Suellen' },
      { title: 'O Fogo Arderá', artist: 'Alexsander Lúcio' },
      { title: 'Quero Conhecer Jesus', artist: 'Alessandro Vilas Boas' },
      { title: 'Yeshua', artist: 'Fernandinho' }
    ]
  },
  {
    id: 'vigilia',
    title: 'Vigília: madrugada de adoração',
    subtitle: 'Pra ir fundo, sem pressa.',
    songs: [
      { title: 'Lugar Secreto', artist: 'Gabriela Rocha' },
      { title: 'Oceanos (Oceans)', artist: 'Ana Nóbrega' },
      { title: 'Santo Pra Sempre', artist: 'Gabriel Guedes' },
      { title: 'Oh, Quão Lindo Esse Nome É (What A Beautiful Name)', artist: 'Ana Nóbrega' },
      { title: 'A Casa É Sua', artist: 'Casa Worship' },
      { title: 'Em Teus Braços', artist: 'Laura Souguellis' },
      { title: 'Vim Para Adorar-Te', artist: 'Adoração & Adoradores' },
      { title: 'Canção do Apocalipse', artist: 'Diante do Trono' },
      { title: 'Nada Pode Calar Um Adorador', artist: 'Eyshila' }
    ]
  },
  {
    id: 'amigos',
    title: 'Roda de violão',
    subtitle: 'Pra tocar com amigos, sem complicar.',
    songs: [
      { title: 'Grande É o Senhor', artist: 'Adhemar de Campos' },
      { title: 'Aclame Ao Senhor', artist: 'Diante do Trono' },
      { title: 'Com Muito Louvor', artist: 'Cassiane' },
      { title: 'Deus É Deus', artist: 'Delino Marçal' },
      { title: 'Deus de Promessas  (part. Simone Mendes)', artist: 'Davi Sacer' },
      { title: 'Ao Único', artist: 'Corinhos Evangélicos' },
      { title: 'A Alegria Está No Coração', artist: 'Corinhos Evangélicos' },
      { title: 'Poderoso Deus', artist: 'David Quinlan' },
      { title: 'Preciso de Ti', artist: 'Diante do Trono' }
    ]
  }
];

export default function HomeScreen({ navigation }: any) {
  const [songs, setSongs] = useState<any[]>([]);
  const [artists, setArtists] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [songsError, setSongsError] = useState<string | null>(null);
  const [artistsError, setArtistsError] = useState<string | null>(null);
  const [offlineNotice, setOfflineNotice] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const tabBarHeight = useBottomTabBarHeight();

  const SONGS_CACHE_KEY = 'cifra_crista:songs_cache:v3';
  const ARTISTS_CACHE_KEY = 'cifra_crista:artists_cache:v3';

  const loadSongs = useCallback(async () => {
    setSongsError(null);
    try {
      const data = await fetchSongs();
      setSongs(data);
      setOfflineNotice(null);
      // Bump cache version to avoid pinning users to old datasets after imports.
      await AsyncStorage.setItem(SONGS_CACHE_KEY, JSON.stringify(data));
    } catch (err: any) {
      const cached =
        (await AsyncStorage.getItem(SONGS_CACHE_KEY)) ??
        (await AsyncStorage.getItem('cifra_crista:songs_cache:v2'));
      if (cached) {
        try {
          setSongs(JSON.parse(cached));
        } catch {
          // ignore
        }
        setOfflineNotice('Sem conexão. Mostrando dados salvos no aparelho.');
        return;
      }
      throw err;
    }
  }, []);

  const loadArtists = useCallback(async () => {
    setArtistsError(null);
    try {
      const data = await fetchArtists();
      setArtists(data);
      await AsyncStorage.setItem(ARTISTS_CACHE_KEY, JSON.stringify(data));
    } catch (err: any) {
      const cached =
        (await AsyncStorage.getItem(ARTISTS_CACHE_KEY)) ??
        (await AsyncStorage.getItem('cifra_crista:artists_cache:v2'));
      if (cached) {
        try {
          setArtists(JSON.parse(cached));
        } catch {
          // ignore
        }
        setOfflineNotice('Sem conexão. Mostrando dados salvos no aparelho.');
        return;
      }
      throw err;
    }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadSongs().catch((err) => {
          const message = err instanceof Error ? err.message : 'Falha ao carregar músicas.';
          setSongsError(message);
          setSongs([]);
        }),
        loadArtists().catch((err) => {
          const message = err instanceof Error ? err.message : 'Falha ao carregar artistas.';
          setArtistsError(message);
          setArtists([]);
        })
      ]);
    } finally {
      setLoading(false);
    }
  }, [loadArtists, loadSongs]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useFocusEffect(
    useCallback(() => {
      // Refresh when returning to Home, useful after data imports.
      loadAll();
    }, [loadAll])
  );

  const songsFiltered = activeCategory
    ? songs.filter((song) => {
        const cat = song.category ?? 'Louvor';
        return cat === activeCategory;
      })
    : songs;

  const topSongs = songsFiltered.slice(0, 10);
  const heroSongs = songsFiltered.length >= 3 ? songsFiltered.slice(0, 3) : songs.slice(0, 3);

  const artistIdsForCategory = new Set(songsFiltered.map((song) => song.artist_id).filter(Boolean));
  const popularArtists =
    activeCategory === 'Todos'
      ? artists.slice(0, 8)
      : artists.filter((artist) => artistIdsForCategory.has(artist.id)).slice(0, 8);

  const heroCards = [
    ...heroSongs.map((song, index) => ({
      title: song.title,
      subtitle: song.artists?.name ?? 'Artista',
      image: heroImages[index % heroImages.length],
      songId: song.id,
      tag: index === 2 ? 'Guitarra' : null,
      color: index === 0 ? '#4a1d00' : index === 1 ? '#2b2b2b' : '#5c2a00'
    }))
  ];

  const curatedSelections = useMemo(() => {
    if (!songs.length) return [];

    // Fast lookup by normalized title_search.
    const byTitle = new Map<string, any[]>();
    for (const song of songs) {
      const key = normalizeSearch(song?.title_search ?? song?.title ?? '');
      if (!key) continue;
      const bucket = byTitle.get(key) ?? [];
      bucket.push(song);
      byTitle.set(key, bucket);
    }

    const pickSong = (ref: CuratedSongRef): any | null => {
      const titleKey = normalizeSearch(ref.title);
      const artistKey = ref.artist ? normalizeSearch(ref.artist) : null;
      const bucket = byTitle.get(titleKey) ?? [];
      if (!bucket.length) return null;

      const candidates = artistKey
        ? bucket.filter((song) => normalizeSearch(song?.artists?.name ?? '') === artistKey)
        : bucket;

      if (!candidates.length) return null;

      // Prefer the most popular match when duplicates exist.
      return [...candidates].sort((a, b) => (b?.views ?? 0) - (a?.views ?? 0))[0] ?? null;
    };

    return curatedSelectionDefs
      .map((def) => {
        const unique = new Map<string, any>();
        for (const ref of def.songs) {
          const song = pickSong(ref);
          if (song?.id && !unique.has(song.id)) unique.set(song.id, song);
        }
        return { ...def, songsResolved: Array.from(unique.values()) };
      })
      .filter((def) => def.songsResolved.length >= 4);
  }, [songs]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={topSongs}
        keyExtractor={(item) => item.id}
        refreshing={refreshing}
        onRefresh={async () => {
          setRefreshing(true);
          try {
            await loadAll();
          } finally {
            setRefreshing(false);
          }
        }}
        contentContainerStyle={{ paddingBottom: tabBarHeight + 24 }}
        ListHeaderComponent={
          <View style={styles.headerWrap}>
            <View style={styles.headerTop}>
              <Text style={styles.brandText}>
                Cifra <Text style={styles.brandAccent}>Cristã</Text>
              </Text>
            </View>

            <TextInput
              style={styles.input}
              placeholder="O que você quer tocar hoje?"
              placeholderTextColor={colors.muted}
              value={query}
              onChangeText={setQuery}
              returnKeyType="search"
              onSubmitEditing={() => {
                const q = query.trim();
                if (!q) return;
                navigation.navigate('Search', { q });
              }}
            />

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
              {categoryTabs.map((chip) => (
                <TouchableOpacity
                  key={chip.value ?? 'all'}
                  style={[styles.chip, chip.value === activeCategory && styles.chipActive]}
                  onPress={() => {
                    setActiveCategory(chip.value);
                  }}
                >
                  <Text style={chip.value === activeCategory ? styles.chipTextActive : styles.chipText}>
                    {chip.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {offlineNotice ? (
              <View style={styles.offlineBanner}>
                <Text style={styles.offlineText}>{offlineNotice}</Text>
              </View>
            ) : null}

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.heroRow}>
              {heroCards.map((card, index) => (
                <TouchableOpacity
                  key={`${card.title}-${index}`}
                  style={[styles.heroCard, { backgroundColor: card.color }]}
                  onPress={() => navigation.navigate('Song', { id: card.songId })}
                >
                  <View style={styles.heroThumb}>
                    <Image source={{ uri: card.image }} style={styles.heroThumbImage} />
                  </View>
                  <View style={styles.heroContent}>
                    <Text style={styles.heroTitle}>{card.title}</Text>
                    <Text style={styles.heroSubtitle}>{card.subtitle}</Text>
                  </View>
                  <View style={styles.heroActions}>
                    <View style={styles.heroButton}>
                      <Text style={styles.heroButtonText}>Abrir cifra</Text>
                    </View>
                    {card.tag ? (
                      <View style={styles.heroChip}>
                        <Text style={styles.heroChipText}>{card.tag}</Text>
                      </View>
                    ) : null}
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>Músicas em alta</Text>
              <TouchableOpacity
                onPress={() => navigation.navigate('Songs', { category: activeCategory })}
              >
                <Text style={styles.sectionAction}>Ver mais</Text>
              </TouchableOpacity>
            </View>

            {songsError ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorTitle}>Não foi possível carregar as músicas</Text>
                <Text style={styles.errorText}>{songsError}</Text>
                <TouchableOpacity style={styles.errorButton} onPress={loadAll}>
                  <Text style={styles.errorButtonText}>Tentar novamente</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        }
        ListFooterComponent={
          <View style={styles.footerWrap}>
            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>Artistas populares</Text>
              <TouchableOpacity onPress={() => navigation.navigate('Artists')}>
                <Text style={styles.sectionAction}>Ver mais</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.artistRow}>
              {popularArtists.map((artist, index) => (
                <TouchableOpacity
                  key={artist.id}
                  style={styles.artistCard}
                  onPress={() => navigation.navigate('ArtistDetail', { id: artist.id, name: artist.name })}
                >
                  <Image
                    source={{ uri: chartImages[index % chartImages.length] }}
                    style={styles.artistImage}
                  />
                  <View style={styles.artistNameRow}>
                    <Text style={styles.artistName}>{artist.name}</Text>
                    {artist.verified_at ? <Ionicons name="checkmark-circle" size={14} color={colors.accent} /> : null}
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {artistsError ? (
              <View style={styles.errorInline}>
                <Text style={styles.errorText}>{artistsError}</Text>
              </View>
            ) : null}

            {curatedSelections.length ? (
              <View style={{ marginTop: 22 }}>
                <View style={styles.sectionRow}>
                  <Text style={styles.sectionTitle}>Seleções prontas</Text>
                </View>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.selectionRow}>
                  {curatedSelections.map((sel, index) => (
                    <TouchableOpacity
                      key={sel.id}
                      style={styles.selectionCard}
                      onPress={() =>
                        navigation.navigate('Selection', {
                          title: sel.title,
                          subtitle: sel.subtitle,
                          songs: sel.songsResolved
                        })
                      }
                      activeOpacity={0.92}
                    >
                      <ImageBackground
                        source={{ uri: heroImages[index % heroImages.length] }}
                        style={styles.selectionBg}
                        imageStyle={styles.selectionBgImage}
                      >
                        <View style={styles.selectionOverlay} />
                        <View style={styles.selectionContent}>
                          <View style={styles.selectionTop}>
                            <Text style={styles.selectionKicker}>SELECAO</Text>
                            <View style={styles.selectionCountPill}>
                              <Text style={styles.selectionCountText}>{sel.songsResolved.length} músicas</Text>
                            </View>
                          </View>

                          <View style={styles.selectionText}>
                            <Text style={styles.selectionTitle} numberOfLines={2}>
                              {sel.title}
                            </Text>
                            <Text style={styles.selectionSubtitle} numberOfLines={2}>
                              {sel.subtitle}
                            </Text>
                          </View>

                          <View style={styles.selectionCtaRow}>
                            <View style={styles.selectionButton}>
                              <Text style={styles.selectionButtonText}>Abrir lista</Text>
                            </View>
                            <Text style={styles.selectionHint}>Toque e comece</Text>
                          </View>
                        </View>
                      </ImageBackground>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item, index }) => (
          <TouchableOpacity
            style={styles.chartItem}
            onPress={() => navigation.navigate('Song', { id: item.id })}
          >
            <Text style={styles.chartRank}>{String(index + 1).padStart(2, '0')}</Text>
            <Image source={{ uri: chartImages[index % chartImages.length] }} style={styles.chartAvatar} />
            <View style={styles.chartText}>
              <Text style={styles.chartTitle}>{item.title}</Text>
              <Text style={styles.chartSubtitle}>{item.artists?.name ?? 'Artista'}</Text>
            </View>
            <Text style={styles.chartMore}>⋮</Text>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  headerWrap: { paddingHorizontal: 16, paddingTop: 8, gap: 12 },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start'
  },
  brandText: { fontSize: 20, fontWeight: '900', color: colors.text },
  brandAccent: { color: colors.accent },
  input: {
    backgroundColor: colors.card,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text
  },
  chipRow: { marginTop: 4 },
  chip: {
    backgroundColor: '#f2f2f2',
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: radii.pill,
    marginRight: 8
  },
  chipActive: { backgroundColor: colors.text },
  chipText: { color: colors.text, fontWeight: '600' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  offlineBanner: {
    marginTop: 8,
    borderRadius: radii.md,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 8,
    paddingHorizontal: 12
  },
  offlineText: { color: colors.text, fontWeight: '700' },
  heroRow: { marginTop: 4 },
  heroCard: {
    width: 300,
    height: 270,
    borderRadius: radii.lg,
    marginRight: 12,
    padding: 18,
    justifyContent: 'space-between',
    alignItems: 'center',
    ...shadows.card
  },
  heroThumb: {
    width: 140,
    height: 140,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    overflow: 'hidden'
  },
  heroThumbImage: { width: '100%', height: '100%' },
  heroContent: { gap: 4, alignItems: 'center' },
  heroTitle: { color: '#fff', fontSize: 22, fontWeight: '800', textAlign: 'center' },
  heroSubtitle: { color: '#bdf6dd', fontWeight: '700', textAlign: 'center' },
  heroActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  heroButton: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radii.pill,
    alignSelf: 'flex-start'
  },
  heroButtonText: { color: '#fff', fontWeight: '600', fontSize: 12 },
  heroChip: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radii.pill
  },
  heroChipText: { color: '#fff', fontWeight: '600', fontSize: 12 },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    marginBottom: 8,
    paddingHorizontal: 16
  },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  sectionAction: { color: colors.muted, fontWeight: '600' },
  errorBox: {
    marginTop: 6,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#fafafa',
    padding: 14,
    gap: 8
  },
  errorTitle: { fontWeight: '800', color: colors.text },
  errorText: { color: colors.muted },
  errorButton: {
    backgroundColor: colors.text,
    paddingVertical: 10,
    borderRadius: radii.pill,
    alignItems: 'center'
  },
  errorButtonText: { color: '#fff', fontWeight: '800' },
  errorInline: { paddingHorizontal: 16, paddingTop: 10 },
  chartItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  chartRank: { color: colors.muted, fontWeight: '700', minWidth: 26 },
  chartAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#eee' },
  chartText: { flex: 1 },
  chartTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  chartSubtitle: { color: colors.muted },
  chartMore: { fontSize: 18, color: colors.muted },
  footerWrap: { paddingBottom: 32 },
  artistRow: { paddingHorizontal: 16 },
  artistCard: { alignItems: 'center', marginRight: 14, width: 88 },
  artistImage: { width: 70, height: 70, borderRadius: 35, marginBottom: 6 },
  artistNameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  artistName: { textAlign: 'center', fontSize: 12, fontWeight: '600', color: colors.text },
  carouselRow: { paddingHorizontal: 16, marginBottom: 10 },

  selectionRow: { paddingHorizontal: 16, marginTop: 6 },
  selectionCard: {
    width: 310,
    height: 180,
    borderRadius: radii.lg,
    overflow: 'hidden',
    marginRight: 12,
    ...shadows.card
  },
  selectionBg: { width: '100%', height: '100%' },
  selectionBgImage: { width: '100%', height: '100%' },
  selectionOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)'
  },
  selectionContent: { flex: 1, padding: 16, justifyContent: 'space-between' },
  selectionTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  selectionKicker: {
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '900',
    letterSpacing: 1.2,
    fontSize: 12
  },
  selectionCountPill: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.12)'
  },
  selectionCountText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  selectionText: { gap: 6 },
  selectionTitle: { color: '#fff', fontSize: 20, fontWeight: '900' },
  selectionSubtitle: { color: 'rgba(255,255,255,0.85)', fontWeight: '700' },
  selectionCtaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  selectionButton: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(0,0,0,0.15)'
  },
  selectionButtonText: { color: '#fff', fontWeight: '900', fontSize: 12 },
  selectionHint: { color: 'rgba(255,255,255,0.8)', fontWeight: '700', fontSize: 12 }
});
