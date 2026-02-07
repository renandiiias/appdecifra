import { useCallback, useMemo, useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { supabase } from '../lib/supabase';
import {
  clearLocalFavoriteFolderForSong,
  getCachedSong,
  getLocalFavoriteFolderMap,
  getLocalFavorites,
  setLocalFavorites
} from '../lib/offline';
import { colors, radii } from '../lib/theme';

type FolderId = 'all' | 'none' | string;

export default function FavoritesFolderScreen({ navigation, route }: any) {
  const folderId: FolderId = (route?.params?.folderId as FolderId) ?? 'all';
  const title: string = typeof route?.params?.title === 'string' ? route.params.title : 'Favoritos';

  const [songs, setSongs] = useState<any[]>([]);
  const [folderMap, setFolderMap] = useState<Record<string, string | null>>({});
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const tabBarHeight = useBottomTabBarHeight();

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [ids, map] = await Promise.all([getLocalFavorites(), getLocalFavoriteFolderMap()]);
      setFolderMap(map);

      const filteredIds = ids.filter((id) => {
        if (folderId === 'all') return true;
        if (folderId === 'none') return !map[id];
        return map[id] === folderId;
      });

      const list = (await Promise.all(filteredIds.map((songId) => getCachedSong(songId)))).filter(Boolean);
      setSongs(list);
    } finally {
      setLoading(false);
    }
  }, [folderId]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return songs;
    return songs.filter(
      (song) => song.title?.toLowerCase().includes(q) || song.artists?.name?.toLowerCase().includes(q)
    );
  }, [query, songs]);

  const removeFavorite = useCallback(async (songId: string) => {
    const ids = await getLocalFavorites();
    const next = ids.filter((id) => id !== songId);
    await setLocalFavorites(next);
    await clearLocalFavoriteFolderForSong(songId);
    setSongs((prev) => prev.filter((s) => s.id !== songId));

    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) return;
    await supabase.from('favorites').delete().eq('song_id', songId).eq('user_id', userId);
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {songs.length} {songs.length === 1 ? 'cifra' : 'cifras'}
          </Text>
        </View>
      </View>

      <View style={styles.searchRow}>
        <Ionicons name="search-outline" size={18} color={colors.muted} />
        <TextInput
          style={styles.input}
          placeholder="Buscar nesta pasta"
          placeholderTextColor={colors.muted}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          returnKeyType="search"
        />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: tabBarHeight + 24 }}
          ListEmptyComponent={<Text style={styles.empty}>Sem cifras aqui ainda.</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('Song', { id: item.id })}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.rowTitle}>{item.title}</Text>
                <Text style={styles.rowSubtitle}>{item.artists?.name ?? 'Artista'}</Text>
              </View>
              <TouchableOpacity
                style={styles.removeButton}
                onPress={(e: any) => {
                  e?.stopPropagation?.();
                  removeFavorite(item.id);
                }}
                hitSlop={10}
              >
                <Ionicons name="bookmark" size={18} color={colors.text} />
              </TouchableOpacity>
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center'
  },
  title: { fontSize: 18, fontWeight: '900', color: colors.text },
  subtitle: { color: colors.muted, fontWeight: '700' },

  searchRow: {
    margin: 16,
    paddingHorizontal: 12,
    height: 44,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  input: { flex: 1, color: colors.text, fontWeight: '700' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { color: colors.muted, paddingHorizontal: 16 },

  row: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  rowTitle: { fontWeight: '700', color: colors.text },
  rowSubtitle: { color: colors.muted },
  removeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#f2f2f2',
    alignItems: 'center',
    justifyContent: 'center'
  }
});

