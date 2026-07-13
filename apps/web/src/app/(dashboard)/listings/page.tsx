'use client';

import { useState, useMemo, useEffect, useCallback, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useListings } from '@/hooks/useListings';
import { FoodCategory, FoodGroup, FOOD_CATEGORY_LABEL, FOOD_GROUP_CATEGORIES } from '@foodresq/types';
import ListingCard, { type ListingItem } from '@/components/listings/ListingCard';
import { useSearchParams } from 'next/navigation';

// Bản đồ Leaflet dùng `window` → chỉ render ở client (ssr: false)
const ListingsMap = dynamic(() => import('@/components/map/ListingsMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-[#e3e1dc]">
      <span className="animate-spin border-4 border-[#236c2a] border-t-transparent rounded-full w-10 h-10" />
    </div>
  ),
});

const CATEGORIES: { value: FoodCategory | ''; label: string }[] = [
  { value: '', label: 'Tất cả' },
  ...FOOD_GROUP_CATEGORIES[FoodGroup.READY_TO_EAT].map((c) => ({ value: c, label: FOOD_CATEGORY_LABEL[c] })),
  ...FOOD_GROUP_CATEGORIES[FoodGroup.RAW_INGREDIENT].map((c) => ({ value: c, label: FOOD_CATEGORY_LABEL[c] })),
  { value: FoodCategory.OTHER, label: FOOD_CATEGORY_LABEL[FoodCategory.OTHER] },
];

const DEFAULT_LAT = 10.8231;
const DEFAULT_LNG = 106.6297;

