import { View, StyleSheet } from 'react-native';
import { ActivityIndicator, Button, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { mobileColors as COLORS, radius, spacing } from '@/theme/design';

type StateKind = 'loading' | 'empty' | 'error';

interface Props {
  kind: StateKind;
  title?: string;
  message?: string;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  actionLabel?: string;
  onAction?: () => void;
}

const DEFAULTS: Record<StateKind, { title: string; message: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }> = {
  loading: {
    title: 'Đang tải dữ liệu',
    message: 'Vui lòng chờ trong giây lát.',
    icon: 'progress-clock',
  },
  empty: {
    title: 'Chưa có dữ liệu',
    message: 'Khi có thông tin mới, nội dung sẽ hiển thị tại đây.',
    icon: 'text-box-search-outline',
  },
  error: {
    title: 'Không tải được dữ liệu',
    message: 'Kiểm tra kết nối rồi thử lại.',
    icon: 'alert-circle-outline',
  },
};

export function ScreenState({ kind, title, message, icon, actionLabel, onAction }: Props) {
  const meta = DEFAULTS[kind];
  const tint = kind === 'error' ? COLORS.error : COLORS.primary;

  return (
    <View style={styles.wrap}>
      <View style={[styles.iconWrap, { backgroundColor: kind === 'error' ? '#ffdad6' : COLORS.primaryContainer }]}>
        {kind === 'loading' ? (
          <ActivityIndicator color={COLORS.primary} />
        ) : (
          <MaterialCommunityIcons name={icon ?? meta.icon} size={34} color={tint} />
        )}
      </View>
      <Text variant="titleMedium" style={styles.title}>
        {title ?? meta.title}
      </Text>
      <Text variant="bodyMedium" style={styles.message}>
        {message ?? meta.message}
      </Text>
      {onAction ? (
        <Button mode="contained-tonal" onPress={onAction} style={styles.action} labelStyle={styles.actionLabel}>
          {actionLabel ?? 'Thử lại'}
        </Button>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
    paddingVertical: 48,
  },
  iconWrap: {
    width: 68,
    height: 68,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    color: COLORS.onSurface,
    fontWeight: '700',
    textAlign: 'center',
  },
  message: {
    color: COLORS.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 21,
    marginTop: spacing.sm,
  },
  action: {
    marginTop: spacing.lg,
    borderRadius: radius.pill,
  },
  actionLabel: {
    fontWeight: '700',
  },
});
