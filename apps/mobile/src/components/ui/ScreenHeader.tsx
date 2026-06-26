import { ReactNode } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { NotificationBell } from '../NotificationBell';

const COLORS = { onSurface: '#121c2a' };

interface Props {
  title: string;
  /** Ẩn chuông thông báo nếu cần (mặc định hiện). */
  showBell?: boolean;
  /** Nội dung tuỳ chỉnh bên phải (ghi đè chuông). */
  right?: ReactNode;
}

/** Header dùng chung cho các tab provider: tiêu đề trái + chuông thông báo phải. */
export function ScreenHeader({ title, showBell = true, right }: Props) {
  return (
    <View style={styles.header}>
      <Text variant="titleLarge" style={styles.title}>
        {title}
      </Text>
      {right ?? (showBell ? <NotificationBell /> : null)}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 56,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { fontWeight: '700', color: COLORS.onSurface },
});
