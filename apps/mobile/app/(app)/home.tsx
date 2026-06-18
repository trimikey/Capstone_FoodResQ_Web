import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/hooks/useAuth';

/**
 * Trang chủ — placeholder cho Luồng 2 (Search & Listing).
 * Dev B: thay phần dưới bằng SearchBar + FlashList<ListingCard> + useListings().
 */
export default function HomeTab() {
  const { user } = useAuth();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Text variant="headlineSmall" style={styles.greeting}>
        Xin chào{user?.name ? `, ${user.name}` : ''} 👋
      </Text>
      <Text variant="bodyMedium" style={styles.subtitle}>
        Tìm kiếm thực phẩm gần bạn sẽ xuất hiện ở đây.
      </Text>

      <View style={styles.placeholder}>
        <Text variant="bodySmall" style={styles.placeholderText}>
          [Luồng 2] Search & Listing — chưa triển khai
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20, paddingTop: 8 },
  greeting: { fontWeight: '700' },
  subtitle: { color: '#6b7280', marginTop: 4 },
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
