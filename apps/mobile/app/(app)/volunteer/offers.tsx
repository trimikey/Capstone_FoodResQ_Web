import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator, Dialog, Portal, Text, Button } from 'react-native-paper';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import {
  useMyOffers,
  useAcceptOffer,
  useRejectOffer,
  useDeliveryOfferSocket,
  type TaskOffer,
} from '@/hooks/useDeliveries';
import { useListings, type Listing } from '@/hooks/useListings';
import { useEnrollFace, useFaceEnrollment } from '@/hooks/useFaceEnrollment';
import { useSetAvailability, useVolunteerMe } from '@/hooks/useVolunteer';
import { ListingsMapView, type DeliveryMapRoute } from '@/components/ListingsMapView';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Popup, Toast } from '@/components/ui/AppPopup';
import { ScreenState } from '@/components/ui/ScreenState';
import { notifyError, notifySuccess } from '@/services/haptics';
import { DEFAULT_COORDS, DEFAULT_LOCATION_LABEL, getLocationLabel } from '@/services/geolocation';
import { reverseGeocode } from '@/services/geocoding';
import { captureImage, pickImageFromLibrary } from '@/services/faceCapture';
import { mobileColors as COLORS } from '@/theme/design';

function formatKm(km: unknown): string | null {
  if (km == null) return null;
  const n = Number(km);
  return Number.isFinite(n) ? `${n.toFixed(1)} km` : null;
}

