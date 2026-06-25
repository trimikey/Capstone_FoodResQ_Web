import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, Chip, Button, Icon, ActivityIndicator } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Popup } from '@/components/ui/AppPopup';

import { useListingDetail } from '@/hooks/useListings';
import { ImageCarousel } from '@/components/ImageCarousel';
import { ListingsStateView } from '@/components/ListingsStateView';
import {
  categoryLabel,
  quantityLabel,
  formatPickupWindow,
} from '@/utils/listingFormat';

const COLORS = {
  primary: '#10b981',
  background: '#f8f9ff',
  surface: '#ffffff',
  onSurface: '#121c2a',
  onSurfaceVariant: '#6b7280',
  outlineVariant: '#e5e7eb',
};

interface Props {
  id: string;
}

export default function ListingDetailScreen({ id }: Props) {
  const insets = useSafeAreaInsets();
  const { data: listing, isLoading, isError, refetch } = useListingDetail(id);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }
  if (isError || !listing) {
    return (
      <View style={styles.center}>
        <ListingsStateView variant="error" onRetry={() => refetch()} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <ImageCarousel imageUrls={listing.imageUrls} />

        <View style={styles.body}>
          <View style={styles.chipRow}>
            <Chip compact style={styles.catChip} textStyle={styles.catChipText}>
              {categoryLabel(listing.category)}
            </Chip>
            <Chip compact style={styles.qtyChip} textStyle={styles.qtyChipText}>
              Còn {quantityLabel(listing.quantityRemaining, listing.quantityUnit)}
            </Chip>
          </View>

          <Text variant="headlineSmall" style={styles.title}>
            {listing.title}
          </Text>

          {listing.description ? (
            <Text variant="bodyMedium" style={styles.description}>
              {listing.description}
            </Text>
          ) : null}

          <InfoRow icon="store-outline" text={listing.provider?.businessName ?? 'Cửa hàng'} />
          <InfoRow
            icon="clock-outline"
            text={formatPickupWindow(listing.pickupStartTime, listing.pickupEndTime)}
            highlight
          />
          <InfoRow icon="map-marker-outline" text={listing.pickupAddress} />
          <InfoRow
            icon="account-multiple-outline"
            text={`Tối đa ${listing.maxPerReservation} ${listing.quantityUnit}/lượt đặt`}
          />
          {listing.storageConditions ? (
            <InfoRow icon="fridge-outline" text={listing.storageConditions} />
          ) : null}
          {listing.allergenNotes ? (
            <InfoRow icon="alert-circle-outline" text={`Dị ứng: ${listing.allergenNotes}`} />
          ) : null}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Button
          mode="contained"
          buttonColor={COLORS.primary}
          style={styles.cta}
          contentStyle={styles.ctaContent}
          onPress={() =>
            Popup.show({
              type: 'info',
              text1: 'Đặt chỗ sắp ra mắt',
              text2: 'Tính năng đặt chỗ thuộc Luồng 3.',
            })
          }
        >
          Đặt chỗ
        </Button>
      </View>
    </View>
  );
}

function InfoRow({
  icon,
  text,
  highlight,
}: {
  icon: string;
  text: string;
  highlight?: boolean;
}) {
  return (
    <View style={styles.infoRow}>
      <Icon source={icon} size={20} color={highlight ? COLORS.primary : COLORS.onSurfaceVariant} />
      <Text
        style={[styles.infoText, highlight && { color: COLORS.primary, fontWeight: '600' }]}
      >
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background },
  body: { paddingHorizontal: 20, paddingTop: 16, gap: 10 },
  chipRow: { flexDirection: 'row', gap: 8 },
  catChip: { backgroundColor: '#ecfdf5' },
  catChipText: { color: COLORS.primary, fontSize: 12 },
  qtyChip: { backgroundColor: '#fff7ed' },
  qtyChipText: { color: '#c2410c', fontSize: 12 },
  title: { fontWeight: '700', color: COLORS.onSurface },
  description: { color: COLORS.onSurfaceVariant, lineHeight: 21 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 },
  infoText: { flex: 1, fontSize: 14, color: COLORS.onSurface },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.outlineVariant,
  },
  cta: { borderRadius: 14 },
  ctaContent: { paddingVertical: 6 },
});
