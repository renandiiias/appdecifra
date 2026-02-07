import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
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
import { fetchArtists, fetchSongs } from '../lib/api';
import { colors, radii, shadows } from '../lib/theme';

const heroImages = [
  'https://images.unsplash.com/photo-1485579149621-3123dd979885?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?auto=format&fit=crop&w=900&q=80'
];

const chartImages = [
  'https://images.unsplash.com/photo-1522199755839-a2bacb67c546?auto=format&fit=crop&w=200&q=80',
  'https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=200&q=80',
  'https://images.unsplash.com/photo-1485579149621-3123dd979885?auto=format&fit=crop&w=200&q=80',
  'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=200&q=80'
];

const lessonCards = [
  {
    title: 'Porque Ele Vive',
    meta: 'Hinos (Simplificada)',
    tag: 'Simplificada',
    image: 'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?auto=format&fit=crop&w=700&q=80'
  },
  {
    title: 'Rendido Estou',
    meta: 'Adoração (Simplificada)',
    tag: 'Simplificada',
    image: 'https://images.unsplash.com/photo-1485579149621-3123dd979885?auto=format&fit=crop&w=700&q=80'
  },
  {
    title: 'Ao Único',
    meta: 'Louvor (Completa)',
    tag: 'Completa',
    image: 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=700&q=80'
  }
];

const courseCards = [
  {
    title: 'Violão Iniciante',
    meta: 'Fundamentos para tocar no louvor',
    image: 'https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=700&q=80'
  },
  {
    title: 'Violão Intermediário',
    meta: 'Levadas, dinâmica e harmonia no culto',
    image: 'https://images.unsplash.com/photo-1522199755839-a2bacb67c546?auto=format&fit=crop&w=700&q=80'
  },
  {
    title: 'Fingerstyle',
    meta: 'Arranjos instrumentais para hinos',
    image: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=700&q=80'
  }
];

const articleCards = [
  {
    title: '5 hinos para tocar no violão (iniciante)',
    image: 'https://images.unsplash.com/photo-1485579149621-3123dd979885?auto=format&fit=crop&w=700&q=80'
  },
  {
    title: 'Como escolher a tonalidade para a congregação',
    image: 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=700&q=80'
  },
  {
    title: 'Capotraste no louvor: quando usar e como soar bem',
    image: 'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?auto=format&fit=crop&w=700&q=80'
  }
];

const categoryTabs = ['Todos', 'Louvor', 'Adoração', 'Hinos', 'Harpa Cristã', 'Mais'];

