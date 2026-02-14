import { useCallback, useMemo, useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  SafeAreaView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import Constants from 'expo-constants';
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

  const ensureLoggedIn = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user ?? null;
    if (!user) {
      Alert.alert('Entre para continuar', 'Faça login na aba Conta para compartilhar playlists.');
      return null;
    }
    return user;
  }, []);

  const buildWebPlaylistUrl = useCallback((playlistId: string) => {
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
    return baseUrl ? `${baseUrl}/playlist/${playlistId}` : null;
  }, []);

  const shareFolder = useCallback(async () => {
    if (folderId === 'all' || folderId === 'none') {
      Alert.alert('Escolha uma pasta', 'Você pode compartilhar uma pasta específica (não “Todas” ou “Sem pasta”).');
      return;
    }

    const user = await ensureLoggedIn();
    if (!user) return;

    // Ensure the folder exists remotely (best effort).
    try {
      await supabase.from('favorite_folders').upsert({ id: folderId, user_id: user.id, name: title } as any, { onConflict: 'id' } as any);
    } catch {
      // ignore
    }

    try {
      const { data, error } = await (supabase as any).rpc('create_shared_playlist_for_folder', { p_folder_id: folderId });
      if (error) throw error;
      const playlistId = String(data ?? '').trim();
      if (!playlistId) throw new Error('Playlist inválida.');

      const url = buildWebPlaylistUrl(playlistId);
      await Share.share({
        message: url ? `${title}\n${url}` : `${title}\nID: ${playlistId}`
      });

      navigation.navigate('SharedPlaylist', { playlistId });
    } catch {
      Alert.alert('Erro', 'Não foi possível criar o link agora. Tente novamente.');
    }
  }, [buildWebPlaylistUrl, ensureLoggedIn, folderId, navigation, title]);

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
        {folderId !== 'all' && folderId !== 'none' ? (
          <TouchableOpacity style={styles.shareButton} onPress={shareFolder} hitSlop={10}>
            <Ionicons name="share-outline" size={20} color={colors.text} />
          </TouchableOpacity>
        ) : null}
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
  shareButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border
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
