import { useCallback, useRef, useState } from 'react';
import { View, StyleSheet, ScrollView, Linking, Platform, RefreshControl, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Button, ActivityIndicator } from 'react-native-paper';
import { CameraView, useCameraPermissions } from 'expo-camera';
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
import { captureImage, type CapturedImage } from '@/services/faceCapture';
import { notifyError, notifySuccess, notifyWarning, selectionFeedback } from '@/services/haptics';
import {
  DELIVERY_STEPS,
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
function advanceLabel(status: string, hasPickupPhoto: boolean): string {
  switch (status) {
    case 'assigned':
      return 'Đi tới điểm lấy';
    case 'heading_to_provider':
      return hasPickupPhoto ? 'Xác nhận đã lấy hàng' : 'Chụp ảnh hàng';
    case 'qc_completed':
      return 'Chỉ đường đến điểm giao';
    case 'in_transit':
      return 'Hoàn tất giao hàng';
    default:
      return 'Cập nhật trạng thái';
  }
}
function advanceIcon(status: string, hasPickupPhoto: boolean): keyof typeof MaterialCommunityIcons.glyphMap {
  switch (status) {
    case 'heading_to_provider':
      return hasPickupPhoto ? 'check-circle-outline' : 'camera';
    case 'in_transit':
      return 'qrcode-scan';
    default:
      return 'arrow-right-circle';
  }
}
function statusHint(status: string, hasPickupPhoto: boolean): string {
  switch (status) {
    case 'assigned':
      return 'Chờ đi lấy hàng';
    case 'heading_to_provider':
      return hasPickupPhoto ? 'Ảnh đã chụp, chờ xác nhận' : 'Đang tới điểm lấy';
    case 'qc_completed':
      return 'Đã lấy hàng, chờ đi giao';
    case 'in_transit':
      return 'Đang giao, chờ mã người nhận';
    case 'delivered':
      return 'Đơn đã hoàn tất';
    default:
      return 'Theo dõi tiến trình giao hàng';
  }
}

export default function VolunteerActiveScreen() {
  const reasonSheetRef = useRef<BottomSheetModal>(null);
  const qrSheetRef = useRef<BottomSheetModal>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const { data, isLoading, isError, refetch, isRefetching } = useActiveDelivery();
  const updateStatus = useUpdateDeliveryStatus();
  const failDelivery = useFailDelivery();
  const cancelAssignment = useCancelAssignment();

  const [reasonMode, setReasonMode] = useState<'cancel' | 'fail' | null>(null);
  const [reasonText, setReasonText] = useState('');
  const [qrToken, setQrToken] = useState('');
  const [reportVisible, setReportVisible] = useState(false);
  const [pendingPickupPhoto, setPendingPickupPhoto] = useState<{ deliveryId: string; photo: CapturedImage } | null>(null);
  const [qrScannerOpen, setQrScannerOpen] = useState(false);
  const [qrScanning, setQrScanning] = useState(false);
  const [torch, setTorch] = useState(false);

  const delivery = data ?? null;
  const busy = updateStatus.isPending || failDelivery.isPending || cancelAssignment.isPending || qrScanning;
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
    setQrScannerOpen(false);
    setTorch(false);
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

  const updateDeliveryStatus = async (
    d: ActiveDelivery,
    status: DeliveryStatus,
    options?: { photo?: CapturedImage; qrToken?: string; successText?: string }
  ) => {
    await updateStatus.mutateAsync({
      deliveryId: d.id,
      status,
      photo: options?.photo,
      qrToken: options?.qrToken,
    });
    void notifySuccess();
    Popup.show({
      type: 'success',
      text1: options?.successText ?? 'Đã cập nhật tiến trình',
      text2: deliveryStatusMeta(status).label,
    });
  };

  const handleAdvance = async (d: ActiveDelivery, pickupTarget: RouteTarget, dropoffTarget: RouteTarget) => {
    const next = nextDeliveryStatus(d.status);
    if (!next) return;
    if (next === 'delivered') {
      openQrSheet();
      return;
    }

    if (d.status === 'assigned') {
      try {
        await updateDeliveryStatus(d, next, { successText: 'Đang tới điểm lấy' });
        await openMaps(pickupTarget);
      } catch (e: any) {
        void notifyError();
        Popup.show({
          type: 'error',
          text1: 'Cập nhật thất bại',
          text2: e?.response?.data?.error?.message ?? 'Vui lòng thử lại.',
        });
      }
      return;
    }

    const pendingPhoto = pendingPickupPhoto?.deliveryId === d.id ? pendingPickupPhoto.photo : null;

    if (requiresQcPhoto(next) && !pendingPhoto) {
      try {
        const photo = await captureImage('id_card');
        if (!photo) {
          Popup.show({ type: 'info', text1: 'Cần ảnh lấy hàng', text2: 'Hãy chụp ảnh hàng trước khi xác nhận.' });
          return;
        }
        setPendingPickupPhoto({ deliveryId: d.id, photo });
        void notifySuccess();
        Popup.show({ type: 'success', text1: 'Ảnh đã sẵn sàng', text2: 'Bấm xác nhận để chuyển sang bước giao hàng.' });
      } catch (e: any) {
        Popup.show({ type: 'error', text1: 'Không mở được camera', text2: e?.message ?? 'Cần quyền camera.' });
      }
      return;
    }

    try {
      await updateDeliveryStatus(d, next, { photo: pendingPhoto ?? undefined });
      setPendingPickupPhoto(null);
      if (d.status === 'qc_completed') {
        await openMaps(dropoffTarget);
      }
    } catch (e: any) {
      void notifyError();
      Popup.show({
        type: 'error',
        text1: 'Cập nhật thất bại',
        text2: e?.response?.data?.error?.message ?? 'Vui lòng thử lại.',
      });
    }
  };

  const openQrScanner = async () => {
    setQrScannerOpen(true);
    if (!cameraPermission?.granted) {
      await requestCameraPermission();
    }
  };

  const submitQrToken = async (tokenOverride?: string) => {
    if (!delivery) return;
    const token = (tokenOverride ?? qrToken).trim();
    if (!token) {
      Popup.show({ type: 'warning', text1: 'Nhập mã người nhận', text2: 'Mã QR nằm trên màn nhận hàng của receiver.' });
      void notifyWarning();
      return;
    }
    try {
      setQrScanning(true);
      await updateStatus.mutateAsync({ deliveryId: delivery.id, status: 'delivered' as DeliveryStatus, qrToken: token });
      qrSheetRef.current?.dismiss();
      setQrToken('');
      setQrScannerOpen(false);
      void notifySuccess();
      Popup.show({ type: 'success', text1: 'Đã giao thành công', text2: 'Đơn đã hoàn tất.' });
    } catch (e: any) {
      void notifyError();
      Popup.show({
        type: 'error',
        text1: 'Không xác nhận được mã',
        text2: e?.response?.data?.error?.message ?? 'Kiểm tra lại mã QR của người nhận.',
      });
    } finally {
      setQrScanning(false);
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
  const pickupTarget = routeTargets[0];
  const dropoffTarget = routeTargets[1];
  const progressSteps = DELIVERY_STEPS;
  const displayIndex = Math.max(
    progressSteps.findIndex((step) => step.key === delivery.status),
    0
  );
  const hasPickupPhoto = delivery.status === 'heading_to_provider' && pendingPickupPhoto?.deliveryId === delivery.id;

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
              <Text style={styles.statusSub}>{statusHint(delivery.status, hasPickupPhoto)}</Text>
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
              {displayIndex + 1}/{progressSteps.length}
            </Text>
          </View>
          <View style={styles.compactTimeline}>
            {progressSteps.map((step) => {
              const stepIndex = progressSteps.findIndex((item) => item.key === step.key);
              const done = displayIndex >= stepIndex;
              const active = delivery.status === step.key;
              return (
                <View key={step.key} style={[styles.stepChip, done && styles.stepChipDone, active && styles.stepChipActive]}>
                  <View style={[styles.stepMiniDot, done && styles.stepMiniDotDone, active && styles.stepMiniDotActive]}>
                    <MaterialCommunityIcons
                      name={done ? 'check' : 'circle'}
                      size={done ? 11 : 6}
                      color={done ? COLORS.surface : COLORS.muted}
                    />
                  </View>
                  <Text style={[styles.stepLabel, active && styles.stepLabelActive, !done && styles.stepLabelTodo]}>
                    {step.label}
                  </Text>
                </View>
              );
            })}
          </View>
          {hasPickupPhoto ? (
            <View style={styles.photoReady}>
              <MaterialCommunityIcons name="image-check-outline" size={18} color={COLORS.success} />
              <Text style={styles.photoReadyText}>Ảnh hàng đã sẵn sàng, chờ xác nhận.</Text>
            </View>
          ) : null}
        </FadeInUp>

        {canAdvance ? (
          <Button
            mode="contained"
            icon={advanceIcon(delivery.status, hasPickupPhoto)}
            onPress={() => handleAdvance(delivery, pickupTarget, dropoffTarget)}
            loading={updateStatus.isPending}
            disabled={busy}
            buttonColor={COLORS.primary}
            style={styles.primaryBtn}
            contentStyle={styles.primaryContent}
          >
            {advanceLabel(delivery.status, hasPickupPhoto)}
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
              <Text style={styles.sheetSub}>Quét hoặc nhập mã QR trên màn nhận hàng để hoàn tất.</Text>
            </View>
          </View>
          <Button
            mode={qrScannerOpen ? 'contained-tonal' : 'outlined'}
            icon="qrcode-scan"
            onPress={() => void openQrScanner()}
            disabled={busy}
            style={styles.scanToggle}
          >
            Scan QR
          </Button>
          {qrScannerOpen ? (
            <View style={styles.scannerBox}>
              {!cameraPermission ? (
                <ActivityIndicator color={COLORS.primary} />
              ) : !cameraPermission.granted ? (
                <View style={styles.scannerPerm}>
                  <MaterialCommunityIcons name="camera-off" size={38} color={COLORS.onSurfaceVariant} />
                  <Text style={styles.scannerHint}>Cần quyền camera để quét mã QR.</Text>
                  <Button mode="contained" buttonColor={COLORS.primary} onPress={requestCameraPermission}>
                    Cấp quyền camera
                  </Button>
                </View>
              ) : (
                <>
                  <CameraView
                    style={StyleSheet.absoluteFill}
                    facing="back"
                    enableTorch={torch}
                    barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                    onBarcodeScanned={busy ? undefined : ({ data }) => void submitQrToken(data)}
                  />
                  <Pressable
                    style={styles.torchBtn}
                    onPress={() => {
                      void selectionFeedback();
                      setTorch((value) => !value);
                    }}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={torch ? 'Tắt đèn flash' : 'Bật đèn flash'}
                  >
                    <MaterialCommunityIcons name={torch ? 'flash' : 'flash-off'} size={22} color="#fff" />
                  </Pressable>
                  <View style={styles.scanFrame} />
                </>
              )}
              {qrScanning ? (
                <View style={styles.scanningOverlay}>
                  <ActivityIndicator color="#fff" />
                  <Text style={styles.scanningText}>Đang xác nhận</Text>
                </View>
              ) : null}
            </View>
          ) : null}
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
              onPress={() => void submitQrToken()}
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
  compactTimeline: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stepChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.outline,
    backgroundColor: COLORS.surface,
  },
  stepChipDone: { backgroundColor: COLORS.primaryContainer, borderColor: COLORS.primaryContainer },
  stepChipActive: { borderColor: COLORS.primary, backgroundColor: COLORS.surface },
  stepMiniDot: {
    width: 18,
    height: 18,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surfaceVariant,
  },
  stepMiniDotDone: { backgroundColor: COLORS.primary },
  stepMiniDotActive: { borderWidth: 2, borderColor: COLORS.primary },
  stepLabel: { fontSize: 12, color: COLORS.onSurface, fontWeight: '700' },
  stepLabelActive: { fontWeight: '800', color: COLORS.primary },
  stepLabelTodo: { color: COLORS.onSurfaceVariant, fontWeight: '600' },
  photoReady: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#dcfce7',
  },
  photoReadyText: { flex: 1, fontSize: 13, fontWeight: '700', color: COLORS.success },
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
  scanToggle: { alignSelf: 'flex-start', borderRadius: 999 },
  scannerBox: {
    width: '100%',
    aspectRatio: 1.35,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scannerPerm: { alignItems: 'center', gap: 10, padding: 18 },
  scannerHint: { color: COLORS.onSurfaceVariant, textAlign: 'center' },
  torchBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanFrame: {
    width: 156,
    height: 156,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#fff',
    backgroundColor: 'transparent',
  },
  scanningOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  scanningText: { color: '#fff', marginTop: 8, fontWeight: '700' },
  sheetActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8 },
});
