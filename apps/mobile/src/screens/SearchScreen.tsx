import { useEffect, useMemo, useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Keyboard,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View
} from 'react-native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { fetchSongs } from '../lib/api';
import { normalizeSearch } from '@cifras/shared';
import { colors, radii } from '../lib/theme';

export default function SearchScreen({ navigation, route }: any) {
  const initialQuery = typeof route?.params?.q === 'string' ? route.params.q : '';
  const tabRoot = Boolean(route?.params?.tabRoot);
  const [query, setQuery] = useState(initialQuery);
  const [songs, setSongs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const tabBarHeight = useBottomTabBarHeight();

  const debouncedQuery = useMemo(() => normalizeSearch(query.trim()), [query]);

  useEffect(() => {
    let mounted = true;
    const q = query.trim();
    if (!q) {
      setSongs([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const timer = setTimeout(() => {
      fetchSongs(q)
        .then((data) => mounted && setSongs(data))
        .catch(() => mounted && setSongs([]))
        .finally(() => mounted && setLoading(false));
    }, 250);

    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, [debouncedQuery, query]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        {!tabRoot ? (
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
        ) : null}
        <TextInput
          style={styles.input}
          placeholder="Buscar por título ou artista"
          placeholderTextColor={colors.muted}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          autoFocus
          returnKeyType="search"
          blurOnSubmit
          onSubmitEditing={() => Keyboard.dismiss()}
        />
      </View>

      <TouchableWithoutFeedback onPress={() => Keyboard.dismiss()} accessible={false}>
        <View style={{ flex: 1 }}>
          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator />
            </View>
          ) : !query.trim() ? (
            <Pressable style={styles.center} onPress={() => Keyboard.dismiss()}>
              <Text style={styles.emptyTitle}>Busque uma música</Text>
              <Text style={styles.emptyText}>Digite acima para encontrar por título ou artista.</Text>
            </Pressable>
          ) : songs.length === 0 ? (
            <Pressable style={styles.center} onPress={() => Keyboard.dismiss()}>
              <Text style={styles.emptyTitle}>Nenhum resultado</Text>
              <Text style={styles.emptyText}>Tente outro termo.</Text>
            </Pressable>
          ) : (
            <FlatList
              data={songs}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ paddingBottom: tabBarHeight + 24 }}
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              keyboardShouldPersistTaps="handled"
              onScrollBeginDrag={() => Keyboard.dismiss()}
              renderItem={({ item, index }) => (
                <TouchableOpacity
                  style={styles.item}
                  onPress={() => {
                    Keyboard.dismiss();
                    navigation.navigate('Song', { id: item.id });
                  }}
                >
                  <Image
                    source={{
                      uri: `https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=200&q=80&sig=${index}`
                    }}
                    style={styles.avatar}
                  />
                  <View style={styles.itemText}>
                    <Text style={styles.title}>{item.title}</Text>
                    <Text style={styles.subtitle}>
                      {item.artists?.name ?? 'Artista'} · {item.category ?? 'Louvor'}
                    </Text>
                  </View>
                  <Text style={styles.more}>›</Text>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </TouchableWithoutFeedback>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.card,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center'
  },
  input: {
    flex: 1,
    backgroundColor: colors.card,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: colors.text, textAlign: 'center' },
  emptyText: { color: colors.muted, textAlign: 'center' },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#eee' },
  itemText: { flex: 1, gap: 2 },
  title: { fontSize: 16, fontWeight: '700', color: colors.text },
  subtitle: { color: colors.muted },
  more: { color: colors.muted, fontSize: 18, fontWeight: '700' }
});
