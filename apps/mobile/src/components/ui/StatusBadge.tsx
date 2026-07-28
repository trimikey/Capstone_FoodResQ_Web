import { StyleSheet, View, type ViewStyle } from 'react-native';
import { Text } from 'react-native-paper';
import { mobileColors as COLORS, radius, spacing } from '@/theme/design';

export type StatusTone =
  | 'neutral'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'blue'
  | 'purple'
  | 'rose'
  | 'teal'
  | 'orange'
  | 'indigo';

const TONES: Record<StatusTone, { bg: string; fg: string }> = {
  neutral: { bg: COLORS.neutralContainer, fg: COLORS.onNeutralContainer },
  success: { bg: COLORS.successContainer, fg: COLORS.onSuccessContainer },
  warning: { bg: COLORS.warningContainer, fg: COLORS.onWarningContainer },
  danger: { bg: COLORS.errorContainer, fg: COLORS.onErrorContainer },
  info: { bg: COLORS.infoContainer, fg: COLORS.onInfoContainer },
  blue: { bg: COLORS.blueContainer, fg: COLORS.onBlueContainer },
  purple: { bg: COLORS.purpleContainer, fg: COLORS.onPurpleContainer },
  rose: { bg: COLORS.roseContainer, fg: COLORS.onRoseContainer },
  teal: { bg: COLORS.tealContainer, fg: COLORS.onTealContainer },
  orange: { bg: COLORS.orangeContainer, fg: COLORS.onOrangeContainer },
  indigo: { bg: COLORS.indigoContainer, fg: COLORS.onIndigoContainer },
};

interface Props {
  label: string;
  tone?: StatusTone;
  style?: ViewStyle;
  size?: 'default' | 'small';
}

export function StatusBadge({ label, tone = 'neutral', style, size = 'default' }: Props) {
  const colors = TONES[tone];

  return (
    <View style={[styles.badge, size === 'small' && styles.badgeSmall, { backgroundColor: colors.bg }, style]}>
      <Text style={[styles.text, size === 'small' && styles.textSmall, { color: colors.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 3,
    maxWidth: '100%',
  },
  text: {
    fontSize: 11,
    fontWeight: '800',
    lineHeight: 14,
  },
  badgeSmall: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  textSmall: {
    fontSize: 10,
    lineHeight: 13,
  },
});
