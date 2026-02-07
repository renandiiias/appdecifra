import { SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, radii } from '../lib/theme';

export default function MaintenanceScreen({ navigation }: any) {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Em manutenção</Text>
        <Text style={styles.subtitle}>
          Estamos finalizando esta área. Em breve ela estará disponível.
        </Text>
        <TouchableOpacity style={styles.button} onPress={() => navigation.goBack()}>
          <Text style={styles.buttonText}>Voltar</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 16 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    gap: 12
  },
  title: { fontSize: 22, fontWeight: '700', color: colors.text },
  subtitle: { color: colors.muted },
  button: {
    backgroundColor: colors.accent,
    paddingVertical: 10,
    borderRadius: radii.pill,
    alignItems: 'center',
    marginTop: 8
  },
  buttonText: { color: '#fff', fontWeight: '700' }
});
