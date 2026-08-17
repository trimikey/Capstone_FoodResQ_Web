import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator, Button, Icon, Menu, Text } from 'react-native-paper';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import BottomSheet from '@gorhom/bottom-sheet';

import {
  CategoryFilterSheet,
  type FilterApplyPayload,
  type FilterSectionKey,
  type PickupTimeFilter,
} from '@/components/CategoryFilterSheet';
import { useListings, type FoodCategory, type Listing } from '@/hooks/useListings';
import { getCurrentCoords, type Coords } from '@/services/geolocation';
import {
  categoryLabel,
  formatDistance,
  formatPickupWindow,
  quantityLabel,
} from '@/utils/listingFormat';
import { elevation, mobileColors as COLORS, radius, spacing } from '@/theme/design';
import { AppImage } from '@/components/ui/AppImage';

const PAGE_SIZE = 10;
const DEFAULT_RADIUS_KM = 5;
const FALLBACK_IMAGE = require('../../../assets/food-fallbacks/food_lunchbox.png');

type QuickFilter = 'Tất cả' | 'Gần nhất' | 'Sắp hết hạn' | 'Nấu chín' | 'Đồ tươi';
type Urgency = 'soon' | 'today' | 'normal';
type SortKey = 'distance' | 'pickup_asc';

const SORT_LABEL: Record<SortKey, string> = {
  distance: 'Gần nhất',
  pickup_asc: 'Ngày gần nhất',
};

function filterToCategory(filter: QuickFilter): FoodCategory | null {
  if (filter === 'Nấu chín') return 'cooked_meal';
  if (filter === 'Đồ tươi') return 'vegetables';
  return null;
}

function pickupTimeLabel(filter: PickupTimeFilter): string {
  if (filter === 'open_now') return 'Đang nhận';
  if (filter === 'today') return 'Hôm nay';
  if (filter === 'soon') return '<2h';
  return 'Tất cả';
}

function isExpiringSoon(listing: Listing): boolean {
  const end = new Date(listing.pickupEndTime).getTime();
  const diff = end - Date.now();
  return Number.isFinite(diff) && diff >= 0 && diff <= 2 * 60 * 60 * 1000;
}

function isToday(listing: Listing): boolean {
  const start = new Date(listing.pickupStartTime);
  const end = new Date(listing.pickupEndTime);
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(todayStart.getDate() + 1);
  return start < tomorrowStart && end >= todayStart;
}

function urgencyFor(listing: Listing): Urgency {
  if (isExpiringSoon(listing)) return 'soon';
  if (isToday(listing)) return 'today';
  return 'normal';
}

function matchesPickupTime(listing: Listing, filter: PickupTimeFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'soon') return isExpiringSoon(listing);
  if (filter === 'today') return isToday(listing);

  const now = Date.now();
  const start = new Date(listing.pickupStartTime).getTime();
  const end = new Date(listing.pickupEndTime).getTime();
  return Number.isFinite(start) && Number.isFinite(end) && start <= now && end >= now;
}

function urgencyText(listing: Listing): string {
  const end = new Date(listing.pickupEndTime).getTime();
  const diff = end - Date.now();

  if (Number.isFinite(diff) && diff >= 0 && diff <= 2 * 60 * 60 * 1000) {
    const minutes = Math.max(1, Math.round(diff / 60_000));
    if (minutes < 60) return `Hết hạn trong ${minutes} phút`;
    return `Hết hạn trong ${Math.round(minutes / 60)} giờ`;
  }

  const prefix = isToday(listing) ? 'Nhận trong ' : '';
  return `${prefix}${formatPickupWindow(listing.pickupStartTime, listing.pickupEndTime)}`;
}

function urgencyColors(urgency: Urgency) {
  if (urgency === 'soon') {
    return { backgroundColor: COLORS.errorContainer, color: COLORS.onErrorContainer };
  }
  if (urgency === 'today') {
    return { backgroundColor: COLORS.warningContainer, color: COLORS.onWarningContainer };
  }
  return { backgroundColor: COLORS.successContainer, color: COLORS.onSuccessContainer };
}

