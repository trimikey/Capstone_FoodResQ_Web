import { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Button } from 'react-native-paper';
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
import { useSetAvailability, useVolunteerMe } from '@/hooks/useVolunteer';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Popup, Toast } from '@/components/ui/AppPopup';
import { ScreenState } from '@/components/ui/ScreenState';
import { notifyError, notifySuccess } from '@/services/haptics';
import { DEFAULT_COORDS, DEFAULT_LOCATION_LABEL, getLocationLabel } from '@/services/geolocation';
import { reverseGeocode } from '@/services/geocoding';
import { mobileColors as COLORS } from '@/theme/design';

function formatKm(km: unknown): string | null {
  if (km == null) return null;
  const n = Number(km);
  return Number.isFinite(n) ? `${n.toFixed(1)} km` : null;
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

/**
 * Đơn cần giao (tab volunteer) — danh sách lời mời giao hàng đang chờ.
 * Mỗi lời mời: điểm lấy/giao + bản đồ tuyến + đếm ngược; Chấp nhận / Từ chối.
 * Poll 15s. Chấp nhận xong → chuyển sang tab "Đang giao".
 */
export default function VolunteerOffersScreen() {
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
  const [now, setNow] = useState(() => Date.now());
  const [actingId, setActingId] = useState<string | null>(null);
  const [resolvedAddress, setResolvedAddress] = useState<{ key: string; value: string } | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const offers = data ?? [];
  const currentLocation = volunteer?.currentLocation ?? null;
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
      Popup.show({
        type: 'error',
        text1: 'Không cập nhật được vị trí test',
        text2: e?.response?.data?.error?.message ?? 'Vui lòng thử lại.',
      });
    }
  };

  const handleAccept = async (offer: TaskOffer) => {
    setActingId(offer.id);
    try {
      await accept.mutateAsync(offer.deliveryId);
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

  const renderEmpty = () => {
    if (isLoading) return <ScreenState kind="loading" title="Đang tải lời mời" />;
    if (isError) return <ScreenState kind="error" title="Không tải được lời mời" onAction={() => refetch()} />;
    if (volunteer && (!volunteer.isAvailable || !volunteer.currentLocation)) {
      return (
        <ScreenState
          kind="empty"
          icon="map-marker-alert-outline"
          title="Chưa sẵn sàng nhận đơn"
          message="Bật sẵn sàng nhận đơn và cập nhật vị trí để backend gửi lời mời gần bạn."
        />
      );
    }
    return (
      <ScreenState
        kind="empty"
        icon="truck-delivery-outline"
        title="Chưa có đơn cần giao"
        message="Chỉ đơn người nhận chọn giao hàng mới xuất hiện tại đây. Đơn tự đến lấy chỉ có QR và không gửi lời mời cho shipper."
      />
    );
  };

  const renderItem = ({ item }: { item: TaskOffer }) => {
    const delivery = item.delivery;
    const reservation = delivery?.reservation;
    const listing = reservation?.listing;
    const receiver = reservation?.receiver;
    const expired = new Date(item.expiresAt).getTime() - now <= 0;
    const busy = actingId === item.id;
    const distanceLabel = formatKm(delivery?.distanceKm);
    const title = listing?.title ?? 'Đơn giao hàng';
    const pickupAddress = listing?.pickupAddress ?? 'Chưa có địa chỉ lấy hàng';
    const dropoffAddress = receiver?.address ?? 'Theo địa chỉ người nhận';

    return (
      <View style={styles.card}>
        <View style={styles.cardHead}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {distanceLabel ? (
            <View style={styles.distBadge}>
              <MaterialCommunityIcons name="map-marker-distance" size={14} color={COLORS.primary} />
              <Text style={styles.distText}>{distanceLabel}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.locRow}>
          <MaterialCommunityIcons name="storefront-outline" size={18} color={COLORS.secondary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.locLabel}>Điểm lấy hàng</Text>
            <Text style={styles.locValue}>{pickupAddress}</Text>
          </View>
        </View>
        <View style={styles.locRow}>
          <MaterialCommunityIcons name="map-marker-radius-outline" size={18} color={COLORS.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.locLabel}>Điểm giao hàng</Text>
            <Text style={styles.locValue}>{dropoffAddress}</Text>
          </View>
        </View>

        <View style={styles.countdownRow}>
          <MaterialCommunityIcons
            name="timer-sand"
            size={16}
            color={expired ? COLORS.danger : COLORS.onSurfaceVariant}
          />
          <Text style={[styles.countdown, expired && { color: COLORS.danger }]}>
            {countdown(item.expiresAt, now)}
          </Text>
        </View>

        <View style={styles.actions}>
          <Button
            mode="outlined"
            onPress={() => handleReject(item)}
            disabled={busy || expired}
            loading={busy && reject.isPending}
            textColor={COLORS.danger}
            style={[styles.btn, { borderColor: COLORS.danger }]}
          >
            Bỏ qua
          </Button>
          <Button
            mode="contained"
            onPress={() => handleAccept(item)}
            disabled={busy || expired}
            loading={busy && accept.isPending}
            buttonColor={COLORS.primary}
            style={styles.btn}
          >
            Chấp nhận
          </Button>
        </View>
      </View>
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
      ? `${offers.length} lời mời đang chờ phản hồi`
      : 'Nếu chưa có lời mời, hãy kiểm tra đơn gần vị trí này đã chọn giao hàng.';
  })();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title="Đơn cần giao" />
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
      <FlashList
        data={offers}
        keyExtractor={(item: TaskOffer, index) => item.id ?? `${item.deliveryId}-${index}`}
        renderItem={renderItem}
        extraData={now}
        contentContainerStyle={styles.list}
        ListEmptyComponent={renderEmpty}
        refreshing={isRefetching}
        onRefresh={() => refetch()}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  list: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 96 },
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
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COLORS.outline,
    gap: 12,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontSize: 16, fontWeight: '700', color: COLORS.onSurface },
  distBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.primaryContainer, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  distText: { fontSize: 12, fontWeight: '700', color: COLORS.primary },
  locRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  locLabel: { fontSize: 11, fontWeight: '700', color: COLORS.onSurfaceVariant, textTransform: 'uppercase' },
  locValue: { fontSize: 14, color: COLORS.onSurface, marginTop: 1 },
  countdownRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  countdown: { fontSize: 13, fontWeight: '600', color: COLORS.onSurfaceVariant },
  actions: { flexDirection: 'row', gap: 12 },
  btn: { flex: 1, borderRadius: 12 },
});
