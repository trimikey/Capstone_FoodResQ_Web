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

  return (
    <FadeInUp delay={Math.min(index, 8) * 40} style={styles.wrap}>
      <Card style={styles.card} onPress={onPress} mode="elevated">
        <View style={styles.imageWrap}>
          {imageUri ? (
            <AppImage source={{ uri: imageUri }} style={styles.image} />
          ) : (
            <View style={[styles.image, styles.imagePlaceholder]}>
              <Icon source="image-off-outline" size={32} color={COLORS.onSurfaceVariant} />
            </View>
          )}
          <Chip compact style={styles.qtyChip} textStyle={styles.qtyChipText}>
            {quantityLabel(listing.quantityRemaining, listing.quantityUnit)}
          </Chip>
        </View>

        <Card.Content style={styles.content}>
          <Text variant="titleMedium" numberOfLines={1} style={styles.title}>
            {listing.title}
          </Text>

          <View style={styles.metaRow}>
            <Chip compact style={styles.catChip} textStyle={styles.catChipText}>
              {categoryLabel(listing.category)}
            </Chip>
            {distance && (
              <View style={styles.iconText}>
                <Icon source="map-marker-outline" size={14} color={COLORS.onSurfaceVariant} />
                <Text style={styles.metaText}>{distance}</Text>
              </View>
            )}
          </View>

          <View style={styles.iconText}>
            <Icon source="store-outline" size={14} color={COLORS.onSurfaceVariant} />
            <Text style={styles.metaText} numberOfLines={1}>
              {listing.provider?.businessName ?? 'Cửa hàng'}
            </Text>
          </View>

          <View style={styles.iconText}>
            <Icon source="clock-outline" size={14} color={COLORS.primary} />
            <Text style={[styles.metaText, { color: COLORS.primary }]} numberOfLines={1}>
              {formatPickupWindow(listing.pickupStartTime, listing.pickupEndTime)}
            </Text>
          </View>
        </Card.Content>
      </Card>
    </FadeInUp>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 12 },
  card: { backgroundColor: COLORS.surface, borderRadius: 16, overflow: 'hidden' },
  imageWrap: { position: 'relative' },
  image: { width: '100%', height: 160 },
  imagePlaceholder: {
    backgroundColor: COLORS.outlineVariant,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyChip: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(16,185,129,0.92)',
  },
  qtyChipText: { color: '#fff', fontSize: 12, fontWeight: '700', lineHeight: 16 },
  content: { paddingTop: 12, gap: 6 },
  title: { fontWeight: '700', color: COLORS.onSurface },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  catChip: { backgroundColor: '#ecfdf5' },
  catChipText: { color: COLORS.primary, fontSize: 11, lineHeight: 14 },
  iconText: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 13, color: COLORS.onSurfaceVariant, flexShrink: 1 },
});
