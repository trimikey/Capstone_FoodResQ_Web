import { useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, FAB, Button, Menu } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { router, Redirect } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { useProviderListings, type ProviderListing } from '@/hooks/useProviderListings';
import { ProviderListingCard } from '@/components/ProviderListingCard';
import { ExtendListingModal, type ExtendListingMode } from '@/components/ExtendListingModal';
import { ListingListSkeleton } from '@/components/ListingCardSkeleton';
import { ListingsStateView } from '@/components/ListingsStateView';
import { AppScreen } from '@/components/ui/AppScreen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { FilterPill } from '@/components/ui/FilterPill';
import { mobileColors as COLORS, radius } from '@/theme/design';

/** Bộ lọc trạng thái — gom các status backend thành nhóm dễ hiểu cho provider. */
type FilterKey = 'all' | 'active' | 'draft' | 'completed' | 'cancelled';
type SortKey = 'created_desc' | 'pickup_asc';
const FILTERS: { key: FilterKey; label: string; match: (s: string) => boolean }[] = [
  { key: 'all', label: 'Tất cả', match: () => true },
  { key: 'active', label: 'Đang phát', match: (s) => s === 'active' || s === 'fully_reserved' },
  { key: 'draft', label: 'Nháp', match: (s) => s === 'draft' },
  { key: 'completed', label: 'Hoàn thành', match: (s) => s === 'completed' },
  { key: 'cancelled', label: 'Đã huỷ', match: (s) => s === 'cancelled' || s === 'expired' },
];

const SORT_LABEL: Record<SortKey, string> = {
  created_desc: 'Mới đăng trước',
  pickup_asc: 'Ngày gần nhất',
};

function pickupTimeMs(listing: ProviderListing): number {
  const value = new Date(listing.pickupStartTime).getTime();
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}

function sortListings(items: ProviderListing[], sort: SortKey): ProviderListing[] {
  if (sort === 'pickup_asc') {
    const now = Date.now();
    return [...items].sort((a, b) => {
      const aTime = pickupTimeMs(a);
      const bTime = pickupTimeMs(b);
      const aPast = aTime < now;
      const bPast = bTime < now;
      if (aPast !== bPast) return aPast ? 1 : -1;
      return aTime - bTime;
    });
  }
  return items;
}

/**
 * Tin của tôi (Provider) — danh sách tin thực phẩm của nhà cung cấp, có bộ lọc
 * theo trạng thái. FAB "Đăng tin" mở màn tạo.
 */
