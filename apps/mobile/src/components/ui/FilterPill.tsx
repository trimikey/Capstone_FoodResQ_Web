import { Pressable, StyleSheet, ViewStyle } from 'react-native';
import { Text } from 'react-native-paper';
import { mobileColors as COLORS, radius, spacing } from '@/theme/design';

interface Props {
  label: string;
  active?: boolean;
  count?: number;
  onPress?: () => void;
  style?: ViewStyle;
}

export function FilterPill({ label, active = false, count, onPress, style }: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        active && styles.pillActive,
        pressed && styles.pressed,
        style,
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
        {label}
      </Text>
      {typeof count === 'number' ? (
        <Text style={[styles.count, active && styles.countActive]}>{count}</Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.outline,
  },
  pillActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  pressed: {
    transform: [{ scale: 0.98 }],
  },
  label: {
    color: COLORS.onSurface,
    fontWeight: '700',
    fontSize: 13,
  },
  labelActive: {
    color: '#ffffff',
  },
  count: {
    color: COLORS.onSurfaceVariant,
    fontSize: 12,
    fontWeight: '700',
  },
  countActive: {
    color: '#ffffff',
  },
});
