import { ReactNode } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { NotificationBell } from '../NotificationBell';
import { mobileColors as COLORS, spacing } from '@/theme/design';

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
      <View style={styles.titleWrap}>
        <View style={styles.accent} />
        <Text variant="titleLarge" style={styles.title} numberOfLines={1}>
          {title}
        </Text>
      </View>
      {right ?? (showBell ? <NotificationBell /> : null)}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    minHeight: 64,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleWrap: { flex: 1, paddingRight: spacing.md },
  accent: {
    width: 34,
    height: 4,
    borderRadius: 999,
    backgroundColor: COLORS.secondary,
    marginBottom: spacing.xs,
  },
  title: {
    fontWeight: '900',
    color: COLORS.ink,
    letterSpacing: 0,
  },
});
