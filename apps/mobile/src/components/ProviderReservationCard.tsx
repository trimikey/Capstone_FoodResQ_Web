import { useEffect, useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppImage } from './ui/AppImage';
import type { ProviderReservation, ReservationStatus } from '../hooks/useProviderReservations';

const COLORS = {
  surface: '#ffffff',
  onSurface: '#121c2a',
  onSurfaceVariant: '#6b7280',
  outline: '#e5e7eb',
};

/** Nhãn + màu cho trạng thái đơn đặt (ReservationStatus). */
export function reservationStatusDisplay(status?: ReservationStatus | string): {
  label: string;
  bg: string;
  fg: string;
} {
  switch (status) {
    case 'confirmed':
      return { label: 'Chờ lấy', bg: '#dbeafe', fg: '#1d4ed8' };
    case 'picked_up':
      return { label: 'Đang giao', bg: '#fef3c7', fg: '#b45309' };
    case 'completed':
      return { label: 'Hoàn tất', bg: '#dcfce7', fg: '#15803d' };
    case 'cancelled':
      return { label: 'Đã huỷ', bg: '#f3f4f6', fg: '#6b7280' };
    case 'expired':
      return { label: 'Hết hạn', bg: '#fee2e2', fg: '#b91c1c' };
    case 'no_show':
      return { label: 'Không đến', bg: '#fee2e2', fg: '#b91c1c' };
    default:
      return { label: String(status ?? '—'), bg: '#f3f4f6', fg: '#6b7280' };
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
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, { opacity: pressed ? 0.85 : 1 }]}
    >
      <AppImage source={{ uri: reservation.listing.imageUrls?.[0] }} style={styles.image} />
      <View style={styles.body}>
        <View style={styles.topRow}>
          <View style={[styles.badge, { backgroundColor: sd.bg }]}>
            <Text style={[styles.badgeText, { color: sd.fg }]}>{sd.label}</Text>
          </View>
          <Text style={styles.qty}>
            {reservation.quantity} {reservation.listing.quantityUnit}
          </Text>
        </View>
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
          <View style={styles.metaRow}>
            <MaterialCommunityIcons name="clock-outline" size={14} color="#1d4ed8" />
            <Text style={[styles.meta, { color: '#1d4ed8', fontWeight: '600' }]}>
              QR còn {countdown}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.outline,
    overflow: 'hidden',
    marginBottom: 12,
  },
  image: { width: 96, height: 96, backgroundColor: COLORS.outline },
  body: { flex: 1, padding: 12, gap: 4 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  qty: { fontSize: 13, fontWeight: '600', color: COLORS.onSurfaceVariant },
  title: { fontWeight: '700', color: COLORS.onSurface },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  meta: { fontSize: 13, color: COLORS.onSurfaceVariant, flexShrink: 1 },
});
