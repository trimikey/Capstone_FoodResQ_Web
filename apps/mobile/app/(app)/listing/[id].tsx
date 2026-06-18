import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { Stack, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

/**
 * Chi tiết listing + form đặt chỗ.
 * TODO [T2.5]: useListingDetail(id) -> ảnh, info provider, hạn dùng.
 * TODO [T3.2]: form chọn quantity + ghi chú -> useCreateReservation() -> điều hướng /order/[id].
 */
export default function ListingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ headerShown: true, title: 'Chi tiết' }} />
      <Text variant="titleLarge">Listing #{id}</Text>
      <View style={styles.body}>
        <Text style={styles.todo}>
          TODO: useListingDetail(id) + nút Đặt chỗ (useCreateReservation)
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  body: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  todo: { color: '#9ca3af' },
});
