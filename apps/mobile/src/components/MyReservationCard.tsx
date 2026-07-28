import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppImage } from './ui/AppImage';
import { StatusBadge } from './ui/StatusBadge';
import { SurfaceCard } from './ui/SurfaceCard';
import { reservationStatusDisplay, useCountdown } from './ProviderReservationCard';
import type { MyReservation } from '../hooks/useReservations';
import { mobileColors as COLORS, radius, spacing } from '@/theme/design';

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
          <MaterialCommunityIcons name="store-outline" size={14} color={COLORS.onSurfaceVariant} />
          <Text style={styles.meta} numberOfLines={1}>
            {reservation.listing.provider.businessName}
          </Text>
        </View>
        {countdown ? (
          <View style={styles.qrRow}>
            <MaterialCommunityIcons name="qrcode" size={14} color={COLORS.onInfoContainer} />
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
