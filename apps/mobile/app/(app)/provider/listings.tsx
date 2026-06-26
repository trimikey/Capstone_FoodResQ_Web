import { useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, FAB, Chip, Button } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { router, Redirect } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { useProviderListings, type ProviderListing } from '@/hooks/useProviderListings';
import { ProviderListingCard } from '@/components/ProviderListingCard';
import { ListingListSkeleton } from '@/components/ListingCardSkeleton';
import { ListingsStateView } from '@/components/ListingsStateView';

const COLORS = {
  primary: '#10b981',
  background: '#f8f9ff',
  onSurface: '#121c2a',
  outline: '#e5e7eb',
};

/** Bộ lọc trạng thái — gom các status backend thành nhóm dễ hiểu cho provider. */
type FilterKey = 'all' | 'active' | 'draft' | 'completed' | 'cancelled';
const FILTERS: { key: FilterKey; label: string; match: (s: string) => boolean }[] = [
  { key: 'all', label: 'Tất cả', match: () => true },
  { key: 'active', label: 'Đang phát', match: (s) => s === 'active' || s === 'fully_reserved' },
  { key: 'draft', label: 'Nháp', match: (s) => s === 'draft' },
  { key: 'completed', label: 'Hoàn thành', match: (s) => s === 'completed' },
  { key: 'cancelled', label: 'Đã huỷ', match: (s) => s === 'cancelled' || s === 'expired' },
];

/**
 * Tin của tôi (Provider) — danh sách tin thực phẩm của nhà cung cấp, có bộ lọc
 * theo trạng thái. FAB "Đăng tin" mở màn tạo.
 */
export default function ProviderListingsScreen() {
  const { user, initialize } = useAuth();
  const { data, isLoading, isError, refetch, isRefetching } = useProviderListings();
  const [filter, setFilter] = useState<FilterKey>('all');
  const [checking, setChecking] = useState(false);

  const all = data ?? [];
  const items = useMemo(() => {
    const f = FILTERS.find((x) => x.key === filter)!;
    return all.filter((l) => f.match(l.status));
  }, [all, filter]);

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
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Text variant="titleLarge" style={styles.title}>
            Tin của tôi
          </Text>
        </View>
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
      </SafeAreaView>
    );
  }

  const renderEmpty = () => {
    if (isLoading) return <ListingListSkeleton count={4} />;
    if (isError) return <ListingsStateView variant="error" onRetry={() => refetch()} />;
    return <ListingsStateView variant="empty" />;
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text variant="titleLarge" style={styles.title}>
          Tin của tôi
        </Text>
      </View>

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
            <Chip
              key={f.key}
              selected={filter === f.key}
              showSelectedCheck={false}
              onPress={() => setFilter(f.key)}
              style={[styles.chip, filter === f.key && styles.chipActive]}
              textStyle={filter === f.key ? styles.chipTextActive : undefined}
            >
              {f.label}
              {count > 0 ? ` (${count})` : ''}
            </Chip>
          );
        })}
      </ScrollView>

      <FlashList
        data={items}
        keyExtractor={(item: ProviderListing) => item.id}
        renderItem={({ item }: { item: ProviderListing }) => (
          <ProviderListingCard
            listing={item}
            onPress={() => router.push(`/(app)/provider/${item.id}`)}
          />
        )}
        estimatedItemSize={120}
        contentContainerStyle={styles.list}
        ListEmptyComponent={renderEmpty}
        refreshing={isRefetching}
        onRefresh={() => refetch()}
      />

      <FAB
        icon="plus"
        label="Đăng tin"
        color="#fff"
        style={styles.fab}
        onPress={() => router.push('/(app)/provider/create')}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { height: 56, paddingHorizontal: 20, justifyContent: 'center' },
  title: { fontWeight: '700', color: COLORS.onSurface },
  filterBar: { flexGrow: 0, maxHeight: 52 },
  filterRow: { paddingHorizontal: 16, paddingVertical: 6, gap: 8, alignItems: 'center' },
  chip: { backgroundColor: '#fff', borderColor: COLORS.outline },
  chipActive: { backgroundColor: COLORS.primary },
  chipTextActive: { color: '#fff', fontWeight: '700' },
  list: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 96 },
  fab: { position: 'absolute', right: 20, bottom: 24, backgroundColor: COLORS.primary },
  pendingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  pendingIcon: {
    width: 96, height: 96, borderRadius: 48, backgroundColor: '#ecfdf5',
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  pendingTitle: { fontSize: 20, fontWeight: '700', color: COLORS.onSurface, marginBottom: 12, textAlign: 'center' },
  pendingBody: { fontSize: 15, color: '#6b7280', textAlign: 'center', lineHeight: 22, marginBottom: 10 },
  pendingHint: { fontSize: 13, color: '#9ca3af', textAlign: 'center', marginBottom: 28 },
  recheckBtn: { borderRadius: 12, paddingHorizontal: 8 },
});
