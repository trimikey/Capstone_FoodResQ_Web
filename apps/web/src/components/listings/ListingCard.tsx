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
      className="bg-white rounded-2xl overflow-hidden border border-neutral-200 flex flex-col hover:shadow-lg hover:border-[#236c2a]/30 transition-all duration-300 group cursor-pointer hover:-translate-y-1"
    >
      {/* Image Container */}
      <div className="relative h-48 bg-neutral-100 overflow-hidden border-b border-neutral-100">
        <img
          src={imageUrl}
          alt={listing.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />

        {/* Expiry / Status badges */}
        {isExpiringSoon && !isEmpty ? (
          <div className="absolute top-3 left-3 bg-rose-500/90 backdrop-blur-sm text-white px-3 py-1 rounded-full font-headline-md tracking-wider text-[10px] font-bold shadow-sm uppercase">
            Sắp hết hạn
          </div>
        ) : (
          <div className="absolute top-3 left-3 bg-[#236c2a]/90 backdrop-blur-sm text-white px-3 py-1 rounded-full font-headline-md tracking-wider text-[10px] font-bold shadow-sm uppercase">
            Mới đăng
          </div>
        )}

        {/* Free / Price badge */}
        <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-sm text-white px-3 py-1 rounded-full font-headline-md tracking-wider text-[10px] font-bold uppercase">
          Miễn phí
        </div>
      </div>

      {/* Content */}
      <div className="p-5 flex flex-col flex-1 gap-2">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <h3 className="font-headline-md text-[17px] text-neutral-900 font-medium line-clamp-1 group-hover:text-[#236c2a] transition-colors">
              {listing.title}
            </h3>
            {/* Portions left badge (Green as shown in mockup) */}
            <span className="shrink-0 bg-[#efe8d8] text-[#236c2a] px-2.5 py-1 rounded-full font-body-md text-[11px] font-bold">
              Còn {listing.quantityRemaining} phần
            </span>
          </div>
          <p className="font-body-md text-[13px] text-neutral-500">{listing.provider.businessName}</p>
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
      </div>
    </Link>
  );
}
