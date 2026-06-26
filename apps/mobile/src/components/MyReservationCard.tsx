import { View, StyleSheet, Pressable } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppImage } from './ui/AppImage';
import { reservationStatusDisplay, useCountdown } from './ProviderReservationCard';
import type { MyReservation } from '../hooks/useReservations';

const COLORS = {
  surface: '#ffffff',
  onSurface: '#121c2a',
  onSurfaceVariant: '#6b7280',
  outline: '#e5e7eb',
};

interface Props {
  reservation: MyReservation;
  onPress: () => void;
}

/** Card 1 đơn trong "Đơn của tôi" — hiển thị cửa hàng, số lượng, đếm ngược QR. */
export function MyReservationCard({ reservation, onPress }: Props) {
  const sd = reservationStatusDisplay(reservation.status);
  const countdown = useCountdown(
    reservation.status === 'confirmed' ? reservation.qrExpiresAt : null
  );

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
          <MaterialCommunityIcons name="store-outline" size={14} color={COLORS.onSurfaceVariant} />
          <Text style={styles.meta} numberOfLines={1}>
            {reservation.listing.provider.businessName}
          </Text>
        </View>
        {countdown ? (
          <View style={styles.metaRow}>
            <MaterialCommunityIcons name="qrcode" size={14} color="#1d4ed8" />
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
