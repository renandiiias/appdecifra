import { useCallback, useEffect, useMemo, useState } from 'react';
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { fetchSearchSuggestions, fetchSongs, type SearchSuggestion } from '../lib/api';
import { buildSearchTerms, normalizeSearch } from '@cifras/shared';
import { colors, radii } from '../lib/theme';

const RECENT_SEARCHES_KEY = 'cifra_crista:recent_searches:v1';
const RECENT_SEARCHES_LIMIT = 8;
const EMPTY_SUGGESTIONS = ['grandioso es tu', 'ao unico', 'hinos', 'morada', 'isaias saad'];

export default function SearchScreen({ navigation, route }: any) {
  const initialQuery = typeof route?.params?.q === 'string' ? route.params.q : '';
  const tabRoot = Boolean(route?.params?.tabRoot);
  const [query, setQuery] = useState(initialQuery);
  const [songs, setSongs] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [recentQueries, setRecentQueries] = useState<string[]>([]);
  const tabBarHeight = useBottomTabBarHeight();

  const preparedQuery = useMemo(() => query.trim(), [query]);
  const debouncedQuery = useMemo(() => normalizeSearch(preparedQuery), [preparedQuery]);
  const suggestedTerms = useMemo(() => {
    if (!debouncedQuery) return EMPTY_SUGGESTIONS;
    return Array.from(new Set([...buildSearchTerms(preparedQuery), ...EMPTY_SUGGESTIONS]))
      .filter((term) => term !== debouncedQuery)
      .slice(0, 6);
  }, [debouncedQuery, preparedQuery]);

  const persistRecentQueries = useCallback((entries: string[]) => {
    AsyncStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(entries)).catch(() => {
      // ignore persistence errors
    });
  }, []);

  const rememberQuery = useCallback(
    (raw: string) => {
      const value = raw.trim();
      if (!value) return;

      setRecentQueries((current) => {
        const currentWithoutDupes = current.filter(
          (entry) => normalizeSearch(entry) !== normalizeSearch(value)
        );
        const next = [value, ...currentWithoutDupes].slice(0, RECENT_SEARCHES_LIMIT);
        persistRecentQueries(next);
        return next;
      });
    },
    [persistRecentQueries]
  );

  const clearRecentQueries = useCallback(() => {
    setRecentQueries([]);
    AsyncStorage.removeItem(RECENT_SEARCHES_KEY).catch(() => {
      // ignore persistence errors
    });
  }, []);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(RECENT_SEARCHES_KEY)
      .then((value) => {
        if (!mounted || !value) return;
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) setRecentQueries(parsed.filter((entry) => typeof entry === 'string').slice(0, RECENT_SEARCHES_LIMIT));
      })
      .catch(() => {
        if (mounted) setRecentQueries([]);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    if (!debouncedQuery) {
      setSongs([]);
      setSuggestions([]);
      setLoading(false);
      setSuggestionsLoading(false);
      return;
    }

    setLoading(true);
    setSuggestionsLoading(true);
    const timer = setTimeout(() => {
      Promise.allSettled([fetchSongs(preparedQuery), fetchSearchSuggestions(preparedQuery)]).then((results) => {
        if (!mounted) return;

        const [songsResult, suggestionsResult] = results;
        if (songsResult.status === 'fulfilled') setSongs(songsResult.value ?? []);
        else setSongs([]);

        if (suggestionsResult.status === 'fulfilled') setSuggestions(suggestionsResult.value ?? []);
        else setSuggestions([]);

        setLoading(false);
        setSuggestionsLoading(false);
      });
    }, 250);

    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, [debouncedQuery, preparedQuery]);

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
          onSubmitEditing={() => {
            rememberQuery(preparedQuery);
            Keyboard.dismiss();
          }}
        />
        {preparedQuery ? (
          <TouchableOpacity
            style={styles.clearButton}
            onPress={() => {
              setQuery('');
              Keyboard.dismiss();
            }}
          >
            <Ionicons name="close-circle" size={22} color={colors.muted} />
          </TouchableOpacity>
        ) : null}
      </View>

      <TouchableWithoutFeedback onPress={() => Keyboard.dismiss()} accessible={false}>
        <View style={{ flex: 1 }}>
          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator />
            </View>
          ) : !debouncedQuery ? (
            <View style={styles.center}>
              <Pressable onPress={() => Keyboard.dismiss()}>
                <Text style={styles.emptyTitle}>Busque uma música</Text>
                <Text style={styles.emptyText}>Digite acima para encontrar por título ou artista.</Text>
              </Pressable>

              <View style={styles.chipsWrap}>
                {suggestedTerms.slice(0, 4).map((term) => (
                  <TouchableOpacity key={term} style={styles.chip} onPress={() => setQuery(term)}>
                    <Text style={styles.chipText}>{term}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {recentQueries.length ? (
                <View style={styles.recentWrap}>
                  <View style={styles.recentHeader}>
                    <Text style={styles.recentTitle}>Buscas recentes</Text>
                    <TouchableOpacity onPress={clearRecentQueries}>
                      <Text style={styles.recentClear}>Limpar</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.chipsWrap}>
                    {recentQueries.map((term) => (
                      <TouchableOpacity
                        key={term}
                        style={styles.chip}
                        onPress={() => {
                          setQuery(term);
                          rememberQuery(term);
                        }}
                      >
                        <Text style={styles.chipText}>{term}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ) : null}
            </View>
          ) : songs.length === 0 ? (
            <Pressable style={styles.center} onPress={() => Keyboard.dismiss()}>
              <Text style={styles.emptyTitle}>Nenhum resultado</Text>
              <Text style={styles.emptyText}>Tente palavras mais simples ou escolha uma sugestão.</Text>
              {suggestionsLoading ? <ActivityIndicator style={{ marginTop: 8 }} /> : null}
              {suggestions.length ? (
                <View style={styles.suggestionsBlock}>
                  <Text style={styles.suggestionsTitle}>Sugestões</Text>
                  {suggestions.map((suggestion) => (
                    <TouchableOpacity
                      key={`${suggestion.kind}:${suggestion.value}`}
                      style={styles.suggestionItem}
                      onPress={() => {
                        setQuery(suggestion.value);
                        rememberQuery(suggestion.value);
                      }}
                    >
                      <Ionicons
                        name={suggestion.kind === 'artist' ? 'person-outline' : 'musical-notes-outline'}
                        size={18}
                        color={colors.muted}
                      />
                      <Text style={styles.suggestionText} numberOfLines={1}>
                        {suggestion.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}
              <View style={styles.chipsWrap}>
                {suggestedTerms.map((term) => (
                  <TouchableOpacity
                    key={term}
                    style={styles.chip}
                    onPress={() => {
                      setQuery(term);
                      rememberQuery(term);
                    }}
                  >
                    <Text style={styles.chipText}>{term}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Pressable>
          ) : (
            <FlatList
              data={songs}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ paddingBottom: tabBarHeight + 24 }}
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              keyboardShouldPersistTaps="handled"
              onScrollBeginDrag={() => Keyboard.dismiss()}
              ListHeaderComponent={
                suggestionsLoading || suggestions.length ? (
                  <View style={styles.suggestionsBlock}>
                    <View style={styles.suggestionsHeader}>
                      <Text style={styles.suggestionsTitle}>Sugestões</Text>
                      {suggestionsLoading ? <ActivityIndicator size="small" /> : null}
                    </View>
                    {suggestions.map((suggestion) => (
                      <TouchableOpacity
                        key={`${suggestion.kind}:${suggestion.value}`}
                        style={styles.suggestionItem}
                        onPress={() => {
                          setQuery(suggestion.value);
                          rememberQuery(suggestion.value);
                        }}
                      >
                        <Ionicons
                          name={suggestion.kind === 'artist' ? 'person-outline' : 'musical-notes-outline'}
                          size={18}
                          color={colors.muted}
                        />
                        <Text style={styles.suggestionText} numberOfLines={1}>
                          {suggestion.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null
              }
              renderItem={({ item, index }) => (
                <TouchableOpacity
                  style={styles.item}
                  onPress={() => {
                    rememberQuery(preparedQuery);
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
  clearButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center'
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
  chipsWrap: {
    marginTop: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: colors.card
  },
  chipText: { color: colors.text, fontWeight: '700' },
  recentWrap: {
    width: '100%',
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 12
  },
  recentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8
  },
  recentTitle: { color: colors.text, fontWeight: '800' },
  recentClear: { color: colors.muted, fontWeight: '700' },
  suggestionsBlock: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6
  },
  suggestionsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  suggestionsTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.3
  },
  suggestionItem: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  suggestionText: { color: colors.text, flex: 1, fontWeight: '700' },
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
