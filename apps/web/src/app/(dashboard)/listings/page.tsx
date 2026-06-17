'use client';

import { useState, useMemo, useEffect, Suspense } from 'react';
import { useListings } from '@/hooks/useListings';
import { FoodCategory } from '@foodresq/types';
import ListingCard, { type ListingItem } from '@/components/listings/ListingCard';
import { useSearchParams } from 'next/navigation';

const CATEGORIES: { value: FoodCategory | ''; label: string }[] = [
  { value: '', label: 'Tất cả' },
  { value: FoodCategory.PREPARED_MEAL, label: 'Đồ chín' },
  { value: FoodCategory.RAW_INGREDIENTS, label: 'Nguyên liệu' },
  { value: FoodCategory.BAKERY, label: 'Bánh ngọt' },
  { value: FoodCategory.BEVERAGE, label: 'Đồ uống' },
  { value: FoodCategory.OTHER, label: 'Khác' },
];

function formatDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

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
  
  // Interactive Map State
  const [hoveredListingId, setHoveredListingId] = useState<string | null>(null);
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null); // pin đang focus

  const { data: apiListings, isLoading, isError, refetch } = useListings({
    lat: DEFAULT_LAT,
    lng: DEFAULT_LNG,
    radiusKm: distanceFilter,
    search: search.trim() || undefined,
    category: (category as FoodCategory) || undefined,
  });

  return (
    <div className="p-md md:p-lg flex flex-col gap-lg min-h-full">
      {/* Header */}
      <div className="flex items-start justify-between gap-md">
        <div>
          <h1 className="font-display-lg text-display-lg text-on-surface">Thực phẩm gần đây</h1>
          <p className="font-label-lg text-label-lg text-on-surface-variant mt-sm">
            Bán kính 5km • {listings?.length ?? 0} kết quả
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="p-md rounded-lg text-on-surface-variant hover:bg-surface-container transition-colors"
          title="Làm mới"
        >
          <span className="material-symbols-outlined text-[24px]">refresh</span>
        </button>
      </div>

      {/* Search bar */}
      <div className="relative glass-card">
        <span className="material-symbols-outlined absolute left-md top-1/2 -translate-y-1/2 text-outline-variant">
          search
        </span>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm kiếm thực phẩm, cửa hàng..."
          className="w-full pl-12 pr-md py-3 bg-transparent border-0 outline-none font-body-md text-on-surface placeholder:text-on-surface-variant"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-md top-1/2 -translate-y-1/2 text-outline-variant hover:text-on-surface transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        )}
      </div>

      {/* Category filters */}
      <div className="flex gap-sm overflow-x-auto pb-sm flex-nowrap -mx-md px-md md:mx-0 md:px-0">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.value}
            onClick={() => setCategory(cat.value)}
            className={`whitespace-nowrap px-md py-2 rounded-lg font-label-lg text-label-lg border transition-all shrink-0 ${
              category === cat.value
                ? 'bg-primary text-on-primary border-primary emerald-glow'
                : 'glass-card border-outline-variant/50 text-on-surface-variant hover:border-primary hover:text-primary'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

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
            <button
              onClick={() => refetch()}
              className="p-2.5 rounded-full text-neutral-500 hover:bg-white hover:text-neutral-900 transition-colors border border-neutral-200 bg-transparent shadow-sm"
              title="Làm mới"
            >
              <span className="material-symbols-outlined text-[20px]">refresh</span>
            </button>
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
            <div className="relative group">
              <button className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-neutral-200 bg-white hover:border-[#236c2a]/40 font-medium text-neutral-700 shadow-sm transition-all">
                Khoảng cách: {distanceFilter}km
                <span className="material-symbols-outlined text-sm text-neutral-400">keyboard_arrow_down</span>
              </button>
              <div className="absolute top-full left-0 mt-2 hidden group-hover:block hover:block bg-white border border-neutral-200 rounded-xl shadow-xl z-30 py-2 min-w-[140px]">
                {[2, 5, 10, 20].map((d) => (
                  <button
                    key={d}
                    onClick={() => setDistanceFilter(d)}
                    className="w-full text-left px-5 py-2 hover:bg-[#efe8d8] text-neutral-700 hover:text-[#236c2a] text-[13px] font-medium transition-colors"
                  >
                    Trong vòng {d}km
                  </button>
                ))}
              </div>
            </div>

            {/* Category Filter Dropdown */}
            <div className="relative group">
              <button className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-neutral-200 bg-white hover:border-[#236c2a]/40 font-medium text-neutral-700 shadow-sm transition-all">
                Danh mục: {category ? CATEGORIES.find(c => c.value === category)?.label : 'Tất cả'}
                <span className="material-symbols-outlined text-sm text-neutral-400">keyboard_arrow_down</span>
              </button>
              <div className="absolute top-full left-0 mt-2 hidden group-hover:block hover:block bg-white border border-neutral-200 rounded-xl shadow-xl z-30 py-2 min-w-[160px]">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.value}
                    onClick={() => setCategory(cat.value)}
                    className="w-full text-left px-5 py-2 hover:bg-[#efe8d8] text-neutral-700 hover:text-[#236c2a] text-[13px] font-medium transition-colors"
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Pickup Time Filter */}
            <div className="relative group">
              <button className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-neutral-200 bg-white hover:border-[#236c2a]/40 font-medium text-neutral-700 shadow-sm transition-all">
                Thời gian nhận
                <span className="material-symbols-outlined text-sm text-neutral-400">keyboard_arrow_down</span>
              </button>
              <div className="absolute top-full left-0 mt-2 hidden group-hover:block hover:block bg-white border border-neutral-200 rounded-xl shadow-xl z-30 py-2 min-w-[160px]">
                <button onClick={() => setTimeFilter('all')} className="w-full text-left px-5 py-2 hover:bg-[#efe8d8] text-neutral-700 hover:text-[#236c2a] text-[13px] font-medium transition-colors">Tất cả</button>
                <button onClick={() => setTimeFilter('soon')} className="w-full text-left px-5 py-2 hover:bg-[#efe8d8] text-neutral-700 hover:text-[#236c2a] text-[13px] font-medium transition-colors">Sắp hết hạn (&lt;2h)</button>
              </div>
            </div>
          </div>

          {/* Quick pills */}
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none pt-2">
            {['Bánh mì', 'Suất ăn', 'Trái cây', 'Nước ngọt'].map((pill) => (
              <button
                key={pill}
                onClick={() => handlePillClick(pill)}
                className={`px-5 py-2 rounded-full border transition-all text-[13px] font-medium shrink-0 ${
                  activePill === pill
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
                  onMouseEnter={() => {
                    setHoveredListingId(item.id);
                    setSelectedPinId(item.id);
                  }}
                  onMouseLeave={() => setHoveredListingId(null)}
                  className={`transition-all duration-300 rounded-2xl ${
                    selectedPinId === item.id ? 'ring-[3px] ring-[#236c2a] ring-offset-2 ring-offset-[#fcf9f2]' : ''
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

      {/* Right side: Interactive Map Mock */}
      <div className="hidden lg:flex flex-1 bg-[#363a36] relative items-center justify-center p-8 select-none">
        {/* Floating background grids for premium map styling */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />

        {/* Mobile Device Mockup */}
        <div className="relative w-full max-w-[340px] aspect-[9/18.5] max-h-[82vh] bg-black rounded-[48px] p-3 shadow-2xl border-[4px] border-neutral-800 flex flex-col z-10">
          {/* Notch */}
          <div className="absolute top-5 left-1/2 -translate-x-1/2 w-36 h-6 bg-black rounded-full z-30 flex items-center justify-center">
            <span className="w-16 h-1 bg-neutral-800 rounded-full" />
          </div>

          {/* Screen Container */}
          <div className="relative flex-1 rounded-[38px] overflow-hidden bg-[#dedcd8] flex flex-col border border-neutral-900">
            {/* Simulated Phone Top Status Bar */}
            <div className="h-9 bg-transparent absolute top-0 left-0 right-0 z-20 flex justify-between items-center px-6 text-[10px] font-bold text-neutral-800">
              <span>9:41</span>
              <div className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[12px]">signal_cellular_alt</span>
                <span className="material-symbols-outlined text-[12px]">wifi</span>
                <span className="material-symbols-outlined text-[12px]">battery_full</span>
              </div>
            </div>

            {/* Mobile Header */}
            <div className="pt-10 pb-3 bg-white/70 backdrop-blur-md border-b border-neutral-300/30 z-10 px-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-neutral-800 text-[18px]">arrow_back_ios</span>
                <h4 className="font-label-lg text-xs font-bold text-neutral-800">Bản đồ thực phẩm</h4>
              </div>
              <span className="material-symbols-outlined text-neutral-800 text-[18px]">tune</span>
            </div>

            {/* Map Canvas Frame */}
            <div className="flex-1 relative bg-[#e3e1dc] overflow-hidden">
              {/* Grid Roads simulation */}
              <svg className="absolute inset-0 w-full h-full opacity-40 pointer-events-none" xmlns="http://www.w3.org/2000/svg">
                {/* Horizontal Streets */}
                <line x1="0" y1="80" x2="400" y2="80" stroke="#fff" strokeWidth="8" />
                <line x1="0" y1="160" x2="400" y2="160" stroke="#fff" strokeWidth="12" />
                <line x1="0" y1="320" x2="400" y2="320" stroke="#fff" strokeWidth="10" />
                <line x1="0" y1="440" x2="400" y2="440" stroke="#fff" strokeWidth="6" />

                {/* Vertical Streets */}
                <line x1="60" y1="0" x2="60" y2="600" stroke="#fff" strokeWidth="8" />
                <line x1="160" y1="0" x2="160" y2="600" stroke="#fff" strokeWidth="14" />
                <line x1="280" y1="0" x2="280" y2="600" stroke="#fff" strokeWidth="10" />

                {/* Diagonal shortcut */}
                <line x1="0" y1="0" x2="300" y2="500" stroke="#fff" strokeWidth="10" />
              </svg>

              {/* Park Green Areas */}
              <div className="absolute top-24 left-20 w-16 h-12 rounded-full bg-emerald-700/10 blur-[4px]" />
              <div className="absolute bottom-16 right-10 w-24 h-24 rounded-full bg-emerald-700/10 blur-[6px]" />

              {/* Lakes/Water Area */}
              <div className="absolute top-48 right-16 w-20 h-16 rounded-3xl bg-sky-500/15 blur-[2px]" />

              {/* User Position Pin (Green circle & pulse) */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center z-20">
                <span className="absolute inline-flex h-6 w-6 rounded-full bg-primary/30 animate-ping" />
                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-primary border-[2.5px] border-white shadow-md" />
                
                {/* Labeled callout */}
                <div className="mt-1 bg-primary text-white font-label-sm text-[9px] font-bold px-2 py-0.5 rounded-full shadow-sm whitespace-nowrap">
                  Vị trí của bạn
                </div>
              </div>

              {/* Listing Markers on Map */}
              {listings.map((item, index) => {
                // Calculate pseudo-locations based on coordinates or indices
                const offsets = [
                  { x: '72%', y: '32%' }, // Sweet buns
                  { x: '35%', y: '25%' }, // Fresh bread
                  { x: '22%', y: '68%' }, // Chicken rice
                  { x: '78%', y: '74%' }, // Cream puff
                ];
                
                const pos = offsets[index % offsets.length];
                const isActive = selectedPinId === item.id;
                const isHovered = hoveredListingId === item.id;

                return (
                  <div
                    key={item.id}
                    className="absolute z-20 cursor-pointer transition-all duration-300"
                    style={{ left: pos.x, top: pos.y }}
                    onClick={() => setSelectedPinId(item.id)}
                  >
                    {/* Pulsing indicator if active or hovered */}
                    {(isActive || isHovered) && (
                      <span className="absolute -top-3 -left-3 inline-flex h-10 w-10 rounded-full bg-amber-500/20 animate-ping" />
                    )}
                    
                    {/* Pin Marker */}
                    <div className={`relative flex items-center justify-center rounded-full shadow-md transition-all duration-300 ${
                      isActive || isHovered
                        ? 'scale-110 border-[2px] border-amber-500 bg-white p-0.5'
                        : 'bg-primary/95 text-white p-1 hover:scale-105'
                    }`}>
                      <span className={`material-symbols-outlined ${
                        isActive || isHovered ? 'text-amber-500 text-[18px]' : 'text-white text-[12px]'
                      }`}>
                        restaurant
                      </span>
                    </div>

                    {/* Small Callout for Active Pin (matches mockup) */}
                    {(isActive || isHovered) && (
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-white/95 backdrop-blur-sm text-neutral-800 p-2 rounded-xl border border-neutral-300/40 shadow-lg flex items-center gap-2 max-w-[140px] whitespace-nowrap animate-in fade-in slide-in-from-bottom duration-200">
                        {/* Rounded thumbnail */}
                        <div className="w-6 h-6 rounded-lg overflow-hidden shrink-0 bg-neutral-100">
                          <img
                            src={item.imageUrls[0] || '/banh-mi-ngot-thap-cam.png'}
                            alt={item.title}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="min-w-0">
                          <p className="font-label-lg text-[9px] font-bold text-neutral-800 truncate leading-none mb-[2px]">
                            {item.provider.businessName}
                          </p>
                          <p className="text-[8px] text-neutral-500/90 leading-none truncate">
                            {formatDistance(item.distanceM || 900)}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Floating controls inside map */}
              <div className="absolute bottom-4 right-4 flex flex-col gap-2 z-20">
                <button className="w-8 h-8 rounded-full bg-white text-neutral-800 flex items-center justify-center shadow-md border border-neutral-200 hover:bg-neutral-50 transition-colors">
                  <span className="material-symbols-outlined text-[16px]">my_location</span>
                </button>
                <div className="flex flex-col rounded-xl bg-white shadow-md border border-neutral-200 overflow-hidden">
                  <button className="w-8 h-8 text-neutral-800 flex items-center justify-center hover:bg-neutral-50 border-b border-neutral-200 transition-colors font-bold text-xs">+</button>
                  <button className="w-8 h-8 text-neutral-800 flex items-center justify-center hover:bg-neutral-50 transition-colors font-bold text-xs">-</button>
                </div>
              </div>
            </div>

            {/* Simulated Phone Bottom App Navigation Bar */}
            <div className="h-14 bg-white/95 backdrop-blur-md border-t border-neutral-300/30 flex items-center justify-around z-20 px-3 pb-2">
              <span className="material-symbols-outlined text-[20px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>home</span>
              <span className="material-symbols-outlined text-[20px] text-neutral-400">search</span>
              <span className="material-symbols-outlined text-[20px] text-neutral-400">history_edu</span>
              <span className="material-symbols-outlined text-[20px] text-neutral-400">notifications</span>
              <span className="material-symbols-outlined text-[20px] text-neutral-400">person</span>
            </div>
          </div>
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
