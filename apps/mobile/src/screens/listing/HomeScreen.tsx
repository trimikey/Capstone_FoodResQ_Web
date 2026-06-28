import { useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, ActivityIndicator, Banner, IconButton } from 'react-native-paper';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import BottomSheet from '@gorhom/bottom-sheet';

import { useAuth } from '@/hooks/useAuth';
import { useListings, type FoodCategory, type Listing } from '@/hooks/useListings';
import { getCurrentCoords, type Coords } from '@/services/geolocation';
import { ListingCard } from '@/components/ListingCard';
import { ListingsMapView } from '@/components/ListingsMapView';
import { SearchBar } from '@/components/SearchBar';
import { CategoryFilterSheet } from '@/components/CategoryFilterSheet';
import { ListingListSkeleton } from '@/components/ListingCardSkeleton';
import { ListingsStateView } from '@/components/ListingsStateView';
import { categoryLabel } from '@/utils/listingFormat';

const COLORS = { primary: '#10b981', background: '#f8f9ff', onSurfaceVariant: '#6b7280' };

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const sheetRef = useRef<BottomSheet>(null);

  const [coords, setCoords] = useState<Coords | null>(null);
  const [isFallbackLocation, setIsFallbackLocation] = useState(false);
  const [bannerVisible, setBannerVisible] = useState(false);

  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [category, setCategory] = useState<FoodCategory | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');

  // Lấy vị trí 1 lần khi mount
  useEffect(() => {
    let active = true;
    getCurrentCoords().then(({ coords, isFallback }) => {
      if (!active) return;
      setCoords(coords);
      setIsFallbackLocation(isFallback);
      setBannerVisible(isFallback);
    });
    return () => {
      active = false;
    };
  }, []);

  // Debounce search ~400ms
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const {
    data,
    isLoading,
    isError,
    refetch,
    isRefetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useListings({ coords, search: debouncedSearch, category });

  const items = useMemo(() => data?.pages.flat() ?? [], [data]);
  const locating = coords == null;
  const showSkeleton = (locating || isLoading) && items.length === 0;

  const renderEmpty = () => {
    if (showSkeleton) return <ListingListSkeleton count={5} />;
    if (isError) return <ListingsStateView variant="error" onRetry={() => refetch()} />;
    return <ListingsStateView variant="empty" />;
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text variant="headlineSmall" style={styles.greeting}>
            Xin chào{user?.name ? `, ${user.name}` : ''} 👋
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

      {bannerVisible && (
        <Banner
          visible
          icon="map-marker-alert-outline"
          actions={[{ label: 'Đã hiểu', onPress: () => setBannerVisible(false) }]}
        >
          Đang dùng vị trí mặc định (TP.HCM). Bật quyền vị trí để thấy món gần bạn nhất.
        </Banner>
      )}

      <View style={styles.searchWrap}>
        <SearchBar
          value={searchInput}
          onChangeText={setSearchInput}
          onPressFilter={() => sheetRef.current?.expand()}
          filterActive={category != null}
        />
      </View>

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
        <FlashList
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
          ListFooterComponent={
            isFetchingNextPage ? (
              <ActivityIndicator color={COLORS.primary} style={styles.footer} />
            ) : null
          }
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (hasNextPage && !isFetchingNextPage) fetchNextPage();
          }}
          refreshing={isRefetching}
          onRefresh={() => refetch()}
        />
      )}

      <CategoryFilterSheet
        ref={sheetRef}
        selected={category}
        onSelect={(c) => {
          setCategory(c);
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
  searchWrap: { paddingHorizontal: 20, paddingTop: 12 },
  listContent: { paddingHorizontal: 20, paddingBottom: 24 },
  footer: { marginVertical: 16 },
});
