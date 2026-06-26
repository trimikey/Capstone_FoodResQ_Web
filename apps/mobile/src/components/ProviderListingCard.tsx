import { View, StyleSheet, Pressable } from 'react-native';
import { Text } from 'react-native-paper';
import { AppImage } from './ui/AppImage';
import { categoryLabel, quantityLabel } from '../utils/listingFormat';
import type { ProviderListing } from '../hooks/useProviderListings';

const COLORS = {
  surface: '#ffffff',
  onSurface: '#121c2a',
  onSurfaceVariant: '#6b7280',
  outline: '#e5e7eb',
};

/** Nhãn + màu cho trạng thái tin (ListingStatus). */
export function listingStatusDisplay(status?: string): {
  label: string;
  bg: string;
  fg: string;
} {
  switch (status) {
    case 'draft':
      return { label: 'Nháp', bg: '#f3f4f6', fg: '#6b7280' };
    case 'active':
      return { label: 'Đang phát', bg: '#dcfce7', fg: '#15803d' };
    case 'fully_reserved':
      return { label: 'Hết suất', bg: '#fef3c7', fg: '#b45309' };
    case 'completed':
      return { label: 'Hoàn tất', bg: '#dbeafe', fg: '#1d4ed8' };
    case 'expired':
      return { label: 'Hết hạn', bg: '#e5e7eb', fg: '#4b5563' };
    case 'cancelled':
      return { label: 'Đã huỷ', bg: '#fee2e2', fg: '#b91c1c' };
    default:
      return { label: status ?? '—', bg: '#f3f4f6', fg: '#6b7280' };
  }
}

interface Props {
  listing: ProviderListing;
  onPress: () => void;
}

export function ProviderListingCard({ listing, onPress }: Props) {
  const sd = listingStatusDisplay(listing.status);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, { opacity: pressed ? 0.85 : 1 }]}
    >
      <AppImage source={{ uri: listing.imageUrls?.[0] }} style={styles.image} />
      <View style={styles.body}>
        <View style={styles.topRow}>
          <View style={[styles.badge, { backgroundColor: sd.bg }]}>
            <Text style={[styles.badgeText, { color: sd.fg }]}>{sd.label}</Text>
          </View>
          <Text style={styles.qty}>
            {quantityLabel(listing.quantityRemaining, listing.quantityUnit)}
          </Text>
        </View>
        <Text variant="titleMedium" style={styles.title} numberOfLines={2}>
          {listing.title}
        </Text>
        <Text style={styles.meta}>{categoryLabel(listing.category)}</Text>
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
  meta: { fontSize: 13, color: COLORS.onSurfaceVariant },
});
