import { useEffect, useMemo, useRef, useState, type ElementRef } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, ActivityIndicator, IconButton, Button, Chip, Icon } from 'react-native-paper';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import BottomSheet from '@gorhom/bottom-sheet';

import { useAuth } from '@/hooks/useAuth';
import { useListings, type FoodCategory, type Listing } from '@/hooks/useListings';
import {
  getCurrentCoords,
  DEFAULT_COORDS,
  getLocationLabel,
  type Coords,
} from '@/services/geolocation';
import { ListingCard } from '@/components/ListingCard';
import { ListingsMapView } from '@/components/ListingsMapView';
import { SearchBar } from '@/components/SearchBar';
import { CategoryFilterSheet } from '@/components/CategoryFilterSheet';
import { ListingListSkeleton } from '@/components/ListingCardSkeleton';
import { ListingsStateView } from '@/components/ListingsStateView';
import { categoryLabel } from '@/utils/listingFormat';
import { mobileColors as COLORS } from '@/theme/design';

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const sheetRef = useRef<BottomSheet>(null);
  const listRef = useRef<ElementRef<typeof FlashList<Listing>>>(null);

  // Khởi tạo bằng DEFAULT_COORDS để feed fetch NGAY, không chờ định vị (tránh skeleton lâu).
  // Khi có toạ độ thật → cập nhật → React Query tự refetch theo đúng vị trí.
  const [coords, setCoords] = useState<Coords>(DEFAULT_COORDS);
  const [isFallbackLocation, setIsFallbackLocation] = useState(false);

  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [category, setCategory] = useState<FoodCategory | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [page, setPage] = useState(1);

  // Lấy vị trí 1 lần khi mount
  useEffect(() => {
    let active = true;
    getCurrentCoords().then(({ coords, isFallback }) => {
      if (!active) return;
      setCoords(coords);
      setIsFallbackLocation(isFallback);
      setPage(1);
    });
    return () => {
      active = false;
    };
  }, []);

  // Debounce search ~400ms
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data, isLoading, isFetching, isError, refetch, isRefetching, isPlaceholderData } = useListings({
    coords,
    search: debouncedSearch,
    category,
    page,
  });

  const items = useMemo(() => data?.items ?? [], [data]);
  const hasNextPage = data?.hasNextPage ?? false;
  const hasFilters = searchInput.trim().length > 0 || category != null;
  const locationLabel = getLocationLabel(coords, isFallbackLocation);
  // coords luôn có (khởi tạo DEFAULT_COORDS) → chỉ hiện skeleton khi đang fetch, không chờ định vị.
  const showSkeleton = isLoading && items.length === 0;

  const refreshLocation = async () => {
    const result = await getCurrentCoords();
    setCoords(result.coords);
    setIsFallbackLocation(result.isFallback);
    setPage(1);
  };

  const clearFilters = () => {
    setSearchInput('');
    setDebouncedSearch('');
    setCategory(null);
    setPage(1);
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  };

  const goToPage = (nextPage: number) => {
    if (nextPage < 1 || nextPage === page || isFetching) return;
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
    setPage(nextPage);
    setTimeout(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }), 250);
  };

  const renderEmpty = () => {
    if (showSkeleton) return <ListingListSkeleton count={5} />;
    if (isError) return <ListingsStateView variant="error" onRetry={() => refetch()} />;
    return (
      <ListingsStateView
        variant="empty"
        hasFilters={hasFilters}
        onClear={hasFilters ? clearFilters : undefined}
      />
    );
  };

  const renderPaginationControls = () => {
    if (viewMode !== 'list' || showSkeleton || isError || items.length === 0) return null;

    return (
      <View style={styles.paginationWrap}>
        <View style={styles.pagination}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: page === 1 || isFetching }}
            disabled={page === 1 || isFetching}
            onPress={() => goToPage(page - 1)}
            style={({ pressed }) => [
              styles.pageBtn,
              styles.prevBtn,
              (page === 1 || isFetching) && styles.pageBtnDisabled,
              pressed && styles.pageBtnPressed,
            ]}
          >
            {isPlaceholderData && isFetching && page > 1 ? (
              <ActivityIndicator size={18} color={COLORS.primary} />
            ) : (
              <Icon source="chevron-left" size={22} color={COLORS.primary} />
            )}
            <Text style={[styles.pageBtnLabel, styles.prevBtnLabel]}>Trước</Text>
          </Pressable>
          <View style={styles.pageStatus}>
            <Text style={styles.pageText}>Trang {page}</Text>
            <Text style={styles.pageHint}>6 tin / trang</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !hasNextPage || isFetching }}
            disabled={!hasNextPage || isFetching}
            onPress={() => goToPage(page + 1)}
            style={({ pressed }) => [
              styles.pageBtn,
              styles.nextBtn,
              (!hasNextPage || isFetching) && styles.pageBtnDisabled,
              pressed && styles.pageBtnPressed,
            ]}
          >
            <Text style={[styles.pageBtnLabel, styles.nextBtnLabel]}>Sau</Text>
            {isPlaceholderData && isFetching && hasNextPage ? (
              <ActivityIndicator size={18} color="#fff" />
            ) : (
              <Icon source="chevron-right" size={22} color="#fff" />
            )}
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text variant="headlineSmall" style={styles.greeting}>
            Xin chào{user?.name ? `, ${user.name}` : ''}
          </Text>
          <Text variant="bodySmall" style={styles.subtitle}>
            {category ? `Đang lọc: ${categoryLabel(category)}` : 'Thực phẩm gần bạn'}
          </Text>
        </View>
        <IconButton
          icon={viewMode === 'list' ? 'map-outline' : 'format-list-bulleted'}
          mode="contained-tonal"
          iconColor={COLORS.primary}
          onPress={() => setViewMode((v) => (v === 'list' ? 'map' : 'list'))}
          accessibilityLabel={viewMode === 'list' ? 'Xem bản đồ' : 'Xem danh sách'}
        />
      </View>

      <View style={styles.locationWrap}>
        <Chip
          compact
          icon="crosshairs-gps"
          style={styles.locationChip}
          textStyle={styles.locationChipText}
        >
          {locationLabel}
        </Chip>
        <IconButton
          icon="refresh"
          size={18}
          mode="contained-tonal"
          onPress={refreshLocation}
          style={styles.refreshBtn}
          accessibilityLabel="Làm mới vị trí"
        />
      </View>

      <View style={styles.searchWrap}>
        <SearchBar
          value={searchInput}
          onChangeText={setSearchInput}
          onPressFilter={() => sheetRef.current?.expand()}
          filterActive={category != null}
        />
      </View>

      {viewMode === 'list' && !showSkeleton && !isError && (
        <View style={styles.resultBar}>
          <View style={styles.resultTitleRow}>
            <Icon source="silverware-fork-knife" size={16} color={COLORS.primary} />
            <Text style={styles.resultTitle}>
              {items.length > 0
                ? `${items.length} tin ở trang ${page}`
                : 'Chưa có tin phù hợp'}
            </Text>
          </View>
          {hasFilters && (
            <Button
              compact
              icon="close"
              mode="text"
              onPress={clearFilters}
              textColor={COLORS.primary}
              contentStyle={styles.clearFilterContent}
            >
              Xoá lọc
            </Button>
          )}
        </View>
      )}
      {renderPaginationControls()}

      {viewMode === 'map' ? (
        showSkeleton ? (
          <View style={styles.center}>
            <ActivityIndicator color={COLORS.primary} />
          </View>
        ) : items.length === 0 ? (
          <ListingsStateView variant={isError ? 'error' : 'empty'} onRetry={() => refetch()} />
        ) : (
          <ListingsMapView
            listings={items}
            center={coords ?? { lat: 10.7769, lng: 106.7009 }}
            onSelect={(id) => router.push(`/listing/${id}`)}
          />
        )
      ) : (
        <View style={styles.listPane}>
          <FlashList
            ref={listRef}
            data={items}
            keyExtractor={(item) => item.id}
            renderItem={({ item, index }: { item: Listing; index: number }) => (
              <ListingCard
                listing={item}
                index={index}
                onPress={() => router.push(`/listing/${item.id}`)}
              />
            )}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={renderEmpty}
            refreshing={isRefetching}
            onRefresh={() => refetch()}
          />
        </View>
      )}

      <CategoryFilterSheet
        ref={sheetRef}
        selected={category}
        onSelect={(c) => {
          setCategory(c);
          setPage(1);
          sheetRef.current?.close();
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { paddingHorizontal: 20, paddingTop: 8, flexDirection: 'row', alignItems: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  greeting: { fontWeight: '700' },
  subtitle: { color: COLORS.onSurfaceVariant, marginTop: 2 },
  locationWrap: {
    paddingHorizontal: 20,
    paddingTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  locationChip: { flex: 1, backgroundColor: COLORS.primaryContainer },
  locationChipText: { color: COLORS.primary, fontWeight: '700', lineHeight: 16 },
  refreshBtn: { margin: 0, borderRadius: 12, backgroundColor: COLORS.surfaceContainerLow },
  searchWrap: { paddingHorizontal: 20, paddingTop: 10 },
  resultBar: {
    marginHorizontal: 20,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 32,
  },
  resultTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  resultTitle: { color: COLORS.onSurfaceVariant, fontWeight: '700', fontSize: 13 },
  clearFilterContent: { paddingHorizontal: 0 },
  listPane: { flex: 1 },
  listContent: { paddingHorizontal: 20, paddingBottom: 12 },
  paginationWrap: {
    marginHorizontal: 20,
    marginBottom: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
  },
  pageStatus: { alignItems: 'center', gap: 2, minWidth: 88 },
  pageText: { color: COLORS.onSurface, fontWeight: '800', fontSize: 15 },
  pageHint: { color: COLORS.onSurfaceVariant, fontSize: 12, fontWeight: '600' },
  pagination: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pageBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  prevBtn: { borderWidth: 1, borderColor: COLORS.outlineVariant, backgroundColor: COLORS.surface },
  nextBtn: { backgroundColor: COLORS.primary },
  pageBtnDisabled: { opacity: 0.55 },
  pageBtnPressed: { opacity: 0.78 },
  pageBtnLabel: { fontSize: 15, fontWeight: '800' },
  prevBtnLabel: { color: COLORS.primary },
  nextBtnLabel: { color: '#fff' },
});
