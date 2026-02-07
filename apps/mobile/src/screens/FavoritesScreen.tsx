import { useCallback, useMemo, useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
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
  createLocalFavoriteFolder,
  getCachedSong,
  getLocalFavoriteFolderMap,
  getLocalFavoriteFolders,
  getLocalFavorites
} from '../lib/offline';
import { colors, radii, shadows } from '../lib/theme';

type FolderRow = {
  id: 'all' | 'none' | string;
  label: string;
  count: number;
  icon: any;
};

export default function FavoritesScreen({ navigation }: any) {
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [favoriteSongs, setFavoriteSongs] = useState<any[]>([]);
  const [folderMap, setFolderMap] = useState<Record<string, string | null>>({});
  const [folders, setFolders] = useState<{ id: string; name: string }[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const tabBarHeight = useBottomTabBarHeight();

  const [createOpen, setCreateOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [ids, map, localFolders] = await Promise.all([
        getLocalFavorites(),
        getLocalFavoriteFolderMap(),
        getLocalFavoriteFolders()
      ]);

      const songs = (await Promise.all(ids.map((songId) => getCachedSong(songId)))).filter(Boolean);
      setFavoriteIds(ids);
      setFavoriteSongs(songs);
      setFolderMap(map);
      setFolders(localFolders.map((f) => ({ id: f.id, name: f.name })).sort((a, b) => a.name.localeCompare(b.name)));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const folderRows = useMemo<FolderRow[]>(() => {
    const allCount = favoriteIds.length;
    const noneCount = favoriteIds.filter((id) => !folderMap[id]).length;

    const countsByFolder: Record<string, number> = {};
    for (const id of favoriteIds) {
      const folderId = folderMap[id];
      if (!folderId) continue;
      countsByFolder[folderId] = (countsByFolder[folderId] ?? 0) + 1;
    }

    return [
      { id: 'all', label: 'Todas as cifras', count: allCount, icon: 'heart-outline' },
      { id: 'none', label: 'Sem pasta', count: noneCount, icon: 'bookmark-outline' },
      ...folders.map((f) => ({
        id: f.id,
        label: f.name,
        count: countsByFolder[f.id] ?? 0,
        icon: 'folder-outline'
      }))
    ];
  }, [favoriteIds, folderMap, folders]);

  const queryResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return favoriteSongs.filter(
      (song) => song.title?.toLowerCase().includes(q) || song.artists?.name?.toLowerCase().includes(q)
    );
  }, [favoriteSongs, query]);

  const openCreateFolder = () => {
    setCreateOpen(true);
    setNewFolderName('');
  };

  const closeCreateFolder = () => {
    Keyboard.dismiss();
    setCreateOpen(false);
    setNewFolderName('');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Favoritos</Text>
          <TouchableOpacity style={styles.addFolderIcon} onPress={openCreateFolder}>
            <Ionicons name="add" size={22} color={colors.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.searchRow}>
          <Ionicons name="search-outline" size={18} color={colors.muted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar nos favoritos"
            placeholderTextColor={colors.muted}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            returnKeyType="search"
          />
          {query.trim() ? (
            <TouchableOpacity
              style={styles.clearButton}
              onPress={() => {
                setQuery('');
                Keyboard.dismiss();
              }}
              hitSlop={10}
            >
              <Ionicons name="close" size={18} color={colors.muted} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : query.trim() ? (
        <FlatList
          data={queryResults}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: tabBarHeight + 24 }}
          ListEmptyComponent={<Text style={styles.empty}>Nenhum favorito encontrado.</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.songRow} onPress={() => navigation.navigate('Song', { id: item.id })}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.songTitle}>{item.title}</Text>
                <Text style={styles.songSubtitle}>{item.artists?.name ?? 'Artista'}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.muted} />
            </TouchableOpacity>
          )}
        />
      ) : (
        <FlatList
          data={folderRows}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: 16, paddingBottom: tabBarHeight + 24, gap: 10 }}
          ListHeaderComponent={
            <View style={{ gap: 6 }}>
              <Text style={styles.sectionTitle}>Pastas</Text>
              <Text style={styles.sectionSubtitle}>Organize suas cifras salvas.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.folderCard}
              onPress={() =>
                navigation.navigate('FavoritesFolder', {
                  folderId: item.id,
                  title: item.label
                })
              }
              activeOpacity={0.9}
            >
              <View style={styles.folderIcon}>
                <Ionicons name={item.icon} size={18} color={colors.text} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.folderTitle}>{item.label}</Text>
                <Text style={styles.folderSubtitle}>{item.count} {item.count === 1 ? 'cifra' : 'cifras'}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.muted} />
            </TouchableOpacity>
          )}
        />
      )}

      <Modal visible={createOpen} transparent animationType="fade" onRequestClose={closeCreateFolder}>
        <Pressable style={styles.sheetBackdrop} onPress={closeCreateFolder}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
            style={{ width: '100%' }}
          >
            <Pressable style={styles.sheet} onPress={() => {}}>
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>Nova pasta</Text>
              <Text style={styles.sheetSubtitle}>Crie pastas para organizar seus favoritos.</Text>

              <TextInput
                style={styles.sheetInput}
                placeholder="Nome da pasta"
                placeholderTextColor={colors.muted}
                value={newFolderName}
                onChangeText={setNewFolderName}
                autoCapitalize="words"
                returnKeyType="done"
                onSubmitEditing={async () => {
                  const name = newFolderName.trim();
                  if (!name) return;
                  Keyboard.dismiss();

                  const folder = await createLocalFavoriteFolder(name);
                  setFolders((prev) =>
                    [...prev, { id: folder.id, name: folder.name }].sort((a, b) => a.name.localeCompare(b.name))
                  );

                  const { data } = await supabase.auth.getSession();
                  const userId = data.session?.user.id;
                  if (userId) {
                    await supabase.from('favorite_folders').insert({ id: folder.id, user_id: userId, name: folder.name } as any);
                  }

                  closeCreateFolder();
                }}
              />

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
                <TouchableOpacity style={styles.secondaryButton} onPress={closeCreateFolder}>
                  <Text style={styles.secondaryButtonText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={async () => {
                    const name = newFolderName.trim();
                    if (!name) return;
                    Keyboard.dismiss();

                    const folder = await createLocalFavoriteFolder(name);
                    setFolders((prev) =>
                      [...prev, { id: folder.id, name: folder.name }].sort((a, b) => a.name.localeCompare(b.name))
                    );

                    const { data } = await supabase.auth.getSession();
                    const userId = data.session?.user.id;
                    if (userId) {
                      await supabase.from('favorite_folders').insert({ id: folder.id, user_id: userId, name: folder.name } as any);
                    }

                    closeCreateFolder();
                  }}
                >
                  <Text style={styles.primaryButtonText}>Criar</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { color: colors.muted, paddingHorizontal: 16, textAlign: 'center' },

  header: { padding: 16 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 24, fontWeight: '900', color: colors.text },
  addFolderIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.chip,
    alignItems: 'center',
    justifyContent: 'center'
  },
  searchRow: {
    marginTop: 12,
    height: 44,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12
  },
  searchInput: { flex: 1, color: colors.text, fontWeight: '700' },
  clearButton: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },

  sectionTitle: { fontSize: 14, fontWeight: '900', color: colors.text },
  sectionSubtitle: { color: colors.muted, fontWeight: '700' },

  folderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    ...shadows.card
  },
  folderIcon: {
    width: 38,
    height: 38,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.chip,
    alignItems: 'center',
    justifyContent: 'center'
  },
  folderTitle: { fontWeight: '900', color: colors.text },
  folderSubtitle: { color: colors.muted, fontWeight: '700' },

  songRow: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  songTitle: { fontWeight: '700', color: colors.text },
  songSubtitle: { color: colors.muted },

  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 10
  },
  sheetHandle: {
    width: 44,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#d6d6d6',
    alignSelf: 'center',
    marginBottom: 8
  },
  sheetTitle: { fontSize: 20, fontWeight: '900', color: colors.text },
  sheetSubtitle: { color: colors.muted, fontWeight: '700' },
  sheetInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    backgroundColor: '#fff',
    fontWeight: '700'
  },
  primaryButton: {
    flex: 1,
    backgroundColor: colors.accent,
    paddingVertical: 12,
    borderRadius: 999,
    alignItems: 'center'
  },
  primaryButtonText: { color: '#fff', fontWeight: '900' },
  secondaryButton: {
    flex: 1,
    backgroundColor: colors.chip,
    paddingVertical: 12,
    borderRadius: 999,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border
  },
  secondaryButtonText: { color: colors.text, fontWeight: '900' }
});