export default function ProviderListingsScreen() {
  const { user, initialize } = useAuth();
  const { data, isLoading, isError, refetch, isRefetching } = useProviderListings();
  const [filter, setFilter] = useState<FilterKey>('all');
  const [sort, setSort] = useState<SortKey>('created_desc');
  const [sortMenuVisible, setSortMenuVisible] = useState(false);
  const [extendTarget, setExtendTarget] = useState<{ listing: ProviderListing; mode: ExtendListingMode } | null>(null);
  const [checking, setChecking] = useState(false);

  const all = useMemo(() => data ?? [], [data]);
  const items = useMemo(() => {
    const f = FILTERS.find((x) => x.key === filter)!;
    return sortListings(all.filter((l) => f.match(l.status)), sort);
  }, [all, filter, sort]);

  // Receiver lỡ vào route provider → đưa về trang chủ.
  if (user && user.role !== 'provider') {
    return <Redirect href="/(app)/home" />;
  }

  // Provider chưa được admin xác minh → màn "Chờ xác minh", chưa cho đăng tin.
  const isPending = !!user && user.status !== 'active';
  if (isPending) {
    const onRecheck = async () => {
      try {
        setChecking(true);
        await initialize();
      } finally {
        setChecking(false);
      }
    };
    return (
      <AppScreen>
        <ScreenHeader title="Tin của tôi" />
        <View style={styles.pendingWrap}>
          <View style={styles.pendingIcon}>
            <MaterialCommunityIcons name="clock-alert-outline" size={56} color={COLORS.primary} />
          </View>
          <Text style={styles.pendingTitle}>Hồ sơ đang chờ xác minh</Text>
          <Text style={styles.pendingBody}>
            Cảm ơn bạn đã đăng ký cơ sở trên FoodResQ. Quản trị viên sẽ xem xét và
            xác minh hồ sơ trước khi bạn có thể đăng tin chia sẻ thực phẩm.
          </Text>
          <Text style={styles.pendingHint}>
            Bạn sẽ nhận được thông báo ngay khi hồ sơ được duyệt.
          </Text>
          <Button
            mode="contained"
            icon="refresh"
            onPress={onRecheck}
            loading={checking}
            disabled={checking}
            buttonColor={COLORS.primary}
            style={styles.recheckBtn}
          >
            Kiểm tra lại
          </Button>
        </View>
      </AppScreen>
    );
  }

  const renderEmpty = () => {
    if (isLoading) return <ListingListSkeleton count={4} />;
    if (isError) return <ListingsStateView variant="error" onRetry={() => refetch()} />;
    return <ListingsStateView variant="empty" />;
  };

  return (
    <AppScreen>
      <ScreenHeader title="Tin của tôi" />

      {/* Bộ lọc trạng thái */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterBar}
        contentContainerStyle={styles.filterRow}
      >
        {FILTERS.map((f) => {
          const count = f.key === 'all' ? all.length : all.filter((l) => f.match(l.status)).length;
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

      <View style={styles.sortRow}>
        <Text style={styles.sortLabel}>Sắp xếp</Text>
        <Menu
          visible={sortMenuVisible}
          onDismiss={() => setSortMenuVisible(false)}
          anchor={
            <Button
              mode="outlined"
              icon="sort-calendar-ascending"
              onPress={() => setSortMenuVisible(true)}
              compact
              textColor={COLORS.primary}
              style={styles.sortButton}
            >
              {SORT_LABEL[sort]}
            </Button>
          }
        >
          <Menu.Item
            leadingIcon="history"
            onPress={() => {
              setSort('created_desc');
              setSortMenuVisible(false);
            }}
            title={SORT_LABEL.created_desc}
          />
          <Menu.Item
            leadingIcon="calendar-clock"
            onPress={() => {
              setSort('pickup_asc');
              setSortMenuVisible(false);
            }}
            title="Ngày gần nhất đến tương lai"
          />
        </Menu>
      </View>

      <FlashList
        data={items}
        numColumns={2}
        keyExtractor={(item: ProviderListing) => item.id}
        renderItem={({ item }: { item: ProviderListing }) => (
          <ProviderListingCard
            listing={item}
            onPress={() => router.push(`/(app)/provider/${item.id}`)}
            onExtend={(mode) => setExtendTarget({ listing: item, mode })}
          />
        )}
        contentContainerStyle={styles.list}
        ListEmptyComponent={renderEmpty}
        refreshing={isRefetching}
        onRefresh={() => refetch()}
      />

      <FAB
        icon="plus"
        label="Đăng tin"
        color={COLORS.onPrimary}
        style={styles.fab}
        onPress={() => router.push('/(app)/provider/create')}
      />

      <ExtendListingModal
        visible={extendTarget != null}
        listing={extendTarget?.listing ?? null}
        defaultMode={extendTarget?.mode ?? 'both'}
        onClose={() => setExtendTarget(null)}
      />
    </AppScreen>
  );
}


const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { height: 56, paddingHorizontal: 20, justifyContent: 'center' },
  title: { fontWeight: '700', color: COLORS.onSurface },
  filterBar: { flexGrow: 0, maxHeight: 52 },
  filterRow: { paddingHorizontal: 16, paddingVertical: 6, gap: 8, alignItems: 'center' },
  sortRow: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 6,
  },
  sortLabel: { fontSize: 13, fontWeight: '800', color: COLORS.onSurfaceVariant },
  sortButton: { borderRadius: radius.md },
  list: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 96 },
  fab: { position: 'absolute', right: 20, bottom: 24, backgroundColor: COLORS.primary },
  pendingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  pendingIcon: {
    width: 96, height: 96, borderRadius: radius.pill, backgroundColor: COLORS.primaryContainer,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  pendingTitle: { fontSize: 20, fontWeight: '700', color: COLORS.onSurface, marginBottom: 12, textAlign: 'center' },
  pendingBody: { fontSize: 15, color: COLORS.onSurfaceVariant, textAlign: 'center', lineHeight: 22, marginBottom: 10 },
  pendingHint: { fontSize: 13, color: COLORS.onSurfaceVariant, textAlign: 'center', marginBottom: 28 },
  recheckBtn: { borderRadius: radius.md, paddingHorizontal: 8 },
});
