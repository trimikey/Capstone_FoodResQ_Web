import { useCallback, useRef, useState } from 'react';
import { View, StyleSheet, ScrollView, Linking, Platform, RefreshControl, Pressable, Modal, Image } from 'react-native';
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
import { useVolunteerMe } from '@/hooks/useVolunteer';
import { DeferredRedirect } from '@/components/navigation/DeferredRedirect';
import { DeliveryRouteMap, type LatLng } from '@/components/DeliveryRouteMap';
import { ReportDialog } from '@/components/ReportDialog';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { AppImage } from '@/components/ui/AppImage';
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
import { mobileColors as COLORS, elevation, radius, spacing } from '@/theme/design';

interface PhotoReviewState {
  photo: CapturedImage;
  action: 'qc' | 'campaign_delivery';
  delivery: ActiveDelivery;
}

function PhotoReviewModal({
  state,
  onConfirm,
  onRetake,
  isConfirming,
}: {
  state: PhotoReviewState | null;
  onConfirm: () => void;
  onRetake: () => void;
  isConfirming: boolean;
}) {
  return (
    <Modal
      visible={state != null}
      transparent
      animationType="slide"
      onRequestClose={isConfirming ? undefined : onRetake}
    >
      <View style={styles.reviewOverlay}>
        <View style={styles.reviewCard}>
          <Text style={styles.reviewTitle}>Xem lại ảnh</Text>
          {state != null ? (
            <Image source={{ uri: state.photo.uri }} style={styles.reviewImage} resizeMode="contain" />
          ) : null}
          <Text style={styles.reviewHint}>
            {state?.action === 'qc'
              ? 'Ảnh lấy hàng tại điểm nhận. Xem lại trước khi xác nhận.'
              : 'Ảnh bàn giao tại điểm giao. Xem lại trước khi hoàn tất.'}
          </Text>
          <View style={styles.reviewActions}>
            <Button
              mode="outlined"
              icon="camera-retake"
              onPress={onRetake}
              disabled={isConfirming}
              textColor={COLORS.danger}
              style={[styles.reviewBtn, { borderColor: COLORS.danger }]}
            >
              Chụp lại
            </Button>
            <Button
              mode="contained"
              icon="check-circle-outline"
              onPress={onConfirm}
              loading={isConfirming}
              disabled={isConfirming}
              buttonColor={COLORS.primary}
              style={styles.reviewBtn}
            >
              Xác nhận
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}

interface DeliveredSummary {
  title: string;
  recipient: string;
  quantity: number | null;
  distanceLabel: string | null;
}

function DeliveredSuccessModal({ summary, onDismiss }: { summary: DeliveredSummary | null; onDismiss: () => void }) {
  return (
    <Modal visible={summary != null} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.successOverlay}>
        <View style={styles.successCard}>
          <View style={styles.successIconWrap}>
            <MaterialCommunityIcons name="check-circle" size={72} color={COLORS.success} />
          </View>
          <Text style={styles.successTitle}>Đã giao thành công</Text>
          <Text style={styles.successSub}>Đơn hàng đã hoàn tất</Text>

          <View style={styles.successDivider} />

          <View style={styles.successDetails}>
            <View style={styles.successRow}>
              <MaterialCommunityIcons name="food-variant" size={18} color={COLORS.orange} />
              <Text style={styles.successRowText} numberOfLines={2}>{summary?.title}</Text>
            </View>
            <View style={styles.successRow}>
              <MaterialCommunityIcons name="account-outline" size={18} color={COLORS.blue} />
              <Text style={styles.successRowText}>{summary?.recipient}</Text>
            </View>
            {summary?.quantity != null && (
              <View style={styles.successRow}>
                <MaterialCommunityIcons name="package-variant-closed" size={18} color={COLORS.indigo} />
                <Text style={styles.successRowText}>{summary.quantity} phần</Text>
              </View>
            )}
            {summary?.distanceLabel != null && (
              <View style={styles.successRow}>
                <MaterialCommunityIcons name="map-marker-distance" size={18} color={COLORS.teal} />
                <Text style={styles.successRowText}>{summary.distanceLabel}</Text>
              </View>
            )}
            <View style={[styles.successRow, styles.pointsRow]}>
              <MaterialCommunityIcons name="medal-outline" size={18} color={COLORS.warning} />
              <Text style={[styles.successRowText, styles.pointsText]}>+5 điểm cống hiến</Text>
            </View>
          </View>

          <Button
            mode="contained"
            buttonColor={COLORS.primary}
            style={styles.successBtn}
            contentStyle={styles.successBtnContent}
            onPress={onDismiss}
          >
            OK
          </Button>
        </View>
      </View>
    </Modal>
  );
}

