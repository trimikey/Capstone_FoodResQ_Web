import { useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import {
  Text,
  Chip,
  Button,
  Icon,
  Portal,
  Dialog,
  TextInput,
  Switch,
  IconButton,
} from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Popup } from '@/components/ui/AppPopup';

import { useListingDetail } from '@/hooks/useListings';
import { useCreateReservation } from '@/hooks/useReservations';
import { ImageCarousel } from '@/components/ImageCarousel';
import {
  categoryLabel,
  quantityLabel,
  formatPickupWindow,
} from '@/utils/listingFormat';
import { ScreenState } from '@/components/ui/ScreenState';
import { mobileColors as COLORS } from '@/theme/design';

interface Props {
  id: string;
}

export default function ListingDetailScreen({ id }: Props) {
  const insets = useSafeAreaInsets();
  const { data: listing, isLoading, isError, refetch } = useListingDetail(id);
  const createMut = useCreateReservation();

  const [dialogVisible, setDialogVisible] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  const [requestDelivery, setRequestDelivery] = useState(false);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ScreenState kind="loading" title="Đang tải tin thực phẩm" />
      </View>
    );
  }
  if (isError || !listing) {
    return (
      <View style={styles.center}>
        <ScreenState kind="error" title="Không tải được tin" actionLabel="Thử lại" onAction={() => refetch()} />
      </View>
    );
  }

  // Trần số lượng đặt: nhỏ hơn giữa "tối đa mỗi lượt" và "còn lại", và backend cap 10.
  const maxQty = Math.max(
    1,
    Math.min(listing.maxPerReservation, listing.quantityRemaining, 10)
  );
  const soldOut = listing.quantityRemaining <= 0 || listing.status !== 'active';
  const unit = listing.quantityUnit;

  const openDialog = () => {
    setQuantity(1);
    setNotes('');
    setRequestDelivery(false);
    setDialogVisible(true);
  };

  const confirmReservation = () => {
    createMut.mutate(
      {
        listingId: listing.id,
        quantity,
        receiverNotes: notes.trim() || undefined,
        requestDelivery,
      },
      {
        onSuccess: (res) => {
          setDialogVisible(false);
          Popup.show({
            type: 'success',
            text1: 'Đặt chỗ thành công!',
            text2: 'Trình mã QR cho nhà cung cấp để nhận hàng.',
          });
          router.replace(`/(app)/order/${res.reservationId}`);
        },
        onError: (e: any) => {
          Popup.show({
            type: 'error',
            text1: 'Đặt chỗ không thành công',
            text2: e?.response?.data?.error?.message ?? 'Vui lòng thử lại sau.',
          });
        },
      }
    );
  };

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
              Còn {quantityLabel(listing.quantityRemaining, unit)}
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
            text={`Tối đa ${listing.maxPerReservation} ${unit}/lượt đặt`}
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
          disabled={soldOut}
          onPress={openDialog}
        >
          {soldOut ? 'Đã hết phần' : 'Đặt chỗ'}
        </Button>
      </View>

      <Portal>
        <Dialog visible={dialogVisible} onDismiss={() => setDialogVisible(false)} style={styles.dialog}>
          <Dialog.Title style={styles.dialogTitle}>Đặt chỗ</Dialog.Title>
          <Dialog.Content style={{ gap: 16 }}>
            <View style={styles.stepperRow}>
              <Text style={styles.stepperLabel}>Số lượng ({unit})</Text>
              <View style={styles.stepper}>
                <IconButton
                  icon="minus"
                  size={20}
                  mode="contained-tonal"
                  disabled={quantity <= 1}
                  onPress={() => setQuantity((q) => Math.max(1, q - 1))}
                />
                <Text style={styles.qtyValue}>{quantity}</Text>
                <IconButton
                  icon="plus"
                  size={20}
                  mode="contained-tonal"
                  disabled={quantity >= maxQty}
                  onPress={() => setQuantity((q) => Math.min(maxQty, q + 1))}
                />
              </View>
            </View>
            <Text style={styles.maxHint}>Tối đa {maxQty} {unit} cho lượt này</Text>

            <TextInput
              mode="outlined"
              label="Ghi chú cho nhà cung cấp (tuỳ chọn)"
              value={notes}
              onChangeText={setNotes}
              maxLength={500}
              multiline
              numberOfLines={2}
              outlineColor={COLORS.outlineVariant}
              activeOutlineColor={COLORS.primary}
            />

            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.switchLabel}>Giao tận nơi</Text>
                <Text style={styles.switchHint}>Yêu cầu shipper giao đến bạn</Text>
              </View>
              <Switch
                value={requestDelivery}
                onValueChange={setRequestDelivery}
                color={COLORS.primary}
              />
            </View>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDialogVisible(false)} textColor={COLORS.onSurfaceVariant}>
              Huỷ
            </Button>
            <Button
              mode="contained"
              buttonColor={COLORS.primary}
              loading={createMut.isPending}
              disabled={createMut.isPending}
              onPress={confirmReservation}
            >
              Xác nhận đặt
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
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
  dialog: { borderRadius: 20, backgroundColor: COLORS.surface },
  dialogTitle: { fontWeight: '700', color: COLORS.onSurface },
  stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepperLabel: { fontSize: 15, fontWeight: '600', color: COLORS.onSurface },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  qtyValue: { fontSize: 18, fontWeight: '700', color: COLORS.onSurface, minWidth: 28, textAlign: 'center' },
  maxHint: { fontSize: 12, color: COLORS.onSurfaceVariant, marginTop: -8 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  switchLabel: { fontSize: 15, fontWeight: '600', color: COLORS.onSurface },
  switchHint: { fontSize: 12, color: COLORS.onSurfaceVariant },
});
