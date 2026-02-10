import { useEffect, useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import CifraView from '../components/CifraView';
import { fetchSong } from '../lib/api';
import { supabase } from '../lib/supabase';
import {
  cacheSong,
  clearLocalFavoriteFolderForSong,
  createLocalFavoriteFolder,
  enqueueFavoriteChange,
  getCachedSong,
  getLocalFavorites,
  getLocalFavoriteFolders,
  setLocalFavoriteFolderForSong,
  setLocalFavorites,
  syncFavorites
} from '../lib/offline';
import { colors } from '../lib/theme';

export default function SongScreen({ route, navigation }: any) {
  const { id } = route.params;
  const [song, setSong] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);
  const [folders, setFolders] = useState<{ id: string; name: string }[]>([]);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user.id ?? null);
      if (data.session?.user.id) {
        syncFavorites(data.session.user.id);
      }
    });

    fetchSong(id)
      .then(async (data) => {
        if (!mounted) return;
        setSong(data);
        await cacheSong(data);
      })
      .catch(async () => {
        const cached = await getCachedSong(id);
        if (mounted) setSong(cached);
      })
      .finally(() => mounted && setLoading(false));

    getLocalFavorites().then((favorites) => {
      if (mounted) setIsFavorite(favorites.includes(id));
    });

    return () => {
      mounted = false;
    };
  }, [id]);

  const loadFolders = async () => {
    const list = await getLocalFavoriteFolders();
    setFolders(list.map((f) => ({ id: f.id, name: f.name })));
  };

  const removeFavorite = async () => {
    const favorites = await getLocalFavorites();
    const nextFavorites = favorites.filter((fav) => fav !== id);
    await setLocalFavorites(nextFavorites);
    await clearLocalFavoriteFolderForSong(id);
    setIsFavorite(false);

    if (!userId) {
      Alert.alert('Entre para sincronizar favoritos');
      return;
    }

    try {
      await supabase.from('favorites').delete().eq('song_id', id).eq('user_id', userId);
    } catch (error) {
      await enqueueFavoriteChange({ songId: id, action: 'remove' });
    }
  };

  const addFavorite = async (folderId: string | null) => {
    const favorites = await getLocalFavorites();
    const nextFavorites = favorites.includes(id) ? favorites : [...favorites, id];
    await setLocalFavorites(nextFavorites);
    await setLocalFavoriteFolderForSong(id, folderId);
    setIsFavorite(true);

    if (!userId) {
      Alert.alert('Entre para sincronizar favoritos');
      return;
    }

    try {
      const payload: any = { song_id: id, user_id: userId };
      if (folderId) payload.folder_id = folderId;
      const { error } = await supabase.from('favorites').insert(payload);

      // If the DB schema hasn't been upgraded yet, fall back to the old insert.
      if (error && /column .*folder_id|schema cache|PGRST/iu.test(String((error as any).message ?? error))) {
        await supabase.from('favorites').insert({ song_id: id, user_id: userId });
      } else if (error) {
        throw error;
      }
    } catch (error) {
      await enqueueFavoriteChange({ songId: id, action: 'add', folderId });
    }
  };

  const toggleFavorite = async () => {
    if (isFavorite) return removeFavorite();
    await loadFolders();
    setFolderPickerOpen(true);
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!song) {
    return (
      <View style={styles.container}>
        <Text style={styles.subtitle}>Cifra indisponível offline.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CifraView
        song={song}
        isFavorite={isFavorite}
        onToggleFavorite={toggleFavorite}
        onBack={() => navigation.goBack()}
        onOpenMaintenance={() => navigation.navigate('Maintenance')}
        onOpenTuner={() => navigation.getParent()?.navigate('Afinador')}
      />

      <Modal visible={folderPickerOpen} transparent animationType="fade" onRequestClose={() => setFolderPickerOpen(false)}>
        <Pressable
          style={styles.sheetBackdrop}
          onPress={() => {
            setCreatingFolder(false);
            setNewFolderName('');
            setFolderPickerOpen(false);
          }}
        >
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
              <Text style={styles.sheetTitle}>Salvar em</Text>
              <Text style={styles.sheetSubtitle}>Escolha uma pasta para organizar seus favoritos.</Text>

              <View style={styles.sheetCard}>
                <TouchableOpacity
                  style={styles.sheetRow}
                  onPress={async () => {
                    setFolderPickerOpen(false);
                    await addFavorite(null);
                  }}
                >
                  <View style={styles.sheetRowLeft}>
                    <Ionicons name="heart-outline" size={18} color={colors.text} />
                    <Text style={styles.sheetRowText}>Sem pasta</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                </TouchableOpacity>

                {folders.map((folder) => (
                  <TouchableOpacity
                    key={folder.id}
                    style={styles.sheetRow}
                    onPress={async () => {
                      setFolderPickerOpen(false);
                      await addFavorite(folder.id);
                    }}
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
                        setFolders((prev) =>
                          [...prev, { id: folder.id, name: folder.name }].sort((a, b) => a.name.localeCompare(b.name))
                        );

                        if (userId) {
                          await supabase
                            .from('favorite_folders')
                            .insert({ id: folder.id, user_id: userId, name: folder.name } as any);
                        }

                        setCreatingFolder(false);
                        setNewFolderName('');
                      }}
                    />
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <TouchableOpacity
                        style={styles.secondaryButton}
                        onPress={() => {
                          Keyboard.dismiss();
                          setCreatingFolder(false);
                          setNewFolderName('');
                        }}
                      >
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

                          if (userId) {
                            await supabase
                              .from('favorite_folders')
                              .insert({ id: folder.id, user_id: userId, name: folder.name } as any);
                          }

                          setCreatingFolder(false);
                          setNewFolderName('');
                        }}
                      >
                        <Text style={styles.primaryButtonText}>Criar pasta</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.addFolderButton}
                    onPress={() => {
                      setCreatingFolder(true);
                    }}
                  >
                    <Ionicons name="add" size={18} color={colors.text} />
                    <Text style={styles.addFolderText}>Nova pasta</Text>
                  </TouchableOpacity>
                )}
              </View>

              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => {
                  Keyboard.dismiss();
                  setCreatingFolder(false);
                  setNewFolderName('');
                  setFolderPickerOpen(false);
                }}
              >
                <Text style={styles.closeButtonText}>Fechar</Text>
              </TouchableOpacity>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  subtitle: { color: colors.muted, padding: 16 },

  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10
  },
  sheetTitle: { fontSize: 20, fontWeight: '900', color: colors.text },
  sheetSubtitle: { color: colors.muted, fontWeight: '700' },
  sheetCard: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    borderRadius: 16,
    overflow: 'hidden'
  },
  sheetRow: {
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10
  },
  sheetRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  sheetRowText: { fontWeight: '900', color: colors.text, flex: 1 },

  createRow: { paddingTop: 6 },
  addFolderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#f2f2f2',
    alignSelf: 'flex-start'
  },
  addFolderText: { fontWeight: '900', color: colors.text },

  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
    color: colors.text,
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
    backgroundColor: '#f2f2f2',
    paddingVertical: 12,
    borderRadius: 999,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border
  },
  secondaryButtonText: { color: colors.text, fontWeight: '900' },
  closeButton: { backgroundColor: colors.text, paddingVertical: 10, borderRadius: 999, alignItems: 'center' },
  closeButtonText: { color: '#fff', fontWeight: '900' }
});
