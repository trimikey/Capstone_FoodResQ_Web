import { useEffect, useMemo, useRef, useState, type ElementRef } from 'react';
import { View, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, ActivityIndicator, IconButton, Button, Icon } from 'react-native-paper';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import BottomSheet from '@gorhom/bottom-sheet';

import { useAuth } from '@/hooks/useAuth';
import { useListings, type FoodCategory, type Listing } from '@/hooks/useListings';
import {
  getCurrentCoords,
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
import { mobileColors as COLORS, radius, spacing } from '@/theme/design';

const HOME_LISTING_PAGE_SIZE = 18;

export default function HomeScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { user } = useAuth();
  const sheetRef = useRef<BottomSheet>(null);
  const listRef = useRef<ElementRef<typeof FlashList<Listing>>>(null);
  // Tìm kiếm luôn dựa trên GPS hiện tại của thiết bị, không dùng vị trí đã lưu trong hồ sơ.
  const [coords, setCoords] = useState<Coords | null>(null);
  const [isFallbackLocation, setIsFallbackLocation] = useState(false);

  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [category, setCategory] = useState<FoodCategory | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [page, setPage] = useState(1);
  const effectiveCoords = coords;
  const gridColumns = width >= 390 ? 3 : 2;

  // Lấy vị trí thật mỗi lần màn hình được mount.
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
    coords: effectiveCoords,
    search: debouncedSearch,
    category,
    page,
    limit: HOME_LISTING_PAGE_SIZE,
  });

  const items = useMemo(() => data?.items ?? [], [data]);
  const hasNextPage = data?.hasNextPage ?? false;
  const hasFilters = searchInput.trim().length > 0 || category != null;
  const locationLabel = effectiveCoords
    ? getLocationLabel(effectiveCoords, isFallbackLocation)
    : isFallbackLocation
      ? 'Không lấy được GPS thật'
      : 'Đang lấy vị trí hiện tại';
  const showSkeleton = (isLoading || (!effectiveCoords && !isFallbackLocation)) && items.length === 0;

  const refreshLocation = async () => {
    const result = await getCurrentCoords();
    if (!result.coords) {
      setIsFallbackLocation(true);
      setCoords(null);
      setPage(1);
      return;
    }
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
            <Text style={styles.pageHint}>{HOME_LISTING_PAGE_SIZE} tin / trang</Text>
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
              <ActivityIndicator size={18} color={COLORS.onPrimary} />
            ) : (
              <Icon source="chevron-right" size={22} color={COLORS.onPrimary} />
            )}
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.headerBand}>
        <View style={styles.headerTop}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setViewMode((v) => (v === 'list' ? 'map' : 'list'))}
            style={({ pressed }) => [styles.menuButton, pressed && styles.pressed]}
          >
            <Icon source={viewMode === 'list' ? 'map-outline' : 'format-list-bulleted'} size={24} color={COLORS.primary} />
            <Text style={styles.menuLabel}>{viewMode === 'list' ? 'Map' : 'List'}</Text>
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>FoodResQ gần bạn</Text>
            <Text style={styles.greeting} numberOfLines={1}>
              {user?.name ? `Chào ${user.name}` : 'Tìm món gần bạn'}
            </Text>
          </View>
          <IconButton
            icon="refresh"
            size={18}
            mode="contained"
            containerColor={COLORS.surface}
            iconColor={COLORS.primary}
            onPress={refreshLocation}
            style={styles.refreshBtn}
            accessibilityLabel="Làm mới vị trí"
          />
        </View>

        <SearchBar
          value={searchInput}
          onChangeText={setSearchInput}
          onPressFilter={() => sheetRef.current?.expand()}
          filterActive={category != null}
        />

        <View style={styles.quickMetaRow}>
          <View style={styles.locationChip}>
            <Icon source="crosshairs-gps" size={15} color={COLORS.primary} />
            <Text style={styles.locationValue} numberOfLines={1}>{locationLabel}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => sheetRef.current?.expand()}
            style={({ pressed }) => [
              styles.filterChip,
              category != null && styles.filterChipActive,
              pressed && styles.pressed,
            ]}
          >
            <Icon
              source={category ? 'filter' : 'filter-outline'}
              size={15}
              color={category ? COLORS.onPrimary : COLORS.primary}
            />
            <Text style={[styles.filterChipText, category != null && styles.filterChipTextActive]} numberOfLines={1}>
              {category ? categoryLabel(category) : 'Tất cả'}
            </Text>
          </Pressable>
        </View>
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
        ) : isError ? (
          <ListingsStateView variant="error" onRetry={() => refetch()} />
        ) : !effectiveCoords ? (
          <ListingsStateView variant="empty" />
        ) : (
          <ListingsMapView
            listings={items}
            center={effectiveCoords}
            onSelect={(id) => router.push(`/listing/${id}`)}
          />
        )
      ) : (
        <View style={styles.listPane}>
          <FlashList
            ref={listRef}
            data={items}
            key={`listing-grid-${gridColumns}`}
            numColumns={gridColumns}
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerBand: {
    backgroundColor: COLORS.primaryStrong,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  headerTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerCopy: { flex: 1 },
  menuButton: {
    width: 54,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
  },
  menuLabel: {
    marginTop: -2,
    color: COLORS.primary,
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  pressed: { opacity: 0.78 },
  eyebrow: {
    color: COLORS.secondaryContainer,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  greeting: {
    marginTop: 2,
    color: COLORS.onPrimary,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '900',
  },
  refreshBtn: { margin: 0, borderRadius: radius.md },
  quickMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  locationChip: {
    flex: 1,
    minHeight: 34,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.surface,
  },
  locationValue: { flex: 1, color: COLORS.primary, fontSize: 12, fontWeight: '800' },
  filterChip: {
    maxWidth: 116,
    minHeight: 34,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.surface,
  },
  filterChipActive: { backgroundColor: COLORS.primary },
  filterChipText: { color: COLORS.primary, fontSize: 12, fontWeight: '900' },
  filterChipTextActive: { color: COLORS.onPrimary },
  resultBar: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 32,
  },
  resultTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  resultTitle: { color: COLORS.onSurfaceVariant, fontWeight: '700', fontSize: 13 },
  clearFilterContent: { paddingHorizontal: 0 },
  listPane: { flex: 1 },
  listContent: { paddingHorizontal: spacing.sm, paddingBottom: spacing.md },
  paginationWrap: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
  },
  pageStatus: { alignItems: 'center', gap: 1, minWidth: 74 },
  pageText: { color: COLORS.onSurface, fontWeight: '800', fontSize: 13 },
  pageHint: { color: COLORS.onSurfaceVariant, fontSize: 10, fontWeight: '600' },
  pagination: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pageBtn: {
    flex: 1,
    minHeight: 36,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  prevBtn: { borderWidth: 1, borderColor: COLORS.outlineVariant, backgroundColor: COLORS.surface },
  nextBtn: { backgroundColor: COLORS.primary },
  pageBtnDisabled: { opacity: 0.55 },
  pageBtnPressed: { opacity: 0.78 },
  pageBtnLabel: { fontSize: 13, fontWeight: '800' },
  prevBtnLabel: { color: COLORS.primary },
  nextBtnLabel: { color: COLORS.onPrimary },
});
