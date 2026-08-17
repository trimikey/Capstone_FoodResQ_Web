import { useMemo, useState } from 'react';
import { StyleSheet, ScrollView, View } from 'react-native';
import { Text, Button } from 'react-native-paper';
import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useMyReservations, type MyReservation } from '@/hooks/useReservations';
import { normalizeImageUrl } from '@/hooks/useListings';
import { MyReservationCard } from '@/components/MyReservationCard';
import { ListingListSkeleton } from '@/components/ListingCardSkeleton';
import { ListingsStateView } from '@/components/ListingsStateView';
import { AppScreen } from '@/components/ui/AppScreen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { SurfaceCard } from '@/components/ui/SurfaceCard';
import { FilterPill } from '@/components/ui/FilterPill';
import { mobileColors as COLORS, spacing } from '@/theme/design';

/** Bộ lọc trạng thái — gom status reservation thành nhóm dễ hiểu cho receiver. */
type FilterKey = 'all' | 'confirmed' | 'picked_up' | 'completed' | 'cancelled';
const FILTERS: { key: FilterKey; label: string; match: (s: string) => boolean }[] = [
  { key: 'all', label: 'Tất cả', match: () => true },
  { key: 'confirmed', label: 'Chờ lấy', match: (s) => s === 'confirmed' },
  { key: 'picked_up', label: 'Đang giao', match: (s) => s === 'picked_up' },
  { key: 'completed', label: 'Hoàn tất', match: (s) => s === 'completed' },
  {
    key: 'cancelled',
    label: 'Đã huỷ',
    match: (s) => s === 'cancelled' || s === 'expired' || s === 'no_show',
  },
];

/**
 * Đơn của tôi (Receiver) — các đơn đã đặt, lọc theo trạng thái.
 * Tap đơn → chi tiết (QR pickup nếu đang chờ lấy).
 */
const PAGE_SIZE = 20;

function normalizeItems(raw: MyReservation[]): MyReservation[] {
  return raw.map((r) => ({
    ...r,
    listing: {
      ...r.listing,
      imageUrls: Array.isArray(r.listing.imageUrls)
        ? r.listing.imageUrls.map(normalizeImageUrl).filter(Boolean)
        : r.listing.imageUrls,
    },
  }));
}

export default function OrdersTab() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, refetch, isRefetching, isFetching } = useMyReservations(page, PAGE_SIZE);
  const [filter, setFilter] = useState<FilterKey>('all');

  const pageItems = useMemo(() => normalizeItems(data?.items ?? []), [data]);
  const [accumulated, setAccumulated] = useState<MyReservation[]>([]);

  const all = useMemo(() => {
    if (page === 1) return pageItems;
    const ids = new Set(pageItems.map((r) => r.id));
    return [...accumulated.filter((r) => !ids.has(r.id)), ...pageItems];
  }, [page, pageItems, accumulated]);

  const total = data?.total ?? 0;
  const canLoadMore = all.length < total;

  const handleLoadMore = () => {
    setAccumulated(all);
    setPage((p) => p + 1);
  };

  const items = useMemo(() => {
    const f = FILTERS.find((x) => x.key === filter)!;
    return all.filter((r) => f.match(r.status));
  }, [all, filter]);

  const renderEmpty = () => {
    if (isLoading) return <ListingListSkeleton count={4} />;
    if (isError) return <ListingsStateView variant="error" onRetry={() => refetch()} />;
    return <ListingsStateView variant="empty" />;
  };

  return (
    <AppScreen>
      <ScreenHeader title="Đơn của tôi" />

      <View style={styles.summaryWrap}>
        <SurfaceCard tone="mint" style={styles.summaryCard}>
          <SectionHeader
            title="Theo dõi đơn đã đặt"
            subtitle="Mã QR, trạng thái lấy hàng và giao hàng nằm trong từng đơn."
            action={<Text style={styles.summaryCount}>{total > 0 ? total : all.length}</Text>}
          />
        </SurfaceCard>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterBar}
        contentContainerStyle={styles.filterRow}
      >
        {FILTERS.map((f) => {
          const count =
            f.key === 'all' ? all.length : all.filter((r) => f.match(r.status)).length;
          return (
            <FilterPill
              key={f.key}
              active={filter === f.key}
              onPress={() => setFilter(f.key)}
              label={f.label}
              count={count}
            />
          );
        })}
      </ScrollView>

      <FlashList
        data={items}
        keyExtractor={(item: MyReservation) => item.id}
        estimatedItemSize={180}
        renderItem={({ item }: { item: MyReservation }) => (
          <MyReservationCard
            reservation={item}
            onPress={() => router.push(`/(app)/order/${item.id}`)}
          />
        )}
        contentContainerStyle={styles.list}
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={
          canLoadMore ? (
            <Button
              mode="outlined"
              onPress={handleLoadMore}
              loading={isFetching && !isRefetching}
              textColor={COLORS.primary}
              style={styles.moreBtn}
            >
              Xem thêm
            </Button>
          ) : null
        }
        refreshing={isRefetching}
        onRefresh={() => {
          setPage(1);
          setAccumulated([]);
          void queryClient.invalidateQueries({ queryKey: ['reservations'] });
        }}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  summaryWrap: { paddingHorizontal: spacing.xl, paddingBottom: spacing.sm },
  summaryCard: { padding: spacing.lg, borderColor: '#cfe5d4' },
  summaryCount: { fontSize: 24, fontWeight: '900', color: COLORS.primary },
  filterBar: { flexGrow: 0, maxHeight: 52 },
  filterRow: { paddingHorizontal: 16, paddingVertical: 6, gap: 8, alignItems: 'center' },
  list: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 96 },
  moreBtn: { borderRadius: 12, borderColor: COLORS.primary, marginTop: 8, marginHorizontal: 20 },
});
