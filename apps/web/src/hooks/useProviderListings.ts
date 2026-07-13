import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { FoodCategory, QuantityUnit } from '@foodresq/types';

export interface ProviderListing {
  id: string;
  title: string;
  description: string | null;
  category: string;
  quantityTotal: string;
  quantityRemaining: string;
  quantityUnit: string;
  weightPerUnitKg: string | null;
  pickupStartTime: string;
  pickupEndTime: string;
  expiryTime: string;
  pickupAddress: string;
  /** Tọa độ điểm lấy hàng (do service `findByProvider` của BE trả về). */
  lng: number | null;
  lat: number | null;
  storageConditions: string | null;
  allergenNotes: string | null;
  maxPerReservation: number;
  status: string;
  imageUrls: string[];
  isSurpriseBag: boolean;
  createdAt: string;
}

export interface CreateListingInput {
  title: string;
  description?: string;
  category: FoodCategory;
  quantityTotal: number;
  quantityUnit: QuantityUnit;
  weightPerUnitKg?: number;
  pickupStartTime: string;
  pickupEndTime: string;
  expiryTime: string;
  pickupAddress: string;
  lng: number;
  lat: number;
  storageConditions?: string;
  allergenNotes?: string;
  maxPerReservation: number;
  imageUrls?: string[];
  isSurpriseBag?: boolean;
}

/** Field phụ được sửa khi tin đã đăng. Field cứng (giờ/địa điểm/số lượng) phải huỷ rồi tạo lại. */
export type UpdateListingInput = Partial<CreateListingInput>;

interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  totalPages: number;
}

export function useProviderListings(page = 1) {
  return useQuery({
    queryKey: ['listings', 'provider', 'my', page],
    queryFn: async () => {
      const { data } = await api.get('/listings/provider/my', { params: { page, limit: 50 } });
      return data.data as Paginated<ProviderListing>;
    },
    staleTime: 15_000,
  });
}

export function useCreateListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateListingInput) => {
      const { data } = await api.post('/listings', input);
      return data.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['listings', 'provider'] });
    },
  });
}

export function usePublishListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.patch(`/listings/${id}/publish`);
      return data.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['listings', 'provider'] });
    },
  });
}

/** Provider sửa tin (draft hoặc active whitelist). */
export function useUpdateListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { id: string; input: UpdateListingInput }) => {
      const { data } = await api.patch(`/listings/${params.id}`, params.input);
      return data.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['listings', 'provider'] });
    },
  });
}

export function useCancelListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { id: string; reason?: string }) => {
      const { data } = await api.patch(`/listings/${params.id}/cancel`, { reason: params.reason });
      return data.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['listings', 'provider'] });
    },
  });
}

// Thông tin người nhận trả về sau khi quét QR — để provider đối chiếu trực tiếp
export interface ScanResult {
  id: string;
  status: string;
  quantity: number;
  listing: { title: string; quantityUnit: string };
  receiver: {
    fullName: string;
    phone: string | null;
    avatarUrl: string | null;
    faceImageUrl: string | null;
    idCardImageUrl: string | null;
    idCardNumber: string | null;
    enrolled: boolean;
  };
}

// Quét QR để xác nhận giao hàng (provider/volunteer)
export function useScanQr() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (qrToken: string) => {
      const { data } = await api.post('/reservations/scan', { qrToken });
      return data.data as ScanResult;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['reservations'] });
    },
  });
}

// Provider xác nhận đã giao đúng người (sau khi đối chiếu ảnh) → completed
export function useConfirmPickup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (reservationId: string) => {
      const { data } = await api.post(`/reservations/${reservationId}/confirm-pickup`);
      return data.data as { reservationId: string; status: string };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['reservations'] });
    },
  });
}
