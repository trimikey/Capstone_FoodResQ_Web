import { useCallback, useRef, useState } from 'react';
import { View, StyleSheet, ScrollView, Linking, Platform, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Button } from 'react-native-paper';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetTextInput,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  useActiveDelivery,
  useUpdateDeliveryStatus,
  useFailDelivery,
  useCancelAssignment,
  useShipperLocationBroadcast,
  type ActiveDelivery,
  type DeliveryCoords,
  type DeliveryStatus,
} from '@/hooks/useDeliveries';
import { DeliveryRouteMap, type LatLng } from '@/components/DeliveryRouteMap';
import { ReportDialog } from '@/components/ReportDialog';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Popup } from '@/components/ui/AppPopup';
import { ScreenState } from '@/components/ui/ScreenState';
import { FadeInUp } from '@/components/ui/Motion';
import { captureImage } from '@/services/faceCapture';
import { notifyError, notifySuccess, notifyWarning } from '@/services/haptics';
import {
  DELIVERY_STEPS,
  DELIVERY_STEP_ORDER,
  deliveryStatusMeta,
  nextDeliveryStatus,
  requiresQcPhoto,
} from '@/utils/delivery';
import { mobileColors as COLORS } from '@/theme/design';

type RouteTarget = {
  key: 'pickup' | 'dropoff';
  title: string;
  subtitle: string;
  address?: string | null;
  coords: LatLng | null;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  color: string;
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
function formatKm(km: unknown): string | null {
  if (km == null) return null;
  const n = Number(km);
  return Number.isFinite(n) ? `${n.toFixed(1)} km` : null;
}
function isActiveDeliveryStatus(status?: string | null): boolean {
  return ['assigned', 'heading_to_provider', 'qc_completed', 'in_transit'].includes(status ?? '');
}
function activeTargetKey(status: string): RouteTarget['key'] {
  return status === 'assigned' || status === 'heading_to_provider' ? 'pickup' : 'dropoff';
}
function mapsDestination(target: RouteTarget): string | null {
  if (target.coords) return `${target.coords.lat},${target.coords.lng}`;
  const fallback = target.address?.trim();
  return fallback ? fallback : null;
}
function mapsUrls(target: RouteTarget): { primary: string; fallback: string } | null {
  const raw = mapsDestination(target);
  if (!raw) return null;
  const encoded = encodeURIComponent(raw);
  const fallback = `https://www.google.com/maps/dir/?api=1&destination=${encoded}&travelmode=driving`;
  if (Platform.OS === 'android') return { primary: `google.navigation:q=${encoded}&mode=d`, fallback };
  if (Platform.OS === 'ios') return { primary: `comgooglemaps://?daddr=${encoded}&directionsmode=driving`, fallback };
  return { primary: fallback, fallback };
}
function advanceLabel(status: string): string {
  switch (status) {
    case 'assigned':
      return 'Đi tới điểm lấy';
    case 'heading_to_provider':
      return 'Chụp xác nhận lấy hàng';
    case 'qc_completed':
      return 'Đi giao hàng';
    case 'in_transit':
      return 'Nhập mã người nhận';
    default:
      return 'Cập nhật trạng thái';
  }
}
function advanceIcon(status: string): keyof typeof MaterialCommunityIcons.glyphMap {
  switch (status) {
    case 'heading_to_provider':
      return 'camera';
    case 'in_transit':
      return 'qrcode-scan';
    default:
      return 'arrow-right-circle';
  }
}

export default function VolunteerActiveScreen() {
  const reasonSheetRef = useRef<BottomSheetModal>(null);
  const qrSheetRef = useRef<BottomSheetModal>(null);
  const { data, isLoading, isError, refetch, isRefetching } = useActiveDelivery();
  const updateStatus = useUpdateDeliveryStatus();
  const failDelivery = useFailDelivery();
  const cancelAssignment = useCancelAssignment();

  const [reasonMode, setReasonMode] = useState<'cancel' | 'fail' | null>(null);
  const [reasonText, setReasonText] = useState('');
  const [qrToken, setQrToken] = useState('');
  const [reportVisible, setReportVisible] = useState(false);

  const delivery = data ?? null;
  const busy = updateStatus.isPending || failDelivery.isPending || cancelAssignment.isPending;
  useShipperLocationBroadcast(isActiveDeliveryStatus(delivery?.status));

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} pressBehavior="close" />
    ),
    []
  );

  const closeReasonSheet = () => {
    if (busy) return;
    setReasonMode(null);
    reasonSheetRef.current?.dismiss();
  };
  const openReasonSheet = (mode: 'cancel' | 'fail') => {
    setReasonText('');
    setReasonMode(mode);
    reasonSheetRef.current?.present();
  };
  const openQrSheet = () => {
    setQrToken('');
    qrSheetRef.current?.present();
  };
  const openMaps = async (target: RouteTarget) => {
    const urls = mapsUrls(target);
    if (!urls) {
      Popup.show({
        type: 'warning',
        text1: 'Thiếu địa chỉ chỉ đường',
        text2: 'Đơn này chưa có toạ độ hoặc địa chỉ đủ rõ để mở Google Maps.',
      });
      void notifyWarning();
      return;
    }
    try {
      await Linking.openURL(urls.primary);
    } catch {
      try {
        await Linking.openURL(urls.fallback);
      } catch {
        Popup.show({ type: 'error', text1: 'Không mở được Google Maps', text2: 'Vui lòng thử lại.' });
        void notifyError();
      }
    }
  };

  const handleAdvance = async (d: ActiveDelivery) => {
    const next = nextDeliveryStatus(d.status);
    if (!next) return;
    if (next === 'delivered') {
      openQrSheet();
      return;
    }
    let photo;
    if (requiresQcPhoto(next)) {
      try {
        photo = (await captureImage('id_card')) ?? undefined;
      } catch (e: any) {
        Popup.show({ type: 'error', text1: 'Không mở được camera', text2: e?.message ?? 'Cần quyền camera.' });
        return;
      }
      if (!photo) {
        Popup.show({ type: 'info', text1: 'Cần ảnh lấy hàng', text2: 'Hãy chụp ảnh hàng hoá để xác nhận đã lấy hàng.' });
        return;
      }
    }
    try {
      await updateStatus.mutateAsync({ deliveryId: d.id, status: next, photo });
      void notifySuccess();
      Popup.show({ type: 'success', text1: 'Đã cập nhật tiến trình', text2: deliveryStatusMeta(next).label });
    } catch (e: any) {
      void notifyError();
      Popup.show({
        type: 'error',
        text1: 'Cập nhật thất bại',
        text2: e?.response?.data?.error?.message ?? 'Vui lòng thử lại.',
      });
    }
  };

  const submitQrToken = async () => {
    if (!delivery) return;
    const token = qrToken.trim();
    if (!token) {
      Popup.show({ type: 'warning', text1: 'Nhập mã người nhận', text2: 'Mã QR nằm trên màn nhận hàng của receiver.' });
      void notifyWarning();
      return;
    }
    try {
      await updateStatus.mutateAsync({ deliveryId: delivery.id, status: 'delivered' as DeliveryStatus, qrToken: token });
      qrSheetRef.current?.dismiss();
      setQrToken('');
      void notifySuccess();
      Popup.show({ type: 'success', text1: 'Đã giao thành công', text2: 'Đơn đã hoàn tất.' });
    } catch (e: any) {
      void notifyError();
      Popup.show({
        type: 'error',
        text1: 'Không xác nhận được mã',
        text2: e?.response?.data?.error?.message ?? 'Kiểm tra lại mã QR của người nhận.',
      });
    }
  };

  const submitReason = async () => {
    if (!delivery) return;
    const reason = reasonText.trim();
    if (reasonMode === 'fail' && !reason) {
      Popup.show({ type: 'warning', text1: 'Vui lòng nhập lý do giao thất bại' });
      void notifyWarning();
      return;
    }
    try {
      if (reasonMode === 'fail') {
        await failDelivery.mutateAsync({ deliveryId: delivery.id, reason });
        void notifyWarning();
        Popup.show({ type: 'info', text1: 'Đã báo giao thất bại' });
      } else {
        await cancelAssignment.mutateAsync({ deliveryId: delivery.id, reason: reason || undefined });
        void notifySuccess();
        Popup.show({ type: 'info', text1: 'Đã huỷ nhận đơn' });
      }
      closeReasonSheet();
      setReasonText('');
    } catch (e: any) {
      void notifyError();
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
        <ScreenState kind="loading" title="Đang tải đơn giao" />
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
  const pickup = pickupOf(delivery.coords);
  const dropoff = dropoffOf(delivery.coords);
  const meta = deliveryStatusMeta(delivery.status);
  const currentIndex = DELIVERY_STEP_ORDER.indexOf(delivery.status);
  const canAdvance = nextDeliveryStatus(delivery.status) != null;
  const canCancel = ['assigned', 'heading_to_provider'].includes(delivery.status);
  const canFail = ['qc_completed', 'in_transit'].includes(delivery.status);
  const phone = receiver?.user.phone ?? null;
  const distanceLabel = formatKm(delivery.distanceKm);
  const routeTargets: RouteTarget[] = [
    {
      key: 'pickup',
      title: 'Điểm lấy hàng',
      subtitle: listing.pickupAddress,
      address: listing.pickupAddress,
      coords: pickup,
      icon: 'storefront-outline',
      color: COLORS.secondary,
    },
    {
      key: 'dropoff',
      title: 'Điểm giao hàng',
      subtitle: receiver?.address ?? receiver?.user.fullName ?? 'Địa chỉ người nhận',
      address: receiver?.address,
      coords: dropoff,
      icon: 'map-marker-radius-outline',
      color: COLORS.primary,
    },
  ];
  const targetKey = activeTargetKey(delivery.status);
  const activeTarget = routeTargets.find((target) => target.key === targetKey) ?? routeTargets[0];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title="Đang giao" />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
      >
        <FadeInUp delay={0} style={{ ...styles.statusBanner, backgroundColor: meta.bg }}>
          <View style={styles.statusLeft}>
            <View style={[styles.pulseDot, { backgroundColor: meta.color }]} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text>
              <Text style={styles.statusSub}>
                {activeTarget.key === 'pickup' ? 'Ưu tiên tới điểm lấy hàng' : 'Tiếp tục giao cho người nhận'}
              </Text>
            </View>
          </View>
          {distanceLabel ? <Text style={[styles.statusDist, { color: meta.color }]}>{distanceLabel}</Text> : null}
        </FadeInUp>

        <FadeInUp delay={80}>
          <DeliveryRouteMap pickup={pickup} dropoff={dropoff} height={206} />
        </FadeInUp>

        <FadeInUp delay={140} style={styles.routePanel}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Lộ trình hôm nay</Text>
            <Button
              mode="text"
              compact
              icon="navigation-variant-outline"
              textColor={COLORS.primary}
              onPress={() => void openMaps(activeTarget)}
            >
              Mở Maps
            </Button>
          </View>
          {routeTargets.map((target) => {
            const active = target.key === targetKey;
            return (
              <View key={target.key} style={[styles.routeRow, active && styles.routeRowActive]}>
                <View style={[styles.routeIcon, { backgroundColor: active ? target.color : COLORS.surfaceVariant }]}>
                  <MaterialCommunityIcons
                    name={target.icon}
                    size={20}
                    color={active ? COLORS.surface : target.color}
                  />
                </View>
                <View style={styles.routeText}>
                  <Text style={styles.routeTitle}>{target.title}</Text>
                  <Text style={styles.routeSubtitle} numberOfLines={2}>
                    {target.subtitle}
                  </Text>
                </View>
                <Button
                  mode={active ? 'contained' : 'outlined'}
                  compact
                  icon="directions"
                  buttonColor={active ? COLORS.primary : undefined}
                  textColor={active ? COLORS.surface : COLORS.primary}
                  style={styles.mapButton}
                  onPress={() => void openMaps(target)}
                >
                  Đi
                </Button>
              </View>
            );
          })}
        </FadeInUp>

        <FadeInUp delay={200} style={styles.infoPanel}>
          <View style={styles.infoTop}>
            <View style={styles.foodIcon}>
              <MaterialCommunityIcons name="food-variant" size={22} color={COLORS.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{listing.title}</Text>
              <Text style={styles.qty}>Số lượng: {delivery.reservation.quantity}</Text>
            </View>
          </View>
          <View style={styles.receiverRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.locLabel}>Người nhận</Text>
              <Text style={styles.locValue}>{receiver?.user.fullName ?? 'Người nhận'}</Text>
              {receiver?.address ? <Text style={styles.locSub}>{receiver.address}</Text> : null}
            </View>
            {phone ? (
              <Button
                mode="outlined"
                icon="phone"
                compact
                textColor={COLORS.primary}
                style={styles.callButton}
                onPress={() => Linking.openURL(`tel:${phone}`)}
              >
                Gọi
              </Button>
            ) : null}
          </View>
        </FadeInUp>

        <FadeInUp delay={260} style={styles.progressPanel}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Tiến trình giao hàng</Text>
            <Text style={styles.stepCount}>
              {Math.max(currentIndex, 0)}/{DELIVERY_STEPS.length}
            </Text>
          </View>
          <View style={styles.timeline}>
            {DELIVERY_STEPS.map((step, i) => {
              const stepIndex = DELIVERY_STEP_ORDER.indexOf(step.key);
              const done = currentIndex >= stepIndex;
              const active = currentIndex === stepIndex;
              return (
                <View key={step.key} style={styles.stepRow}>
                  <View style={styles.stepIconCol}>
                    <View style={[styles.stepDot, done && styles.stepDotDone, active && styles.stepDotActive]}>
                      <MaterialCommunityIcons
                        name={done ? 'check' : 'circle'}
                        size={done ? 14 : 8}
                        color={done ? COLORS.surface : COLORS.muted}
                      />
                    </View>
                    {i < DELIVERY_STEPS.length - 1 ? (
                      <View style={[styles.connector, done ? styles.connectorDone : styles.connectorTodo]} />
                    ) : null}
                  </View>
                  <View style={styles.stepTextWrap}>
                    <Text style={[styles.stepLabel, active && styles.stepLabelActive, !done && styles.stepLabelTodo]}>
                      {step.label}
                    </Text>
                    {active ? <Text style={styles.stepHint}>Bước hiện tại</Text> : null}
                  </View>
                </View>
              );
            })}
          </View>
        </FadeInUp>

        {canAdvance ? (
          <Button
            mode="contained"
            icon={advanceIcon(delivery.status)}
            onPress={() => handleAdvance(delivery)}
            loading={updateStatus.isPending}
            disabled={busy}
            buttonColor={COLORS.primary}
            style={styles.primaryBtn}
            contentStyle={styles.primaryContent}
          >
            {advanceLabel(delivery.status)}
          </Button>
        ) : null}

        <View style={styles.secondaryRow}>
          {canCancel ? (
            <Button
              mode="outlined"
              icon="close-circle-outline"
              onPress={() => openReasonSheet('cancel')}
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
              onPress={() => openReasonSheet('fail')}
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
        >
          Báo cáo sự cố
        </Button>
      </ScrollView>

      <BottomSheetModal
        ref={reasonSheetRef}
        enableDynamicSizing
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        onDismiss={() => setReasonMode(null)}
        handleIndicatorStyle={styles.sheetHandle}
        accessibilityLabel={reasonMode === 'fail' ? 'Báo giao thất bại' : 'Huỷ nhận đơn'}
      >
        <BottomSheetView style={styles.sheet}>
          <Text style={styles.dialogTitle}>{reasonMode === 'fail' ? 'Báo giao thất bại' : 'Huỷ nhận đơn'}</Text>
          <BottomSheetTextInput
            placeholder={reasonMode === 'fail' ? 'Lý do giao thất bại (bắt buộc)' : 'Lý do huỷ (tuỳ chọn)'}
            value={reasonText}
            onChangeText={setReasonText}
            multiline
            numberOfLines={3}
            editable={!busy}
            style={styles.reasonInput}
            accessibilityLabel={reasonMode === 'fail' ? 'Lý do giao thất bại' : 'Lý do huỷ nhận đơn'}
          />
          <View style={styles.sheetActions}>
            <Button onPress={closeReasonSheet} textColor={COLORS.onSurfaceVariant} disabled={busy}>
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
          </View>
        </BottomSheetView>
      </BottomSheetModal>

      <BottomSheetModal
        ref={qrSheetRef}
        enableDynamicSizing
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        handleIndicatorStyle={styles.sheetHandle}
        accessibilityLabel="Nhập mã QR người nhận"
      >
        <BottomSheetView style={styles.sheet}>
          <View style={styles.qrHeader}>
            <View style={styles.qrIcon}>
              <MaterialCommunityIcons name="qrcode-scan" size={22} color={COLORS.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.dialogTitle}>Mã người nhận</Text>
              <Text style={styles.sheetSub}>Nhập token QR trên màn nhận hàng để hoàn tất giao hàng.</Text>
            </View>
          </View>
          <BottomSheetTextInput
            placeholder="Dán hoặc nhập mã QR"
            value={qrToken}
            onChangeText={setQrToken}
            autoCapitalize="none"
            editable={!busy}
            style={styles.qrInput}
            accessibilityLabel="Mã QR người nhận"
          />
          <View style={styles.sheetActions}>
            <Button onPress={() => qrSheetRef.current?.dismiss()} textColor={COLORS.onSurfaceVariant} disabled={busy}>
              Đóng
            </Button>
            <Button
              mode="contained"
              icon="check-circle-outline"
              onPress={submitQrToken}
              loading={updateStatus.isPending}
              disabled={busy}
              buttonColor={COLORS.primary}
            >
              Hoàn tất
            </Button>
          </View>
        </BottomSheetView>
      </BottomSheetModal>

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
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.outline,
  },
  statusLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  pulseDot: { width: 10, height: 10, borderRadius: 999 },
  statusText: { fontSize: 16, fontWeight: '800' },
  statusSub: { fontSize: 12, color: COLORS.onSurfaceVariant, marginTop: 2 },
  statusDist: { fontSize: 13, fontWeight: '800', marginLeft: 10 },
  routePanel: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.outline,
    gap: 10,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: COLORS.onSurface },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.outline,
    backgroundColor: COLORS.surface,
  },
  routeRowActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryContainer },
  routeIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  routeText: { flex: 1, minWidth: 0 },
  routeTitle: { fontSize: 13, fontWeight: '800', color: COLORS.onSurface },
  routeSubtitle: { fontSize: 12, color: COLORS.onSurfaceVariant, marginTop: 2, lineHeight: 16 },
  mapButton: { borderRadius: 10 },
  infoPanel: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.outline,
    gap: 14,
  },
  infoTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  foodIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primaryContainer,
  },
  title: { fontSize: 17, fontWeight: '800', color: COLORS.onSurface },
  qty: { fontSize: 13, color: COLORS.onSurfaceVariant, marginTop: 2 },
  receiverRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  locLabel: { fontSize: 11, fontWeight: '800', color: COLORS.onSurfaceVariant, textTransform: 'uppercase' },
  locValue: { fontSize: 14, fontWeight: '700', color: COLORS.onSurface, marginTop: 2 },
  locSub: { fontSize: 13, color: COLORS.onSurfaceVariant, marginTop: 2, lineHeight: 18 },
  callButton: { borderRadius: 10 },
  progressPanel: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.outline,
    gap: 12,
  },
  stepCount: { fontSize: 12, fontWeight: '800', color: COLORS.primary },
  timeline: { gap: 0 },
  stepRow: { flexDirection: 'row', gap: 12 },
  stepIconCol: { alignItems: 'center', width: 28 },
  stepDot: {
    width: 24,
    height: 24,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surfaceVariant,
    borderWidth: 1,
    borderColor: COLORS.outline,
  },
  stepDotDone: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  stepDotActive: { borderWidth: 3, borderColor: COLORS.primary },
  connector: { width: 2, flex: 1, minHeight: 18, marginVertical: 3 },
  connectorDone: { backgroundColor: COLORS.primary },
  connectorTodo: { backgroundColor: COLORS.outline },
  stepTextWrap: { flex: 1, minHeight: 42 },
  stepLabel: { fontSize: 14, color: COLORS.onSurface, fontWeight: '600' },
  stepLabelActive: { fontWeight: '800', color: COLORS.primary },
  stepLabelTodo: { color: COLORS.onSurfaceVariant, fontWeight: '500' },
  stepHint: { fontSize: 12, color: COLORS.onSurfaceVariant, marginTop: 2 },
  primaryBtn: { borderRadius: 14 },
  primaryContent: { paddingVertical: 6 },
  secondaryRow: { flexDirection: 'row', gap: 12 },
  secondaryBtn: { flex: 1, borderRadius: 12 },
  dialogTitle: { fontSize: 18, fontWeight: '800', color: COLORS.onSurface },
  sheetHandle: { backgroundColor: COLORS.outline },
  sheet: { paddingHorizontal: 20, paddingBottom: 28, gap: 14 },
  sheetSub: { fontSize: 13, color: COLORS.onSurfaceVariant, lineHeight: 18, marginTop: 2 },
  reasonInput: {
    minHeight: 92,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.outline,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COLORS.onSurface,
    textAlignVertical: 'top',
  },
  qrHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  qrIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primaryContainer,
  },
  qrInput: {
    minHeight: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.outline,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 12,
    color: COLORS.onSurface,
  },
  sheetActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8 },
});
