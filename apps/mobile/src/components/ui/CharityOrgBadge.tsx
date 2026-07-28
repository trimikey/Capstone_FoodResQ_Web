import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { mobileColors as COLORS, radius } from '@/theme/design';

type VerificationTone = 'approved' | 'pending' | 'rejected' | 'neutral';

function normalizeVerificationStatus(status?: string | null, accountStatus?: string | null): VerificationTone {
  if (status === 'approved' || status === 'verified') return 'approved';
  if (status === 'pending' || status === 'under_review' || status === 'pending_verification') return 'pending';
  if (status === 'rejected' || status === 'suspended' || status === 'banned') return 'rejected';
  if (accountStatus === 'pending_verification') return 'pending';
  if (accountStatus === 'suspended' || accountStatus === 'banned') return 'rejected';
  if (accountStatus === 'active') return 'approved';
  return 'neutral';
}

export function charityVerificationMeta(status?: string | null, accountStatus?: string | null) {
  const tone = normalizeVerificationStatus(status, accountStatus);
  switch (tone) {
    case 'approved':
      return {
        tone,
        icon: 'check-decagram' as const,
        label: 'Tổ chức đã xác minh',
        bg: COLORS.primaryContainer,
        fg: COLORS.primary,
      };
    case 'pending':
      return {
        tone,
        icon: 'clock-outline' as const,
        label: 'Chờ xác minh tổ chức',
        bg: '#fffbeb',
        fg: COLORS.warning,
      };
    case 'rejected':
      return {
        tone,
        icon: 'shield-alert-outline' as const,
        label: 'Cần bổ sung xác minh',
        bg: '#fef2f2',
        fg: COLORS.error,
      };
    default:
      return {
        tone,
        icon: 'domain' as const,
        label: 'Tổ chức từ thiện',
        bg: COLORS.surfaceContainerLow,
        fg: COLORS.onSurfaceVariant,
      };
  }
}

export function CharityOrgBadge({
  isCharityOrg,
  organizationName,
  verificationStatus,
  accountStatus,
  compact = false,
}: {
  isCharityOrg?: boolean | null;
  organizationName?: string | null;
  verificationStatus?: string | null;
  accountStatus?: string | null;
  compact?: boolean;
}) {
  if (!isCharityOrg) return null;

  const meta = charityVerificationMeta(verificationStatus, accountStatus);
  const label = organizationName?.trim() ? meta.label : 'Thiếu tên tổ chức';
  return (
    <View style={[styles.badge, { backgroundColor: meta.bg }, compact && styles.badgeCompact]}>
      <MaterialCommunityIcons name={meta.icon} size={compact ? 15 : 17} color={meta.fg} />
      <Text style={[styles.label, { color: meta.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    minHeight: 32,
    maxWidth: '100%',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  badgeCompact: {
    minHeight: 28,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  label: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '800',
  },
});
