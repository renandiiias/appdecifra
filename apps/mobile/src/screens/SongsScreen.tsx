import { useCallback, useEffect, useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  ActivityIndicator,
  FlatList,
  Image,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { fetchSongsPage } from '../lib/api';
import { colors, radii } from '../lib/theme';

const chartImages = [
  'https://images.unsplash.com/photo-1522199755839-a2bacb67c546?auto=format&fit=crop&w=200&q=80',
  'https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=200&q=80',
  'https://images.unsplash.com/photo-1485579149621-3123dd979885?auto=format&fit=crop&w=200&q=80',
  'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=200&q=80'
];

const PAGE_SIZE = 20;

export default function SongsScreen({ navigation, route }: any) {
  const category = route?.params?.category ?? null;
  const [songs, setSongs] = useState<any[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tabBarHeight = useBottomTabBarHeight();

  const loadPage = useCallback(
    async (pageIndex: number, mode: 'replace' | 'append') => {
      const data = await fetchSongsPage({ page: pageIndex, pageSize: PAGE_SIZE, category });
      setHasMore(data.length === PAGE_SIZE);
      setPage(pageIndex);
      setSongs((prev) => (mode === 'replace' ? data : [...prev, ...data]));
    },
    [category]
  );

  const loadFirst = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      await loadPage(0, 'replace');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao carregar músicas.';
      setError(message);
      setSongs([]);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [loadPage]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      await loadPage(page + 1, 'append');
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, loadPage, page]);

  useEffect(() => {
    loadFirst();
  }, [loadFirst]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Músicas em alta</Text>
          {category ? <Text style={styles.subtitle}>{category}</Text> : null}
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Não foi possível carregar</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadFirst}>
            <Text style={styles.retryText}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={songs}
          keyExtractor={(item) => item.id}
          onRefresh={loadFirst}
          refreshing={false}
          contentContainerStyle={{ paddingBottom: tabBarHeight + 24 }}
          renderItem={({ item, index }) => (
            <TouchableOpacity style={styles.item} onPress={() => navigation.navigate('Song', { id: item.id })}>
              <Text style={styles.rank}>{String(index + 1).padStart(2, '0')}</Text>
              <Image source={{ uri: chartImages[index % chartImages.length] }} style={styles.avatar} />
              <View style={styles.itemText}>
                <Text style={styles.itemTitle}>{item.title}</Text>
                <Text style={styles.itemSubtitle}>{item.artists?.name ?? 'Artista'}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </TouchableOpacity>
          )}
          ListFooterComponent={
            <View style={{ paddingHorizontal: 16, paddingVertical: 18 }}>
              {hasMore ? (
                <TouchableOpacity style={styles.moreButton} onPress={loadMore} disabled={loadingMore}>
                  {loadingMore ? <ActivityIndicator color={colors.text} /> : <Text style={styles.moreText}>Ver mais</Text>}
                </TouchableOpacity>
              ) : (
                <Text style={styles.endText}>Fim da lista</Text>
              )}
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
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
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center'
  },
  title: { fontSize: 20, fontWeight: '900', color: colors.text },
  subtitle: { color: colors.muted, marginTop: 2, fontWeight: '700' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
  errorTitle: { fontSize: 18, fontWeight: '900', color: colors.text, textAlign: 'center' },
  errorText: { color: colors.muted, textAlign: 'center' },
  retryButton: {
    marginTop: 6,
    backgroundColor: colors.text,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: radii.pill
  },
  retryText: { color: '#fff', fontWeight: '800' },

  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  rank: { width: 30, color: colors.muted, fontWeight: '900' },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#eee' },
  itemText: { flex: 1, gap: 2 },
  itemTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  itemSubtitle: { color: colors.muted, fontWeight: '600' },

  moreButton: {
    backgroundColor: '#f2f2f2',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingVertical: 12,
    alignItems: 'center'
  },
  moreText: { fontWeight: '900', color: colors.text },
  endText: { textAlign: 'center', color: colors.muted, fontWeight: '700' }
});
