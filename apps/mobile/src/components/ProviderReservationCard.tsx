import { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppImage } from './ui/AppImage';
import { StatusBadge, type StatusTone } from './ui/StatusBadge';
import { SurfaceCard } from './ui/SurfaceCard';
import type { ProviderReservation, ReservationStatus } from '../hooks/useProviderReservations';
import { mobileColors as COLORS, radius, spacing } from '@/theme/design';

/** Nhãn + màu cho trạng thái đơn đặt (ReservationStatus). */
export function reservationStatusDisplay(status?: ReservationStatus | string): {
  label: string;
  tone: StatusTone;
  bg: string;
  fg: string;
} {
  switch (status) {
    case 'confirmed':
      return { label: 'Chờ lấy', tone: 'info', bg: COLORS.infoContainer, fg: COLORS.onInfoContainer };
    case 'picked_up':
      return { label: 'Đang giao', tone: 'warning', bg: COLORS.warningContainer, fg: COLORS.onWarningContainer };
    case 'completed':
      return { label: 'Hoàn tất', tone: 'success', bg: COLORS.successContainer, fg: COLORS.onSuccessContainer };
    case 'cancelled':
      return { label: 'Đã huỷ', tone: 'neutral', bg: COLORS.neutralContainer, fg: COLORS.onNeutralContainer };
    case 'expired':
      return { label: 'Hết hạn', tone: 'danger', bg: COLORS.errorContainer, fg: COLORS.onErrorContainer };
    case 'no_show':
      return { label: 'Không đến', tone: 'danger', bg: COLORS.errorContainer, fg: COLORS.onErrorContainer };
    default:
      return { label: String(status ?? '—'), tone: 'neutral', bg: COLORS.neutralContainer, fg: COLORS.onNeutralContainer };
  }
}

/** Đếm ngược tới mốc ISO; trả chuỗi "Mm:Ss" hoặc null nếu đã hết/không có. */
export function useCountdown(targetIso?: string | null): string | null {
  const compute = () => {
    if (!targetIso) return null;
    const ms = new Date(targetIso).getTime() - Date.now();
    if (ms <= 0) return null;
    const total = Math.floor(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };
  const [left, setLeft] = useState<string | null>(compute);
  useEffect(() => {
    const update = () => setLeft(compute());
    const initial = setTimeout(update, 0);
    const t = setInterval(update, 1000);
    return () => {
      clearTimeout(initial);
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetIso]);
  return left;
}

interface Props {
  reservation: ProviderReservation;
  onPress: () => void;
}

export function ProviderReservationCard({ reservation, onPress }: Props) {
  const sd = reservationStatusDisplay(reservation.status);
  const countdown = useCountdown(
    reservation.status === 'confirmed' ? reservation.qrExpiresAt : null
  );
  const r = reservation.receiver.user;

  return (
    <SurfaceCard
      onPress={onPress}
      style={styles.card}
    >
      <View style={styles.header}>
        <StatusBadge label={sd.label} tone={sd.tone} />
        <View style={styles.qtyPill}>
          <Text style={styles.qty}>
            {reservation.quantity} {reservation.listing.quantityUnit}
          </Text>
        </View>
      </View>
      <AppImage source={{ uri: reservation.listing.imageUrls?.[0] }} style={styles.image} />
      <View style={styles.body}>
        <Text variant="titleMedium" style={styles.title} numberOfLines={1}>
          {reservation.listing.title}
        </Text>
        <View style={styles.metaRow}>
          <MaterialCommunityIcons name="account" size={14} color={COLORS.onSurfaceVariant} />
          <Text style={styles.meta} numberOfLines={1}>
            {r.fullName}
            {r.phone ? ` · ${r.phone}` : ''}
          </Text>
        </View>
        {countdown ? (
          <View style={styles.qrRow}>
            <MaterialCommunityIcons name="clock-outline" size={14} color={COLORS.onInfoContainer} />
            <Text style={styles.qrText}>
              QR còn {countdown}
            </Text>
          </View>
        ) : null}
      </View>
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.md,
    padding: spacing.md,
    gap: spacing.md,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  qtyPill: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    backgroundColor: COLORS.warningContainer,
  },
  qty: { fontSize: 12, fontWeight: '900', color: COLORS.onWarningContainer },
  image: { width: '100%', height: 118, borderRadius: radius.lg, backgroundColor: COLORS.outline },
  body: { gap: spacing.sm },
  title: { fontWeight: '800', color: COLORS.onSurface },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  meta: { fontSize: 13, color: COLORS.onSurfaceVariant, flexShrink: 1 },
  qrRow: {
    alignSelf: 'flex-start',
    minHeight: 30,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.infoContainer,
  },
  qrText: { color: COLORS.onInfoContainer, fontSize: 12, fontWeight: '800' },
});