/**
 * Bước cuối: mã QR đã đúng, ĐỐI CHIẾU người nhận (ảnh đã đăng ký + thông tin)
 * rồi mới bàn giao — quét trúng mã chưa chắc đúng người cầm máy. Cùng luật với
 * bản web và với bước provider quét QR ở đơn tự đến lấy.
 */
function HandoverConfirmModal({
  delivery,
  busy,
  onConfirm,
  onCancel,
}: {
  delivery: ActiveDelivery;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const reservation = delivery.reservation;
  const receiver = reservation?.receiver;
  const registeredPhoto = receiver?.faceImageUrl ?? receiver?.idCardImageUrl ?? null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.successOverlay}>
        <View style={styles.successCard}>
          <Text style={styles.successTitle}>Đối chiếu người nhận</Text>
          <Text style={styles.successSub}>Mã QR đã đúng — kiểm tra người trước mặt bạn</Text>

          <View style={styles.handoverPhotoWrap}>
            {registeredPhoto ? (
              <AppImage source={{ uri: registeredPhoto }} style={styles.handoverPhoto} />
            ) : (
              <View style={styles.handoverNoPhoto}>
                <MaterialCommunityIcons name="camera-off-outline" size={34} color={COLORS.warning} />
                <Text style={styles.handoverNoPhotoText}>Chưa đăng ký ảnh — hỏi giấy tờ tuỳ thân</Text>
              </View>
            )}
            {registeredPhoto ? <Text style={styles.handoverPhotoLabel}>Ảnh đã đăng ký</Text> : null}
          </View>

          <View style={styles.successDivider} />

          <View style={styles.successDetails}>
            <View style={styles.successRow}>
              <MaterialCommunityIcons name="account-outline" size={18} color={COLORS.blue} />
              <Text style={styles.successRowText}>{receiver?.user.fullName ?? '—'}</Text>
            </View>
            {receiver?.user.phone ? (
              <View style={styles.successRow}>
                <MaterialCommunityIcons name="phone-outline" size={18} color={COLORS.teal} />
                <Text style={styles.successRowText}>{receiver.user.phone}</Text>
              </View>
            ) : null}
            {receiver?.idCardNumber ? (
              <View style={styles.successRow}>
                <MaterialCommunityIcons name="card-account-details-outline" size={18} color={COLORS.indigo} />
                <Text style={styles.successRowText}>CCCD: {receiver.idCardNumber}</Text>
              </View>
            ) : null}
            <View style={styles.successRow}>
              <MaterialCommunityIcons name="food-variant" size={18} color={COLORS.orange} />
              <Text style={styles.successRowText} numberOfLines={2}>
                {reservation?.listing.title ?? '—'}
                {reservation?.quantity != null ? ` · ${reservation.quantity} phần` : ''}
              </Text>
            </View>
          </View>

          {reservation?.deliveryEvidenceUrl ? (
            <View style={styles.handoverEvidence}>
              <Text style={styles.handoverEvidenceLabel}>Bằng chứng người nhận khó di chuyển</Text>
              <AppImage source={{ uri: reservation.deliveryEvidenceUrl }} style={styles.handoverEvidenceImage} />
            </View>
          ) : null}

          <View style={styles.handoverActions}>
            <Button
              mode="outlined"
              onPress={onCancel}
              disabled={busy}
              textColor={COLORS.onSurface}
              style={styles.handoverBtn}
            >
              Chưa đúng người
            </Button>
            <Button
              mode="contained"
              buttonColor={COLORS.primary}
              onPress={onConfirm}
              loading={busy}
              disabled={busy}
              style={styles.handoverBtn}
            >
              Bàn giao
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}

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
function advanceLabel(status: string, hasPickupPhoto: boolean, isCampaignTransport: boolean): string {
  switch (status) {
    case 'assigned':
      return 'Đi tới điểm lấy';
    case 'heading_to_provider':
      return hasPickupPhoto ? 'Xác nhận đã lấy hàng' : 'Chụp ảnh hàng';
    case 'qc_completed':
      return 'Chỉ đường đến điểm giao';
    case 'in_transit':
      return isCampaignTransport ? 'Chụp ảnh bàn giao cho bếp' : 'Hoàn tất giao hàng';
    default:
      return 'Cập nhật trạng thái';
  }
}
function advanceIcon(
  status: string,
  hasPickupPhoto: boolean,
  isCampaignTransport: boolean,
): keyof typeof MaterialCommunityIcons.glyphMap {
  switch (status) {
    case 'heading_to_provider':
      return hasPickupPhoto ? 'check-circle-outline' : 'camera';
    case 'in_transit':
      return isCampaignTransport ? 'camera' : 'qrcode-scan';
    default:
      return 'arrow-right-circle';
  }
}
function statusHint(status: string, hasPickupPhoto: boolean, isCampaignTransport: boolean): string {
  switch (status) {
    case 'assigned':
      return 'Chờ đi lấy hàng';
    case 'heading_to_provider':
      return hasPickupPhoto ? 'Ảnh đã chụp, chờ xác nhận' : 'Đang tới điểm lấy';
    case 'qc_completed':
      return 'Đã lấy hàng, chờ đi giao';
    case 'in_transit':
      return isCampaignTransport ? 'Đang giao đến bếp, cần ảnh bàn giao' : 'Đang giao, chờ mã người nhận';
    case 'delivered':
      return isCampaignTransport ? 'Đã giao, chờ bếp xác nhận nhận hàng' : 'Đơn đã hoàn tất';
    default:
      return 'Theo dõi tiến trình giao hàng';
  }
}

