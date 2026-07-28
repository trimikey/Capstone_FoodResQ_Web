import { useEffect, useMemo, useRef, useState, type ElementRef } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, ActivityIndicator, IconButton, Button, Chip, Icon } from 'react-native-paper';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import BottomSheet from '@gorhom/bottom-sheet';

import { useAuth } from '@/hooks/useAuth';
import { useListings, LISTING_PAGE_SIZE, type FoodCategory, type Listing } from '@/hooks/useListings';
import { useMyProfile } from '@/hooks/useProfile';
import {
  getCurrentCoords,
  getLocationLabel,
  isNearCoords,
  type Coords,
} from '@/services/geolocation';
import { ListingCard } from '@/components/ListingCard';
import { ListingsMapView } from '@/components/ListingsMapView';
import { SearchBar } from '@/components/SearchBar';
import { CategoryFilterSheet } from '@/components/CategoryFilterSheet';
import { ListingListSkeleton } from '@/components/ListingCardSkeleton';
import { ListingsStateView } from '@/components/ListingsStateView';
import { MetricPill, SectionHeader, SurfaceCard } from '@/components/ui/SurfaceCard';
import { categoryLabel } from '@/utils/listingFormat';
import { mobileColors as COLORS } from '@/theme/design';

const HCM_CENTER: Coords = { lat: 10.8231, lng: 106.6297 };