function formatLocationLabel(coords: Coords | null, address: string | null, loading: boolean): string {
  if (address) return address;
  if (loading) return 'Đang lấy vị trí thật...';
  if (!coords) return 'Chưa có quyền vị trí';
  return 'Vị trí hiện tại';
}

async function reverseGeocode(coords: Coords): Promise<string | null> {
  try {
    const [place] = await Location.reverseGeocodeAsync({
      latitude: coords.lat,
      longitude: coords.lng,
    });
    if (!place) return null;
    return [place.district, place.subregion, place.city].filter(Boolean).join(', ') || null;
  } catch {
    return null;
  }
}

function mergeListings(previous: Listing[], next: Listing[]) {
  const seen = new Set(previous.map((item) => item.id));
  return [...previous, ...next.filter((item) => !seen.has(item.id))];
}

function pickupTimeMs(listing: Listing): number {
  const value = new Date(listing.pickupStartTime).getTime();
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}

function sortVisibleListings(items: Listing[], sort: SortKey): Listing[] {
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

export default function HomeScreen() {
  const router = useRouter();
  const listRef = useRef<FlatList<Listing>>(null);
  const sheetRef = useRef<BottomSheet>(null);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [locationLabel, setLocationLabel] = useState<string | null>(null);
  const [locationLoading, setLocationLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<QuickFilter>('Tất cả');
  const [selectedCategory, setSelectedCategory] = useState<FoodCategory | null>(null);
  const [radiusKm, setRadiusKm] = useState(DEFAULT_RADIUS_KM);
  const [pickupTime, setPickupTime] = useState<PickupTimeFilter>('all');
  const [initialFilterSection, setInitialFilterSection] = useState<FilterSectionKey>('distance');
  const [sort, setSort] = useState<SortKey>('distance');
  const [sortMenuVisible, setSortMenuVisible] = useState(false);
  const [page, setPage] = useState(1);
  const [feedItems, setFeedItems] = useState<Listing[]>([]);

  const category = selectedCategory ?? filterToCategory(activeFilter);

  useEffect(() => {
    let active = true;

    const loadLocation = async () => {
      setLocationLoading(true);
      const result = await getCurrentCoords();
      if (!active) return;

      setCoords(result.coords);
      setLocationLoading(false);

      if (result.coords) {
        const label = await reverseGeocode(result.coords);
        if (active) setLocationLabel(label);
      } else {
        setLocationLabel(null);
      }
    };

    void loadLocation();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
      setFeedItems([]);
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    }, 350);

    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading, isFetching, isError, refetch, isRefetching } = useListings({
    coords,
    search: debouncedSearch,
    category,
    radiusKm,
    page,
    limit: PAGE_SIZE,
  });

  useEffect(() => {
    const nextItems = data?.items ?? [];
    if (page === 1) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFeedItems(nextItems);
      return;
    }
    if (nextItems.length > 0) {
      setFeedItems((items) => mergeListings(items, nextItems));
    }
  }, [data?.items, page]);

  const visibleItems = useMemo(() => {
    return sortVisibleListings(
      feedItems.filter((item) => matchesPickupTime(item, pickupTime)),
      sort
    );
  }, [feedItems, pickupTime, sort]);

  const hasNextPage = data?.hasNextPage ?? false;
  const showInitialLoading = locationLoading || (isLoading && feedItems.length === 0);
  const canLoadMore = hasNextPage && !isFetching && !showInitialLoading;

  const resetResults = () => {
    setPage(1);
    setFeedItems([]);
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  };

  const refreshLocation = async () => {
    setLocationLoading(true);
    const result = await getCurrentCoords();
    setCoords(result.coords);
    setLocationLabel(result.coords ? await reverseGeocode(result.coords) : null);
    setLocationLoading(false);
    setPage(1);
    setFeedItems([]);
    void refetch();
  };

  const handleLoadMore = () => {
    if (!canLoadMore) return;
    setPage((currentPage) => currentPage + 1);
  };

  const handleQuickFilter = (filter: QuickFilter) => {
    resetResults();
    setActiveFilter(filter);
    setSelectedCategory(null);
    if (filter === 'Tất cả' || filter === 'Gần nhất') {
      setPickupTime('all');
    } else if (filter === 'Sắp hết hạn') {
      setPickupTime('soon');
    } else if (pickupTime === 'soon') {
      setPickupTime('all');
    }
  };

  const resetHomeFilters = () => {
    resetResults();
    setActiveFilter('Tất cả');
    setSelectedCategory(null);
    setRadiusKm(DEFAULT_RADIUS_KM);
    setPickupTime('all');
  };

  const openFilterSheet = (section: FilterSectionKey) => {
    setInitialFilterSection(section);
    requestAnimationFrame(() => sheetRef.current?.expand());
  };

  const applySheetFilters = ({ category, radiusKm, pickupTime }: FilterApplyPayload) => {
    resetResults();
    setSelectedCategory(category);
    setRadiusKm(radiusKm);
    setPickupTime(pickupTime);

    if (category == null && pickupTime === 'soon') {
      setActiveFilter('Sắp hết hạn');
    } else if (category === 'cooked_meal') {
      setActiveFilter('Nấu chín');
    } else if (category === 'vegetables') {
      setActiveFilter('Đồ tươi');
    } else {
      setActiveFilter('Tất cả');
    }

    sheetRef.current?.close();
  };

  const clearSheetFilters = () => {
    resetResults();
    setSelectedCategory(null);
    setRadiusKm(DEFAULT_RADIUS_KM);
    setPickupTime('all');
    setActiveFilter('Tất cả');
    sheetRef.current?.close();
  };

  const handleSortChange = (nextSort: SortKey) => {
    resetResults();
    setSort(nextSort);
    setSortMenuVisible(false);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <FlatList
        ref={listRef}
        data={visibleItems}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <FoodItemCard item={item} onPress={() => router.push(`/listing/${item.id}`)} />
        )}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshing={isRefetching}
        onRefresh={() => {
          setPage(1);
          setFeedItems([]);
          void refetch();
        }}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.45}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.locationRow}>
              <View style={styles.locationCopy}>
                <Text style={styles.kicker}>FOODRESQ gần bạn</Text>
                <View style={styles.addressRow}>
                  <Icon source="map-marker" size={19} color={COLORS.primary} />
                  <Text style={styles.address} numberOfLines={1}>
                    {formatLocationLabel(coords, locationLabel, locationLoading)}
                  </Text>
                </View>
              </View>
              <Pressable
                onPress={refreshLocation}
                style={({ pressed }) => [styles.locationButton, pressed && styles.pressed]}
              >
                {locationLoading ? (
                  <ActivityIndicator size={18} color={COLORS.primary} />
                ) : (
                  <Icon source="crosshairs-gps" size={20} color={COLORS.primary} />
                )}
              </Pressable>
            </View>

            <View style={styles.searchBox}>
              <Icon source="magnify" size={22} color={COLORS.onSurfaceVariant} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Tìm món ăn, cửa hàng..."
                placeholderTextColor={COLORS.onSurfaceVariant}
                style={styles.searchInput}
                returnKeyType="search"
              />
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRail}
            >
              <FilterNavButton
                icon="view-grid-outline"
                label="Tất cả"
                value="Bỏ lọc"
                active={category == null && pickupTime === 'all' && radiusKm === DEFAULT_RADIUS_KM}
                onPress={resetHomeFilters}
              />
              <FilterNavButton
                icon="map-marker-radius-outline"
                label="Khoảng cách"
                value={`${radiusKm}km`}
                active={radiusKm !== DEFAULT_RADIUS_KM}
                onPress={() => openFilterSheet('distance')}
              />
              <FilterNavButton
                icon="food-apple-outline"
                label="Loại thực phẩm"
                value={category ? categoryLabel(category) : 'Tất cả'}
                active={category != null}
                onPress={() => openFilterSheet('category')}
              />
              <FilterNavButton
                icon="clock-outline"
                label="Thời gian"
                value={pickupTimeLabel(pickupTime)}
                active={pickupTime !== 'all' && pickupTime !== 'soon'}
                onPress={() => openFilterSheet('time')}
              />
              <FilterNavButton
                icon="timer-sand"
                label="Sắp hết hạn"
                value="<2h"
                active={pickupTime === 'soon'}
                onPress={() => handleQuickFilter('Sắp hết hạn')}
              />
            </ScrollView>

            <View style={styles.feedHeading}>
              <Text style={styles.feedTitle}>Thực phẩm đang có</Text>
              <Menu
                visible={sortMenuVisible}
                onDismiss={() => setSortMenuVisible(false)}
                anchor={
                  <Button
                    mode="outlined"
                    icon="sort-calendar-ascending"
                    compact
                    onPress={() => setSortMenuVisible(true)}
                    textColor={COLORS.primary}
                    style={styles.sortButton}
                  >
                    {SORT_LABEL[sort]}
                  </Button>
                }
              >
                <Menu.Item
                  leadingIcon="map-marker-distance"
                  onPress={() => handleSortChange('distance')}
                  title="Gần nhất"
                />
                <Menu.Item
                  leadingIcon="calendar-clock"
                  onPress={() => handleSortChange('pickup_asc')}
                  title="Ngày gần nhất đến tương lai"
                />
              </Menu>
            </View>
            <Text style={styles.feedCount}>
              Bán kính {radiusKm}km
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            {showInitialLoading ? (
              <ActivityIndicator color={COLORS.primary} />
            ) : (
              <>
                <Icon
                  source={isError ? 'wifi-off' : 'food-off-outline'}
                  size={42}
                  color={COLORS.onSurfaceVariant}
                />
                <Text style={styles.emptyTitle}>
                  {coords ? 'Không có bài đăng phù hợp' : 'Không lấy được vị trí thật'}
                </Text>
                <Text style={styles.emptyText}>
                  {coords
                    ? 'Thử đổi từ khóa, bộ lọc hoặc kéo để tải lại.'
                    : 'Hãy bật GPS/quyền vị trí để FoodResQ tìm bài đăng quanh bạn.'}
                </Text>
              </>
            )}
          </View>
        }
        ListFooterComponent={
          <View style={styles.footer}>
            {isFetching && feedItems.length > 0 ? (
              <ActivityIndicator color={COLORS.primary} />
            ) : hasNextPage ? (
              <Text style={styles.footerText}>Kéo xuống để xem thêm</Text>
            ) : feedItems.length > 0 ? (
              <Text style={styles.footerText}>Bạn đã xem hết bài đăng quanh đây</Text>
            ) : null}
          </View>
        }
      />

      <CategoryFilterSheet
        ref={sheetRef}
        selected={category}
        radiusKm={radiusKm}
        pickupTime={pickupTime}
        initialSection={initialFilterSection}
        onApply={applySheetFilters}
        onClear={clearSheetFilters}
      />
    </SafeAreaView>
  );
}

