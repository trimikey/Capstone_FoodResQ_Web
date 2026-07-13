import { useMemo, useState } from 'react';
import { StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useMyReservations, type MyReservation } from '@/hooks/useReservations';
import { MyReservationCard } from '@/components/MyReservationCard';
import { ListingListSkeleton } from '@/components/ListingCardSkeleton';
import { ListingsStateView } from '@/components/ListingsStateView';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { FilterPill } from '@/components/ui/FilterPill';
import { mobileColors as COLORS } from '@/theme/design';

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
export default function OrdersTab() {
  const { data, isLoading, isError, refetch, isRefetching } = useMyReservations();
  const [filter, setFilter] = useState<FilterKey>('all');

  const all = useMemo(() => data ?? [], [data]);
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
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title="Đơn của tôi" />

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
        renderItem={({ item }: { item: MyReservation }) => (
          <MyReservationCard
            reservation={item}
            onPress={() => router.push(`/(app)/order/${item.id}`)}
          />
        )}
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
  filterBar: { flexGrow: 0, maxHeight: 52 },
  filterRow: { paddingHorizontal: 16, paddingVertical: 6, gap: 8, alignItems: 'center' },
  list: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 96 },
});
