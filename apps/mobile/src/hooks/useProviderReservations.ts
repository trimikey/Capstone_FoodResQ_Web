import { useQuery } from '@tanstack/react-query';
import apiClient, { ApiResponse, endpoints } from '../api/client';
import { normalizeImageUrl } from './useListings';

/** Trạng thái đơn đặt chỗ (khớp enum ReservationStatus backend). */
export type ReservationStatus =
  | 'confirmed'
  | 'picked_up'
  | 'completed'
  | 'cancelled'
  | 'expired'
  | 'no_show';

/** Một đơn đặt vào tin của provider (shape từ GET /reservations/provider/my). */
export interface ProviderReservation {
  id: string;
  status: ReservationStatus;
  quantity: number;
  qrExpiresAt: string | null;
  createdAt: string;
  listing: {
    title: string;
    pickupAddress: string;
    imageUrls: string[] | null;
    category: string;
    quantityUnit: string;
  };
  receiver: {
    user: {
      fullName: string;
      phone: string | null;
      avatarUrl: string | null;
    };
  };
}

interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

function normalizeReservationListingImages<T extends ProviderReservation>(reservation: T): T {
  return {
    ...reservation,
    listing: {
      ...reservation.listing,
      imageUrls: Array.isArray(reservation.listing.imageUrls)
        ? reservation.listing.imageUrls.map(normalizeImageUrl).filter(Boolean)
        : reservation.listing.imageUrls,
    },
  };
}

/**
 * Danh sách đơn đặt vào các tin của provider đang đăng nhập.
 * GET /reservations/provider/my (lọc theo status tuỳ chọn).
 */
export function useProviderReservations(status?: string) {
  return useQuery({
    queryKey: ['provider-reservations', status ?? 'all'],
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<Paginated<ProviderReservation>>>(
        endpoints.reservations.providerMy,
        { params: { page: 1, limit: 50, ...(status ? { status } : {}) } }
      );
      return res.data.data.items.map(normalizeReservationListingImages);
    },
  });
}

/** Fallback chi tiết reservation khi màn provider order được mở trực tiếp và cache list rỗng. */
export function useProviderReservationDetail(id?: string) {
  return useQuery({
    queryKey: ['provider-reservation', id],
    enabled: !!id,
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<ProviderReservation>>(
        endpoints.reservations.detail(id!)
      );
      return normalizeReservationListingImages(res.data.data);
    },
  });
}