function FilterNavButton({
  icon,
  label,
  value,
  active,
  onPress,
}: {
  icon: string;
  label: string;
  value: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.filterNavButton,
        active && styles.filterNavButtonActive,
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.filterNavIcon, active && styles.filterNavIconActive]}>
        <Icon source={icon} size={18} color={active ? COLORS.onPrimary : COLORS.primary} />
      </View>
      <View style={styles.filterNavCopy}>
        <Text style={[styles.filterNavLabel, active && styles.filterNavLabelActive]} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[styles.filterNavValue, active && styles.filterNavValueActive]} numberOfLines={1}>
          {value}
        </Text>
      </View>
    </Pressable>
  );
}

function FoodItemCard({ item, onPress }: { item: Listing; onPress: () => void }) {
  const urgency = urgencyColors(urgencyFor(item));
  const distance = formatDistance(item.distanceM) ?? 'Gần bạn';

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
      <View style={styles.cardImage}>
        <AppImage
          source={item.imageUrls?.[0]}
          fallbackSource={FALLBACK_IMAGE}
          style={styles.cardImageFill}
        />
        <View style={styles.overlayRow}>
          <View style={styles.overlayPill}>
            <Icon source="map-marker-distance" size={15} color={COLORS.onSurface} />
            <Text style={styles.overlayText}>{distance}</Text>
          </View>
          <View style={styles.overlayPill}>
            <Icon source="package-variant-closed" size={15} color={COLORS.onSurface} />
            <Text style={styles.overlayText}>
              {quantityLabel(item.quantityRemaining, item.quantityUnit)}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.cardBody}>
        <View style={styles.titleRow}>
          <View style={styles.titleBlock}>
            <Text style={styles.itemTitle} numberOfLines={1}>{item.title}</Text>
            <Text style={styles.itemMeta} numberOfLines={1}>
              {item.provider.businessName} - {item.pickupAddress}
            </Text>
          </View>
          <View style={styles.categoryBadge}>
            <Text style={styles.categoryText} numberOfLines={1}>{categoryLabel(item.category)}</Text>
          </View>
        </View>

        <View style={[styles.urgencyBox, { backgroundColor: urgency.backgroundColor }]}>
          <Text style={[styles.urgencyText, { color: urgency.color }]} numberOfLines={1}>
            {urgencyText(item)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  listContent: { paddingBottom: spacing.section },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    backgroundColor: COLORS.background,
  },
  locationRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  locationCopy: { flex: 1, minWidth: 0 },
  kicker: {
    color: COLORS.onSurfaceVariant,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  addressRow: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  address: {
    flex: 1,
    color: COLORS.onSurface,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 0,
  },
  locationButton: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primaryContainer,
  },
  searchBox: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: spacing.lg,
    paddingRight: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
  },
  searchInput: {
    flex: 1,
    height: '100%',
    paddingVertical: 0,
    color: COLORS.onSurface,
    fontSize: 15,
    fontWeight: '600',
  },
  filterRail: {
    gap: spacing.sm,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  filterNavButton: {
    width: 138,
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
  },
  filterNavButtonActive: {
    backgroundColor: COLORS.primaryContainer,
    borderColor: COLORS.primary,
  },
  filterNavIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primaryContainer,
  },
  filterNavIconActive: {
    backgroundColor: COLORS.primary,
  },
  filterNavCopy: {
    flex: 1,
    minWidth: 0,
  },
  filterNavLabel: {
    color: COLORS.onSurface,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0,
  },
  filterNavLabelActive: {
    color: COLORS.primary,
  },
  filterNavValue: {
    marginTop: 2,
    color: COLORS.onSurfaceVariant,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0,
  },
  filterNavValueActive: {
    color: COLORS.onSurface,
  },
  feedHeading: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  feedTitle: {
    color: COLORS.onSurface,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0,
  },
  feedCount: {
    marginTop: 4,
    color: COLORS.onSurfaceVariant,
    fontSize: 12,
    fontWeight: '700',
  },
  sortButton: { borderRadius: radius.md },
  card: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: COLORS.surface,
    overflow: 'hidden',
    ...elevation.card,
  },
  cardPressed: { opacity: 0.92, transform: [{ scale: 0.99 }] },
  cardImage: {
    height: 168,
    justifyContent: 'flex-start',
    backgroundColor: COLORS.outlineVariant,
  },
  cardImageFill: {
    ...StyleSheet.absoluteFill,
  },
  overlayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: spacing.md,
  },
  overlayPill: {
    minHeight: 30,
    maxWidth: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  overlayText: {
    color: COLORS.onSurface,
    fontSize: 12,
    fontWeight: '900',
  },
  cardBody: { padding: spacing.lg, gap: spacing.md },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  titleBlock: { flex: 1, minWidth: 0 },
  itemTitle: {
    color: COLORS.onSurface,
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 0,
  },
  itemMeta: {
    marginTop: 4,
    color: COLORS.onSurfaceVariant,
    fontSize: 12,
    fontWeight: '700',
  },
  categoryBadge: {
    maxWidth: 106,
    minHeight: 28,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: COLORS.neutralContainer,
  },
  categoryText: {
    color: COLORS.onNeutralContainer,
    fontSize: 11,
    fontWeight: '900',
  },
  urgencyBox: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  urgencyText: {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0,
  },
  footer: {
    minHeight: 72,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  footerText: {
    color: COLORS.onSurfaceVariant,
    fontSize: 12,
    fontWeight: '700',
  },
  emptyState: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
    padding: spacing.xl,
    alignItems: 'center',
    borderRadius: radius.lg,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
  },
  emptyTitle: {
    marginTop: spacing.sm,
    color: COLORS.onSurface,
    fontSize: 16,
    fontWeight: '900',
  },
  emptyText: {
    marginTop: 4,
    color: COLORS.onSurfaceVariant,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '600',
  },
  pressed: { opacity: 0.78 },
});