function isFiniteCoord(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const sheetRef = useRef<BottomSheet>(null);
  const listRef = useRef<ElementRef<typeof FlashList<Listing>>>(null);

  const { data: profile } = useMyProfile();
  const profileCoords = useMemo<Coords | null>(() => {
    const lat = profile?.receiver?.lat ?? profile?.provider?.lat;
    const lng = profile?.receiver?.lng ?? profile?.provider?.lng;
    return isFiniteCoord(lat) && isFiniteCoord(lng) ? { lat, lng } : null;
  }, [profile?.provider?.lat, profile?.provider?.lng, profile?.receiver?.lat, profile?.receiver?.lng]);

  const [gpsCoords, setGpsCoords] = useState<Coords | null>(null);
  const [isFallbackLocation, setIsFallbackLocation] = useState(false);
  const [locating, setLocating] = useState(true);

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
      setGpsCoords(isFallback ? null : coords);
      setIsFallbackLocation(isFallback);
      setLocating(false);
      setPage(1);
    }).catch(() => {
      if (!active) return;
      setGpsCoords(null);
      setIsFallbackLocation(true);
      setLocating(false);
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

  const effectiveCoords = gpsCoords ?? profileCoords;

  const { data, isLoading, isFetching, isError, refetch, isRefetching, isPlaceholderData } = useListings({
    coords: effectiveCoords,
    search: debouncedSearch,
    category,
    page,
    limit: viewMode === 'map' ? 100 : LISTING_PAGE_SIZE,
  });

  const items = useMemo(() => data?.items ?? [], [data]);
  const hasNextPage = data?.hasNextPage ?? false;
  const hasFilters = searchInput.trim().length > 0 || category != null;
  const locationLabel = effectiveCoords
    ? getLocationLabel(effectiveCoords, gpsCoords ? isFallbackLocation : false)
    : locating
      ? 'Đang định vị...'
      : 'Tất cả khu vực';
  const locationHint = effectiveCoords
    ? isNearCoords(effectiveCoords, HCM_CENTER, 0.08)
      ? 'Đang tìm quanh TP.HCM'
      : gpsCoords
        ? 'Đang tìm quanh vị trí GPS của bạn'
        : 'Đang tìm quanh địa chỉ hồ sơ'
    : 'Chưa có GPS, đang hiển thị dữ liệu như web';
  const mapCenter = effectiveCoords ?? items.find((item) => isFiniteCoord(item.lat) && isFiniteCoord(item.lng)) ?? HCM_CENTER;
  const showSkeleton = isLoading && items.length === 0;
  const resultCountLabel = isFetching && !isRefetching ? 'Đang cập nhật' : `${items.length} tin`;

  const refreshLocation = async () => {
    try {
      setLocating(true);
      const result = await getCurrentCoords();
      setGpsCoords(result.isFallback ? null : result.coords);
      setIsFallbackLocation(result.isFallback);
      setPage(1);
    } finally {
      setLocating(false);
    }
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
      <SurfaceCard style={styles.heroCard}>
        <View style={styles.header}>
          <SectionHeader
            icon="silverware-fork-knife"
            title={`Xin chào${user?.name ? `, ${user.name}` : ''}`}
            subtitle={category ? `Đang lọc: ${categoryLabel(category)}` : 'Thực phẩm sẵn sàng nhận quanh bạn'}
          />
          <IconButton
            icon={viewMode === 'list' ? 'map-outline' : 'format-list-bulleted'}
            mode="contained-tonal"
            iconColor={COLORS.primary}
            onPress={() => setViewMode((v) => (v === 'list' ? 'map' : 'list'))}
            accessibilityLabel={viewMode === 'list' ? 'Xem bản đồ' : 'Xem danh sách'}
            style={styles.viewToggle}
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
            loading={locating}
            disabled={locating}
            style={styles.refreshBtn}
            accessibilityLabel="Làm mới vị trí"
          />
        </View>
        <View style={styles.metricRow}>
          <MetricPill icon="basket-outline" label={resultCountLabel} tone="primary" />
          <MetricPill icon={viewMode === 'map' ? 'map-marker-multiple-outline' : 'format-list-bulleted'} label={viewMode === 'map' ? 'Bản đồ' : `Trang ${page}`} />
          {hasFilters ? <MetricPill icon="filter-check-outline" label="Đang lọc" tone="warning" /> : null}
        </View>
        <Text style={styles.locationHint}>{locationHint}</Text>

        <View style={styles.searchWrap}>
          <SearchBar
            value={searchInput}
            onChangeText={setSearchInput}
            onPressFilter={() => sheetRef.current?.expand()}
            filterActive={category != null}
          />
        </View>
      </SurfaceCard>

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
          <ListingsStateView variant={isError ? 'error' : 'empty'} onRetry={() => refetch()} />
        ) : (
          <View style={styles.mapPane}>
            <ListingsMapView
              listings={items}
              center={mapCenter}
              onSelect={(id) => router.push(`/listing/${id}`)}
            />
            {items.length === 0 ? (
              <View style={styles.mapEmptyPanel}>
                <Text style={styles.mapEmptyTitle}>Chưa có pin thực phẩm</Text>
                <Text style={styles.mapEmptyText}>
                  Bản đồ vẫn hiển thị khu vực hiện tại. Thử xoá bộ lọc hoặc tải lại dữ liệu.
                </Text>
              </View>
            ) : null}
          </View>
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
  heroCard: { marginHorizontal: 12, marginTop: 6, padding: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  viewToggle: { margin: 0, borderRadius: 12 },
  locationWrap: {
    paddingTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  locationChip: { flex: 1, backgroundColor: COLORS.primaryContainer },
  locationChipText: { color: COLORS.primary, fontWeight: '700', lineHeight: 16 },
  refreshBtn: { margin: 0, borderRadius: 12, backgroundColor: COLORS.surfaceContainerLow },
  locationHint: { paddingTop: 7, color: COLORS.onSurfaceVariant, fontSize: 12, fontWeight: '600' },
  metricRow: { paddingTop: 10, flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  searchWrap: { paddingTop: 10 },
  resultBar: {
    marginHorizontal: 16,
    marginBottom: 6,
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 32,
  },
  resultTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  resultTitle: { color: COLORS.onSurfaceVariant, fontWeight: '700', fontSize: 13 },
  clearFilterContent: { paddingHorizontal: 0 },
  listPane: { flex: 1 },
  mapPane: { flex: 1, marginTop: 8 },
  mapEmptyPanel: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 20,
    borderRadius: 16,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.outline,
    padding: 14,
  },
  mapEmptyTitle: { fontSize: 15, fontWeight: '900', color: COLORS.onSurface },
  mapEmptyText: { marginTop: 3, fontSize: 12, lineHeight: 17, color: COLORS.onSurfaceVariant },
  listContent: { paddingHorizontal: 16, paddingBottom: 112 },
  paginationWrap: {
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
  },
  pageStatus: { alignItems: 'center', gap: 2, minWidth: 74 },
  pageText: { color: COLORS.onSurface, fontWeight: '800', fontSize: 15 },
  pageHint: { color: COLORS.onSurfaceVariant, fontSize: 12, fontWeight: '600' },
  pagination: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pageBtn: {
    flex: 1,
    minHeight: 40,
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
