import { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Button } from 'react-native-paper';
import { FlashList } from '@shopify/flash-list';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  useDeliveryHistory,
  useDeliveryStats,
  type DeliveryHistoryItem,
  type DeliveryStats,
} from '@/hooks/useDeliveries';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { deliveryStatusMeta } from '@/utils/delivery';
import { ScreenState } from '@/components/ui/ScreenState';
import { mobileColors as COLORS } from '@/theme/design';

function formatDate(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}
function formatKm(km: unknown): string | null {
  if (km == null) return null;
  const n = Number(km);
  return Number.isFinite(n) ? `${n.toFixed(1)} km` : null;
}

function formatDecimal(value: unknown): string | null {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(1) : null;
}

function StatsHeader({ stats }: { stats?: DeliveryStats }) {
  if (!stats) return null;
  const cards: { icon: string; label: string; value: string; tint: string }[] = [
    { icon: 'truck-check', label: 'Tổng chuyến', value: String(stats.totalDelivered), tint: COLORS.primary },
    { icon: 'map-marker-distance', label: 'Quãng đường', value: `${stats.totalKm} km`, tint: COLORS.info },
    { icon: 'calendar-today', label: 'Hôm nay', value: String(stats.todayDelivered), tint: COLORS.secondary },
    {
      icon: 'check-decagram',
      label: 'Tỉ lệ hoàn thành',
      value: stats.completionRate != null ? `${stats.completionRate}%` : '-',
      tint: COLORS.info,
    },
    { icon: 'medal-outline', label: 'Điểm cống hiến', value: String(stats.dedicationPoints), tint: COLORS.warning },
    {
      icon: 'star',
      label: 'Đánh giá',
      value: formatDecimal(stats.avgRating) ?? '-',
      tint: COLORS.warning,
    },
  ];
  return (
    <View style={styles.statsGrid}>
      {cards.map((c) => (
        <View key={c.label} style={styles.statCard}>
          <MaterialCommunityIcons name={c.icon as never} size={22} color={c.tint} />
          <Text style={styles.statValue}>{c.value}</Text>
          <Text style={styles.statLabel}>{c.label}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * Lịch sử giao hàng (route push từ Hồ sơ) — bảng thành tích (chuyến/km/suất)
 * + danh sách các chuyến đã giao / thất bại, phân trang server-side.
 */
export default function VolunteerHistoryScreen() {
  const [limit, setLimit] = useState(20);
  const { data: stats } = useDeliveryStats();
  const { data, isLoading, isError, refetch, isRefetching, isFetching } = useDeliveryHistory(1, limit);

  const items = data?.items ?? [];
  const total = data?.meta.total ?? 0;
  const canLoadMore = items.length < total;

  const renderItem = ({ item }: { item: DeliveryHistoryItem }) => {
    const meta = deliveryStatusMeta(item.status);
    const failed = item.status === 'failed';
    const distanceLabel = formatKm(item.distanceKm);
    return (
      <View style={styles.card}>
        <View style={styles.cardHead}>
          <Text style={styles.date}>{formatDate(item.deliveredAt)}</Text>
          <View style={[styles.statusBadge, { backgroundColor: meta.bg }]}>
            <Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text>
          </View>
        </View>
        <View style={styles.locRow}>
          <MaterialCommunityIcons name="storefront-outline" size={16} color={COLORS.onSurfaceVariant} />
          <Text style={styles.locText} numberOfLines={1}>
            {item.reservation.listing.title}
          </Text>
        </View>
        <View style={styles.locRow}>
          <MaterialCommunityIcons name="map-marker-radius-outline" size={16} color={COLORS.primary} />
          <Text style={styles.locText} numberOfLines={1}>
            {item.reservation.receiver?.user.fullName ?? 'Người nhận'}
          </Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaText}>SL: {item.reservation.quantity}</Text>
          {distanceLabel ? <Text style={styles.metaText}>{distanceLabel}</Text> : null}
        </View>
        {failed && item.failedReason ? (
          <Text style={styles.failReason}>Lý do: {item.failedReason}</Text>
        ) : null}
      </View>
    );
  };

  const renderEmpty = () => {
    if (isLoading) return <ScreenState kind="loading" title="Đang tải lịch sử" />;
    if (isError) return <ScreenState kind="error" title="Không tải được lịch sử" onAction={() => refetch()} />;
    return <ScreenState kind="empty" icon="history" title="Chưa có chuyến giao nào" />;
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title="Lịch sử giao hàng" showBell={false} />
      <FlashList
        data={items}
        keyExtractor={(item: DeliveryHistoryItem) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={<StatsHeader stats={stats} />}
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={
          canLoadMore ? (
            <Button
              mode="outlined"
              onPress={() => setLimit((l) => l + 20)}
              loading={isFetching && !isRefetching}
              textColor={COLORS.primary}
              style={styles.moreBtn}
            >
              Xem thêm
            </Button>
          ) : null
        }
        contentContainerStyle={styles.list}
        refreshing={isRefetching}
        onRefresh={() => refetch()}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  list: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  statCard: {
    width: '31.5%',
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.outline,
    gap: 4,
  },
  statValue: { fontSize: 18, fontWeight: '800', color: COLORS.onSurface },
  statLabel: { fontSize: 11, color: COLORS.onSurfaceVariant, textAlign: 'center' },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.outline,
    gap: 8,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  date: { fontSize: 13, fontWeight: '700', color: COLORS.onSurface },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  statusText: { fontSize: 12, fontWeight: '700' },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  locText: { flex: 1, fontSize: 14, color: COLORS.onSurface },
  metaRow: { flexDirection: 'row', gap: 16 },
  metaText: { fontSize: 12, color: COLORS.onSurfaceVariant },
  failReason: { fontSize: 13, color: COLORS.danger },
  emptyWrap: { alignItems: 'center', paddingTop: 48, gap: 8 },
  emptyTitle: { fontSize: 15, color: COLORS.onSurfaceVariant },
  moreBtn: { borderRadius: 12, borderColor: COLORS.primary, marginTop: 4 },
});
