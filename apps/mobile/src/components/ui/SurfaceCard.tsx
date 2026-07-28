import { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { mobileColors as COLORS, elevation, radius } from '@/theme/design';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

interface SurfaceCardProps {
  children: ReactNode;
  style?: ViewStyle | ViewStyle[];
}

interface SectionHeaderProps {
  icon?: IconName;
  title: string;
  subtitle?: string;
  right?: ReactNode;
}

interface MetricPillProps {
  icon: IconName;
  label: string;
  tone?: 'primary' | 'neutral' | 'warning' | 'danger';
}

export function SurfaceCard({ children, style }: SurfaceCardProps) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionHeader({ icon, title, subtitle, right }: SectionHeaderProps) {
  return (
    <View style={styles.sectionHeader}>
      {icon ? (
        <View style={styles.sectionIcon}>
          <MaterialCommunityIcons name={icon} size={19} color={COLORS.primary} />
        </View>
      ) : null}
      <View style={styles.sectionText}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle ? (
          <Text style={styles.sectionSubtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

export function MetricPill({ icon, label, tone = 'neutral' }: MetricPillProps) {
  const toneStyle = toneStyles[tone];
  return (
    <View style={[styles.metricPill, { backgroundColor: toneStyle.bg }]}>
      <MaterialCommunityIcons name={icon} size={14} color={toneStyle.fg} />
      <Text style={[styles.metricText, { color: toneStyle.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const toneStyles = {
  primary: { bg: COLORS.primaryContainer, fg: COLORS.primary },
  neutral: { bg: COLORS.surfaceContainerLow, fg: COLORS.onSurfaceVariant },
  warning: { bg: COLORS.secondaryContainer, fg: COLORS.warning },
  danger: { bg: '#ffdad6', fg: COLORS.danger },
} as const;

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    ...elevation.card,
  },
  sectionHeader: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sectionIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: COLORS.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionText: { flex: 1, minWidth: 0 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: COLORS.onSurface },
  sectionSubtitle: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
    color: COLORS.onSurfaceVariant,
  },
  metricPill: {
    minHeight: 30,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  metricText: { fontSize: 12, fontWeight: '800' },
});
