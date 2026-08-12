import { Pressable, View, StyleSheet } from 'react-native';
import { Text, Icon } from 'react-native-paper';
import type { Listing } from '../hooks/useListings';
import { AppImage, foodFallbackSourceForCategory } from './ui/AppImage';
import { FadeInUp } from './ui/Motion';
import { StatusBadge } from './ui/StatusBadge';
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

  return (
    <FadeInUp delay={Math.min(index, 8) * 40} style={styles.wrap}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        accessibilityRole="button"
      >
        <View style={styles.imageWrap}>
          <AppImage
            source={imageUri}
            fallbackSource={foodFallbackSourceForCategory(listing.category)}
            style={styles.image}
          />
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
      </Pressable>
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
    backgroundColor: COLORS.surface,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    ...elevation.card,
  },
  cardPressed: {
    transform: [{ scale: 0.992 }],
    opacity: 0.94,
  },
  imageWrap: {
    height: 108,
    backgroundColor: COLORS.outlineVariant,
  },
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
    backgroundColor: 'rgba(0,0,0,0.16)',
  },
  imageTopRow: {
    position: 'absolute',
    right: 6,
    top: 6,
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
    backgroundColor: 'rgba(18,28,42,0.72)',
  },
  distanceText: { color: COLORS.onPrimary, fontSize: 11, fontWeight: '800' },
  quantityBadge: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    minWidth: 58,
    borderRadius: radius.md,
    paddingHorizontal: 7,
    paddingVertical: 4,
    backgroundColor: COLORS.surface,
    alignItems: 'flex-end',
  },
  quantityValue: { color: COLORS.onWarningContainer, fontSize: 11, fontWeight: '900' },
  quantityLabel: { marginTop: 0, color: COLORS.onSurfaceVariant, fontSize: 9, fontWeight: '700' },
  content: { paddingHorizontal: spacing.sm, paddingVertical: 9, gap: 5 },
  categoryLine: { alignSelf: 'flex-start', maxWidth: '100%' },
  title: { fontSize: 13, fontWeight: '900', color: COLORS.onSurface, lineHeight: 17 },
  metaGrid: { gap: 3 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 10, color: COLORS.onSurfaceVariant, flexShrink: 1 },
  pickupText: { color: COLORS.primary, fontWeight: '700' },
});
