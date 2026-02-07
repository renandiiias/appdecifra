import { useCallback, useEffect, useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
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
import { useFocusEffect } from '@react-navigation/native';
import { fetchArtists } from '../lib/api';
import { normalizeSearch } from '@cifras/shared';
import { colors, radii } from '../lib/theme';

export default function ArtistsScreen({ navigation }: any) {
  const [artists, setArtists] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const tabBarHeight = useBottomTabBarHeight();

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const data = await fetchArtists();
      setArtists(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao carregar artistas.';
      setError(message);
      setArtists([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const normalizedQuery = normalizeSearch(query.trim());
  const filteredArtists = normalizedQuery
    ? artists.filter((artist) => {
        const hay = typeof artist.name_search === 'string' ? artist.name_search : normalizeSearch(artist.name ?? '');
        return hay.includes(normalizedQuery);
      })
    : artists;

  const grouped = filteredArtists.reduce((acc: Record<string, any[]>, artist) => {
    const letter = artist.name?.[0]?.toUpperCase() ?? '#';
    if (!acc[letter]) acc[letter] = [];
    acc[letter].push(artist);
    return acc;
  }, {});

  const letters = Object.keys(grouped).sort();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Artistas</Text>
        <TouchableOpacity
          style={styles.searchButton}
          onPress={() => {
            setSearchOpen((v) => !v);
            if (searchOpen) setQuery('');
          }}
        >
          <Ionicons name={searchOpen ? 'close' : 'search'} size={22} color={colors.text} />
        </TouchableOpacity>
      </View>
      {searchOpen ? (
        <View style={styles.searchWrap}>
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar artista"
            placeholderTextColor={colors.muted}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            autoCapitalize="none"
            autoFocus
            returnKeyType="search"
          />
        </View>
      ) : null}
      {loading ? (
        <ActivityIndicator />
      ) : (
        <FlatList
          data={normalizedQuery ? filteredArtists : letters}
          keyExtractor={(item) => (typeof item === 'string' ? item : item.id)}
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            try {
              await load();
            } finally {
              setRefreshing(false);
            }
          }}
          ListHeaderComponent={
            error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorTitle}>Não foi possível carregar os artistas</Text>
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity style={styles.errorButton} onPress={load}>
                  <Text style={styles.errorButtonText}>Tentar novamente</Text>
                </TouchableOpacity>
              </View>
            ) : null
          }
          contentContainerStyle={{ paddingBottom: tabBarHeight + 24 }}
          renderItem={({ item }) => {
            if (typeof item !== 'string') {
              return (
                <TouchableOpacity
                  style={styles.searchResult}
                  onPress={() => navigation.navigate('ArtistDetail', { id: item.id, name: item.name })}
                >
                  <Text style={styles.cardTitle}>{item.name}</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                </TouchableOpacity>
              );
            }

            return (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{item}</Text>
                {grouped[item].map((artist) => (
                  <TouchableOpacity
                    key={artist.id}
                    style={styles.listItem}
                    onPress={() => navigation.navigate('ArtistDetail', { id: artist.id, name: artist.name })}
                  >
                    <Text style={styles.cardTitle}>{artist.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 24, fontWeight: '800', color: colors.text },
  searchButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.chip,
    borderWidth: 1,
    borderColor: colors.border
  },
  searchWrap: { paddingHorizontal: 16, paddingBottom: 12 },
  searchInput: {
    backgroundColor: colors.card,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text
  },
  errorBox: {
    marginHorizontal: 16,
    marginBottom: 10,
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
  section: { paddingHorizontal: 16, marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8, color: colors.text },
  listItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  searchResult: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  cardTitle: { fontWeight: '600', color: colors.text }
});
