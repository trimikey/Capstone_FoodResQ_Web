import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

/**
 * Đơn của tôi — placeholder cho Luồng 3 (Reservation & QR).
 * Dev B: thay bằng FlashList reservation + useReservations(); chi tiết QR ở /(app)/orders/[id].
 */
export default function OrdersTab() {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Text variant="headlineSmall" style={styles.title}>
        Đơn của tôi
      </Text>
      <View style={styles.placeholder}>
        <Text variant="bodySmall" style={styles.placeholderText}>
          [Luồng 3] Reservation & QR — chưa triển khai
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20, paddingTop: 8 },
  title: { fontWeight: '700' },
  placeholder: {
    flex: 1,
    marginTop: 24,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: { color: '#9ca3af' },
});
