import { useEffect, useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ActivityIndicator, FlatList, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { fetchSongs } from '../lib/api';
import { colors } from '../lib/theme';

export default function ArtistDetailScreen({ navigation, route }: any) {
  const { id, name } = route.params;
  const [songs, setSongs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const tabBarHeight = useBottomTabBarHeight();

  useEffect(() => {
    let mounted = true;
    fetchSongs(undefined, id)
      .then((data) => mounted && setSongs(data))
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, [id]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{name}</Text>
          <Text style={styles.subtitle}>{songs.length} músicas</Text>
        </View>
      </View>
      {loading ? (
        <ActivityIndicator />
      ) : (
        <FlatList
          data={songs}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: tabBarHeight + 24 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.listItem}
              onPress={() => navigation.navigate('Song', { id: item.id })}
            >
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardSubtitle}>{item.category ?? 'Louvor'}</Text>
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { padding: 16, flexDirection: 'row', alignItems: 'center', gap: 8 },
  backButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '800', color: colors.text },
  subtitle: { color: colors.muted },
  listItem: {
    paddingVertical: 12,
    marginHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  cardTitle: { fontWeight: '600', color: colors.text },
  cardSubtitle: { color: colors.muted }
});
