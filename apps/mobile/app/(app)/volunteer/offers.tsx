import { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Button, ActivityIndicator } from 'react-native-paper';
import { FlashList } from '@shopify/flash-list';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import {
  useMyOffers,
  useAcceptOffer,
  useRejectOffer,
  type TaskOffer,
  type DeliveryCoords,
} from '@/hooks/useDeliveries';
import { DeliveryRouteMap, type LatLng } from '@/components/DeliveryRouteMap';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { ListingsStateView } from '@/components/ListingsStateView';
import { Popup } from '@/components/ui/AppPopup';

const COLORS = {
  primary: '#10b981',
  danger: '#ef4444',
  background: '#f8f9ff',
  surface: '#ffffff',
  onSurface: '#121c2a',
  onSurfaceVariant: '#6b7280',
  outline: '#e5e7eb',
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
  const accept = useAcceptOffer();
  const reject = useRejectOffer();
  const [now, setNow] = useState(() => Date.now());
  const [actingId, setActingId] = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const offers = data ?? [];

  const handleAccept = async (offer: TaskOffer) => {
    setActingId(offer.id);
    try {
      await accept.mutateAsync(offer.deliveryId);
      Popup.show({ type: 'success', text1: 'Đã nhận đơn', text2: 'Bắt đầu hành trình giao hàng nhé!' });
      router.replace('/(app)/volunteer/active');
    } catch (e: any) {
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
      await reject.mutateAsync({ deliveryId: offer.deliveryId });
      Popup.show({ type: 'info', text1: 'Đã từ chối lời mời' });
    } catch (e: any) {
      Popup.show({
        type: 'error',
        text1: 'Từ chối thất bại',
        text2: e?.response?.data?.error?.message ?? 'Vui lòng thử lại.',
      });
    } finally {
      setActingId(null);
    }
  };

  const renderEmpty = () => {
    if (isLoading) return <ActivityIndicator style={{ marginTop: 40 }} color={COLORS.primary} />;
    if (isError) return <ListingsStateView variant="error" onRetry={() => refetch()} />;
    return <ListingsStateView variant="empty" />;
  };

  const renderItem = ({ item }: { item: TaskOffer }) => {
    const { delivery } = item;
    const { listing, receiver } = delivery.reservation;
    const expired = new Date(item.expiresAt).getTime() - now <= 0;
    const busy = actingId === item.id;
    return (
      <View style={styles.card}>
        <View style={styles.cardHead}>
          <Text style={styles.title} numberOfLines={1}>
            {listing.title}
          </Text>
          {delivery.distanceKm != null ? (
            <View style={styles.distBadge}>
              <MaterialCommunityIcons name="map-marker-distance" size={14} color={COLORS.primary} />
              <Text style={styles.distText}>{delivery.distanceKm.toFixed(1)} km</Text>
            </View>
          ) : null}
        </View>

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
            <Text style={styles.locLabel}>Điểm giao hàng</Text>
            <Text style={styles.locValue}>{receiver?.address ?? 'Theo địa chỉ người nhận'}</Text>
          </View>
        </View>

        <DeliveryRouteMap pickup={pickupOf(delivery.coords)} dropoff={dropoffOf(delivery.coords)} />

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
            Từ chối
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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title="Đơn cần giao" />
      <FlashList
        data={offers}
        keyExtractor={(item: TaskOffer) => item.id}
        renderItem={renderItem}
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
  distBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#ecfdf5', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  distText: { fontSize: 12, fontWeight: '700', color: COLORS.primary },
  locRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  locLabel: { fontSize: 11, fontWeight: '700', color: COLORS.onSurfaceVariant, textTransform: 'uppercase' },
  locValue: { fontSize: 14, color: COLORS.onSurface, marginTop: 1 },
  countdownRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  countdown: { fontSize: 13, fontWeight: '600', color: COLORS.onSurfaceVariant },
  actions: { flexDirection: 'row', gap: 12 },
  btn: { flex: 1, borderRadius: 12 },
});
