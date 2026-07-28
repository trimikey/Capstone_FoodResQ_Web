import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { mobileColors as COLORS, radius, spacing } from '@/theme/design';

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
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: COLORS.warning,
    backgroundColor: COLORS.warningContainer,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
  },
  text: { flex: 1, color: COLORS.onWarningContainer, fontSize: 12, fontWeight: '700' },
});