export default function VolunteerActiveScreen() {
  const reasonSheetRef = useRef<BottomSheetModal>(null);
  const qrSheetRef = useRef<BottomSheetModal>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const { data, isLoading, isError, refetch, isRefetching } = useActiveDelivery();
  const { data: volunteer, isLoading: isVolunteerLoading } = useVolunteerMe();
  const updateStatus = useUpdateDeliveryStatus();
  const failDelivery = useFailDelivery();
  const cancelAssignment = useCancelAssignment();

  const [reasonMode, setReasonMode] = useState<'cancel' | 'fail' | null>(null);
  const [reasonText, setReasonText] = useState('');
  const [qrToken, setQrToken] = useState('');
  const [reportVisible, setReportVisible] = useState(false);
  const [pendingPickupPhoto, setPendingPickupPhoto] = useState<{ deliveryId: string; photo: CapturedImage } | null>(null);
  const [photoReview, setPhotoReview] = useState<PhotoReviewState | null>(null);
  const [qrScannerOpen, setQrScannerOpen] = useState(false);
  const [qrScanning, setQrScanning] = useState(false);
  // Lỗi hiển thị NGAY TRONG sheet: Popup (Paper Portal) bị container của
  // BottomSheetModal đè lên nên popup lỗi khi sheet đang mở là vô hình.
  const [qrError, setQrError] = useState<string | null>(null);
  // Chặn camera bắn nhiều lần trước khi state `busy` kịp render (state là async,
  // ref là đồng bộ) — tránh gọi API xác nhận trùng lặp.
  const qrSubmittingRef = useRef(false);
  const [torch, setTorch] = useState(false);
  const [deliveredSummary, setDeliveredSummary] = useState<DeliveredSummary | null>(null);
  // Mã QR đã quét đúng, đang chờ shipper ĐỐI CHIẾU người nhận rồi mới bàn giao —
  // quét trúng mã chưa chắc đúng người cầm máy (giống luật của đơn tự đến lấy).
  const [handoverToken, setHandoverToken] = useState<string | null>(null);

  const delivery = data ?? null;
  const busy = updateStatus.isPending || failDelivery.isPending || cancelAssignment.isPending || qrScanning;
  const hasVerifiedShipper = volunteer?.specializations.some(
    (s) => s.specialization === 'shipper' && s.isVerified
  ) === true;
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
    setQrError(null);
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
      if (d.source === 'reservation') {
        openQrSheet();
        return;
      }

      try {
        const photo = await captureImage('id_card');
        if (!photo) {
          Popup.show({ type: 'info', text1: 'Cần ảnh bàn giao', text2: 'Hãy chụp ảnh thực phẩm tại bếp trước khi hoàn tất.' });
          return;
        }
        setPhotoReview({ photo, action: 'campaign_delivery', delivery: d });
      } catch (e: any) {
        void notifyError();
        Popup.show({
          type: 'error',
          text1: 'Không mở được camera',
          text2: e?.message ?? 'Cần quyền camera.',
        });
      }
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
        setPhotoReview({ photo, action: 'qc', delivery: d });
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
    if (qrSubmittingRef.current) return;
    const token = (tokenOverride ?? qrToken).trim();
    if (!token) {
      setQrError('Nhập hoặc quét mã QR trên màn nhận hàng của người nhận.');
      void notifyWarning();
      return;
    }
    // Đơn của người nhận → bắt buộc đối chiếu ảnh/thông tin trước khi bàn giao.
    // Chuyến giao cho bếp chiến dịch không có hồ sơ người nhận nên chốt thẳng.
    if (delivery.reservation) {
      qrSheetRef.current?.dismiss();
      setQrScannerOpen(false);
      setHandoverToken(token);
      return;
    }
    await finalizeHandover(token);
  };

  /** Goi API chot ban giao - chay SAU khi da doi chieu (hoac don chien dich). */
  const finalizeHandover = async (token: string) => {
    if (!delivery) return;
    const snapshot = {
      title: delivery.reservation?.listing.title ?? delivery.campaignTransport?.campaignTitle ?? 'Chuyến giao',
      recipient: delivery.reservation?.receiver?.user.fullName ?? delivery.campaignTransport?.campaignTitle ?? 'Bếp chiến dịch',
      quantity: delivery.reservation?.quantity ?? null,
      distanceLabel: formatKm(delivery.distanceKm),
    };
    try {
      qrSubmittingRef.current = true;
      setQrScanning(true);
      setQrError(null);
      await updateStatus.mutateAsync({ deliveryId: delivery.id, status: 'delivered' as DeliveryStatus, qrToken: token });
      qrSheetRef.current?.dismiss();
      setQrToken('');
      setQrScannerOpen(false);
      setHandoverToken(null);
      void notifySuccess();
      setDeliveredSummary(snapshot);
    } catch (e: any) {
      void notifyError();
      // Không dùng Popup ở đây: sheet đang mở sẽ che popup (Paper Portal nằm
      // dưới container BottomSheetModal) — hiện lỗi inline trong sheet.
      setQrError(e?.response?.data?.error?.message ?? 'Kiểm tra lại mã QR của người nhận.');
    } finally {
      qrSubmittingRef.current = false;
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

  const confirmPhotoReview = async () => {
    if (!photoReview) return;
    const { photo, action, delivery } = photoReview;
    if (action === 'qc') {
      setPhotoReview(null);
      setPendingPickupPhoto({ deliveryId: delivery.id, photo });
      void notifySuccess();
      Popup.show({ type: 'success', text1: 'Ảnh đã sẵn sàng', text2: 'Bấm xác nhận để chuyển sang bước giao hàng.' });
    } else {
      try {
        await updateDeliveryStatus(delivery, 'delivered', { photo, successText: 'Đã bàn giao cho bếp' });
      } catch (e: any) {
        void notifyError();
        Popup.show({
          type: 'error',
          text1: 'Không thể hoàn tất giao hàng',
          text2: e?.response?.data?.error?.message ?? e?.message ?? 'Vui lòng thử lại.',
        });
      } finally {
        setPhotoReview(null);
      }
    }
  };

  if (!isVolunteerLoading && volunteer && !hasVerifiedShipper) {
    return <DeferredRedirect href="/(app)/volunteer/campaigns" />;
  }

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
              : 'Hãy đăng ký ca giao hàng rồi tự nhận đơn phù hợp ở tab Giao hàng.'}
          </Text>
        </ScrollView>
        <DeliveredSuccessModal summary={deliveredSummary} onDismiss={() => setDeliveredSummary(null)} />
      </SafeAreaView>
    );
  }

  const reservation = delivery.reservation;
  const transport = delivery.campaignTransport;
  const isCampaignTransport = delivery.source === 'campaign_transport';
  const pickup = pickupOf(delivery.coords) ?? toLatLng(delivery.pickup.lat, delivery.pickup.lng);
  const dropoff = dropoffOf(delivery.coords) ?? toLatLng(delivery.destination.lat, delivery.destination.lng);
  const meta = deliveryStatusMeta(delivery.status);
  const canAdvance = nextDeliveryStatus(delivery.status) != null;
  const canCancel = ['assigned', 'heading_to_provider'].includes(delivery.status);
  const canFail = ['qc_completed', 'in_transit'].includes(delivery.status);
  const phone = reservation?.receiver?.user.phone ?? null;
  const distanceLabel = formatKm(delivery.distanceKm);
  const deliveryTitle = reservation?.listing.title ?? transport?.campaignTitle ?? 'Chuyến giao chiến dịch';
  const quantity = reservation?.quantity ?? null;
  const recipientName = reservation?.receiver?.user.fullName ?? transport?.campaignTitle ?? 'Bếp chiến dịch';
  const routeTargets: RouteTarget[] = [
    {
      key: 'pickup',
      title: 'Điểm lấy hàng',
      subtitle: delivery.pickup.address ?? reservation?.listing.pickupAddress ?? 'Chưa có địa chỉ lấy hàng',
      address: delivery.pickup.address ?? reservation?.listing.pickupAddress,
      coords: pickup,
      icon: 'storefront-outline',
      color: COLORS.secondary,
    },
    {
      key: 'dropoff',
      title: isCampaignTransport ? 'Bếp nhận hàng' : 'Điểm giao hàng',
      subtitle: delivery.destination.address ?? reservation?.receiver?.address ?? recipientName,
      address: delivery.destination.address ?? reservation?.receiver?.address,
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
              <Text style={styles.statusSub}>{statusHint(delivery.status, hasPickupPhoto, isCampaignTransport)}</Text>
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
              <MaterialCommunityIcons name="food-variant" size={22} color={COLORS.orange} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{deliveryTitle}</Text>
              {quantity != null ? <Text style={styles.qty}>Số lượng: {quantity}</Text> : null}
            </View>
          </View>
          <View style={styles.receiverRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.locLabel}>{isCampaignTransport ? 'Bếp nhận hàng' : 'Người nhận'}</Text>
              <Text style={styles.locValue}>{recipientName}</Text>
              {routeTargets[1].address ? <Text style={styles.locSub}>{routeTargets[1].address}</Text> : null}
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
            icon={advanceIcon(delivery.status, hasPickupPhoto, isCampaignTransport)}
            onPress={() => handleAdvance(delivery, pickupTarget, dropoffTarget)}
            loading={updateStatus.isPending}
            disabled={busy}
            buttonColor={COLORS.primary}
            style={styles.primaryBtn}
            contentStyle={styles.primaryContent}
          >
            {advanceLabel(delivery.status, hasPickupPhoto, isCampaignTransport)}
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
              <MaterialCommunityIcons name="qrcode-scan" size={22} color={COLORS.purple} />
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
            onChangeText={(value) => {
              setQrToken(value);
              if (qrError) setQrError(null);
            }}
            autoCapitalize="none"
            editable={!busy}
            style={styles.qrInput}
            accessibilityLabel="Mã QR người nhận"
          />
          {qrError ? (
            <View style={styles.qrErrorRow}>
              <MaterialCommunityIcons name="alert-circle" size={16} color={COLORS.error} />
              <Text style={styles.qrErrorText}>{qrError}</Text>
            </View>
          ) : null}
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

      {/* Đối chiếu người nhận sau khi quét đúng QR — xác nhận rồi mới bàn giao */}
      {handoverToken && delivery ? (
        <HandoverConfirmModal
          delivery={delivery}
          busy={qrScanning || updateStatus.isPending}
          onConfirm={() => void finalizeHandover(handoverToken)}
          onCancel={() => setHandoverToken(null)}
        />
      ) : null}

      <DeliveredSuccessModal summary={deliveredSummary} onDismiss={() => setDeliveredSummary(null)} />
      <PhotoReviewModal
        state={photoReview}
        onConfirm={() => void confirmPhotoReview()}
        onRetake={() => setPhotoReview(null)}
        isConfirming={updateStatus.isPending && photoReview?.action === 'campaign_delivery'}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: 96, gap: spacing.md },
  emptyWrap: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.section, gap: spacing.sm },
  emptyTitle: { fontSize: 20, fontWeight: '900', color: COLORS.onSurface, marginTop: 8 },
  emptySub: { fontSize: 14, color: COLORS.onSurfaceVariant, textAlign: 'center', lineHeight: 20 },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: COLORS.blueContainer,
    ...elevation.card,
  },
  statusLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  pulseDot: { width: 10, height: 10, borderRadius: 999 },
  statusText: { fontSize: 18, fontWeight: '900' },
  statusSub: { fontSize: 12, color: COLORS.onSurfaceVariant, marginTop: 2 },
  statusDist: { fontSize: 13, fontWeight: '800', marginLeft: 10 },
  routePanel: {
    backgroundColor: COLORS.surface,
    borderRadius: 28,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    gap: spacing.md,
    ...elevation.card,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: COLORS.onSurface },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: spacing.md,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    backgroundColor: COLORS.surface,
  },
  routeRowActive: { borderColor: COLORS.blue, backgroundColor: COLORS.blueContainer },
  routeIcon: { width: 40, height: 40, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  routeText: { flex: 1, minWidth: 0 },
  routeTitle: { fontSize: 13, fontWeight: '800', color: COLORS.onSurface },
  routeSubtitle: { fontSize: 12, color: COLORS.onSurfaceVariant, marginTop: 2, lineHeight: 16 },
  mapButton: { borderRadius: radius.md },
  infoPanel: {
    backgroundColor: COLORS.surface,
    borderRadius: 28,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    gap: spacing.md,
    ...elevation.card,
  },
  infoTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  foodIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.orangeContainer,
  },
  title: { fontSize: 19, fontWeight: '900', color: COLORS.onSurface, lineHeight: 24 },
  qty: { fontSize: 13, color: COLORS.onSurfaceVariant, marginTop: 2 },
  receiverRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  locLabel: { fontSize: 11, fontWeight: '800', color: COLORS.onSurfaceVariant, textTransform: 'uppercase' },
  locValue: { fontSize: 14, fontWeight: '700', color: COLORS.onSurface, marginTop: 2 },
  locSub: { fontSize: 13, color: COLORS.onSurfaceVariant, marginTop: 2, lineHeight: 18 },
  callButton: { borderRadius: 10 },
  progressPanel: {
    backgroundColor: COLORS.surface,
    borderRadius: 28,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    gap: 12,
    ...elevation.card,
  },
  stepCount: { fontSize: 12, fontWeight: '800', color: COLORS.indigo },
  compactTimeline: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stepChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.outline,
    backgroundColor: COLORS.surface,
  },
  stepChipDone: { backgroundColor: COLORS.tealContainer, borderColor: COLORS.tealContainer },
  stepChipActive: { borderColor: COLORS.indigo, backgroundColor: COLORS.indigoContainer },
  stepMiniDot: {
    width: 18,
    height: 18,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surfaceVariant,
  },
  stepMiniDotDone: { backgroundColor: COLORS.teal },
  stepMiniDotActive: { borderWidth: 2, borderColor: COLORS.indigo },
  stepLabel: { fontSize: 12, color: COLORS.onSurface, fontWeight: '700' },
  stepLabelActive: { fontWeight: '800', color: COLORS.indigo },
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
  primaryContent: { paddingVertical: 8 },
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
    backgroundColor: COLORS.purpleContainer,
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
  qrErrorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 8 },
  qrErrorText: { flex: 1, fontSize: 13, lineHeight: 18, color: COLORS.error },
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
  successOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.section,
  },
  successCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 28,
    padding: spacing.section,
    width: '100%',
    alignItems: 'center',
    gap: 12,
    ...elevation.card,
  },
  successIconWrap: { marginBottom: 4 },
  successTitle: { fontSize: 24, fontWeight: '900', color: COLORS.onSurface, textAlign: 'center' },
  successSub: { fontSize: 14, color: COLORS.onSurfaceVariant, textAlign: 'center' },
  successDivider: { width: '100%', height: 1, backgroundColor: COLORS.outlineVariant, marginVertical: 4 },
  successDetails: { width: '100%', gap: 10 },
  successRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  successRowText: { flex: 1, fontSize: 15, color: COLORS.onSurface, fontWeight: '600' },
  pointsRow: {
    backgroundColor: COLORS.warningContainer,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  pointsText: { color: COLORS.warning, fontWeight: '800' },
  successBtn: { borderRadius: 14, width: '100%', marginTop: 4 },
  successBtnContent: { paddingVertical: 8 },
  // ── Đối chiếu người nhận trước khi bàn giao ──
  handoverPhotoWrap: { alignItems: 'center', gap: 6, marginTop: 4 },
  handoverPhoto: {
    width: 132,
    height: 132,
    borderRadius: radius.lg,
    borderWidth: 3,
    borderColor: COLORS.primaryContainer,
  },
  handoverNoPhoto: {
    width: '100%',
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#fcd34d',
    backgroundColor: '#fffbeb',
    alignItems: 'center',
    gap: 6,
  },
  handoverNoPhotoText: { fontSize: 12, fontWeight: '700', color: '#92400e', textAlign: 'center' },
  handoverPhotoLabel: { fontSize: 11, fontWeight: '800', color: COLORS.primary },
  handoverEvidence: {
    width: '100%',
    marginTop: 4,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#fcd34d',
    backgroundColor: '#fffbeb',
    gap: 6,
  },
  handoverEvidenceLabel: { fontSize: 11, fontWeight: '800', color: '#78350f' },
  handoverEvidenceImage: { width: '100%', height: 120, borderRadius: radius.sm },
  handoverActions: { flexDirection: 'row', gap: spacing.sm, width: '100%', marginTop: 6 },
  handoverBtn: { flex: 1, borderRadius: 14 },
  reviewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'flex-end',
    padding: spacing.lg,
    paddingBottom: 48,
  },
  reviewCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 28,
    padding: spacing.lg,
    width: '100%',
    gap: spacing.md,
  },
  reviewTitle: { fontSize: 20, fontWeight: '800', color: COLORS.onSurface },
  reviewImage: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: 16,
    backgroundColor: '#111',
  },
  reviewHint: { fontSize: 13, color: COLORS.onSurfaceVariant, lineHeight: 18 },
  reviewActions: { flexDirection: 'row', gap: 12 },
  reviewBtn: { flex: 1, borderRadius: 14 },
});
