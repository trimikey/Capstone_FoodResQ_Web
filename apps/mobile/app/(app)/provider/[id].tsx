import { useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Text,
  Button,
  Portal,
  Dialog,
} from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { useListingDetail } from '@/hooks/useListings';
import { usePublishListing, useCancelListing } from '@/hooks/useProviderListings';
import { listingStatusDisplay } from '@/components/ProviderListingCard';
import { ImageCarousel } from '@/components/ImageCarousel';
import {
  categoryLabel,
  quantityLabel,
  formatPickupWindow,
} from '@/utils/listingFormat';
import { getErrorMessage } from '@/hooks/useErrorHandler';
import { Popup } from '@/components/ui/AppPopup';
import { ScreenState } from '@/components/ui/ScreenState';
import { mobileColors as COLORS } from '@/theme/design';

export default function ProviderListingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { data: listing, isLoading, isError, refetch } = useListingDetail(id);
  const publish = usePublishListing();
  const cancel = useCancelListing();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState(false);

  const handlePublish = async () => {
    try {
      setBusy(true);
      await publish.mutateAsync(id);
      Popup.show({ type: 'success', text1: 'Đã đăng tin', text2: 'Tin đã hiển thị công khai.' });
      refetch();
    } catch (err) {
      Popup.show({ type: 'error', text1: 'Đăng tin thất bại', text2: getErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async () => {
    setConfirmCancel(false);
    try {
      setBusy(true);
      await cancel.mutateAsync({ id });
      Popup.show({ type: 'success', text1: 'Đã huỷ tin' });
      refetch();
    } catch (err) {
      Popup.show({ type: 'error', text1: 'Huỷ tin thất bại', text2: getErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  const sd = listingStatusDisplay(listing?.status);
  const canPublish = listing?.status === 'draft';
  const canCancel = listing?.status === 'draft' || listing?.status === 'active';
  const canEdit = listing?.status === 'draft' || listing?.status === 'active' || listing?.status === 'fully_reserved';

  if (user && user.role !== 'provider') {
    return <Redirect href="/(app)/home" />;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={COLORS.onSurface} />
        </Pressable>
        <Text variant="titleMedium" style={styles.headerTitle}>Chi tiết tin</Text>
        <View style={{ width: 24 }} />
      </View>

      {isLoading ? (
        <ScreenState kind="loading" title="Đang tải tin" />
      ) : isError || !listing ? (
        <ScreenState kind="error" title="Không tải được tin" actionLabel="Thử lại" onAction={() => refetch()} />
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.content}>
            <ImageCarousel imageUrls={listing.imageUrls} />

            <View style={styles.badgeRow}>
              <View style={[styles.badge, { backgroundColor: sd.bg }]}>
                <Text style={[styles.badgeText, { color: sd.fg }]}>{sd.label}</Text>
              </View>
              <Text style={styles.qty}>
                {quantityLabel(listing.quantityRemaining, listing.quantityUnit)}
              </Text>
            </View>

            <Text variant="headlineSmall" style={styles.title}>{listing.title}</Text>
            <Text style={styles.category}>{categoryLabel(listing.category)}</Text>

            {listing.description ? (
              <Text style={styles.desc}>{listing.description}</Text>
            ) : null}

            <Row icon="clock-outline" text={formatPickupWindow(listing.pickupStartTime, listing.pickupEndTime)} />
            <Row icon="map-marker-outline" text={listing.pickupAddress} />
            <Row icon="account-multiple-outline" text={`Tối đa ${listing.maxPerReservation}/lượt đặt`} />
            {listing.storageConditions ? (
              <Row icon="fridge-outline" text={listing.storageConditions} />
            ) : null}
            {listing.allergenNotes ? (
              <Row icon="alert-outline" text={`Dị ứng: ${listing.allergenNotes}`} />
            ) : null}
          </ScrollView>

          <View style={[styles.footer]}>
            {canEdit ? (
              <Button
                mode="contained-tonal"
                icon="pencil-outline"
                onPress={() => router.push(`/(app)/provider/create?editId=${id}`)}
                disabled={busy}
                style={styles.actionBtn}
              >
                Sửa
              </Button>
            ) : null}
            {canPublish ? (
              <Button mode="contained" icon="send" onPress={handlePublish} loading={busy} disabled={busy}
                buttonColor={COLORS.primary} style={styles.actionBtn}>
                Đăng tin
              </Button>
            ) : null}
            {canCancel ? (
              <Button mode="outlined" icon="close-circle-outline" onPress={() => setConfirmCancel(true)}
                disabled={busy} textColor={COLORS.error} style={[styles.actionBtn, { borderColor: COLORS.error }]}>
                Huỷ tin
              </Button>
            ) : null}
          </View>
        </>
      )}

      <Portal>
        <Dialog visible={confirmCancel} onDismiss={() => setConfirmCancel(false)}>
          <Dialog.Title>Huỷ tin này?</Dialog.Title>
          <Dialog.Content>
            <Text>Tin sẽ chuyển sang trạng thái &quot;Đã huỷ&quot; và không còn hiển thị.</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmCancel(false)}>Đóng</Button>
            <Button textColor={COLORS.error} onPress={handleCancel}>Huỷ tin</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </SafeAreaView>
  );
}

function Row({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.row}>
      <MaterialCommunityIcons
        name={icon as keyof typeof MaterialCommunityIcons.glyphMap}
        size={20}
        color={COLORS.primary}
      />
      <Text style={styles.rowText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    height: 56, paddingHorizontal: 16, backgroundColor: COLORS.surface,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 1, borderBottomColor: COLORS.outline,
  },
  headerTitle: { fontWeight: '700', color: COLORS.onSurface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 20, paddingBottom: 24 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  badge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  qty: { fontSize: 14, fontWeight: '600', color: COLORS.onSurfaceVariant },
  title: { fontWeight: '800', color: COLORS.onSurface, marginTop: 10 },
  category: { fontSize: 14, color: COLORS.primary, fontWeight: '600', marginTop: 4 },
  desc: { fontSize: 15, color: COLORS.onSurface, marginTop: 12, lineHeight: 22 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  rowText: { flex: 1, fontSize: 15, color: COLORS.onSurface },
  footer: {
    flexDirection: 'row', gap: 12, padding: 16,
    borderTopWidth: 1, borderTopColor: COLORS.outline, backgroundColor: COLORS.surface,
  },
  actionBtn: { flex: 1, borderRadius: 12 },
});
