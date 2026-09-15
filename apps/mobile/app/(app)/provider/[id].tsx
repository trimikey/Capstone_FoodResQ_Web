import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Text,
  Button,
} from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
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
import { BackButton } from '@/components/ui/BackButton';
import { DeferredRedirect } from '@/components/navigation/DeferredRedirect';
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
    try {
      setBusy(true);
      await cancel.mutateAsync({ id });
      setConfirmCancel(false);
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
    return <DeferredRedirect href="/(app)/home" />;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <BackButton />
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

      <CancelListingConfirmModal
        visible={confirmCancel}
        listingTitle={listing?.title}
        busy={busy}
        onDismiss={() => setConfirmCancel(false)}
        onConfirm={handleCancel}
      />
    </SafeAreaView>
  );
}

function CancelListingConfirmModal({
  visible,
  listingTitle,
  busy,
  onDismiss,
  onConfirm,
}: {
  visible: boolean;
  listingTitle?: string;
  busy: boolean;
  onDismiss: () => void;
  onConfirm: () => void;
}) {
  const close = () => {
    if (!busy) onDismiss();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={close}
    >
      <Pressable style={styles.modalBackdrop} onPress={close}>
        <Pressable
          style={styles.cancelCard}
          accessibilityRole="alert"
          accessibilityLabel="Xác nhận hủy tin"
        >
          <View style={styles.cancelHandle} />

          <View style={styles.cancelHeader}>
            <View style={styles.cancelIconWrap}>
              <MaterialCommunityIcons name="archive-cancel-outline" size={28} color={COLORS.error} />
            </View>
            <View style={styles.cancelHeaderCopy}>
              <Text style={styles.cancelEyebrow}>Xác nhận thay đổi trạng thái</Text>
              <Text style={styles.cancelTitle}>Hủy tin này?</Text>
            </View>
          </View>

          {listingTitle ? (
            <Text style={styles.cancelListingTitle} numberOfLines={2}>
              {listingTitle}
            </Text>
          ) : null}

          <View style={styles.cancelImpactBox}>
            <ImpactRow icon="eye-off-outline" text="Tin sẽ chuyển sang trạng thái Đã hủy và không còn hiển thị công khai." />
            <ImpactRow icon="calendar-remove-outline" text="Người nhận sẽ không thể tạo lượt đặt mới từ tin này." />
          </View>

          <View style={styles.cancelActions}>
            <Button
              mode="contained-tonal"
              onPress={close}
              disabled={busy}
              textColor={COLORS.onSurface}
              buttonColor={COLORS.surfaceContainerLow}
              style={styles.cancelSecondaryBtn}
              labelStyle={styles.cancelSecondaryLabel}
            >
              Giữ tin
            </Button>
            <Button
              mode="contained"
              icon="close-circle-outline"
              loading={busy}
              disabled={busy}
              onPress={onConfirm}
              buttonColor={COLORS.error}
              textColor={COLORS.onPrimary}
              style={styles.cancelPrimaryBtn}
              labelStyle={styles.cancelPrimaryLabel}
            >
              Hủy tin
            </Button>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ImpactRow({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.impactRow}>
      <MaterialCommunityIcons
        name={icon as keyof typeof MaterialCommunityIcons.glyphMap}
        size={18}
        color={COLORS.error}
      />
      <Text style={styles.impactText}>{text}</Text>
    </View>
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
  modalBackdrop: {
    flex: 1,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(18, 28, 42, 0.46)',
  },
  cancelCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 18,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.outline,
    shadowColor: '#172033',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.18,
    shadowRadius: 32,
    elevation: 16,
  },
  cancelHandle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 999,
    backgroundColor: COLORS.outline,
    marginBottom: 18,
  },
  cancelHeader: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  cancelIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.errorContainer,
  },
  cancelHeaderCopy: { flex: 1 },
  cancelEyebrow: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '800',
    letterSpacing: 0,
    color: COLORS.error,
    textTransform: 'uppercase',
  },
  cancelTitle: {
    marginTop: 2,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '800',
    letterSpacing: 0,
    color: COLORS.onSurface,
  },
  cancelListingTitle: {
    marginTop: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: COLORS.surfaceContainerLow,
    color: COLORS.onSurface,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
  cancelImpactBox: {
    marginTop: 14,
    padding: 14,
    gap: 12,
    borderRadius: 18,
    backgroundColor: COLORS.errorContainer,
  },
  impactRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  impactText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: COLORS.onErrorContainer,
  },
  cancelActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  cancelSecondaryBtn: { flex: 1, borderRadius: 14 },
  cancelPrimaryBtn: { flex: 1, borderRadius: 14 },
  cancelSecondaryLabel: { fontSize: 14, fontWeight: '800' },
  cancelPrimaryLabel: { fontSize: 14, fontWeight: '800' },
});
