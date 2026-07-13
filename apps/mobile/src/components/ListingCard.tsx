import { View, StyleSheet } from 'react-native';
import { Card, Text, Chip, Icon } from 'react-native-paper';
import type { Listing } from '../hooks/useListings';
import { AppImage } from './ui/AppImage';
import { FadeInUp } from './ui/Motion';
import {
  categoryLabel,
  quantityLabel,
  formatDistance,
  formatPickupWindow,
} from '../utils/listingFormat';

const COLORS = {
  primary: '#10b981',
  surface: '#ffffff',
  onSurface: '#121c2a',
  onSurfaceVariant: '#6b7280',
  outlineVariant: '#e5e7eb',
};

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
      <Card style={styles.card} onPress={onPress} mode="elevated">
        <View style={styles.row}>
          <View style={styles.imageWrap}>
          {canRenderImage ? (
            <AppImage source={{ uri: imageUri }} style={styles.image} />
          ) : (
            <View style={[styles.image, styles.imagePlaceholder]}>
              <Icon source="image-off-outline" size={32} color={COLORS.onSurfaceVariant} />
            </View>
          )}
          </View>

          <Card.Content style={styles.content}>
            <View style={styles.topLine}>
              <Chip compact style={styles.catChip} textStyle={styles.catChipText}>
                {categoryLabel(listing.category)}
              </Chip>
              {distance && (
                <View style={styles.distance}>
                  <Icon source="map-marker-outline" size={14} color={COLORS.primary} />
                  <Text style={styles.distanceText}>{distance}</Text>
                </View>
              )}
            </View>

            <Text variant="titleMedium" numberOfLines={2} style={styles.title}>
              {listing.title}
            </Text>

            <View style={styles.iconText}>
              <Icon source="store-outline" size={14} color={COLORS.onSurfaceVariant} />
              <Text style={styles.metaText} numberOfLines={1}>
                {listing.provider?.businessName ?? 'Cửa hàng'}
              </Text>
            </View>

            <View style={styles.bottomLine}>
              <View style={styles.iconText}>
                <Icon source="clock-outline" size={14} color={COLORS.primary} />
                <Text style={[styles.metaText, { color: COLORS.primary }]} numberOfLines={1}>
                  {formatPickupWindow(listing.pickupStartTime, listing.pickupEndTime)}
                </Text>
              </View>
              <View style={styles.actionLine}>
                <Text style={styles.qtyText} numberOfLines={1}>
                  Còn {quantityLabel(listing.quantityRemaining, listing.quantityUnit)}
                </Text>
                <View style={styles.detailCta}>
                  <Text style={styles.detailText}>Chi tiết</Text>
                  <Icon source="chevron-right" size={15} color={COLORS.primary} />
                </View>
              </View>
            </View>
          </Card.Content>
        </View>
      </Card>
    </FadeInUp>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 10 },
  card: { backgroundColor: COLORS.surface, borderRadius: 14, overflow: 'hidden' },
  row: { flexDirection: 'row', minHeight: 132 },
  imageWrap: { width: 112, backgroundColor: COLORS.outlineVariant },
  image: { width: 112, height: '100%', minHeight: 132 },
  imagePlaceholder: {
    backgroundColor: COLORS.outlineVariant,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { flex: 1, paddingVertical: 10, paddingHorizontal: 12, gap: 6 },
  topLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { fontWeight: '700', color: COLORS.onSurface, lineHeight: 22 },
  catChip: { backgroundColor: '#ecfdf5' },
  catChipText: { color: COLORS.primary, fontSize: 11, lineHeight: 14 },
  distance: { flexDirection: 'row', alignItems: 'center', gap: 2, flexShrink: 0 },
  distanceText: { color: COLORS.primary, fontSize: 12, fontWeight: '700' },
  iconText: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 13, color: COLORS.onSurfaceVariant, flexShrink: 1 },
  bottomLine: { gap: 6, alignItems: 'flex-start' },
  actionLine: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  qtyText: {
    color: COLORS.onSurface,
    backgroundColor: '#fef3c7',
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontSize: 12,
    fontWeight: '700',
    flexShrink: 1,
  },
  detailCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
    paddingLeft: 8,
    flexShrink: 0,
  },
  detailText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '800',
  },
});
