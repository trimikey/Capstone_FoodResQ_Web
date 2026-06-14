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
    <Link
      href={`/listings/${listing.id}`}
      className="bg-surface rounded-2xl overflow-hidden border border-outline-variant/15 flex flex-col hover:shadow-md hover:border-primary/20 transition-all duration-300 group cursor-pointer"
    >
      {/* Image Container */}
      <div className="relative h-44 bg-surface-container overflow-hidden">
        <img
          src={imageUrl}
          alt={listing.title}
          className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-500"
        />

        {/* Expiry / Status badges */}
        {isExpiringSoon && !isEmpty ? (
          <div className="absolute top-3 left-3 bg-error/90 backdrop-blur-sm text-white px-3 py-1 rounded-full font-label-sm text-[11px] font-semibold shadow-sm">
            Hết hạn trong 2h
          </div>
        ) : (
          <div className="absolute top-3 left-3 bg-primary/90 backdrop-blur-sm text-white px-3 py-1 rounded-full font-label-sm text-[11px] font-semibold shadow-sm">
            Mới đăng
          </div>
        )}

        {/* Free / Price badge */}
        <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-sm text-white px-3 py-0.5 rounded-full font-label-sm text-[11px] font-semibold">
          Miễn phí
        </div>
      </div>

      {/* Content */}
      <div className="p-4 flex flex-col flex-1 gap-sm">
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <h3 className="font-label-lg text-sm text-on-surface font-bold line-clamp-1 group-hover:text-primary transition-colors">
              {listing.title}
            </h3>
            {/* Portions left badge (Green as shown in mockup) */}
            <span className="shrink-0 bg-primary/10 text-primary px-2.5 py-0.5 rounded-full font-label-sm text-[11px] font-bold">
              Còn lại {listing.quantityRemaining} phần
            </span>
          </div>
          <p className="font-label-sm text-xs text-on-surface-variant/80">{listing.provider.businessName}</p>
        </div>

        {/* Details Row: Distance & Rating */}
        <div className="flex items-center gap-3 mt-auto pt-2 border-t border-outline-variant/10 text-xs text-on-surface-variant/80">
          <div className="flex items-center gap-1">
            <span className="material-symbols-outlined text-primary text-[16px]">location_on</span>
            <span>{formatDistance(listing.distanceM || 1200)}</span>
          </div>

          <span className="text-outline-variant">•</span>

          <div className="flex items-center gap-1">
            <span className="material-symbols-outlined text-amber-500 text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
            <span className="font-semibold text-on-surface font-label-sm text-xs">4.8</span>
            <span className="text-on-surface-variant/70">Uy tín</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
