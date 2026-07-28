import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { AppImage } from './ui/AppImage';
import { StatusBadge, type StatusTone } from './ui/StatusBadge';
import { SurfaceCard } from './ui/SurfaceCard';
import { categoryLabel, quantityLabel } from '../utils/listingFormat';
import type { ProviderListing } from '../hooks/useProviderListings';
import { mobileColors as COLORS, radius, spacing } from '@/theme/design';

/** Nhãn + màu cho trạng thái tin (ListingStatus). */
export function listingStatusDisplay(status?: string): {
  label: string;
  tone: StatusTone;
  bg: string;
  fg: string;
} {
  switch (status) {
    case 'draft':
      return { label: 'Nháp', tone: 'neutral', bg: COLORS.neutralContainer, fg: COLORS.onNeutralContainer };
    case 'active':
      return { label: 'Đang phát', tone: 'success', bg: COLORS.successContainer, fg: COLORS.onSuccessContainer };
    case 'fully_reserved':
      return { label: 'Hết suất', tone: 'warning', bg: COLORS.warningContainer, fg: COLORS.onWarningContainer };
    case 'completed':
      return { label: 'Hoàn tất', tone: 'info', bg: COLORS.infoContainer, fg: COLORS.onInfoContainer };
    case 'expired':
      return { label: 'Hết hạn', tone: 'neutral', bg: COLORS.neutralContainer, fg: COLORS.onMuted };
    case 'cancelled':
      return { label: 'Đã huỷ', tone: 'danger', bg: COLORS.errorContainer, fg: COLORS.onErrorContainer };
    default:
      return { label: status ?? '—', tone: 'neutral', bg: COLORS.neutralContainer, fg: COLORS.onNeutralContainer };
  }
}

interface Props {
  listing: ProviderListing;
  onPress: () => void;
}

export function ProviderListingCard({ listing, onPress }: Props) {
  const sd = listingStatusDisplay(listing.status);
  return (
    <SurfaceCard
      onPress={onPress}
      style={styles.card}
    >
      <View style={styles.imageWrap}>
        <AppImage source={{ uri: listing.imageUrls?.[0] }} style={styles.image} />
        <View style={styles.statusFloat}>
          <StatusBadge label={sd.label} tone={sd.tone} />
        </View>
      </View>
      <View style={styles.body}>
        <Text variant="titleMedium" style={styles.title} numberOfLines={2}>
          {listing.title}
        </Text>
        <View style={styles.metaRow}>
          <Text style={styles.meta}>{categoryLabel(listing.category)}</Text>
          <Text style={styles.qty}>
            {quantityLabel(listing.quantityRemaining, listing.quantityUnit)}
          </Text>
        </View>
      </View>
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    marginHorizontal: 4,
    marginBottom: spacing.md,
  },
  imageWrap: { height: 116, backgroundColor: COLORS.outlineVariant },
  image: { width: '100%', height: '100%' },
  statusFloat: { position: 'absolute', left: spacing.md, top: spacing.md },
  body: { padding: spacing.md, gap: spacing.sm },
  title: { fontSize: 14, lineHeight: 19, fontWeight: '900', color: COLORS.onSurface },
  metaRow: { alignItems: 'flex-start', gap: spacing.sm },
  qty: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    overflow: 'hidden',
    backgroundColor: COLORS.warningContainer,
    fontSize: 12,
    fontWeight: '900',
    color: COLORS.onWarningContainer,
  },
  meta: { fontSize: 12, color: COLORS.onSurfaceVariant, fontWeight: '700' },
});
