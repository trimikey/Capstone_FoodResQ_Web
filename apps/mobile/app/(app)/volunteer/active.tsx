import { useState } from 'react';
import { View, StyleSheet, ScrollView, Linking, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Text,
  Button,
  ActivityIndicator,
  Portal,
  Dialog,
  TextInput,
} from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  useActiveDelivery,
  useUpdateDeliveryStatus,
  useFailDelivery,
  useCancelAssignment,
  type ActiveDelivery,
  type DeliveryCoords,
} from '@/hooks/useDeliveries';
import { DeliveryRouteMap, type LatLng } from '@/components/DeliveryRouteMap';
import { ReportDialog } from '@/components/ReportDialog';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Popup } from '@/components/ui/AppPopup';
import { captureImage } from '@/services/faceCapture';
import {
  DELIVERY_STEPS,
  DELIVERY_STEP_ORDER,
  deliveryStatusMeta,
  nextDeliveryStatus,
  requiresQcPhoto,
} from '@/utils/delivery';

const COLORS = {
  primary: '#10b981',
  danger: '#ef4444',
  background: '#f8f9ff',
  surface: '#ffffff',
  onSurface: '#121c2a',
  onSurfaceVariant: '#6b7280',
  outline: '#e5e7eb',
  muted: '#d1d5db',
};

function toLatLng(lat: number | null, lng: number | null): LatLng | null {
  return lat != null && lng != null ? { lat, lng } : null;
}
function pickupOf(c: DeliveryCoords | null): LatLng | null {
  return c ? toLatLng(c.pickupLat, c.pickupLng) : null;
}
function dropoffOf(c: DeliveryCoords | null): LatLng | null {
  return c ? toLatLng(c.deliveryLat, c.deliveryLng) : null;
}

/** Nhãn nút chuyển bước theo trạng thái hiện tại. */
function advanceLabel(status: string): string {
  switch (status) {
    case 'assigned':
      return 'Lên đường lấy hàng';
    case 'heading_to_provider':
      return 'Đã lấy hàng — chụp ảnh QC';
    case 'qc_completed':
      return 'Bắt đầu giao hàng';
    case 'in_transit':
      return 'Xác nhận đã giao';
    default:
      return 'Cập nhật trạng thái';
  }
}

/**
 * Đơn đang giao (tab volunteer) — keystone. Timeline bước, bản đồ tuyến,
 * nút chuyển trạng thái (heading_to_provider → qc_completed [bắt buộc ảnh QC]
 * → in_transit → delivered), huỷ nhận đơn (trước lấy hàng), báo giao thất bại
 * (sau lấy hàng) + báo cáo sự cố. Poll 15s.
 */
