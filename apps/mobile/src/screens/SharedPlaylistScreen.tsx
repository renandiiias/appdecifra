import { useCallback, useEffect, useMemo, useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import Constants from 'expo-constants';
import { supabase } from '../lib/supabase';
import {
  createLocalFavoriteFolder,
  enqueueFavoriteChange,
  getLocalFavoriteFolders,
  getLocalFavorites,
  setLocalFavoriteFolderForSong,
  setLocalFavorites
} from '../lib/offline';
import { colors, radii, shadows } from '../lib/theme';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';

function extractPlaylistId(raw: string): string | null {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  const m = text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/iu);
  return m ? m[0] : null;
}

function buildWebPlaylistUrl(playlistId: string) {
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
}

export default function SharedPlaylistScreen({ navigation, route }: any) {
  const playlistId: string | null = extractPlaylistId(route?.params?.playlistId ?? '') ?? null;
  const tabBarHeight = useBottomTabBarHeight();

  const [playlist, setPlaylist] = useState<any | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [importOpen, setImportOpen] = useState(false);
  const [folders, setFolders] = useState<{ id: string; name: string }[]>([]);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [importing, setImporting] = useState(false);

  const title = String(playlist?.title ?? 'Playlist');
  const count = items.length;

  const load = useCallback(async () => {
    if (!playlistId) {
      setError('Link inválido.');
      setLoading(false);
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const { data: pl, error: plErr } = await supabase
        .from('shared_playlists')
        .select('id,title,description,is_public,created_at')
        .eq('id', playlistId)
        .single();
      if (plErr) throw plErr;
      setPlaylist(pl);

      const { data, error: itemsErr } = await supabase
        .from('shared_playlist_items')
        .select('song_id,added_at,songs(id,title,category,artists(name))')
        .eq('playlist_id', playlistId)
        .order('added_at', { ascending: false })
        .limit(400);
      if (itemsErr) throw itemsErr;
      setItems(data ?? []);
    } catch (err: any) {
      const message = err instanceof Error ? err.message : 'Não foi possível carregar a playlist.';
      setError(message);
      setPlaylist(null);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [playlistId]);

  useEffect(() => {
    load();
  }, [load]);

  const loadFolders = useCallback(async () => {
    const list = await getLocalFavoriteFolders();
    setFolders(list.map((f) => ({ id: f.id, name: f.name })).sort((a, b) => a.name.localeCompare(b.name)));
  }, []);

  const openImport = useCallback(async () => {
    await loadFolders();
    setCreatingFolder(false);
    setNewFolderName('');
    setImportOpen(true);
  }, [loadFolders]);

  const closeImport = useCallback(() => {
    Keyboard.dismiss();
    setImportOpen(false);
    setCreatingFolder(false);
    setNewFolderName('');
  }, []);

  const ensureLoggedIn = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user ?? null;
    if (!user) {
      Alert.alert('Entre para continuar', 'Faça login na aba Conta para importar playlists.');
      return null;
    }
    return user;
  }, []);

  const importToFolder = useCallback(
    async (folderId: string | null) => {
      const user = await ensureLoggedIn();
      if (!user) return;
      if (!playlistId) return;
      if (importing) return;
      if (!items.length) return Alert.alert('Playlist vazia', 'Não há músicas para importar.');

      setImporting(true);
      try {
        const localFavs = await getLocalFavorites();
        const localSet = new Set(localFavs);

        const songIds = items
          .map((row) => String(row.song_id ?? row?.songs?.id ?? '').trim())
          .filter(Boolean);

        const toAdd: string[] = [];
        for (const id of songIds) {
          if (!localSet.has(id)) {
            toAdd.push(id);
            localSet.add(id);
          }
        }

        if (!toAdd.length) {
          closeImport();
          Alert.alert('Pronto', 'Você já tem todas as músicas dessa playlist nos seus favoritos.');
          return;
        }

        const nextLocal = [...localFavs, ...toAdd];
        await setLocalFavorites(nextLocal);

        for (const songId of toAdd) {
          await setLocalFavoriteFolderForSong(songId, folderId);
          await enqueueFavoriteChange({ songId, action: 'add', folderId });
        }

        closeImport();
        Alert.alert('Importado', `${toAdd.length} ${toAdd.length === 1 ? 'música adicionada' : 'músicas adicionadas'} aos seus favoritos.`);
      } catch {
        Alert.alert('Erro', 'Não foi possível importar agora. Tente novamente.');
      } finally {
        setImporting(false);
      }
    },
    [closeImport, ensureLoggedIn, importing, items, playlistId]
  );

  const sharePlaylist = useCallback(async () => {
    if (!playlistId) return;
    const url = buildWebPlaylistUrl(playlistId);
    try {
      await Share.share({
        message: url ? `${title}\n${url}` : `${title}\nID: ${playlistId}`
      });
    } catch {
      // ignore
    }
  }, [playlistId, title]);

  const rows = useMemo(() => {
    return items
      .map((row) => {
        const song = row.songs ?? null;
        if (!song) return null;
        return {
          id: String(song.id),
          title: String(song.title ?? ''),
          artist: String(song.artists?.name ?? 'Artista'),
          category: song.category ?? null
        };
      })
      .filter(Boolean) as { id: string; title: string; artist: string; category?: string | null }[];
  }, [items]);

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
            {count} {count === 1 ? 'música' : 'músicas'}
          </Text>
        </View>
        <TouchableOpacity style={styles.iconButton} onPress={sharePlaylist} hitSlop={10}>
          <Ionicons name="share-outline" size={20} color={colors.text} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>Não foi possível carregar</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.errorButton} onPress={load}>
            <Text style={styles.errorButtonText}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={styles.topActions}>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={openImport}
              activeOpacity={0.9}
              disabled={!rows.length}
            >
              <Ionicons name="download-outline" size={18} color="#fff" />
              <Text style={styles.primaryButtonText}>Importar para meus favoritos</Text>
            </TouchableOpacity>
          </View>

          <FlatList
            data={rows}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingBottom: tabBarHeight + 24 }}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('Song', { id: item.id })}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.rowTitle}>{item.title}</Text>
                  <Text style={styles.rowSubtitle}>{item.artist}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.muted} />
              </TouchableOpacity>
            )}
            ListEmptyComponent={<Text style={styles.empty}>Playlist vazia.</Text>}
          />
        </>
      )}

      <Modal visible={importOpen} transparent animationType="fade" onRequestClose={closeImport}>
        <Pressable style={styles.sheetBackdrop} onPress={closeImport}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
            style={{ width: '100%' }}
          >
            <Pressable
              style={styles.sheet}
              onPress={(event) => {
                event.stopPropagation();
              }}
            >
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>Importar para</Text>
              <Text style={styles.sheetSubtitle}>Escolha a pasta onde salvar as músicas importadas.</Text>

              <View style={styles.sheetCard}>
                <TouchableOpacity style={styles.sheetRow} onPress={() => void importToFolder(null)}>
                  <View style={styles.sheetRowLeft}>
                    <Ionicons name="bookmark-outline" size={18} color={colors.text} />
                    <Text style={styles.sheetRowText}>Sem pasta</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                </TouchableOpacity>

                {folders.map((folder) => (
                  <TouchableOpacity
                    key={folder.id}
                    style={styles.sheetRow}
                    onPress={() => void importToFolder(folder.id)}
                  >
                    <View style={styles.sheetRowLeft}>
                      <Ionicons name="folder-outline" size={18} color={colors.text} />
                      <Text style={styles.sheetRowText}>{folder.name}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.createRow}>
                {creatingFolder ? (
                  <View style={{ gap: 10 }}>
                    <TextInput
                      style={styles.input}
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
                        setFolders((prev) => [...prev, { id: folder.id, name: folder.name }].sort((a, b) => a.name.localeCompare(b.name)));

                        const { data } = await supabase.auth.getSession();
                        const userId = data.session?.user.id;
                        if (userId) {
                          await supabase.from('favorite_folders').insert({ id: folder.id, user_id: userId, name: folder.name } as any);
                        }

                        setCreatingFolder(false);
                        setNewFolderName('');
                      }}
                    />
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <TouchableOpacity style={styles.secondaryButton} onPress={() => setCreatingFolder(false)} activeOpacity={0.9}>
                        <Text style={styles.secondaryButtonText}>Cancelar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.primarySolidButton}
                        onPress={async () => {
                          const name = newFolderName.trim();
                          if (!name) return;
                          Keyboard.dismiss();
                          const folder = await createLocalFavoriteFolder(name);
                          setFolders((prev) => [...prev, { id: folder.id, name: folder.name }].sort((a, b) => a.name.localeCompare(b.name)));
                          const { data } = await supabase.auth.getSession();
                          const userId = data.session?.user.id;
                          if (userId) {
                            await supabase.from('favorite_folders').insert({ id: folder.id, user_id: userId, name: folder.name } as any);
                          }
                          setCreatingFolder(false);
                          setNewFolderName('');
                        }}
                        activeOpacity={0.9}
                      >
                        <Text style={styles.primarySolidButtonText}>Criar</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity style={styles.addFolderButton} onPress={() => setCreatingFolder(true)} activeOpacity={0.9}>
                    <Ionicons name="add" size={18} color={colors.text} />
                    <Text style={styles.addFolderButtonText}>Criar nova pasta</Text>
                  </TouchableOpacity>
                )}
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
  backButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  iconButton: {
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { color: colors.muted, paddingHorizontal: 16, paddingTop: 20 },

  topActions: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  primaryButton: {
    borderRadius: radii.pill,
    backgroundColor: colors.text,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
    ...shadows.card
  },
  primaryButtonText: { color: '#fff', fontWeight: '900' },

  row: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  rowTitle: { fontWeight: '800', color: colors.text },
  rowSubtitle: { color: colors.muted, fontWeight: '700' },

  errorBox: {
    margin: 16,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#fafafa',
    padding: 14,
    gap: 8
  },
  errorTitle: { fontWeight: '900', color: colors.text },
  errorText: { color: colors.muted, fontWeight: '700' },
  errorButton: {
    backgroundColor: colors.text,
    paddingVertical: 10,
    borderRadius: radii.pill,
    alignItems: 'center'
  },
  errorButtonText: { color: '#fff', fontWeight: '900' },

  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 18,
    borderWidth: 1,
    borderColor: colors.border
  },
  sheetHandle: {
    width: 44,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#d6d6d6',
    alignSelf: 'center',
    marginBottom: 10
  },
  sheetTitle: { fontSize: 18, fontWeight: '900', color: colors.text },
  sheetSubtitle: { color: colors.muted, fontWeight: '700', marginTop: 4, marginBottom: 12 },
  sheetCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    backgroundColor: colors.card
  },
  sheetRow: {
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  sheetRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sheetRowText: { fontWeight: '800', color: colors.text },

  createRow: { marginTop: 12 },
  addFolderButton: {
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10
  },
  addFolderButtonText: { fontWeight: '900', color: colors.text },
  input: {
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingVertical: 12,
    paddingHorizontal: 14,
    color: colors.text,
    fontWeight: '800'
  },
  secondaryButton: {
    flex: 1,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingVertical: 12,
    alignItems: 'center'
  },
  secondaryButtonText: { fontWeight: '900', color: colors.text },
  primarySolidButton: {
    flex: 1,
    borderRadius: radii.pill,
    backgroundColor: colors.text,
    paddingVertical: 12,
    alignItems: 'center'
  },
  primarySolidButtonText: { fontWeight: '900', color: '#fff' }
});

