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
import { router } from 'expo-router';
import { Popup } from '@/components/ui/AppPopup';
import { useAuth } from '@/hooks/useAuth';

import { useListingDetail } from '@/hooks/useListings';
import { useCreateReservation } from '@/hooks/useReservations';
import { ImageCarousel } from '@/components/ImageCarousel';
import { SectionHeader } from '@/components/ui/SectionHeader';
import {
  categoryLabel,
  quantityLabel,
  formatPickupWindow,
} from '@/utils/listingFormat';
import { ScreenState } from '@/components/ui/ScreenState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { StickyActionBar } from '@/components/ui/StickyActionBar';
import { SurfaceCard } from '@/components/ui/SurfaceCard';
import { mobileColors as COLORS, radius, spacing } from '@/theme/design';

interface Props {
  id: string;
}

export default function ListingDetailScreen({ id }: Props) {
  const { user } = useAuth();
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
  const providerBlocked = user?.role === 'provider';
  const unit = listing.quantityUnit;
  const listingStatus = soldOut
    ? { label: listing.status === 'active' ? 'Đã hết phần' : 'Không còn nhận đặt', tone: 'warning' as const }
    : { label: 'Có thể đặt nhận', tone: 'success' as const };

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
            <StatusBadge label={listingStatus.label} tone={listingStatus.tone} />
          </View>

          <Text variant="headlineSmall" style={styles.title}>
            {listing.title}
          </Text>

          {listing.description ? (
            <Text variant="bodyMedium" style={styles.description}>
              {listing.description}
            </Text>
          ) : null}

          <SurfaceCard style={styles.infoCard}>
            <SectionHeader
              title="Thông tin nhận món"
              subtitle="Kiểm tra thời gian, địa chỉ và giới hạn trước khi đặt."
            />
            <InfoRow icon="store-outline" label="Nhà cung cấp" text={listing.provider?.businessName ?? 'Cửa hàng'} />
            <InfoRow
              icon="clock-outline"
              label="Khung giờ nhận"
              text={formatPickupWindow(listing.pickupStartTime, listing.pickupEndTime)}
              highlight
            />
            <InfoRow icon="map-marker-outline" label="Điểm lấy" text={listing.pickupAddress} />
            <InfoRow
              icon="account-multiple-outline"
              label="Giới hạn"
              text={`Tối đa ${listing.maxPerReservation} ${unit}/lượt đặt`}
            />
          </SurfaceCard>

          {(listing.storageConditions || listing.allergenNotes) ? (
            <SurfaceCard style={styles.infoCard}>
              <SectionHeader title="Lưu ý an toàn" />
              {listing.storageConditions ? (
                <InfoRow icon="fridge-outline" label="Bảo quản" text={listing.storageConditions} />
              ) : null}
              {listing.allergenNotes ? (
                <InfoRow icon="alert-circle-outline" label="Dị ứng" text={listing.allergenNotes} warning />
              ) : null}
            </SurfaceCard>
          ) : null}
        </View>
      </ScrollView>

      <StickyActionBar>
        <Button
          mode="contained"
          buttonColor={COLORS.primary}
          style={styles.cta}
          contentStyle={styles.ctaContent}
          disabled={soldOut && !providerBlocked}
          onPress={providerBlocked ? () => router.replace('/(app)/provider/listings') : openDialog}
        >
          {providerBlocked ? 'Về Tin của tôi' : soldOut ? 'Đã hết phần' : 'Đặt nhận món'}
        </Button>
      </StickyActionBar>

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

function InfoRow({ icon, label, text, highlight, warning }: {
  icon: string;
  label: string;
  text: string;
  highlight?: boolean;
  warning?: boolean;
}) {
  const iconColor = warning ? COLORS.warning : highlight ? COLORS.primary : COLORS.onSurfaceVariant;
  return (
    <View style={styles.infoRow}>
      <View style={[styles.infoIcon, { backgroundColor: highlight ? COLORS.primaryContainer : COLORS.surfaceContainerLow }]}>
        <Icon source={icon} size={18} color={iconColor} />
      </View>
      <View style={styles.infoCopy}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={[styles.infoText, highlight && styles.infoTextHighlight, warning && styles.infoTextWarning]}>
          {text}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background },
  body: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, gap: spacing.md },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  catChip: { backgroundColor: COLORS.primaryContainer },
  catChipText: { color: COLORS.primary, fontSize: 12 },
  qtyChip: { backgroundColor: COLORS.warningContainer },
  qtyChipText: { color: COLORS.onWarningContainer, fontSize: 12 },
  title: { fontWeight: '700', color: COLORS.onSurface },
  description: { color: COLORS.onSurfaceVariant, lineHeight: 21 },
  infoCard: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  infoIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoCopy: { flex: 1 },
  infoLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.onSurfaceVariant,
    textTransform: 'uppercase',
  },
  infoText: { marginTop: 2, fontSize: 14, lineHeight: 19, fontWeight: '600', color: COLORS.onSurface },
  infoTextHighlight: { color: COLORS.primary, fontWeight: '800' },
  infoTextWarning: { color: COLORS.warning, fontWeight: '700' },
  cta: { borderRadius: radius.md },
  ctaContent: { paddingVertical: 6 },
  dialog: { borderRadius: radius.xl, backgroundColor: COLORS.surface },
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