function ListingsPageContent() {
  const searchParams = useSearchParams();
  const queryParam = searchParams ? searchParams.get('q') || '' : '';
  const [search, setSearch] = useState(queryParam);

  useEffect(() => {
    setSearch(queryParam);
  }, [queryParam]);

  const [category, setCategory] = useState<FoodCategory | ''>('');
  const [distanceFilter, setDistanceFilter] = useState<number>(5); // Default 5km
  const [timeFilter, setTimeFilter] = useState<'all' | 'soon' | 'today'>('all');
  const [activePill, setActivePill] = useState<string | null>(null);
  // Dropdown bộ lọc: bấm để mở, bấm ra ngoài/chọn để đóng (không dùng hover để khỏi tự đóng)
  const [openMenu, setOpenMenu] = useState<'distance' | 'category' | 'time' | null>(null);

  // Interactive Map State
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null); // pin đang focus

  // Vị trí người dùng: mặc định tâm HCM, thay bằng GPS thật khi có quyền
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number }>({
    lat: DEFAULT_LAT,
    lng: DEFAULT_LNG,
  });
  const [locStatus, setLocStatus] = useState<'default' | 'locating' | 'gps' | 'denied'>('default');

  // Xin GPS (gọi lúc mở trang + khi bấm "Định vị lại")
  const locate = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocStatus('denied');
      return;
    }
    setLocStatus('locating');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocStatus('gps');
      },
      () => setLocStatus('denied'), // từ chối/không lấy được → giữ tâm HCM
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    );
  }, []);

  useEffect(() => {
    locate();
  }, [locate]);

  const { data: apiListings, isLoading, isError, refetch } = useListings({
    lat: userLoc.lat,
    lng: userLoc.lng,
    radiusKm: distanceFilter,
    search: search.trim() || undefined,
    category: (category as FoodCategory) || undefined,
    limit: 100, // tải nhiều điểm để bản đồ hiển thị đủ khi zoom ra
  });

  // Luôn dùng dữ liệu thật từ API. search/category đã được lọc phía BE (PostGIS);
  // chỉ lọc thêm activePill (chip nhanh) phía client cho tức thời.
  const listings = useMemo<ListingItem[]>(() => {
    let list: ListingItem[] = apiListings ?? [];
    if (activePill) {
      list = list.filter((item) =>
        item.title.toLowerCase().includes(activePill.toLowerCase()),
      );
    }
    if (timeFilter === 'soon') {
      // Sắp hết hạn: pickupEndTime trong vòng 2 giờ
      const twoHours = 2 * 60 * 60 * 1000;
      list = list.filter(
        (item) => new Date(item.pickupEndTime).getTime() - Date.now() < twoHours,
      );
    }
    return list;
  }, [apiListings, activePill, timeFilter]);

  // If search or categories change, auto-select first pin of the filtered list
  useEffect(() => {
    if (listings.length > 0) {
      setSelectedPinId(listings[0].id);
    } else {
      setSelectedPinId(null);
    }
  }, [listings]);

  const handlePillClick = (pillName: string) => {
    if (activePill === pillName) {
      setActivePill(null);
    } else {
      setActivePill(pillName);
    }
  };

  return (
    <div className="flex-1 flex flex-col lg:flex-row h-[calc(100vh-104px)] overflow-hidden bg-[#fcf9f2]">
      {/* Left side: Listings Panel */}
      <div className="w-full lg:w-[45%] xl:w-[40%] flex flex-col border-r border-neutral-200 bg-[#fcf9f2] h-full overflow-y-auto">
        <div className="p-6 space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-headline-md text-3xl text-neutral-900 font-bold">Thực phẩm mới đăng</h2>
              <p className="font-body-md text-sm text-neutral-500 mt-1">
                Bán kính {distanceFilter}km • {listings.length} kết quả tìm thấy
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={locate}
                disabled={locStatus === 'locating'}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-bold transition-colors border shadow-sm disabled:opacity-60 ${locStatus === 'gps'
                  ? 'border-emerald-600 text-emerald-700 bg-emerald-50'
                  : 'border-neutral-200 text-neutral-600 bg-white hover:text-neutral-900'
                  }`}
                title="Định vị lại theo GPS"
              >
                <span className={`material-symbols-outlined text-[18px] ${locStatus === 'locating' ? 'animate-spin' : ''}`}>
                  {locStatus === 'locating' ? 'progress_activity' : 'my_location'}
                </span>
                {locStatus === 'locating' ? 'Đang định vị…' : 'Định vị lại'}
              </button>

            </div>
          </div>

          {/* Trạng thái định vị */}
          <div className={`flex items-center gap-1.5 text-xs font-semibold -mt-3 ${locStatus === 'gps' ? 'text-emerald-700' : locStatus === 'denied' ? 'text-amber-600' : 'text-neutral-400'
            }`}>
            <span className="material-symbols-outlined text-[14px]">
              {locStatus === 'gps' ? 'location_on' : locStatus === 'denied' ? 'location_off' : 'location_searching'}
            </span>
            {locStatus === 'gps'
              ? 'Đang hiển thị thực phẩm quanh vị trí GPS của bạn'
              : locStatus === 'locating'
                ? 'Đang xác định vị trí…'
                : locStatus === 'denied'
                  ? 'Chưa cấp quyền vị trí — đang dùng trung tâm TP.HCM. Bấm "Định vị lại".'
                  : 'Trung tâm TP.HCM'}
          </div>

          {/* Quick Search */}
          <div className="relative">
            <span className="material-symbols-outlined absolute left-5 top-1/2 -translate-y-1/2 text-neutral-400 text-[20px]">
              search
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm kiếm thực phẩm, cửa hàng..."
              className="w-full pl-12 pr-10 py-3.5 bg-white border border-neutral-200 rounded-full focus:outline-none focus:border-[#236c2a] focus:ring-1 focus:ring-[#236c2a] font-body-md text-[15px] transition-all placeholder:text-neutral-400 shadow-sm"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-900 transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            )}
          </div>

          {/* Filter Row: Distance, Category, Time */}
          <div className="flex flex-wrap gap-3 items-center text-[13px]">
            <span className="text-neutral-500 font-medium flex items-center gap-1.5 uppercase tracking-wider text-[11px]">
              <span className="material-symbols-outlined text-[16px]">filter_list</span>
              Bộ lọc:
            </span>

            {/* Distance Filter Dropdown */}
            <div className="relative">
              <button
                onClick={() => setOpenMenu(openMenu === 'distance' ? null : 'distance')}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-neutral-200 bg-white hover:border-[#236c2a]/40 font-medium text-neutral-700 shadow-sm transition-all"
              >
                Khoảng cách: {distanceFilter}km
                <span className="material-symbols-outlined text-sm text-neutral-400">keyboard_arrow_down</span>
              </button>
              {openMenu === 'distance' && (
                <div className="absolute top-full left-0 mt-2 bg-white border border-neutral-200 rounded-xl shadow-xl z-40 py-2 min-w-[140px]">
                  {[2, 5, 10, 20, 50].map((d) => (
                    <button
                      key={d}
                      onClick={() => { setDistanceFilter(d); setOpenMenu(null); }}
                      className={`w-full text-left px-5 py-2 hover:bg-[#efe8d8] text-[13px] font-medium transition-colors ${distanceFilter === d ? 'text-[#236c2a] bg-[#efe8d8]/50' : 'text-neutral-700 hover:text-[#236c2a]'}`}
                    >
                      Trong vòng {d}km
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Category Filter Dropdown */}
            <div className="relative">
              <button
                onClick={() => setOpenMenu(openMenu === 'category' ? null : 'category')}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-neutral-200 bg-white hover:border-[#236c2a]/40 font-medium text-neutral-700 shadow-sm transition-all"
              >
                Danh mục: {category ? CATEGORIES.find(c => c.value === category)?.label : 'Tất cả'}
                <span className="material-symbols-outlined text-sm text-neutral-400">keyboard_arrow_down</span>
              </button>
              {openMenu === 'category' && (
                <div className="absolute top-full left-0 mt-2 bg-white border border-neutral-200 rounded-xl shadow-xl z-40 py-2 min-w-[160px]">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat.value}
                      onClick={() => { setCategory(cat.value); setOpenMenu(null); }}
                      className={`w-full text-left px-5 py-2 hover:bg-[#efe8d8] text-[13px] font-medium transition-colors ${category === cat.value ? 'text-[#236c2a] bg-[#efe8d8]/50' : 'text-neutral-700 hover:text-[#236c2a]'}`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Pickup Time Filter */}
            <div className="relative">
              <button
                onClick={() => setOpenMenu(openMenu === 'time' ? null : 'time')}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-neutral-200 bg-white hover:border-[#236c2a]/40 font-medium text-neutral-700 shadow-sm transition-all"
              >
                Thời gian nhận{timeFilter === 'soon' ? ': Sắp hết hạn' : ''}
                <span className="material-symbols-outlined text-sm text-neutral-400">keyboard_arrow_down</span>
              </button>
              {openMenu === 'time' && (
                <div className="absolute top-full left-0 mt-2 bg-white border border-neutral-200 rounded-xl shadow-xl z-40 py-2 min-w-[160px]">
                  <button onClick={() => { setTimeFilter('all'); setOpenMenu(null); }} className="w-full text-left px-5 py-2 hover:bg-[#efe8d8] text-neutral-700 hover:text-[#236c2a] text-[13px] font-medium transition-colors">Tất cả</button>
                  <button onClick={() => { setTimeFilter('soon'); setOpenMenu(null); }} className="w-full text-left px-5 py-2 hover:bg-[#efe8d8] text-neutral-700 hover:text-[#236c2a] text-[13px] font-medium transition-colors">Sắp hết hạn (&lt;2h)</button>
                </div>
              )}
            </div>
          </div>

          {/* Lớp phủ bắt click ra ngoài để đóng dropdown */}
          {openMenu && <div className="fixed inset-0 z-30" onClick={() => setOpenMenu(null)} />}

          {/* Quick pills */}
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none pt-2">
            {['Bánh mì', 'Suất ăn', 'Trái cây', 'Nước ngọt'].map((pill) => (
              <button
                key={pill}
                onClick={() => handlePillClick(pill)}
                className={`px-5 py-2 rounded-full border transition-all text-[13px] font-medium shrink-0 ${activePill === pill
                  ? 'bg-[#236c2a] text-white border-[#236c2a] shadow-md'
                  : 'bg-white border-neutral-200 text-neutral-600 hover:border-[#236c2a]/50 hover:text-[#236c2a]'
                  }`}
              >
                {pill}
              </button>
            ))}
          </div>

          {/* Listings List */}
          <div className="space-y-4">
            {/* Loading: skeleton thật trong khi gọi API */}
            {isLoading &&
              Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="h-64 rounded-2xl bg-surface-container-low border border-outline-variant/15 animate-pulse"
                />
              ))}

            {/* Error khi gọi API thất bại */}
            {!isLoading && isError && (
              <div className="text-center py-12 space-y-3">
                <span className="material-symbols-outlined text-error text-[48px]">wifi_off</span>
                <p className="font-label-lg text-sm text-on-surface-variant">
                  Không tải được dữ liệu. Kiểm tra kết nối tới máy chủ.
                </p>
                <button
                  onClick={() => refetch()}
                  className="px-4 py-2 bg-primary/10 text-primary rounded-xl text-xs font-bold"
                >
                  Thử lại
                </button>
              </div>
            )}

            {!isLoading &&
              !isError &&
              listings.map((item) => (
                <div
                  key={item.id}
                  onMouseEnter={() => setSelectedPinId(item.id)}
                  className={`transition-all duration-300 rounded-2xl ${selectedPinId === item.id ? 'ring-[3px] ring-[#236c2a] ring-offset-2 ring-offset-[#fcf9f2]' : ''
                    }`}
                >
                  <ListingCard listing={item} />
                </div>
              ))}

            {!isLoading && !isError && listings.length === 0 && (
              <div className="text-center py-16 space-y-4 bg-white border border-neutral-200 rounded-2xl">
                <span className="material-symbols-outlined text-neutral-300 text-[56px]">restaurant</span>
                <p className="font-body-md text-[15px] text-neutral-500">Không tìm thấy thực phẩm nào</p>
                <button
                  onClick={() => {
                    setSearch('');
                    setCategory('');
                    setActivePill(null);
                  }}
                  className="px-6 py-2.5 bg-[#efe8d8] hover:bg-[#e6dcc5] text-[#236c2a] transition-colors rounded-full text-sm font-medium"
                >
                  Xóa bộ lọc
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right side: bản đồ thật (Leaflet + OpenStreetMap) */}
      <div className="hidden lg:block flex-1 relative">
        <ListingsMap
          listings={listings}
          center={userLoc}
          selectedId={selectedPinId}
          onSelect={setSelectedPinId}
        />
        {/* Chú thích nổi trên bản đồ */}
        <div className="absolute top-4 left-4 z-[1000] bg-white/95 backdrop-blur rounded-xl shadow-md border border-neutral-200 px-4 py-2.5 pointer-events-none">
          <p className="text-xs font-bold text-neutral-800">{listings.length} điểm thực phẩm gần bạn</p>
          <p className="text-[11px] text-neutral-500">
            {locStatus === 'gps'
              ? '📍 Theo vị trí GPS của bạn'
              : locStatus === 'locating'
                ? 'Đang xác định vị trí…'
                : locStatus === 'denied'
                  ? 'Chưa có quyền vị trí — đang dùng TP.HCM'
                  : 'Trung tâm TP.HCM'}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function ListingsPage() {
  return (
    <Suspense fallback={
      <div className="flex-1 flex items-center justify-center bg-surface py-20">
        <div className="flex flex-col items-center gap-md">
          <span className="animate-spin border-4 border-primary border-t-transparent rounded-full w-10 h-10" />
          <p className="font-body-md text-on-surface-variant">Đang tải bản đồ...</p>
        </div>
      </div>
    }>
      <ListingsPageContent />
    </Suspense>
  );
}
