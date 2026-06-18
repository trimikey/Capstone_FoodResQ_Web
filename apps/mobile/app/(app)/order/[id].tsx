import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { Stack, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

/**
 * Chi tiết đơn + QR pickup.
 * TODO [T3.5]: lấy reservation theo id, hiển thị <QRDisplay value={qrToken} />,
 * countdown 30 phút, checklist pickup.
 */
export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ headerShown: true, title: 'Đơn của tôi' }} />
      <Text variant="titleLarge">Đơn #{id}</Text>
      <View style={styles.body}>
        <Text style={styles.todo}>TODO: QRDisplay + countdown 30' + checklist</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  body: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  todo: { color: '#9ca3af' },
});