export default function VolunteerActiveScreen() {
  const { data, isLoading, isError, refetch, isRefetching } = useActiveDelivery();
  const updateStatus = useUpdateDeliveryStatus();
  const failDelivery = useFailDelivery();
  const cancelAssignment = useCancelAssignment();

  const [reasonMode, setReasonMode] = useState<'cancel' | 'fail' | null>(null);
  const [reasonText, setReasonText] = useState('');
  const [reportVisible, setReportVisible] = useState(false);

  const delivery = data ?? null;
  const busy = updateStatus.isPending || failDelivery.isPending || cancelAssignment.isPending;

  const handleAdvance = async (d: ActiveDelivery) => {
    const next = nextDeliveryStatus(d.status);
    if (!next) return;
    let photo;
    if (requiresQcPhoto(next)) {
      try {
        photo = (await captureImage('id_card')) ?? undefined;
      } catch (e: any) {
        Popup.show({ type: 'error', text1: 'Không mở được camera', text2: e?.message ?? 'Cần quyền camera.' });
        return;
      }
      if (!photo) {
        Popup.show({ type: 'info', text1: 'Cần ảnh QC', text2: 'Hãy chụp ảnh hàng hoá để xác nhận đã lấy hàng.' });
        return;
      }
    }
    try {
      await updateStatus.mutateAsync({ deliveryId: d.id, status: next, photo });
      Popup.show({
        type: 'success',
        text1: next === 'delivered' ? 'Đã giao thành công 🎉' : 'Đã cập nhật trạng thái',
        text2: next === 'delivered' ? 'Cảm ơn bạn đã giải cứu bữa ăn này!' : undefined,
      });
    } catch (e: any) {
      Popup.show({
        type: 'error',
        text1: 'Cập nhật thất bại',
        text2: e?.response?.data?.error?.message ?? 'Vui lòng thử lại.',
      });
    }
  };

  const submitReason = async () => {
    if (!delivery) return;
    const reason = reasonText.trim();
    if (reasonMode === 'fail' && !reason) {
      Popup.show({ type: 'warning', text1: 'Vui lòng nhập lý do giao thất bại' });
      return;
    }
    try {
      if (reasonMode === 'fail') {
        await failDelivery.mutateAsync({ deliveryId: delivery.id, reason });
        Popup.show({ type: 'info', text1: 'Đã báo giao thất bại' });
      } else {
        await cancelAssignment.mutateAsync({ deliveryId: delivery.id, reason: reason || undefined });
        Popup.show({ type: 'info', text1: 'Đã huỷ nhận đơn' });
      }
      setReasonMode(null);
      setReasonText('');
    } catch (e: any) {
      Popup.show({
        type: 'error',
        text1: 'Thao tác thất bại',
        text2: e?.response?.data?.error?.message ?? 'Vui lòng thử lại.',
      });
    }
  };

  if (isLoading && !delivery) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScreenHeader title="Đang giao" />
        <ActivityIndicator style={{ marginTop: 48 }} color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  if (!delivery) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScreenHeader title="Đang giao" />
        <ScrollView
          contentContainerStyle={styles.emptyWrap}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
        >
          <MaterialCommunityIcons name="truck-check-outline" size={64} color={COLORS.muted} />
          <Text style={styles.emptyTitle}>Chưa có đơn đang giao</Text>
          <Text style={styles.emptySub}>
            {isError
              ? 'Không tải được dữ liệu. Kéo để thử lại.'
              : 'Hãy bật "Sẵn sàng nhận đơn" và nhận lời mời ở tab Đơn cần giao.'}
          </Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const { listing, receiver } = delivery.reservation;
  const meta = deliveryStatusMeta(delivery.status);
  const currentIndex = DELIVERY_STEP_ORDER.indexOf(delivery.status);
  const canAdvance = nextDeliveryStatus(delivery.status) != null;
  const canCancel = ['assigned', 'heading_to_provider'].includes(delivery.status);
  const canFail = ['qc_completed', 'in_transit'].includes(delivery.status);
  const phone = receiver?.user.phone ?? null;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title="Đang giao" />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
      >
        {/* Trạng thái hiện tại */}
        <View style={[styles.statusBanner, { backgroundColor: meta.bg }]}>
          <Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text>
          {delivery.distanceKm != null ? (
            <Text style={[styles.statusDist, { color: meta.color }]}>{delivery.distanceKm.toFixed(1)} km</Text>
          ) : null}
        </View>

        {/* Bản đồ tuyến */}
        <DeliveryRouteMap
          pickup={pickupOf(delivery.coords)}
          dropoff={dropoffOf(delivery.coords)}
          height={200}
        />

        {/* Thông tin đơn */}
        <View style={styles.card}>
          <Text style={styles.title}>{listing.title}</Text>
          <Text style={styles.qty}>Số lượng: {delivery.reservation.quantity}</Text>

          <View style={styles.locRow}>
            <MaterialCommunityIcons name="storefront-outline" size={18} color="#f97316" />
            <View style={{ flex: 1 }}>
              <Text style={styles.locLabel}>Điểm lấy hàng</Text>
              <Text style={styles.locValue}>{listing.pickupAddress}</Text>
            </View>
          </View>

          <View style={styles.locRow}>
            <MaterialCommunityIcons name="map-marker-radius-outline" size={18} color={COLORS.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.locLabel}>Người nhận</Text>
              <Text style={styles.locValue}>{receiver?.user.fullName ?? 'Người nhận'}</Text>
              {receiver?.address ? <Text style={styles.locSub}>{receiver.address}</Text> : null}
            </View>
            {phone ? (
              <Button
                mode="text"
                icon="phone"
                compact
                textColor={COLORS.primary}
                onPress={() => Linking.openURL(`tel:${phone}`)}
              >
                Gọi
              </Button>
            ) : null}
          </View>
        </View>

        {/* Timeline bước */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Tiến trình giao hàng</Text>
          <View style={styles.timeline}>
            {DELIVERY_STEPS.map((step, i) => {
              const stepIndex = DELIVERY_STEP_ORDER.indexOf(step.key);
              const done = currentIndex >= stepIndex;
              const active = currentIndex === stepIndex;
              return (
                <View key={step.key} style={styles.stepRow}>
                  <View style={styles.stepIconCol}>
                    <MaterialCommunityIcons
                      name={done ? 'check-circle' : 'circle-outline'}
                      size={20}
                      color={done ? COLORS.primary : COLORS.muted}
                    />
                    {i < DELIVERY_STEPS.length - 1 ? (
                      <View style={[styles.connector, { backgroundColor: done ? COLORS.primary : COLORS.muted }]} />
                    ) : null}
                  </View>
                  <Text style={[styles.stepLabel, active && styles.stepLabelActive, !done && styles.stepLabelTodo]}>
                    {step.label}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Hành động chính */}
        {canAdvance ? (
          <Button
            mode="contained"
            icon={delivery.status === 'heading_to_provider' ? 'camera' : 'arrow-right-circle'}
            onPress={() => handleAdvance(delivery)}
            loading={updateStatus.isPending}
            disabled={busy}
            buttonColor={COLORS.primary}
            style={styles.primaryBtn}
            contentStyle={{ paddingVertical: 4 }}
          >
            {advanceLabel(delivery.status)}
          </Button>
        ) : null}

        {/* Hành động phụ */}
        <View style={styles.secondaryRow}>
          {canCancel ? (
            <Button
              mode="outlined"
              icon="close-circle-outline"
              onPress={() => {
                setReasonText('');
                setReasonMode('cancel');
              }}
              disabled={busy}
              textColor={COLORS.onSurfaceVariant}
              style={[styles.secondaryBtn, { borderColor: COLORS.outline }]}
            >
              Huỷ nhận đơn
            </Button>
          ) : null}
          {canFail ? (
            <Button
              mode="outlined"
              icon="alert-circle-outline"
              onPress={() => {
                setReasonText('');
                setReasonMode('fail');
              }}
              disabled={busy}
              textColor={COLORS.danger}
              style={[styles.secondaryBtn, { borderColor: COLORS.danger }]}
            >
              Giao thất bại
            </Button>
          ) : null}
        </View>

        <Button
          mode="text"
          icon="flag-outline"
          onPress={() => setReportVisible(true)}
          textColor={COLORS.onSurfaceVariant}
          style={{ marginTop: 4 }}
        >
          Báo cáo sự cố
        </Button>
      </ScrollView>

      {/* Dialog lý do huỷ / thất bại */}
      <Portal>
        <Dialog visible={reasonMode != null} onDismiss={() => setReasonMode(null)} style={styles.dialog}>
          <Dialog.Title style={styles.dialogTitle}>
            {reasonMode === 'fail' ? 'Báo giao thất bại' : 'Huỷ nhận đơn'}
          </Dialog.Title>
          <Dialog.Content>
            <TextInput
              mode="outlined"
              placeholder={
                reasonMode === 'fail'
                  ? 'Lý do giao thất bại (bắt buộc)'
                  : 'Lý do huỷ (tuỳ chọn)'
              }
              value={reasonText}
              onChangeText={setReasonText}
              multiline
              numberOfLines={3}
              outlineColor={COLORS.outline}
              activeOutlineColor={COLORS.primary}
              disabled={busy}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setReasonMode(null)} textColor={COLORS.onSurfaceVariant} disabled={busy}>
              Đóng
            </Button>
            <Button
              mode="contained"
              onPress={submitReason}
              loading={failDelivery.isPending || cancelAssignment.isPending}
              disabled={busy}
              buttonColor={reasonMode === 'fail' ? COLORS.danger : COLORS.primary}
            >
              Xác nhận
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {/* Báo cáo sự cố — target là delivery */}
      <ReportDialog
        visible={reportVisible}
        targetType="delivery"
        targetId={delivery.id}
        title="Báo cáo sự cố giao hàng"
        onDismiss={() => setReportVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 96, gap: 14 },
  emptyWrap: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: COLORS.onSurface, marginTop: 8 },
  emptySub: { fontSize: 14, color: COLORS.onSurfaceVariant, textAlign: 'center' },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
  },
  statusText: { fontSize: 16, fontWeight: '800' },
  statusDist: { fontSize: 14, fontWeight: '700' },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.outline,
    gap: 12,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: COLORS.onSurface },
  title: { fontSize: 17, fontWeight: '700', color: COLORS.onSurface },
  qty: { fontSize: 13, color: COLORS.onSurfaceVariant, marginTop: -6 },
  locRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  locLabel: { fontSize: 11, fontWeight: '700', color: COLORS.onSurfaceVariant, textTransform: 'uppercase' },
  locValue: { fontSize: 14, color: COLORS.onSurface, marginTop: 1 },
  locSub: { fontSize: 13, color: COLORS.onSurfaceVariant, marginTop: 1 },
  timeline: { marginTop: 4 },
  stepRow: { flexDirection: 'row', gap: 10 },
  stepIconCol: { alignItems: 'center', width: 20 },
  connector: { width: 2, flex: 1, minHeight: 16, marginVertical: 2 },
  stepLabel: { fontSize: 14, color: COLORS.onSurface, paddingBottom: 12 },
  stepLabelActive: { fontWeight: '700', color: COLORS.primary },
  stepLabelTodo: { color: COLORS.onSurfaceVariant },
  primaryBtn: { borderRadius: 14 },
  secondaryRow: { flexDirection: 'row', gap: 12 },
  secondaryBtn: { flex: 1, borderRadius: 12 },
  dialog: { borderRadius: 20 },
  dialogTitle: { fontSize: 18, fontWeight: '700', color: COLORS.onSurface },
});
