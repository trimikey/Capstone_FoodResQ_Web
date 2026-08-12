import { Pressable, View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppImage } from './ui/AppImage';
import { StatusBadge, type StatusTone } from './ui/StatusBadge';
import { SurfaceCard } from './ui/SurfaceCard';
import { categoryLabel, quantityLabel } from '../utils/listingFormat';
import type { ProviderListing } from '../hooks/useProviderListings';
import type { ExtendListingMode } from './ExtendListingModal';
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
  onExtend?: (mode: ExtendListingMode) => void;
}

export function ProviderListingCard({ listing, onPress, onExtend }: Props) {
  const sd = listingStatusDisplay(listing.status);
  const canExtend = listing.status === 'active' || listing.status === 'fully_reserved';
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
        {canExtend && onExtend ? (
          <View style={styles.actionRow}>
            <ActionButton icon="clock-plus-outline" label="Gia hạn" onPress={() => onExtend('extend_time')} />
            <ActionButton icon="plus-circle-outline" label="Thêm SL" onPress={() => onExtend('add_quantity')} />
            <ActionButton icon="lightning-bolt-outline" label="Cả hai" onPress={() => onExtend('both')} />
          </View>
        ) : null}
      </View>
    </SurfaceCard>
  );
}

function ActionButton({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}>
      <MaterialCommunityIcons name={icon} size={15} color={COLORS.primary} />
      <Text style={styles.actionText} numberOfLines={1}>{label}</Text>
    </Pressable>
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
  actionRow: {
    flexDirection: 'row',
    gap: 6,
    paddingTop: 2,
  },
  actionButton: {
    flex: 1,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderRadius: radius.md,
    backgroundColor: COLORS.primaryContainer,
  },
  actionText: {
    fontSize: 9,
    fontWeight: '900',
    color: COLORS.primary,
  },
  pressed: { opacity: 0.76 },
});
