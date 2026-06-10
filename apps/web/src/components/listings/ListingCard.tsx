const CATEGORY_LABELS: Record<string, string> = {
  prepared_meal: 'Đồ chín',
  raw_ingredients: 'Nguyên liệu',
  bakery: 'Bánh',
  beverage: 'Đồ uống',
  other: 'Khác',
};

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
  onReserve: () => void;
}

function formatDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

export default function ListingCard({ listing, onReserve }: Props) {
  const pickupEnd = new Date(listing.pickupEndTime);
  const isExpiringSoon = pickupEnd.getTime() - Date.now() < 2 * 60 * 60 * 1000;
  const isEmpty = listing.quantityRemaining === 0;

  return (
    <div className="bg-surface rounded-2xl overflow-hidden border border-outline-variant/20 flex flex-col hover:shadow-md transition-shadow">
      {/* Image */}
      <div className="relative h-44 bg-surface-container overflow-hidden">
        {listing.imageUrls.length > 0 ? (
          <img
            src={listing.imageUrls[0]}
            alt={listing.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-surface-container">
            <span className="material-symbols-outlined text-outline-variant" style={{ fontSize: '48px' }}>
              restaurant
            </span>
          </div>
        )}

        {/* Distance badge */}
        <div className="absolute top-2 right-2 bg-surface/90 backdrop-blur-sm px-sm py-xs rounded-full flex items-center gap-xs">
          <span className="material-symbols-outlined text-primary" style={{ fontSize: '14px' }}>
            location_on
          </span>
          <span className="font-label-sm text-label-sm text-on-surface">{formatDistance(listing.distanceM)}</span>
        </div>

        {isExpiringSoon && !isEmpty && (
          <div className="absolute top-2 left-2 bg-error text-white px-sm py-xs rounded-full font-label-sm text-label-sm">
            Sắp hết hạn
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-md flex flex-col flex-1 gap-sm">
        <div>
          <span className="inline-block bg-tertiary-container text-on-tertiary-container px-sm py-xs rounded-full font-label-sm text-label-sm mb-xs">
            {CATEGORY_LABELS[listing.category] ?? listing.category}
          </span>
          <h3 className="font-label-lg text-label-lg text-on-surface line-clamp-2 leading-snug">{listing.title}</h3>
          <p className="font-label-sm text-label-sm text-on-surface-variant mt-xs">{listing.provider.businessName}</p>
        </div>

        <div className="flex items-center gap-xs text-primary">
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>inventory_2</span>
          <span className="font-label-sm text-label-sm">
            Còn {listing.quantityRemaining} {listing.quantityUnit}
          </span>
        </div>

        <div className="flex items-center gap-xs text-on-surface-variant">
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>schedule</span>
          <span className="font-label-sm text-label-sm">
            {new Date(listing.pickupStartTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
            {' – '}
            {new Date(listing.pickupEndTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>

        <div className="flex items-start gap-xs text-on-surface-variant">
          <span className="material-symbols-outlined mt-0.5 shrink-0" style={{ fontSize: '16px' }}>place</span>
          <span className="font-label-sm text-label-sm line-clamp-1">{listing.pickupAddress}</span>
        </div>

        <button
          onClick={onReserve}
          disabled={isEmpty}
          className="mt-auto w-full py-3 bg-primary-container text-on-primary-container rounded-xl font-label-lg text-label-lg transition-all hover:shadow-sm active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isEmpty ? 'Đã hết' : 'Đặt ngay'}
        </button>
      </div>
    </div>
  );
}