export default function HomeScreen({ navigation }: any) {
  const [songs, setSongs] = useState<any[]>([]);
  const [artists, setArtists] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [songsError, setSongsError] = useState<string | null>(null);
  const [artistsError, setArtistsError] = useState<string | null>(null);
  const [offlineNotice, setOfflineNotice] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('Todos');
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

  const songsFiltered =
    activeCategory === 'Todos'
      ? songs
      : songs.filter((song) => {
          if (!song.category) return activeCategory === 'Louvor';
          return song.category === activeCategory;
        });

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
    })),
    {
      title: 'Dicas, técnicas e curiosidades',
      subtitle: 'Blog da Cifra Cristã',
      image: 'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?auto=format&fit=crop&w=900&q=80',
      songId: null,
      tag: null,
      color: '#6b3a00'
    }
  ];

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
                  key={chip}
                  style={[styles.chip, chip === activeCategory && styles.chipActive]}
                  onPress={() => {
                    if (chip === 'Mais') return navigation.navigate('Maintenance');
                    setActiveCategory(chip);
                  }}
                >
                  <Text style={chip === activeCategory ? styles.chipTextActive : styles.chipText}>{chip}</Text>
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
                  onPress={() =>
                    card.songId
                      ? navigation.navigate('Song', { id: card.songId })
                      : navigation.navigate('Maintenance')
                  }
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
                      <Text style={styles.heroButtonText}>Aprender a tocar</Text>
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
                onPress={() => navigation.navigate('Songs', { category: activeCategory === 'Todos' ? null : activeCategory })}
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
                  <Text style={styles.artistName}>{artist.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {artistsError ? (
              <View style={styles.errorInline}>
                <Text style={styles.errorText}>{artistsError}</Text>
              </View>
            ) : null}

            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>Novas aulas</Text>
              <TouchableOpacity onPress={() => navigation.navigate('Maintenance')}>
                <Text style={styles.sectionAction}>Ver mais</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.carouselRow}>
              {lessonCards.map((lesson) => (
                <TouchableOpacity
                  key={lesson.title}
                  style={styles.lessonCard}
                  onPress={() => navigation.navigate('Maintenance')}
                >
                  <Image source={{ uri: lesson.image }} style={styles.lessonImage} />
                  <Text style={styles.lessonTag}>{lesson.tag}</Text>
                  <View style={styles.lessonBody}>
                    <Text style={styles.lessonTitle}>{lesson.title}</Text>
                    <Text style={styles.lessonMeta}>{lesson.meta}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>Cursos para você</Text>
              <TouchableOpacity onPress={() => navigation.navigate('Maintenance')}>
                <Text style={styles.sectionAction}>Liberar todos os cursos</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.carouselRow}>
              {courseCards.map((course) => (
                <TouchableOpacity
                  key={course.title}
                  style={styles.courseCard}
                  onPress={() => navigation.navigate('Maintenance')}
                >
                  <Image source={{ uri: course.image }} style={styles.courseImage} />
                  <View style={styles.courseBody}>
                    <Text style={styles.courseTitle}>{course.title}</Text>
                    <Text style={styles.courseMeta}>{course.meta}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>Leia tambem</Text>
              <TouchableOpacity onPress={() => navigation.navigate('Maintenance')}>
                <Text style={styles.sectionAction}>Ver mais</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.carouselRow}>
              {articleCards.map((article) => (
                <TouchableOpacity
                  key={article.title}
                  style={styles.articleCard}
                  onPress={() => navigation.navigate('Maintenance')}
                >
                  <Image source={{ uri: article.image }} style={styles.articleImage} />
                  <View style={styles.articleBody}>
                    <Text style={styles.articleTitle}>{article.title}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity style={styles.ctaBanner} onPress={() => navigation.navigate('Maintenance')}>
              <Image
                source={{
                  uri: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=1200&q=80'
                }}
                style={styles.ctaImage}
              />
              <View style={styles.ctaOverlay} />
              <View style={styles.ctaContent}>
                <Text style={styles.ctaTitle}>Toque mais e melhor</Text>
                <Text style={styles.ctaText}>Assine a Cifra Cristã e tenha acesso ilimitado.</Text>
                <View style={styles.ctaButton}>
                  <Text style={styles.ctaButtonText}>Explorar benefícios</Text>
                </View>
              </View>
            </TouchableOpacity>
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
  artistName: { textAlign: 'center', fontSize: 12, fontWeight: '600', color: colors.text },
  carouselRow: { paddingHorizontal: 16, marginBottom: 10 },
  lessonCard: {
    width: 240,
    borderRadius: radii.lg,
    backgroundColor: colors.card,
    marginRight: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border
  },
  lessonImage: { width: '100%', height: 140 },
  lessonTag: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: 'rgba(20,20,20,0.7)',
    color: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
    fontSize: 12,
    fontWeight: '600'
  },
  lessonBody: { padding: 12, gap: 4 },
  lessonTitle: { fontWeight: '700', color: colors.text },
  lessonMeta: { color: colors.muted, fontSize: 12 },
  courseCard: {
    width: 200,
    borderRadius: radii.lg,
    backgroundColor: colors.card,
    marginRight: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border
  },
  courseImage: { width: '100%', height: 140 },
  courseBody: { padding: 12, gap: 4 },
  courseTitle: { fontWeight: '700', color: colors.text },
  courseMeta: { color: colors.muted, fontSize: 12 },
  articleCard: {
    width: 220,
    borderRadius: radii.lg,
    backgroundColor: colors.card,
    marginRight: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border
  },
  articleImage: { width: '100%', height: 130 },
  articleBody: { padding: 12 },
  articleTitle: { fontWeight: '700', color: colors.text, fontSize: 13 },
  ctaBanner: {
    marginTop: 20,
    marginHorizontal: 16,
    borderRadius: radii.lg,
    overflow: 'hidden',
    height: 200
  },
  ctaImage: { width: '100%', height: '100%' },
  ctaOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  ctaContent: { position: 'absolute', left: 16, bottom: 16, right: 16, gap: 8 },
  ctaTitle: { color: '#fff', fontSize: 20, fontWeight: '700' },
  ctaText: { color: 'rgba(255,255,255,0.9)' },
  ctaButton: {
    backgroundColor: colors.accent,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radii.pill,
    alignSelf: 'flex-start'
  },
  ctaButtonText: { color: '#fff', fontWeight: '700', fontSize: 12 }
});
