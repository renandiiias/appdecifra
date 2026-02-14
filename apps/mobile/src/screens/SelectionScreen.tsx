import { useMemo } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  FlatList,
  Image,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { colors, radii } from '../lib/theme';

const chartImages = [
  'https://images.unsplash.com/photo-1522199755839-a2bacb67c546?auto=format&fit=crop&w=200&q=80',
  'https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=200&q=80',
  'https://images.unsplash.com/photo-1485579149621-3123dd979885?auto=format&fit=crop&w=200&q=80',
  'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=200&q=80'
];

export default function SelectionScreen({ navigation, route }: any) {
  const tabBarHeight = useBottomTabBarHeight();
  const title = route?.params?.title ?? 'Seleção';
  const subtitle = route?.params?.subtitle ?? '';
  const songs = Array.isArray(route?.params?.songs) ? route.params.songs : [];

  const items = useMemo(() => {
    // De-dup by id and keep given order.
    const unique = new Map<string, any>();
    for (const song of songs) {
      if (!song?.id) continue;
      if (!unique.has(song.id)) unique.set(song.id, song);
    }
    return Array.from(unique.values());
  }, [songs]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: tabBarHeight + 24 }}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.emptyTitle}>Nada por aqui ainda</Text>
            <Text style={styles.emptyText}>Essa seleção não tem músicas disponíveis no momento.</Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <TouchableOpacity style={styles.item} onPress={() => navigation.navigate('Song', { id: item.id })}>
            <Text style={styles.rank}>{String(index + 1).padStart(2, '0')}</Text>
            <Image source={{ uri: chartImages[index % chartImages.length] }} style={styles.avatar} />
            <View style={styles.itemText}>
              <Text style={styles.itemTitle} numberOfLines={2}>
                {item.title}
              </Text>
              <Text style={styles.itemSubtitle} numberOfLines={1}>
                {item.artists?.name ?? 'Artista'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </TouchableOpacity>
        )}
      />
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
  emptyTitle: { fontSize: 18, fontWeight: '900', color: colors.text, textAlign: 'center' },
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
  rank: { width: 30, color: colors.muted, fontWeight: '900' },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#eee' },
  itemText: { flex: 1, gap: 2 },
  itemTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  itemSubtitle: { color: colors.muted, fontWeight: '600' },
  pill: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingVertical: 6,
    paddingHorizontal: 10
  }
});

