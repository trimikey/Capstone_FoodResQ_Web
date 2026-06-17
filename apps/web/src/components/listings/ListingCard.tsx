'use client';

import Link from 'next/link';

export interface ListingItem {
  id: string;
  title: string;
  category: string;
  quantityRemaining: number;
  quantityUnit: string;
  pickupStartTime: string;
  pickupEndTime: string;
  pickupAddress: string;
  storageConditions: string | null;
  allergenNotes: string | null;
  maxPerReservation: number;
  imageUrls: string[];
  status: string;
  provider: { id: string; businessName: string };
  distanceM: number;
}

interface Props {
  listing: ListingItem;
  onReserve?: () => void; // Made optional
}

const CATEGORY_LABELS: Record<string, string> = {
  prepared_meal: 'Đồ chín',
  raw_ingredients: 'Nguyên liệu',
  bakery: 'Bánh ngọt',
  beverage: 'Đồ uống',
  other: 'Khác',
};

function formatDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

export default function ListingCard({ listing }: Props) {
  const pickupEnd = new Date(listing.pickupEndTime);
  const isExpiringSoon = pickupEnd.getTime() - Date.now() < 2 * 60 * 60 * 1000;
  const isEmpty = listing.quantityRemaining === 0;

  // Custom fallback images for mock display
  const fallbackImage = listing.category === 'bakery'
    ? '/banh-mi-ngot-thap-cam.png'
    : listing.category === 'prepared_meal'
    ? '/com-ga-hoi-an.png'
    : '/banh-mi-lua-mach-tuoi.png';

  const imageUrl = listing.imageUrls.length > 0 ? listing.imageUrls[0] : fallbackImage;

  return (
    <div className="glass-card flex flex-col overflow-hidden hover:shadow-lg transition-smooth">
      {/* Image */}
      <div className="relative h-44 bg-surface-container overflow-hidden">
        {listing.imageUrls.length > 0 ? (
          <img
            src={listing.imageUrls[0]}
            alt={listing.title}
            className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="absolute top-3 left-3 bg-[#236c2a]/90 backdrop-blur-sm text-white px-3 py-1 rounded-full font-headline-md tracking-wider text-[10px] font-bold shadow-sm uppercase">
            Mới đăng
          </div>
        )}

        {/* Distance badge */}
        <div className="absolute top-sm right-sm glass-card px-sm py-xs flex items-center gap-xs">
          <span className="material-symbols-outlined text-primary" style={{ fontSize: '14px' }}>
            location_on
          </span>
          <span className="font-label-sm text-label-sm text-on-surface">{formatDistance(listing.distanceM)}</span>
        </div>

        {isExpiringSoon && !isEmpty && (
          <div className="absolute top-sm left-sm bg-error text-white px-sm py-xs rounded-lg font-label-sm text-label-sm">
            Sắp hết hạn
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-md flex flex-col flex-1 gap-sm">
        <div>
          <span className="impact-chip mb-xs">
            {CATEGORY_LABELS[listing.category] ?? listing.category}
          </span>
          <h3 className="font-headline-md text-headline-md text-on-surface line-clamp-2">{listing.title}</h3>
          <p className="font-label-sm text-label-sm text-on-surface-variant mt-xs">{listing.provider.businessName}</p>
        </div>

        {/* Details Row: Distance & Rating */}
        <div className="flex items-center gap-3 mt-auto pt-4 border-t border-neutral-100 text-[13px] text-neutral-500 font-body-md">
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[#236c2a] text-[16px]">location_on</span>
            <span>{formatDistance(listing.distanceM || 1200)}</span>
          </div>

          <span className="text-neutral-300">•</span>

          <div className="flex items-center gap-1">
            <span className="material-symbols-outlined text-amber-500 text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
            <span className="font-bold text-neutral-700 text-[13px]">4.8</span>
            <span className="text-neutral-400 text-xs">Uy tín</span>
          </div>
        </div>

        <button
          onClick={onReserve}
          disabled={isEmpty}
          className="mt-auto w-full py-3 px-md bg-primary text-on-primary rounded-lg font-label-lg transition-all hover:shadow-lg active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed emerald-glow"
        >
          {isEmpty ? 'Đã hết' : 'Đặt ngay'}
        </button>
      </div>
    </Link>
  );
}
