import { View, StyleSheet } from 'react-native';
import { Text, Icon } from 'react-native-paper';
import type { Listing } from '../hooks/useListings';
import { AppImage } from '@/components/ui/AppImage';
import { FadeInUp, InteractiveScale } from '@/components/ui/Motion';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { mobileColors as COLORS, elevation, radius, spacing } from '@/theme/design';
import {
  categoryLabel,
  quantityLabel,
  formatDistance,
  formatPickupWindow,
} from '../utils/listingFormat';

interface Props {
  listing: Listing;
  onPress?: () => void;
  /** index để stagger animation */
  index?: number;
}

export function ListingCard({ listing, onPress, index = 0 }: Props) {
  const distance = formatDistance(listing.distanceM);
  const imageUri = listing.imageUrls?.[0];
  const canRenderImage = imageUri != null && /^(https?:|file:|data:)/.test(imageUri);

  return (
    <FadeInUp delay={Math.min(index, 8) * 40} style={styles.wrap}>
      <InteractiveScale
        onPress={onPress}
        style={styles.card}
        pressedScale={0.982}
        accessibilityRole="button"
      >
        <View style={styles.imageWrap}>
          {canRenderImage ? (
            <AppImage source={{ uri: imageUri }} style={styles.image} />
          ) : (
            <View style={[styles.image, styles.imagePlaceholder]}>
              <Icon source="image-off-outline" size={32} color={COLORS.onSurfaceVariant} />
            </View>
          )}
          <View style={styles.imageShade} />
          <View style={styles.imageTopRow}>
            {distance ? (
              <View style={styles.distance}>
                <Icon source="map-marker-outline" size={14} color={COLORS.onPrimary} />
                <Text style={styles.distanceText}>{distance}</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.quantityBadge}>
            <Text style={styles.quantityValue}>
              {quantityLabel(listing.quantityRemaining, listing.quantityUnit)}
            </Text>
            <Text style={styles.quantityLabel}>còn lại</Text>
          </View>
        </View>

        <View style={styles.content}>
          <View style={styles.categoryLine}>
            <StatusBadge label={categoryLabel(listing.category)} tone="success" size="small" />
          </View>
          <Text variant="titleMedium" numberOfLines={2} style={styles.title}>
            {listing.title}
          </Text>

          <View style={styles.metaGrid}>
            <View style={styles.metaItem}>
              <Icon source="store-outline" size={14} color={COLORS.onSurfaceVariant} />
              <Text style={styles.metaText} numberOfLines={1}>
                {listing.provider?.businessName ?? 'Cửa hàng'}
              </Text>
            </View>

            <View style={styles.metaItem}>
              <Icon source="clock-outline" size={14} color={COLORS.primary} />
              <Text style={[styles.metaText, styles.pickupText]} numberOfLines={1}>
                {formatPickupWindow(listing.pickupStartTime, listing.pickupEndTime)}
              </Text>
            </View>
          </View>
        </View>
      </InteractiveScale>
    </FadeInUp>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    marginHorizontal: 3,
    marginBottom: spacing.sm,
  },
  card: {
    height: 246,
    backgroundColor: COLORS.surface,
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    ...elevation.card,
  },
  imageWrap: { height: 112, backgroundColor: COLORS.outlineVariant },
  image: { width: '100%', height: '100%' },
  imagePlaceholder: {
    backgroundColor: COLORS.outlineVariant,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageShade: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(15,53,40,0.1)',
  },
  imageTopRow: {
    position: 'absolute',
    right: 7,
    top: 7,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  distance: {
    minHeight: 23,
    borderRadius: radius.pill,
    paddingHorizontal: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(17,29,24,0.76)',
  },
  distanceText: { color: COLORS.onPrimary, fontSize: 11, fontWeight: '800' },
  quantityBadge: {
    position: 'absolute',
    right: 7,
    bottom: 7,
    minWidth: 58,
    borderRadius: radius.lg,
    paddingHorizontal: 7,
    paddingVertical: 4,
    backgroundColor: 'rgba(255,255,255,0.96)',
    alignItems: 'flex-end',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  quantityValue: { color: COLORS.primaryStrong, fontSize: 11, fontWeight: '900' },
  quantityLabel: { marginTop: 0, color: COLORS.onSurfaceVariant, fontSize: 9, fontWeight: '700' },
  content: {
    height: 134,
    paddingHorizontal: spacing.sm,
    paddingTop: 9,
    paddingBottom: 9,
    gap: 5,
  },
  categoryLine: {
    height: 22,
    alignSelf: 'flex-start',
    maxWidth: '100%',
    justifyContent: 'center',
  },
  title: {
    height: 36,
    fontSize: 13,
    fontWeight: '900',
    color: COLORS.ink,
    lineHeight: 18,
  },
  metaGrid: { height: 42, gap: 3, justifyContent: 'flex-end' },
  metaItem: {
    minHeight: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingRight: 2,
  },
  metaText: { fontSize: 10, color: COLORS.onSurfaceVariant, flexShrink: 1 },
  pickupText: { color: COLORS.primary, fontWeight: '700' },
});
