'use client';

import { useState } from 'react';
import { useListings } from '@/hooks/useListings';
import { FoodCategory } from '@foodresq/types';
import ListingCard from '@/components/listings/ListingCard';
import ReservationModal from '@/components/listings/ReservationModal';

const CATEGORIES: { value: FoodCategory | ''; label: string }[] = [
  { value: '', label: 'Tất cả' },
  { value: FoodCategory.PREPARED_MEAL, label: 'Đồ chín' },
  { value: FoodCategory.RAW_INGREDIENTS, label: 'Nguyên liệu' },
  { value: FoodCategory.BAKERY, label: 'Bánh' },
  { value: FoodCategory.BEVERAGE, label: 'Đồ uống' },
  { value: FoodCategory.OTHER, label: 'Khác' },
];

const DEFAULT_LAT = 10.8231;
const DEFAULT_LNG = 106.6297;

export default function ListingsPage() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<FoodCategory | ''>('');
  const [selectedListingId, setSelectedListingId] = useState<string | null>(null);

  const { data: listings, isLoading, isError, refetch } = useListings({
    lat: DEFAULT_LAT,
    lng: DEFAULT_LNG,
    radiusKm: 5,
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

      {/* Loading */}
      {isLoading && (
        <div className="flex-1 flex items-center justify-center py-xl">
          <div className="flex flex-col items-center gap-md">
            <span className="animate-spin border-4 border-primary border-t-transparent rounded-full w-10 h-10" />
            <p className="font-body-md text-on-surface-variant">Đang tải...</p>
          </div>
        </div>
      )}

      {/* Error */}
      {isError && (
        <div className="flex-1 flex items-center justify-center py-xl">
          <div className="text-center">
            <span className="material-symbols-outlined text-error" style={{ fontSize: '48px' }}>
              wifi_off
            </span>
            <p className="font-body-md text-on-surface-variant mt-md">Không thể tải danh sách</p>
            <button
              onClick={() => refetch()}
              className="mt-md px-lg py-3 bg-primary-container text-on-primary-container rounded-xl font-label-lg text-label-lg"
            >
              Thử lại
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !isError && (!listings || listings.length === 0) && (
        <div className="flex-1 flex items-center justify-center py-xl">
          <div className="text-center">
            <span className="material-symbols-outlined text-outline-variant" style={{ fontSize: '64px' }}>
              restaurant
            </span>
            <h3 className="font-headline-md text-headline-md text-on-surface mt-md">Chưa có thực phẩm nào</h3>
            <p className="font-body-md text-on-surface-variant mt-sm max-w-xs mx-auto">
              Hãy thử tìm kiếm với từ khóa khác hoặc xóa bộ lọc danh mục.
            </p>
            {(search || category) && (
              <button
                onClick={() => { setSearch(''); setCategory(''); }}
                className="mt-md px-lg py-3 border border-outline-variant/30 rounded-xl font-label-lg text-label-lg text-on-surface-variant hover:bg-surface-container"
              >
                Xóa bộ lọc
              </button>
            )}
          </div>
        </div>
      )}

      {/* Grid */}
      {!isLoading && listings && listings.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-md">
          {listings.map((listing) => (
            <ListingCard
              key={listing.id}
              listing={listing}
              onReserve={() => setSelectedListingId(listing.id)}
            />
          ))}
        </div>
      )}

      {/* Reservation Modal */}
      {selectedListingId && (
        <ReservationModal
          listingId={selectedListingId}
          onClose={() => setSelectedListingId(null)}
        />
      )}
    </div>
  );
}