function isFiniteCoord(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

/** Đếm ngược tới hạn hết hiệu lực lời mời. */
function countdown(expiresAt: string, now: number): string {
  const ms = new Date(expiresAt).getTime() - now;
  if (ms <= 0) return 'Đã hết hạn';
  const s = Math.floor(ms / 1000);
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `Còn ${mm}:${String(ss).padStart(2, '0')}`;
}

function isExpired(offer: TaskOffer, now: number): boolean {
  return new Date(offer.expiresAt).getTime() - now <= 0;
}

function offerSortValue(offer: TaskOffer): number {
  const expires = new Date(offer.expiresAt).getTime();
  return Number.isFinite(expires) ? expires : Number.MAX_SAFE_INTEGER;
}

function offerDetails(offer: TaskOffer) {
  const delivery = offer.delivery;
  const reservation = delivery?.reservation;
  const listing = reservation?.listing;
  const receiver = reservation?.receiver;

  return {
    title: listing?.title ?? 'Đơn giao hàng',
    quantity: reservation?.quantity ?? null,
    pickupAddress: listing?.pickupAddress ?? 'Chưa có địa chỉ lấy hàng',
    dropoffAddress: receiver?.address ?? 'Theo địa chỉ người nhận',
    distanceLabel: formatKm(delivery?.distanceKm),
    offeredTime: formatTime(offer.offeredAt),
  };
}

function isFaceNotEnrolledError(e: any): boolean {
  const code = e?.response?.data?.error?.code;
  const message = e?.response?.data?.error?.message ?? e?.message ?? '';
  return code === 'FACE_NOT_ENROLLED' || String(message).includes('FACE_NOT_ENROLLED');
}

/**
 * Đơn cần giao (tab volunteer) - danh sách lời mời giao hàng đang chờ.
 * Mỗi lời mời: điểm lấy/giao + bản đồ tuyến + đếm ngược; Chấp nhận / Từ chối.
 * Poll 15s. Chấp nhận xong → chuyển sang tab "Đang giao".
 */
export default function VolunteerOffersScreen() {
  const offerSheetRef = useRef<BottomSheetModal>(null);
  const { data, isLoading, isError, refetch, isRefetching } = useMyOffers();
  const {
    data: volunteer,
    isLoading: isVolunteerLoading,
    isError: isVolunteerError,
    refetch: refetchVolunteer,
  } = useVolunteerMe();
  useDeliveryOfferSocket(); // nhận lời mời realtime, không chờ poll 15s
  const accept = useAcceptOffer();
  const reject = useRejectOffer();
  const setAvailability = useSetAvailability();
  const faceEnrollment = useFaceEnrollment();
  const enrollFace = useEnrollFace();
  const [now, setNow] = useState(() => Date.now());
  const [actingId, setActingId] = useState<string | null>(null);
  const [resolvedAddress, setResolvedAddress] = useState<{ key: string; value: string } | null>(null);
  const [deferredIds, setDeferredIds] = useState<string[]>([]);
  const [facePromptVisible, setFacePromptVisible] = useState(false);
  const lastPromptedIdRef = useRef<string | null>(null);
  const needsFaceEnrollment = faceEnrollment.data?.enrolled === false;

  const offers = useMemo(
    () => [...(data ?? [])].sort((a, b) => offerSortValue(a) - offerSortValue(b)),
    [data]
  );

  useEffect(() => {
    if (offers.length === 0) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [offers.length]);
  const activeOffer = useMemo(
    () => offers.find((offer) => !deferredIds.includes(offer.id) && !isExpired(offer, now)) ?? null,
    [deferredIds, now, offers]
  );
  const queueOffers = useMemo(
    () => offers.filter((offer) => offer.id !== activeOffer?.id),
    [activeOffer?.id, offers]
  );
  const rawCurrentLocation = volunteer?.currentLocation ?? null;
  const currentLocation =
    rawCurrentLocation && isFiniteCoord(rawCurrentLocation.lat) && isFiniteCoord(rawCurrentLocation.lng)
      ? rawCurrentLocation
      : null;
  const currentLat = currentLocation?.lat;
  const currentLng = currentLocation?.lng;
  const nearbyListings = useListings({
    coords: currentLocation ? { lat: currentLocation.lat, lng: currentLocation.lng } : null,
    radiusKm: 5,
    limit: 12,
  });
  const mapListings = useMemo(
    () => (nearbyListings.data?.items ?? [])
      .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng))
      .sort((a, b) => (a.distanceM ?? Number.MAX_SAFE_INTEGER) - (b.distanceM ?? Number.MAX_SAFE_INTEGER)),
    [nearbyListings.data?.items]
  );
  const mapCenter = useMemo(
    () => (currentLat != null && currentLng != null ? { lat: currentLat, lng: currentLng } : null),
    [currentLat, currentLng]
  );
  const activeMapRoute = useMemo<DeliveryMapRoute | null>(() => {
    const coords = activeOffer?.delivery?.coords;
    if (!coords) return null;
    const details = activeOffer ? offerDetails(activeOffer) : null;
    const pickup = Number.isFinite(coords.pickupLat) && Number.isFinite(coords.pickupLng)
      ? {
          lat: coords.pickupLat as number,
          lng: coords.pickupLng as number,
          label: details?.pickupAddress ?? 'Điểm lấy hàng',
        }
      : null;
    const dropoff = Number.isFinite(coords.deliveryLat) && Number.isFinite(coords.deliveryLng)
      ? {
          lat: coords.deliveryLat as number,
          lng: coords.deliveryLng as number,
          label: details?.dropoffAddress ?? 'Điểm giao hàng',
        }
      : null;
    return pickup || dropoff ? { pickup, dropoff } : null;
  }, [activeOffer]);
  const handleSelectListing = useCallback((id: string) => {
    router.push(`/listing/${id}`);
  }, []);
  const currentLocationKey = currentLocation
    ? `${currentLocation.lat.toFixed(6)},${currentLocation.lng.toFixed(6)}`
    : '';
  const currentLocationLabel = currentLocation
    ? getLocationLabel({ lat: currentLocation.lat, lng: currentLocation.lng })
    : '';
  const locationAddress =
    currentLocationLabel === DEFAULT_LOCATION_LABEL
      ? `${DEFAULT_LOCATION_LABEL}, TP. Thủ Đức`
      : resolvedAddress?.key === currentLocationKey
        ? resolvedAddress.value
        : '';

  useEffect(() => {
    if (!currentLocation || currentLocationLabel === DEFAULT_LOCATION_LABEL) return;

    const controller = new AbortController();
    reverseGeocode(currentLocation.lat, currentLocation.lng, controller.signal)
      .then((address) => {
        setResolvedAddress({ key: currentLocationKey, value: address || currentLocationLabel });
      });

    return () => controller.abort();
  }, [currentLocation, currentLocationKey, currentLocationLabel]);

  useEffect(() => {
    if (!activeOffer || activeOffer.id === lastPromptedIdRef.current || actingId) return;
    lastPromptedIdRef.current = activeOffer.id;
    offerSheetRef.current?.present();
  }, [actingId, activeOffer]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} pressBehavior="close" />
    ),
    []
  );

  const handleUseVinhomesLocation = async () => {
    try {
      await setAvailability.mutateAsync({
        isAvailable: true,
        lng: DEFAULT_COORDS.lng,
        lat: DEFAULT_COORDS.lat,
      });
      await Promise.all([refetchVolunteer(), refetch()]);
      void notifySuccess();
      Toast.show({
        type: 'success',
        text1: 'Đã dùng vị trí test',
        text2: 'Shipper đang ở Vinhomes Grand Park và sẵn sàng nhận đơn.',
      });
    } catch (e: any) {
      void notifyError();
      if (isFaceNotEnrolledError(e)) {
        setFacePromptVisible(true);
        return;
      }
      Popup.show({
        type: 'error',
        text1: 'Không cập nhật được vị trí test',
        text2: e?.response?.data?.error?.message ?? 'Vui lòng thử lại.',
      });
    }
  };

  const handleEnrollFace = async (mode: 'camera' | 'library') => {
    try {
      const img = mode === 'camera' ? await captureImage('face') : await pickImageFromLibrary();
      if (!img) return;
      await enrollFace.mutateAsync({ selfie: img });
      await faceEnrollment.refetch();
      setFacePromptVisible(false);
      void notifySuccess();
      Toast.show({
        type: 'success',
        text1: 'Đã cập nhật khuôn mặt',
        text2: 'Bạn có thể bật nhận đơn ngay bây giờ.',
      });
    } catch (e: any) {
      void notifyError();
      Popup.show({
        type: 'error',
        text1: 'Cập nhật khuôn mặt thất bại',
        text2: e?.response?.data?.error?.message ?? 'Vui lòng thử lại.',
      });
    }
  };

  const handleAccept = async (offer: TaskOffer) => {
    setActingId(offer.id);
    try {
      await accept.mutateAsync(offer.deliveryId);
      offerSheetRef.current?.dismiss();
      void notifySuccess();
      Toast.show({ type: 'success', text1: 'Đã nhận đơn', text2: 'Bắt đầu hành trình giao hàng.' });
      router.replace('/(app)/volunteer/active');
    } catch (e: any) {
      void notifyError();
      Popup.show({
        type: 'error',
        text1: 'Nhận đơn thất bại',
        text2: e?.response?.data?.error?.message ?? 'Lời mời có thể đã hết hạn hoặc được nhận bởi người khác.',
      });
    } finally {
      setActingId(null);
    }
  };

  const handleDefer = (offer: TaskOffer) => {
    setDeferredIds((ids) => (ids.includes(offer.id) ? ids : [...ids, offer.id]));
    offerSheetRef.current?.dismiss();
    Toast.show({
      type: 'info',
      text1: 'Đã đưa vào hàng chờ',
      text2: 'Đơn vẫn nằm trong danh sách để bạn nhận sau.',
    });
  };

  const handleReject = async (offer: TaskOffer) => {
    setActingId(offer.id);
    try {
      await reject.mutateAsync({ deliveryId: offer.deliveryId, reason: 'Shipper bỏ qua' });
      void notifySuccess();
      Toast.show({ type: 'info', text1: 'Đã bỏ qua lời mời', text2: 'Đơn sẽ chuyển cho shipper tiếp theo.' });
    } catch (e: any) {
      void notifyError();
      Popup.show({
        type: 'error',
        text1: 'Bỏ qua thất bại',
        text2: e?.response?.data?.error?.message ?? 'Vui lòng thử lại.',
      });
    } finally {
      setActingId(null);
    }
  };

  const refreshNearbyData = () => {
    void Promise.all([refetch(), nearbyListings.refetch()]);
  };

  const renderPriorityCard = (offer: TaskOffer) => {
    const details = offerDetails(offer);
    const expired = isExpired(offer, now);
    const busy = actingId === offer.id;

    return (
      <View style={styles.priorityCard}>
        <View style={styles.priorityTop}>
          <View style={styles.priorityIcon}>
            <MaterialCommunityIcons name="navigation-variant-outline" size={22} color={COLORS.primary} />
          </View>
          <View style={styles.priorityTitleWrap}>
            <Text style={styles.sectionKicker}>Đơn ưu tiên</Text>
            <Text style={styles.priorityTitle} numberOfLines={2}>
              {details.title}
            </Text>
          </View>
          {details.distanceLabel ? (
            <View style={styles.distBadgeStrong}>
              <Text style={styles.distTextStrong}>{details.distanceLabel}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.routeBox}>
          <RouteLine
            icon="storefront-outline"
            iconColor={COLORS.secondary}
            label="Lấy hàng"
            value={details.pickupAddress}
          />
          <View style={styles.routeDivider} />
          <RouteLine
            icon="map-marker-radius-outline"
            iconColor={COLORS.primary}
            label="Giao đến"
            value={details.dropoffAddress}
          />
        </View>

        <View style={styles.priorityMetaRow}>
          <MetaPill icon="timer-sand" text={countdown(offer.expiresAt, now)} danger={expired} />
          {details.quantity != null ? <MetaPill icon="basket-outline" text={`${details.quantity} phần`} /> : null}
          {details.offeredTime ? <MetaPill icon="clock-outline" text={details.offeredTime} /> : null}
        </View>

        <View style={styles.priorityActions}>
          <Button
            mode="outlined"
            onPress={() => handleDefer(offer)}
            disabled={busy || expired}
            textColor={COLORS.onSurface}
            style={styles.prioritySecondaryBtn}
            labelStyle={styles.actionLabel}
          >
            Để sau
          </Button>
          <Button
            mode="contained"
            onPress={() => handleAccept(offer)}
            disabled={busy || expired}
            loading={busy && accept.isPending}
            buttonColor={COLORS.primary}
            style={styles.priorityPrimaryBtn}
            labelStyle={styles.actionLabel}
          >
            Nhận đơn
          </Button>
        </View>
      </View>
    );
  };

  const renderEmpty = () => {
    if (isLoading) return <ScreenState kind="loading" title="Đang tải lời mời" />;
    if (isError) return <ScreenState kind="error" title="Không tải được lời mời" onAction={() => refetch()} />;
    if (volunteer && (!volunteer.isAvailable || !volunteer.currentLocation)) {
      return <EligibilityEmptyState />;
    }
    return (
      <OffersEmptyState
        listings={mapListings}
        center={mapCenter}
        isLoading={nearbyListings.isLoading}
        onSelectListing={handleSelectListing}
      />
    );
  };

  const renderItem = ({ item }: { item: TaskOffer }) => {
    const expired = isExpired(item, now);
    const busy = actingId === item.id;
    const deferred = deferredIds.includes(item.id);
    const details = offerDetails(item);

    return (
      <View style={[styles.queueCard, expired && styles.queueCardMuted]}>
        <View style={styles.queueHead}>
          <View style={{ flex: 1 }}>
            <Text style={styles.queueTitle} numberOfLines={1}>
              {details.title}
            </Text>
            <Text style={styles.queueSub} numberOfLines={1}>
              {deferred ? 'Đã để sau' : 'Đang chờ phản hồi'}
            </Text>
          </View>
          {details.distanceLabel ? (
            <View style={styles.distBadge}>
              <MaterialCommunityIcons name="map-marker-distance" size={13} color={COLORS.primary} />
              <Text style={styles.distText}>{details.distanceLabel}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.compactRoute}>
          <CompactLine icon="storefront-outline" value={details.pickupAddress} />
          <CompactLine icon="map-marker-radius-outline" value={details.dropoffAddress} />
        </View>

        <View style={styles.queueFooter}>
          <View style={styles.queueTimer}>
            <MaterialCommunityIcons
              name="timer-sand"
              size={15}
              color={expired ? COLORS.danger : COLORS.onSurfaceVariant}
            />
            <Text style={[styles.countdown, expired && { color: COLORS.danger }]}>
              {countdown(item.expiresAt, now)}
            </Text>
          </View>
          <View style={styles.queueActions}>
            <Button
              mode="text"
              onPress={() => handleReject(item)}
              disabled={busy || expired}
              loading={busy && reject.isPending}
              textColor={COLORS.danger}
              compact
              labelStyle={styles.queueActionLabel}
            >
              Bỏ qua
            </Button>
            <Button
              mode="contained-tonal"
              onPress={() => handleAccept(item)}
              disabled={busy || expired}
              loading={busy && accept.isPending}
              buttonColor={COLORS.primaryContainer}
              textColor={COLORS.primary}
              compact
              style={styles.queueAcceptBtn}
              labelStyle={styles.queueActionLabel}
            >
              Nhận
            </Button>
          </View>
        </View>
      </View>
    );
  };

  const renderListHeader = () => {
    if (isLoading || isError || offers.length === 0) return null;

    return (
      <View style={styles.listHeader}>
        <MapWatchCard
          listings={mapListings}
          center={mapCenter}
          route={activeMapRoute}
          isLoading={nearbyListings.isLoading}
          onSelectListing={handleSelectListing}
          compact
        />
        {activeOffer ? renderPriorityCard(activeOffer) : null}
        <View style={styles.queueHeader}>
          <View>
            <Text style={styles.queueHeaderTitle}>Hàng chờ</Text>
            <Text style={styles.queueHeaderSub}>
              {queueOffers.length > 0 ? `${queueOffers.length} đơn có thể nhận sau` : 'Không còn đơn trong hàng chờ'}
            </Text>
          </View>
          <View style={styles.queueCount}>
            <Text style={styles.queueCountText}>{offers.length}</Text>
          </View>
        </View>
      </View>
    );
  };

  const renderOfferSheet = () => {
    if (!activeOffer) return null;
    const details = offerDetails(activeOffer);
    const expired = isExpired(activeOffer, now);
    const busy = actingId === activeOffer.id;

    return (
      <BottomSheetModal
        ref={offerSheetRef}
        snapPoints={['46%']}
        backdropComponent={renderBackdrop}
        backgroundStyle={styles.sheetBackground}
        handleIndicatorStyle={styles.sheetHandle}
      >
        <BottomSheetView style={styles.sheetContent}>
          <View style={styles.sheetHead}>
            <View style={styles.sheetIcon}>
              <MaterialCommunityIcons name="truck-fast-outline" size={24} color={COLORS.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.sheetLabel}>Đơn mới cần giao</Text>
              <Text style={styles.sheetTitle} numberOfLines={2}>
                {details.title}
              </Text>
            </View>
          </View>

          <View style={styles.sheetRoute}>
            <RouteLine
              icon="storefront-outline"
              iconColor={COLORS.secondary}
              label="Điểm lấy"
              value={details.pickupAddress}
            />
            <View style={styles.routeDivider} />
            <RouteLine
              icon="map-marker-radius-outline"
              iconColor={COLORS.primary}
              label="Điểm giao"
              value={details.dropoffAddress}
            />
          </View>

          <View style={styles.priorityMetaRow}>
            <MetaPill icon="timer-sand" text={countdown(activeOffer.expiresAt, now)} danger={expired} />
            {details.distanceLabel ? <MetaPill icon="map-marker-distance" text={details.distanceLabel} /> : null}
            {details.quantity != null ? <MetaPill icon="basket-outline" text={`${details.quantity} phần`} /> : null}
          </View>

          <View style={styles.sheetActions}>
            <Button
              mode="outlined"
              onPress={() => handleDefer(activeOffer)}
              disabled={busy || expired}
              textColor={COLORS.onSurface}
              style={styles.sheetBtn}
              labelStyle={styles.actionLabel}
            >
              Để sau
            </Button>
            <Button
              mode="contained"
              onPress={() => handleAccept(activeOffer)}
              disabled={busy || expired}
              loading={busy && accept.isPending}
              buttonColor={COLORS.primary}
              style={styles.sheetBtn}
              labelStyle={styles.actionLabel}
            >
              Nhận đơn
            </Button>
          </View>
        </BottomSheetView>
      </BottomSheetModal>
    );
  };

  const locationStatus = (() => {
    if (isVolunteerLoading && !volunteer) return 'Đang tải vị trí shipper...';
    if (isVolunteerError) return 'Không tải được vị trí shipper';
    if (!volunteer?.isAvailable) return 'Đang tắt nhận đơn';
    if (!currentLocation) return 'Chưa có vị trí hiện tại';
    return locationAddress || currentLocationLabel;
  })();

  const locationHint = (() => {
    if (isVolunteerError) return 'Kéo để tải lại hoặc mở tab Hồ sơ kiểm tra trạng thái.';
    if (!volunteer?.isAvailable) return 'Bật sẵn sàng để nhận lời mời giao hàng gần vị trí này.';
    if (!currentLocation) return 'Backend cần vị trí shipper để phát lời mời gần điểm lấy hàng.';
    return offers.length > 0
      ? `${offers.length} lời mời đang chờ, ${queueOffers.length} đơn trong hàng chờ`
      : 'Nếu chưa có lời mời, hãy kiểm tra đơn gần vị trí này đã chọn giao hàng.';
  })();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader
        title="Đơn cần giao"
        right={
          <View style={[styles.headerStatus, volunteer?.isAvailable ? styles.headerStatusOn : styles.headerStatusOff]}>
            <MaterialCommunityIcons
              name={volunteer?.isAvailable ? 'access-point' : 'access-point-off'}
              size={14}
              color={volunteer?.isAvailable ? COLORS.primary : COLORS.onSurfaceVariant}
            />
            <Text
              style={[
                styles.headerStatusText,
                volunteer?.isAvailable ? styles.headerStatusTextOn : styles.headerStatusTextOff,
              ]}
            >
              {volunteer?.isAvailable ? 'Đang nhận' : 'Đang tắt'}
            </Text>
          </View>
        }
      />
      <View style={styles.locationBar}>
        <View style={styles.locationIcon}>
          <MaterialCommunityIcons name="crosshairs-gps" size={18} color={COLORS.primary} />
        </View>
        <View style={styles.locationContent}>
          <Text style={styles.locationLabel}>Vị trí hiện tại</Text>
          <Text style={styles.locationValue} numberOfLines={2}>
            {locationStatus}
          </Text>
          <Text style={styles.locationHint} numberOfLines={2}>
            {locationHint}
          </Text>
        </View>
        {__DEV__ ? (
          <Button
            mode="outlined"
            compact
            onPress={handleUseVinhomesLocation}
            loading={setAvailability.isPending}
            disabled={setAvailability.isPending}
            textColor={COLORS.primary}
            style={styles.locationButton}
            labelStyle={styles.locationButtonLabel}
          >
            VGP
          </Button>
        ) : null}
      </View>
      <View style={styles.bulkEntry}>
        <View style={styles.bulkEntryIcon}>
          <MaterialCommunityIcons name="truck-delivery-outline" size={20} color={COLORS.primary} />
        </View>
        <View style={styles.bulkEntryText}>
          <Text style={styles.bulkEntryTitle}>Giao sỉ nhiều điểm</Text>
          <Text style={styles.bulkEntrySub} numberOfLines={2}>
            Nhận từ 10 phần, lấy tại provider rồi phát dọc tuyến.
          </Text>
        </View>
        <Button
          mode="contained-tonal"
          compact
          onPress={() => router.push('/(app)/volunteer/bulk')}
          buttonColor={COLORS.primaryContainer}
          textColor={COLORS.primary}
          labelStyle={styles.bulkEntryActionLabel}
        >
          Mở
        </Button>
      </View>
      {needsFaceEnrollment ? (
        <View style={styles.faceBanner}>
          <View style={styles.faceBannerIcon}>
            <MaterialCommunityIcons name="face-recognition" size={20} color={COLORS.warning} />
          </View>
          <View style={styles.faceBannerText}>
            <Text style={styles.faceBannerTitle}>Chưa cập nhật khuôn mặt</Text>
            <Text style={styles.faceBannerSub} numberOfLines={2}>
              Cập nhật để bật nhận đơn và xác minh khi giao nhận.
            </Text>
          </View>
          <Button
            mode="contained-tonal"
            compact
            onPress={() => setFacePromptVisible(true)}
            buttonColor={COLORS.secondaryContainer}
            textColor={COLORS.warning}
            labelStyle={styles.faceBannerActionLabel}
            style={styles.faceBannerAction}
          >
            Cập nhật
          </Button>
        </View>
      ) : null}
      {offers.length === 0 ? (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {renderEmpty()}
        </ScrollView>
      ) : (
        <FlashList
          data={queueOffers}
          keyExtractor={(item: TaskOffer, index) => item.id ?? `${item.deliveryId}-${index}`}
          renderItem={renderItem}
          extraData={{ now, actingId, deferredIds, activeOfferId: activeOffer?.id }}
          contentContainerStyle={styles.list}
          ListHeaderComponent={renderListHeader}
          refreshing={isRefetching}
          onRefresh={refreshNearbyData}
        />
      )}
      {renderOfferSheet()}
      <FaceEnrollmentPrompt
        visible={facePromptVisible}
        busy={enrollFace.isPending}
        onDismiss={() => setFacePromptVisible(false)}
        onEnroll={handleEnrollFace}
      />
    </SafeAreaView>
  );
}

