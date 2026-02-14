import { useCallback, useEffect, useMemo, useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { fetchSongs } from '../lib/api';
import { supabase } from '../lib/supabase';
import { colors, radii, shadows } from '../lib/theme';

type OfficialLink = {
  label?: string;
  url?: string;
  kind?: string;
};

function normalizeLinks(value: any): OfficialLink[] {
  if (!value) return [];
  if (Array.isArray(value)) return value as OfficialLink[];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as OfficialLink[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export default function ArtistDetailScreen({ navigation, route }: any) {
  const { id, name: initialName } = route.params;
  const tabBarHeight = useBottomTabBarHeight();

  const [artist, setArtist] = useState<any | null>(null);
  const [artistLoading, setArtistLoading] = useState(true);

  const [songs, setSongs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const artistName = artist?.name ?? initialName ?? 'Artista';
  const verified = Boolean(artist?.verified_at);
  const highlight = typeof artist?.profile_highlight === 'string' ? artist.profile_highlight.trim() : '';
  const links = useMemo(() => normalizeLinks(artist?.official_links).filter((l) => l && l.url), [artist?.official_links]);

  const loadArtist = useCallback(async () => {
    setArtistLoading(true);
    try {
      const { data, error } = await supabase
        .from('artists')
        .select('id,name,verified_at,claimed_user_id,claimed_at,profile_highlight,official_links')
        .eq('id', id)
        .single();
      if (error) throw error;
      setArtist(data);
    } catch (err: any) {
      const message = err instanceof Error ? err.message : 'Falha ao carregar artista.';
      setArtist(null);
      Alert.alert('Erro', message);
    } finally {
      setArtistLoading(false);
    }
  }, [id]);

  const loadSongs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchSongs(undefined, id);
      setSongs(data ?? []);
    } catch {
      setSongs([]);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    let mounted = true;
    Promise.all([loadArtist(), loadSongs()]).finally(() => {
      if (!mounted) return;
    });
    return () => {
      mounted = false;
    };
  }, [loadArtist, loadSongs]);

  const openLink = useCallback(async (url: string) => {
    const finalUrl = String(url ?? '').trim();
    if (!finalUrl) return;
    try {
      await Linking.openURL(finalUrl);
    } catch {
      Alert.alert('Erro', 'Não foi possível abrir o link.');
    }
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </TouchableOpacity>

        <View style={{ flex: 1, gap: 6 }}>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={1}>
              {artistName}
            </Text>
            {verified ? (
              <View style={styles.verifiedSeal} accessibilityLabel="Artista verificado">
                <Ionicons name="checkmark-circle" size={16} color="#fff" />
              </View>
            ) : null}
          </View>
          <Text style={styles.subtitle}>{songs.length} músicas</Text>
        </View>
      </View>

      {artistLoading ? (
        <View style={{ paddingHorizontal: 16, paddingBottom: 10 }}>
          <ActivityIndicator />
        </View>
      ) : verified ? (
        <View style={styles.verifiedHero}>
          <View style={{ flex: 1, gap: 6 }}>
            <View style={styles.verifiedHeroTitleRow}>
              <Ionicons name="ribbon-outline" size={16} color="#fff" />
              <Text style={styles.verifiedHeroTitle}>Artista verificado</Text>
            </View>
            <Text style={styles.verifiedHeroSub}>
              {highlight || 'Links oficiais e destaque ativados para este perfil.'}
            </Text>
          </View>
        </View>
      ) : null}

      {verified && links.length ? (
        <View style={styles.linksCard}>
          <Text style={styles.linksTitle}>Links oficiais</Text>
          <View style={styles.linksGrid}>
            {links.slice(0, 6).map((link, idx) => (
              <TouchableOpacity
                key={`${link.url}-${idx}`}
                style={styles.linkChip}
                onPress={() => void openLink(String(link.url))}
                activeOpacity={0.9}
              >
                <Ionicons name="link-outline" size={16} color={colors.text} />
                <Text style={styles.linkChipText} numberOfLines={1}>
                  {String(link.label || link.kind || 'Link')}
                </Text>
                <Ionicons name="open-outline" size={16} color={colors.muted} />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : null}

      {loading ? (
        <ActivityIndicator />
      ) : (
        <FlatList
          data={songs}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: tabBarHeight + 24 }}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.listItem} onPress={() => navigation.navigate('Song', { id: item.id })}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardSubtitle}>{item.category ?? 'Louvor'}</Text>
            </TouchableOpacity>
          )}
          ListHeaderComponent={
            verified ? (
              <View style={{ height: 8 }} />
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { padding: 16, flexDirection: 'row', alignItems: 'center', gap: 8 },
  backButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 24, fontWeight: '900', color: colors.text, flexShrink: 1, minWidth: 0 },
  subtitle: { color: colors.muted, fontWeight: '700' },

  verifiedSeal: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center'
  },
  verifiedHero: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: radii.lg,
    backgroundColor: '#141414',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    ...shadows.card
  },
  verifiedHeroTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  verifiedHeroTitle: { color: '#fff', fontWeight: '900' },
  verifiedHeroSub: { color: 'rgba(255,255,255,0.82)', fontWeight: '800', fontSize: 12, lineHeight: 16 },

  linksCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: 14
  },
  linksTitle: { fontWeight: '900', color: colors.text, marginBottom: 10 },
  linksGrid: { gap: 8 },
  linkChip: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#fff',
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  linkChipText: { flex: 1, fontWeight: '900', color: colors.text },

  listItem: {
    paddingVertical: 12,
    marginHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  cardTitle: { fontWeight: '700', color: colors.text },
  cardSubtitle: { color: colors.muted }
});

