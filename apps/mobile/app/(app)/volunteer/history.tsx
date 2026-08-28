import { useState, useEffect, useRef, useCallback } from 'react';
import { InteractionManager, View, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Button } from 'react-native-paper';
import { FlashList } from '@shopify/flash-list';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import {
  useDeliveryHistory,
  useDeliveryStats,
  type DeliveryHistoryItem,
  type DeliveryStats,
} from '@/hooks/useDeliveries';
import { AppImage } from '@/components/ui/AppImage';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { deliveryStatusMeta } from '@/utils/delivery';
import { ScreenState } from '@/components/ui/ScreenState';
import { mobileColors as COLORS, elevation, radius, spacing } from '@/theme/design';

function formatDate(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function formatTime(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
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

function fmtFilterDate(d: Date | null): string {
  if (!d) return '';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

// ── Filter bar ────────────────────────────────────────────────────────────────

interface FilterBarProps {
  fromDate: Date | null;
  toDate: Date | null;
  onFromDate: (d: Date) => void;
  onToDate: (d: Date) => void;
  onClear: () => void;
}

function FilterBar({ fromDate, toDate, onFromDate, onToDate, onClear }: FilterBarProps) {
  const [pickerTarget, setPickerTarget] = useState<'from' | 'to' | null>(null);
  const hasFilter = fromDate != null || toDate != null;

  return (
    <View style={filterStyles.wrap}>
      <Pressable
        style={[filterStyles.dateBtn, fromDate && filterStyles.dateBtnActive]}
        onPress={() => setPickerTarget('from')}
        accessibilityRole="button"
        accessibilityLabel="Chọn ngày bắt đầu"
      >
        <MaterialCommunityIcons
          name="calendar-start"
          size={15}
          color={fromDate ? COLORS.indigo : COLORS.onSurfaceVariant}
        />
        <Text style={[filterStyles.dateBtnText, fromDate && filterStyles.dateBtnTextActive]}>
          {fromDate ? fmtFilterDate(fromDate) : 'Từ ngày'}
        </Text>
      </Pressable>

      <MaterialCommunityIcons name="arrow-right" size={13} color={COLORS.onSurfaceVariant} />

      <Pressable
        style={[filterStyles.dateBtn, toDate && filterStyles.dateBtnActive]}
        onPress={() => setPickerTarget('to')}
        accessibilityRole="button"
        accessibilityLabel="Chọn ngày kết thúc"
      >
        <MaterialCommunityIcons
          name="calendar-end"
          size={15}
          color={toDate ? COLORS.indigo : COLORS.onSurfaceVariant}
        />
        <Text style={[filterStyles.dateBtnText, toDate && filterStyles.dateBtnTextActive]}>
          {toDate ? fmtFilterDate(toDate) : 'Đến ngày'}
        </Text>
      </Pressable>

      {hasFilter ? (
        <Pressable onPress={onClear} hitSlop={10} accessibilityRole="button" accessibilityLabel="Xoá bộ lọc">
          <MaterialCommunityIcons name="close-circle" size={20} color={COLORS.onSurfaceVariant} />
        </Pressable>
      ) : null}

      {pickerTarget != null ? (
        <DateTimePicker
          value={pickerTarget === 'from' ? (fromDate ?? new Date()) : (toDate ?? new Date())}
          mode="date"
          display="default"
          maximumDate={new Date()}
          onChange={(_, date) => {
            if (date) {
              if (pickerTarget === 'from') onFromDate(date);
              else onToDate(date);
            }
            setPickerTarget(null);
          }}
        />
      ) : null}
    </View>
  );
}

// ── Delivery detail bottom sheet ──────────────────────────────────────────────

function DeliveryDetailSheet({
  item,
  sheetRef,
}: {
  item: DeliveryHistoryItem | null;
  sheetRef: React.RefObject<BottomSheetModal | null>;
}) {
  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} pressBehavior="close" />
    ),
    []
  );

  const isCampaignTransport = item?.source === 'campaign_transport';
  const meta = item ? deliveryStatusMeta(item.status) : null;
  const title = item?.reservation?.listing.title ?? item?.campaignTransport?.campaignTitle ?? 'Chuyến giao chiến dịch';
  const recipient = item?.reservation?.receiver?.user.fullName ?? item?.campaignTransport?.campaignTitle ?? 'Bếp chiến dịch';
  const quantity = item?.reservation?.quantity ?? null;
  const pickupAddr = item?.pickup.address ?? item?.reservation?.listing.pickupAddress ?? null;
  const dropoffAddr = item?.destination.address ?? null;
  const distanceLabel = formatKm(item?.distanceKm);
  const deliveredDate = formatDate(item?.deliveredAt ?? null);
  const deliveredTime = formatTime(item?.deliveredAt ?? null);
  const failed = item?.status === 'failed';
  const delivered = item?.status === 'delivered';

  return (
    <BottomSheetModal
      ref={sheetRef}
      enableDynamicSizing
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      handleIndicatorStyle={detailStyles.handle}
      accessibilityLabel="Chi tiết chuyến giao"
    >
      <BottomSheetScrollView contentContainerStyle={detailStyles.container}>
        {item && meta ? (
          <>
            {/* Title + status */}
            <View style={detailStyles.header}>
              <Text style={detailStyles.title} numberOfLines={3}>{title}</Text>
              <View style={[detailStyles.statusBadge, { backgroundColor: meta.bg }]}>
                <Text style={[detailStyles.statusText, { color: meta.color }]}>{meta.label}</Text>
              </View>
            </View>

            {/* Date/time */}
            <View style={detailStyles.row}>
              <MaterialCommunityIcons name="calendar-clock-outline" size={17} color={COLORS.indigo} />
              <Text style={detailStyles.rowText}>
                {deliveredDate}{deliveredTime ? ` · ${deliveredTime}` : ''}
              </Text>
            </View>

            {/* Route */}
            <View style={detailStyles.routeCard}>
              <View style={detailStyles.locRow}>
                <View style={[detailStyles.dot, { backgroundColor: COLORS.secondary }]} />
                <View style={{ flex: 1 }}>
                  <Text style={detailStyles.locLabel}>Điểm lấy hàng</Text>
                  <Text style={detailStyles.locValue}>{pickupAddr ?? 'Chưa có địa chỉ'}</Text>
                </View>
              </View>
              <View style={detailStyles.routeLine} />
              <View style={detailStyles.locRow}>
                <View style={[detailStyles.dot, { backgroundColor: COLORS.blue }]} />
                <View style={{ flex: 1 }}>
                  <Text style={detailStyles.locLabel}>{isCampaignTransport ? 'Bếp nhận hàng' : 'Điểm giao hàng'}</Text>
                  <Text style={detailStyles.locValue}>{dropoffAddr ?? recipient}</Text>
                </View>
              </View>
            </View>

            {/* Recipient */}
            <View style={detailStyles.row}>
              <MaterialCommunityIcons name="account-outline" size={17} color={COLORS.blue} />
              <Text style={detailStyles.rowText}>{recipient}</Text>
            </View>

            {/* Meta chips */}
            <View style={detailStyles.chipRow}>
              {quantity != null ? (
                <View style={detailStyles.chip}>
                  <MaterialCommunityIcons name="package-variant-closed" size={13} color={COLORS.indigo} />
                  <Text style={detailStyles.chipText}>{quantity} phần</Text>
                </View>
              ) : null}
              {distanceLabel ? (
                <View style={detailStyles.chip}>
                  <MaterialCommunityIcons name="map-marker-distance" size={13} color={COLORS.teal} />
                  <Text style={detailStyles.chipText}>{distanceLabel}</Text>
                </View>
              ) : null}
              {delivered ? (
                <View style={[detailStyles.chip, { backgroundColor: COLORS.warningContainer }]}>
                  <MaterialCommunityIcons name="medal-outline" size={13} color={COLORS.warning} />
                  <Text style={[detailStyles.chipText, { color: COLORS.warning }]}>+5 đ.c.h</Text>
                </View>
              ) : null}
            </View>

            {/* Fail reason */}
            {failed && item.failedReason ? (
              <View style={detailStyles.failCard}>
                <MaterialCommunityIcons name="alert-circle-outline" size={16} color={COLORS.danger} />
                <Text style={detailStyles.failText}>{item.failedReason}</Text>
              </View>
            ) : null}

            {/* Photos (if backend returns them) */}
            {item.qcPhotoUrl ? (
              <View style={detailStyles.photoSection}>
                <Text style={detailStyles.photoLabel}>Ảnh lấy hàng (QC)</Text>
                <AppImage source={{ uri: item.qcPhotoUrl }} style={detailStyles.photo} contentFit="contain" />
              </View>
            ) : null}
            {item.deliveryProofUrl ? (
              <View style={detailStyles.photoSection}>
                <Text style={detailStyles.photoLabel}>Ảnh bàn giao</Text>
                <AppImage source={{ uri: item.deliveryProofUrl }} style={detailStyles.photo} contentFit="contain" />
              </View>
            ) : null}
          </>
        ) : null}
        <View style={{ height: 32 }} />
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

// ── Stats header ──────────────────────────────────────────────────────────────

function StatsHeader({ stats }: { stats?: DeliveryStats }) {
  if (!stats) return null;
  const cards: { icon: string; label: string; value: string; tint: string }[] = [
    { icon: 'truck-check', label: 'Tổng chuyến', value: String(stats.totalDelivered), tint: COLORS.teal },
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
    <View style={styles.statsPanel}>
      <View style={styles.statsHero}>
        <View>
          <Text style={styles.statsKicker}>Hiệu suất shipper</Text>
          <Text style={styles.statsTitle}>{stats.totalDelivered} chuyến hoàn tất</Text>
        </View>
        <MaterialCommunityIcons name="medal-outline" size={34} color={COLORS.onPrimary} />
      </View>
      <View style={styles.statsGrid}>
        {cards.slice(1).map((c) => (
          <View key={c.label} style={styles.statCard}>
            <MaterialCommunityIcons name={c.icon as never} size={20} color={c.tint} />
            <Text style={styles.statValue}>{c.value}</Text>
            <Text style={styles.statLabel}>{c.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

/**
 * Lịch sử giao hàng (route push từ Hồ sơ) — bảng thành tích (chuyến/km/suất)
 * + danh sách các chuyến đã giao / thất bại, phân trang server-side.
 * Hỗ trợ filter ngày và xem chi tiết từng chuyến.
 */
export default function VolunteerHistoryScreen() {
  const [limit, setLimit] = useState(20);
  const [fromDate, setFromDate] = useState<Date | null>(null);
  const [toDate, setToDate] = useState<Date | null>(null);
  const [selectedItem, setSelectedItem] = useState<DeliveryHistoryItem | null>(null);
  const detailSheetRef = useRef<BottomSheetModal>(null);

  const { data: stats } = useDeliveryStats();
  const { data, isLoading, isError, refetch, isRefetching, isFetching } = useDeliveryHistory(
    1,
    limit,
    fromDate,
    toDate
  );

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      setLimit(20);
    });
    return () => task.cancel?.();
  }, [fromDate, toDate]);

  const openDetail = useCallback((item: DeliveryHistoryItem) => {
    setSelectedItem(item);
    detailSheetRef.current?.present();
  }, []);

  const items = data?.items ?? [];
  const total = data?.meta.total ?? 0;
  const canLoadMore = items.length < total;

  const renderItem = ({ item }: { item: DeliveryHistoryItem }) => {
    const meta = deliveryStatusMeta(item.status);
    const failed = item.status === 'failed';
    const delivered = item.status === 'delivered';
    const distanceLabel = formatKm(item.distanceKm);
    const isCampaignTransport = item.source === 'campaign_transport';
    const title = item.reservation?.listing.title ?? item.campaignTransport?.campaignTitle ?? 'Chuyến giao chiến dịch';
    const recipient = item.reservation?.receiver?.user.fullName ?? item.campaignTransport?.campaignTitle ?? 'Bếp chiến dịch';
    const quantity = item.reservation?.quantity ?? null;
    const pickupAddr = item.pickup.address ?? item.reservation?.listing.pickupAddress ?? null;
    const dropoffAddr = item.destination.address ?? null;
    const deliveredTime = formatTime(item.deliveredAt);
    return (
      <Pressable onPress={() => openDetail(item)} android_ripple={{ color: COLORS.outlineVariant, borderless: false }}>
        <View style={[styles.card, failed && styles.cardFailed]}>
          <View style={styles.cardHead}>
            <View style={styles.datePill}>
              <MaterialCommunityIcons name="calendar-check-outline" size={14} color={COLORS.indigo} />
              <Text style={styles.date}>{formatDate(item.deliveredAt)}</Text>
              {deliveredTime ? <Text style={styles.dateTime}>· {deliveredTime}</Text> : null}
            </View>
            <View style={[styles.statusBadge, { backgroundColor: meta.bg }]}>
              <Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text>
            </View>
          </View>
          <View style={styles.routeBlock}>
            <View style={styles.locRow}>
              <View style={styles.routeDotPickup} />
              <View style={styles.locCol}>
                <Text style={styles.locText} numberOfLines={1}>{title}</Text>
                {pickupAddr ? <Text style={styles.locAddr} numberOfLines={1}>{pickupAddr}</Text> : null}
              </View>
            </View>
            <View style={styles.routeLine} />
            <View style={styles.locRow}>
              <View style={styles.routeDotDropoff} />
              <View style={styles.locCol}>
                <Text style={styles.locText} numberOfLines={1}>
                  {isCampaignTransport ? 'Giao đến bếp ' : ''}{recipient}
                </Text>
                {dropoffAddr ? <Text style={styles.locAddr} numberOfLines={1}>{dropoffAddr}</Text> : null}
              </View>
            </View>
          </View>
          <View style={styles.metaRow}>
            {quantity != null ? <Text style={styles.metaText}>{quantity} phần</Text> : null}
            {distanceLabel ? <Text style={styles.metaText}>{distanceLabel}</Text> : null}
            {delivered ? (
              <View style={styles.pointsBadge}>
                <MaterialCommunityIcons name="medal-outline" size={12} color={COLORS.warning} />
                <Text style={styles.pointsBadgeText}>+5 đ.c.h</Text>
              </View>
            ) : null}
            <View style={{ flex: 1 }} />
            <MaterialCommunityIcons name="chevron-right" size={16} color={COLORS.onSurfaceVariant} />
          </View>
          {failed && item.failedReason ? (
            <Text style={styles.failReason}>Lý do: {item.failedReason}</Text>
          ) : null}
        </View>
      </Pressable>
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
        ListHeaderComponent={
          <View>
            <StatsHeader stats={stats} />
            <FilterBar
              fromDate={fromDate}
              toDate={toDate}
              onFromDate={setFromDate}
              onToDate={setToDate}
              onClear={() => { setFromDate(null); setToDate(null); }}
            />
          </View>
        }
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={
          canLoadMore ? (
            <Button
              mode="outlined"
              onPress={() => setLimit((l) => l + 20)}
              loading={isFetching && !isRefetching}
              textColor={COLORS.indigo}
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
      <DeliveryDetailSheet item={selectedItem} sheetRef={detailSheetRef} />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.section },
  statsPanel: { marginBottom: spacing.lg, gap: spacing.md },
  statsHero: {
    minHeight: 118,
    borderRadius: 30,
    padding: spacing.lg,
    backgroundColor: COLORS.heroBlue,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...elevation.card,
  },
  statsKicker: { color: COLORS.blueContainer, fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  statsTitle: { marginTop: 5, color: COLORS.onPrimary, fontSize: 25, lineHeight: 31, fontWeight: '900' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard: {
    width: '31.5%',
    backgroundColor: COLORS.surface,
    borderRadius: radius.xl,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    gap: 4,
    ...elevation.card,
  },
  statValue: { fontSize: 18, fontWeight: '800', color: COLORS.onSurface },
  statLabel: { fontSize: 11, color: COLORS.onSurfaceVariant, textAlign: 'center' },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 26,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    gap: spacing.md,
    overflow: 'hidden',
    ...elevation.card,
  },
  cardFailed: { borderColor: COLORS.errorContainer },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  datePill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 4, backgroundColor: COLORS.indigoContainer },
  date: { fontSize: 12, fontWeight: '900', color: COLORS.indigo },
  dateTime: { fontSize: 12, fontWeight: '700', color: COLORS.indigo },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  statusText: { fontSize: 12, fontWeight: '700' },
  routeBlock: { gap: 4 },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  locCol: { flex: 1, minWidth: 0 },
  routeLine: { width: 2, height: 14, marginLeft: 5, backgroundColor: COLORS.outlineVariant },
  routeDotPickup: { width: 12, height: 12, borderRadius: 6, backgroundColor: COLORS.secondary, flexShrink: 0 },
  routeDotDropoff: { width: 12, height: 12, borderRadius: 6, backgroundColor: COLORS.blue, flexShrink: 0 },
  locText: { fontSize: 14, fontWeight: '800', color: COLORS.onSurface },
  locAddr: { fontSize: 11, color: COLORS.onSurfaceVariant, marginTop: 1 },
  metaRow: { flexDirection: 'row', gap: 12, alignItems: 'center', flexWrap: 'wrap' },
  metaText: { fontSize: 12, color: COLORS.onSurfaceVariant, fontWeight: '800' },
  pointsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.warningContainer,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  pointsBadgeText: { fontSize: 11, fontWeight: '800', color: COLORS.warning },
  failReason: { fontSize: 13, color: COLORS.danger },
  moreBtn: { borderRadius: 12, borderColor: COLORS.indigo, marginTop: 4 },
});

const filterStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: spacing.md,
    flexWrap: 'wrap',
  },
  dateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    backgroundColor: COLORS.surface,
  },
  dateBtnActive: {
    borderColor: COLORS.indigo,
    backgroundColor: COLORS.indigoContainer,
  },
  dateBtnText: { fontSize: 13, fontWeight: '700', color: COLORS.onSurfaceVariant },
  dateBtnTextActive: { color: COLORS.indigo },
});

const detailStyles = StyleSheet.create({
  handle: { backgroundColor: COLORS.outline },
  container: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: spacing.sm },
  title: { flex: 1, fontSize: 18, fontWeight: '900', color: COLORS.onSurface, lineHeight: 24 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, flexShrink: 0 },
  statusText: { fontSize: 12, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  rowText: { flex: 1, fontSize: 14, color: COLORS.onSurface, fontWeight: '600' },
  routeCard: {
    backgroundColor: COLORS.surfaceVariant,
    borderRadius: radius.xl,
    padding: spacing.md,
    gap: 4,
    marginVertical: spacing.sm,
  },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 12, height: 12, borderRadius: 6, flexShrink: 0 },
  routeLine: { width: 2, height: 14, marginLeft: 5, backgroundColor: COLORS.outline },
  locLabel: { fontSize: 11, color: COLORS.onSurfaceVariant, fontWeight: '700', textTransform: 'uppercase' },
  locValue: { fontSize: 13, color: COLORS.onSurface, fontWeight: '700', marginTop: 1 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: COLORS.surfaceVariant,
  },
  chipText: { fontSize: 12, fontWeight: '700', color: COLORS.onSurface },
  failCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.errorContainer,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  failText: { flex: 1, fontSize: 13, color: COLORS.danger },
  photoSection: { gap: 8, marginTop: spacing.sm },
  photoLabel: { fontSize: 13, fontWeight: '700', color: COLORS.onSurfaceVariant },
  photo: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: radius.xl,
    backgroundColor: '#111',
  },
});
