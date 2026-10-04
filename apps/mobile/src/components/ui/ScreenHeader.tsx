import { ReactNode } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { NotificationBell } from '../NotificationBell';
import { BackButton } from './BackButton';
import { mobileColors as COLORS, spacing } from '@/theme/design';

interface Props {
  title: string;
  /** Ẩn chuông thông báo nếu cần (mặc định hiện). */
  showBell?: boolean;
  /** Nội dung tuỳ chỉnh bên phải (ghi đè chuông). */
  right?: ReactNode;
  /** Hiện nút quay lại bên trái — cho màn mở từ màn khác, không phải tab. */
  showBack?: boolean;
}

/** Header dùng chung cho các tab provider: tiêu đề trái + chuông thông báo phải. */
export function ScreenHeader({ title, showBell = true, right, showBack = false }: Props) {
  return (
    <View style={styles.header}>
      <View style={styles.left}>
        {showBack ? <BackButton /> : null}
        <Text variant="titleLarge" style={styles.title}>
          {title}
        </Text>
      </View>
      {right ?? (showBell ? <NotificationBell /> : null)}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 56,
    paddingHorizontal: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { fontWeight: '700', color: COLORS.onSurface },
});