function FaceEnrollmentPrompt({
  visible,
  busy,
  onDismiss,
  onEnroll,
}: {
  visible: boolean;
  busy: boolean;
  onDismiss: () => void;
  onEnroll: (mode: 'camera' | 'library') => void;
}) {
  return (
    <Portal>
      <Dialog visible={visible} onDismiss={busy ? undefined : onDismiss} style={styles.faceDialog}>
        <Dialog.Content style={styles.faceDialogContent}>
          <View style={styles.faceDialogIcon}>
            <MaterialCommunityIcons name="shield-account-outline" size={34} color={COLORS.primary} />
          </View>
          <Text style={styles.faceDialogTitle}>Cần cập nhật khuôn mặt</Text>
          <Text style={styles.faceDialogText}>
            Bạn cần đăng ký khuôn mặt trước khi bật nhận đơn. Thông tin này dùng để xác minh khi giao nhận.
          </Text>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onDismiss} textColor={COLORS.onSurfaceVariant} disabled={busy}>
            Để sau
          </Button>
          <Button
            mode="contained"
            icon={busy ? undefined : 'camera'}
            buttonColor={COLORS.primary}
            onPress={() => onEnroll('camera')}
            disabled={busy}
            style={styles.faceDialogPrimary}
          >
            {busy ? <ActivityIndicator color="#ffffff" size={16} /> : 'Cập nhật ngay'}
          </Button>
          <Button
            icon="image-outline"
            onPress={() => onEnroll('library')}
            textColor={COLORS.primary}
            disabled={busy}
          >
            Chọn ảnh
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const MapWatchCard = memo(function MapWatchCard({
  listings,
  center,
  route,
  isLoading,
  onSelectListing,
  compact = false,
}: {
  listings: Listing[];
  center: { lat: number; lng: number } | null;
  route?: DeliveryMapRoute | null;
  isLoading: boolean;
  onSelectListing: (id: string) => void;
  compact?: boolean;
}) {
  const hasRoute = Boolean(route?.pickup || route?.dropoff);
  const hasMap = listings.length > 0 || hasRoute;
  const nearest = hasRoute ? [] : listings.slice(0, compact ? 2 : 3);
  const resolvedCenter =
    center ??
    (route?.pickup ? { lat: route.pickup.lat, lng: route.pickup.lng } : null) ??
    (route?.dropoff ? { lat: route.dropoff.lat, lng: route.dropoff.lng } : null) ??
    (listings[0] ? { lat: listings[0].lat, lng: listings[0].lng } : null);

  return (
    <View style={[styles.watchCard, compact && styles.watchCardCompact]}>
      <View style={styles.watchHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.watchTitle}>{hasRoute ? 'Bản đồ đơn ưu tiên' : 'Khu vực đang theo dõi'}</Text>
          <Text style={styles.watchSub} numberOfLines={1}>
            {hasRoute
              ? 'Vị trí, điểm lấy và điểm giao'
              : hasMap
                ? `${listings.length} điểm cung cấp gần vị trí GPS`
                : 'Theo GPS quanh vị trí hiện tại'}
          </Text>
        </View>
        <View style={styles.watchBadge}>
          <MaterialCommunityIcons name={hasRoute ? 'map-marker-path' : 'radar'} size={16} color={COLORS.primary} />
          <Text style={styles.watchBadgeText}>{hasRoute ? 'Đơn' : '5 km'}</Text>
        </View>
      </View>

      {hasMap ? (
        <>
          <View style={[styles.mapFrame, compact && styles.mapFrameCompact]}>
            <ListingsMapView
              listings={listings}
              center={resolvedCenter!}
              route={route}
              onSelect={onSelectListing}
            />
          </View>
          {nearest.length > 0 ? (
            <View style={styles.providerStrip}>
              {nearest.map((item) => (
                <View key={item.id} style={styles.providerChip}>
                  <MaterialCommunityIcons name="storefront-outline" size={13} color={COLORS.primary} />
                  <Text style={styles.providerChipText} numberOfLines={1}>
                    {item.provider?.businessName || item.title}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </>
      ) : (
        <View style={[styles.radarPanel, compact && styles.radarPanelCompact]}>
          <View style={styles.radarCircle}>
            <MaterialCommunityIcons name={isLoading ? 'map-search-outline' : 'map-marker-question-outline'} size={32} color={COLORS.primary} />
          </View>
          <Text style={styles.radarTitle}>
            {isLoading ? 'Đang đọc khu vực quanh bạn' : 'Chưa có điểm quanh vị trí này'}
          </Text>
          <Text style={styles.radarText}>
            Ứng dụng sẽ tự cập nhật khi vị trí hoặc dữ liệu gần bạn thay đổi.
          </Text>
        </View>
      )}
    </View>
  );
});

const OffersEmptyState = memo(function OffersEmptyState({
  listings,
  center,
  isLoading,
  onSelectListing,
}: {
  listings: Listing[];
  center: { lat: number; lng: number } | null;
  isLoading: boolean;
  onSelectListing: (id: string) => void;
}) {
  return (
    <View style={styles.emptyWrap}>
      <MapWatchCard
        listings={listings}
        center={center}
        isLoading={isLoading}
        onSelectListing={onSelectListing}
      />

      <View style={styles.reasonCard}>
        <Text style={styles.emptyTitle}>Chưa có đơn cần giao</Text>
        <Text style={styles.emptyText}>
          Màn này chỉ hiện lời mời giao hàng đã được backend tạo cho shipper.
        </Text>
        <View style={styles.checkList}>
          <CheckRow text="Đang bật trạng thái nhận đơn." />
          <CheckRow text="GPS đã có vị trí hiện tại." />
          <CheckRow text="Đơn giao hàng sẽ tự xuất hiện khi có lời mời." />
        </View>
      </View>
    </View>
  );
});

function EligibilityEmptyState() {
  return (
    <View style={styles.emptyWrap}>
      <View style={styles.reasonCard}>
        <View style={styles.emptyIcon}>
          <MaterialCommunityIcons name="map-marker-alert-outline" size={34} color={COLORS.primary} />
        </View>
        <Text style={styles.emptyTitle}>Chưa sẵn sàng nhận đơn</Text>
        <Text style={styles.emptyText}>
          Backend cần trạng thái sẵn sàng và vị trí hiện tại để gửi lời mời gần bạn.
        </Text>
        <View style={styles.checkList}>
          <CheckRow text="Bật sẵn sàng nhận đơn trong Hồ sơ." />
          <CheckRow text="Cho phép định vị hoặc dùng vị trí test ở môi trường dev." />
          <CheckRow text="Đơn sẽ xuất hiện khi hệ thống có lời mời phù hợp." />
        </View>
      </View>
    </View>
  );
}

function CheckRow({ text }: { text: string }) {
  return (
    <View style={styles.checkRow}>
      <MaterialCommunityIcons name="check-circle-outline" size={18} color={COLORS.primary} />
      <Text style={styles.checkText}>{text}</Text>
    </View>
  );
}

function RouteLine({
  icon,
  iconColor,
  label,
  value,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  iconColor: string;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.routeLine}>
      <View style={[styles.routeIcon, { backgroundColor: `${iconColor}18` }]}>
        <MaterialCommunityIcons name={icon} size={18} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.routeLabel}>{label}</Text>
        <Text style={styles.routeValue} numberOfLines={2}>
          {value}
        </Text>
      </View>
    </View>
  );
}

function CompactLine({
  icon,
  value,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  value: string;
}) {
  return (
    <View style={styles.compactLine}>
      <MaterialCommunityIcons name={icon} size={15} color={COLORS.onSurfaceVariant} />
      <Text style={styles.compactLineText} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function MetaPill({
  icon,
  text,
  danger,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  text: string;
  danger?: boolean;
}) {
  return (
    <View style={[styles.metaPill, danger && styles.metaPillDanger]}>
      <MaterialCommunityIcons name={icon} size={14} color={danger ? COLORS.danger : COLORS.primary} />
      <Text style={[styles.metaPillText, danger && styles.metaPillTextDanger]} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  list: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 104 },
  listHeader: { gap: 14, paddingBottom: 10 },
  headerStatus: {
    minHeight: 32,
    borderRadius: 999,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
  },
  headerStatusOn: { backgroundColor: COLORS.primaryContainer, borderColor: COLORS.primaryContainer },
  headerStatusOff: { backgroundColor: COLORS.surfaceVariant, borderColor: COLORS.outline },
  headerStatusText: { fontSize: 12, fontWeight: '800' },
  headerStatusTextOn: { color: COLORS.primary },
  headerStatusTextOff: { color: COLORS.onSurfaceVariant },
  locationBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 8,
    padding: 12,
    borderRadius: 16,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.outline,
  },
  locationIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primaryContainer,
  },
  locationContent: { flex: 1 },
  locationLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.onSurfaceVariant,
    textTransform: 'uppercase',
  },
  locationValue: {
    marginTop: 2,
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.onSurface,
  },
  locationHint: {
    marginTop: 2,
    fontSize: 12,
    color: COLORS.onSurfaceVariant,
    lineHeight: 16,
  },
  locationButton: {
    minWidth: 54,
    borderRadius: 12,
    borderColor: COLORS.primary,
  },
  locationButtonLabel: {
    marginHorizontal: 8,
    fontSize: 12,
    fontWeight: '800',
  },
  bulkEntry: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.outline,
    backgroundColor: COLORS.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bulkEntryIcon: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primaryContainer,
  },
  bulkEntryText: { flex: 1 },
  bulkEntryTitle: { fontSize: 14, fontWeight: '800', color: COLORS.onSurface },
  bulkEntrySub: { marginTop: 2, fontSize: 12, lineHeight: 16, color: COLORS.onSurfaceVariant },
  bulkEntryActionLabel: { fontSize: 12, fontWeight: '800', marginHorizontal: 8 },
  faceBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: 16,
    backgroundColor: COLORS.secondaryContainer,
    borderWidth: 1,
    borderColor: '#f6b99f',
  },
  faceBannerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
  },
  faceBannerText: { flex: 1 },
  faceBannerTitle: { fontSize: 14, fontWeight: '800', color: COLORS.onSurface },
  faceBannerSub: { marginTop: 2, fontSize: 12, lineHeight: 16, color: COLORS.onSurfaceVariant },
  faceBannerAction: { borderRadius: 999 },
  faceBannerActionLabel: { fontSize: 12, fontWeight: '800', marginHorizontal: 8 },
  faceDialog: { borderRadius: 24, backgroundColor: COLORS.surface },
  faceDialogContent: { alignItems: 'center', paddingTop: 8 },
  faceDialogIcon: {
    width: 68,
    height: 68,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primaryContainer,
    marginBottom: 14,
  },
  faceDialogTitle: { fontSize: 18, fontWeight: '800', color: COLORS.onSurface, textAlign: 'center' },
  faceDialogText: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.onSurfaceVariant,
    textAlign: 'center',
  },
  faceDialogPrimary: { borderRadius: 12 },
  priorityCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.primaryContainer,
    gap: 14,
    shadowColor: '#174b31',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 2,
  },
  priorityTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  priorityIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primaryContainer,
  },
  priorityTitleWrap: { flex: 1 },
  sectionKicker: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.primary,
    textTransform: 'uppercase',
  },
  priorityTitle: { marginTop: 2, fontSize: 18, lineHeight: 23, fontWeight: '800', color: COLORS.onSurface },
  distBadgeStrong: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: COLORS.secondaryContainer,
  },
  distTextStrong: { fontSize: 12, fontWeight: '800', color: COLORS.secondary },
  routeBox: {
    padding: 12,
    borderRadius: 16,
    backgroundColor: COLORS.surfaceContainerLow,
    gap: 10,
  },
  routeLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  routeIcon: {
    width: 32,
    height: 32,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.onSurfaceVariant,
    textTransform: 'uppercase',
  },
  routeValue: { marginTop: 2, fontSize: 14, lineHeight: 19, fontWeight: '700', color: COLORS.onSurface },
  routeDivider: { height: 1, backgroundColor: COLORS.outline, marginLeft: 42 },
  priorityMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metaPill: {
    minHeight: 30,
    paddingHorizontal: 10,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.primaryContainer,
  },
  metaPillDanger: { backgroundColor: '#ffdad6' },
  metaPillText: { fontSize: 12, fontWeight: '800', color: COLORS.primary },
  metaPillTextDanger: { color: COLORS.danger },
  priorityActions: { flexDirection: 'row', gap: 10 },
  prioritySecondaryBtn: { flex: 0.9, borderRadius: 14, borderColor: COLORS.outline },
  priorityPrimaryBtn: { flex: 1.1, borderRadius: 14 },
  actionLabel: { fontWeight: '800' },
  queueHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  queueHeaderTitle: { fontSize: 17, fontWeight: '800', color: COLORS.onSurface },
  queueHeaderSub: { marginTop: 2, fontSize: 12, color: COLORS.onSurfaceVariant },
  queueCount: {
    minWidth: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.muted,
  },
  queueCountText: { fontSize: 13, fontWeight: '800', color: COLORS.primary },
  queueCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.outline,
    gap: 10,
  },
  queueCardMuted: { opacity: 0.68 },
  queueHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  queueTitle: { fontSize: 15, fontWeight: '800', color: COLORS.onSurface },
  queueSub: { marginTop: 2, fontSize: 12, color: COLORS.onSurfaceVariant },
  distBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.primaryContainer,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  distText: { fontSize: 12, fontWeight: '700', color: COLORS.primary },
  compactRoute: { gap: 5 },
  compactLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  compactLineText: { flex: 1, fontSize: 13, color: COLORS.onSurfaceVariant },
  queueFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  queueTimer: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5 },
  countdown: { fontSize: 13, fontWeight: '700', color: COLORS.onSurfaceVariant },
  queueActions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  queueAcceptBtn: { borderRadius: 999 },
  queueActionLabel: { fontSize: 12, fontWeight: '800', marginHorizontal: 8 },
  emptyWrap: {
    paddingTop: 8,
    paddingBottom: 24,
    gap: 14,
  },
  watchCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.outline,
    gap: 12,
  },
  watchCardCompact: {
    padding: 12,
    gap: 10,
  },
  watchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  watchTitle: { fontSize: 16, fontWeight: '800', color: COLORS.onSurface },
  watchSub: { marginTop: 2, fontSize: 12, color: COLORS.onSurfaceVariant },
  watchBadge: {
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.primaryContainer,
  },
  watchBadgeText: { fontSize: 12, fontWeight: '800', color: COLORS.primary },
  mapFrame: {
    height: 320,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: COLORS.surfaceContainerLow,
  },
  mapFrameCompact: {
    height: 230,
  },
  providerStrip: {
    flexDirection: 'row',
    gap: 8,
  },
  providerChip: {
    flex: 1,
    minHeight: 30,
    borderRadius: 999,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.surfaceContainerLow,
  },
  providerChipText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.onSurfaceVariant,
  },
  radarPanel: {
    minHeight: 260,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
    backgroundColor: COLORS.surfaceContainerLow,
  },
  radarPanelCompact: {
    minHeight: 176,
  },
  radarCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primaryContainer,
    marginBottom: 12,
  },
  radarTitle: { fontSize: 15, fontWeight: '800', color: COLORS.onSurface, textAlign: 'center' },
  radarText: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.onSurfaceVariant,
    textAlign: 'center',
  },
  reasonCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.outline,
  },
  emptyIcon: {
    width: 66,
    height: 66,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primaryContainer,
    marginBottom: 14,
  },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: COLORS.onSurface },
  emptyText: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.onSurfaceVariant,
  },
  checkList: { gap: 10, marginTop: 14 },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  checkText: { flex: 1, fontSize: 13, lineHeight: 19, color: COLORS.onSurfaceVariant },
  emptyAction: { marginTop: 16, borderRadius: 14 },
  sheetBackground: { backgroundColor: COLORS.surface, borderRadius: 24 },
  sheetHandle: { backgroundColor: COLORS.outline, width: 44 },
  sheetContent: { paddingHorizontal: 18, paddingBottom: 22, gap: 14 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sheetIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primaryContainer,
  },
  sheetLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.primary,
    textTransform: 'uppercase',
  },
  sheetTitle: { marginTop: 2, fontSize: 18, lineHeight: 23, fontWeight: '800', color: COLORS.onSurface },
  sheetRoute: {
    padding: 12,
    borderRadius: 16,
    backgroundColor: COLORS.surfaceContainerLow,
    gap: 10,
  },
  sheetActions: { flexDirection: 'row', gap: 10, marginTop: 2 },
  sheetBtn: { flex: 1, borderRadius: 14 },
});
