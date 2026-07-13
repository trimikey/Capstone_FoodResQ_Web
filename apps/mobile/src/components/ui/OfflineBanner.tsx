import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { mobileColors as COLORS } from '@/theme/design';

export function OfflineBanner() {
  const { isOffline } = useNetworkStatus();
  if (!isOffline) return null;

  return (
    <View
      style={styles.banner}
      accessibilityRole="alert"
      accessibilityLabel="Mất kết nối mạng. FoodResQ sẽ thử lại khi có mạng."
    >
      <MaterialCommunityIcons name="wifi-off" size={16} color={COLORS.warning} />
      <Text style={styles.text}>Đang offline. Một số dữ liệu sẽ tự tải lại khi có mạng.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    left: 12,
    right: 12,
    top: 52,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#facc15',
    backgroundColor: '#fffbeb',
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  text: { flex: 1, color: '#854d0e', fontSize: 12, fontWeight: '700' },
});
