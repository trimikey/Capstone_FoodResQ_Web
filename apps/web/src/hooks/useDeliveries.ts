import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { io, type Socket } from 'socket.io-client';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import type { ApiResponse, Paginated } from '@foodresq/types';

function socketUrl(): string {
  const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
  return base.replace(/\/api\/v1\/?$/, '');
}

// ── Types (khớp shape BE trả về) ────────────────────────────────────────────
interface ListingBrief {
  title: string;
  pickupAddress: string;
  imageUrls: string[];
}

export interface DeliveryCoords {
  pickupLng: number | null;
  pickupLat: number | null;
  deliveryLng: number | null;
  deliveryLat: number | null;
}

export interface TaskOffer {
  id: string;
  deliveryId: string;
  status: string;
  expiresAt: string;
  offeredAt: string;
  delivery: {
    id: string;
    distanceKm: number | null;
    coords: DeliveryCoords | null;
    reservation: { listing: ListingBrief; receiver: { address: string | null } };
  };
}

export interface ActiveDelivery {
  id: string;
  status: 'assigned' | 'heading_to_provider' | 'qc_completed' | 'in_transit' | 'delivered';
  qcPhotoUrl: string | null;
  deliveryProofUrl: string | null;
  distanceKm: number | null;
  coords: DeliveryCoords | null;
  reservation: {
    id: string;
    quantity: number;
    listing: ListingBrief;
    receiver: { address: string | null; user: { fullName: string; phone: string | null } };
  };
}

export interface DeliveryHistoryItem {
  id: string;
  status: 'delivered' | 'failed';
  distanceKm: number | null;
  deliveredAt: string | null;
  deliveryProofUrl: string | null;
  failedReason: string | null;
  createdAt: string;
  reservation: {
    listing: ListingBrief;
    receiver: { user: { fullName: string } };
  };
}

export interface VolunteerMe {
  id: string;
  isAvailable: boolean;
  dedicationPoints: number;
  rank: string;
  vehicleType: string | null;
  vehiclePlate: string | null;
  avgRating: number | null;
  verificationStatus: string;
  isShipper: boolean;
  specializations: { specialization: 'chef' | 'waiter' | 'shipper'; isVerified: boolean }[];
  currentLocation: { lng: number; lat: number } | null;
}

// ── Fetchers ─────────────────────────────────────────────────────────────────
async function fetchVolunteerMe(): Promise<VolunteerMe> {
  const { data } = await api.get<ApiResponse<VolunteerMe>>('/volunteers/me');
  return data.data;
}
async function fetchMyOffers(): Promise<TaskOffer[]> {
  const { data } = await api.get<ApiResponse<TaskOffer[]>>('/deliveries/my/offers');
  return data.data;
}
async function fetchActiveDelivery(): Promise<ActiveDelivery | null> {
  const { data } = await api.get<ApiResponse<ActiveDelivery | null>>('/deliveries/my/active');
  return data.data;
}
export type DeliveryHistoryResult = Paginated<DeliveryHistoryItem>;
async function fetchDeliveryHistory(page: number, limit: number): Promise<DeliveryHistoryResult> {
  const { data } = await api.get<ApiResponse<DeliveryHistoryResult>>('/deliveries/my/history', { params: { page, limit } });
  return data.data;
}

// ── Queries ──────────────────────────────────────────────────────────────────
export function useVolunteerMe(enabled = true) {
  return useQuery({ queryKey: ['volunteers', 'me'], queryFn: fetchVolunteerMe, staleTime: 60_000, enabled });
}
export function useMyOffers(enabled = true) {
  return useQuery({
    queryKey: ['deliveries', 'offers'],
    queryFn: fetchMyOffers,
    enabled,
    refetchInterval: 15_000, // poll nhẹ để bắt offer mới
  });
}
export interface ShipperStats {
  totalDelivered: number;
  todayDelivered: number;
  totalFailed: number;
  completionRate: number | null;
  totalKm: number;
  dedicationPoints: number;
  rank: string;
  avgRating: number | null;
}
export function useShipperStats(enabled = true) {
  return useQuery({
    queryKey: ['deliveries', 'stats'],
    queryFn: async () => (await api.get<ApiResponse<ShipperStats>>('/deliveries/my/stats')).data.data,
    staleTime: 60_000,
    enabled,
  });
}

export function useDeliveryHistory(params: { page?: number; limit?: number; enabled?: boolean } = {}) {
  const { page = 1, limit = 20, enabled = true } = params;
  return useQuery({
    queryKey: ['deliveries', 'history', page, limit],
    queryFn: () => fetchDeliveryHistory(page, limit),
    staleTime: 60_000,
    enabled,
    placeholderData: (prev) => prev, // giữ trang cũ khi đang tải trang mới
  });
}
export function useActiveDelivery() {
  return useQuery({
    queryKey: ['deliveries', 'active'],
    queryFn: fetchActiveDelivery,
    refetchInterval: 15_000,
  });
}

/** Nghe socket `delivery:offer` để bật popup nhận đơn NGAY khi có (không chờ poll 15s). */
export function useOfferSocket(enabled: boolean) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled || !accessToken) return;
    const socket: Socket = io(socketUrl(), {
      auth: { token: accessToken },
      transports: ['websocket'],
      reconnection: true,
    });
    socket.on('delivery:offer', () => {
      void qc.invalidateQueries({ queryKey: ['deliveries', 'offers'] });
    });
    return () => {
      socket.off('delivery:offer');
      socket.disconnect();
    };
  }, [enabled, accessToken, qc]);
}

// ── Mutations ──────────────────────────────────────────────────────────────
export function useSetAvailability() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { isAvailable: boolean; lng?: number; lat?: number }) => {
      const { data } = await api.patch('/volunteers/me/availability', input);
      return data.data as { isAvailable: boolean; message: string };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['volunteers', 'me'] });
      void qc.invalidateQueries({ queryKey: ['deliveries', 'offers'] });
    },
  });
}

export function useAcceptOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (deliveryId: string) => {
      const { data } = await api.post(`/deliveries/${deliveryId}/accept`);
      return data.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['deliveries'] });
      void qc.invalidateQueries({ queryKey: ['volunteers', 'me'] });
    },
  });
}

export function useRejectOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { deliveryId: string; reason?: string }) => {
      const { data } = await api.post(`/deliveries/${params.deliveryId}/reject`, {
        reason: params.reason,
      });
      return data.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['deliveries', 'offers'] });
    },
  });
}

export interface DeliveryTracking {
  status: ActiveDelivery['status'] | 'pending_assignment' | 'failed';
  distanceKm: number | null;
  listingTitle: string;
  pickupAddress: string;
  coords: DeliveryCoords | null;
  shipper: { name: string; phone: string | null; location: { lng: number; lat: number } | null } | null;
}
export function useDeliveryTracking(reservationId: string, enabled: boolean) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['deliveries', 'track', reservationId],
    queryFn: async () => (await api.get<ApiResponse<DeliveryTracking>>(`/deliveries/track/${reservationId}`)).data.data,
    enabled,
    refetchInterval: 15_000, // fallback poll; real-time qua socket bên dưới
  });

  // Nghe `delivery:location` để cập nhật vị trí shipper tức thì (không chờ poll)
  useEffect(() => {
    if (!enabled || !reservationId || !accessToken) return;
    const socket: Socket = io(socketUrl(), {
      auth: { token: accessToken },
      transports: ['websocket'],
      reconnection: true,
    });
    socket.on('delivery:location', (p: { reservationId: string; lng: number; lat: number }) => {
      if (p.reservationId !== reservationId) return;
      qc.setQueryData<DeliveryTracking>(['deliveries', 'track', reservationId], (prev) =>
        prev && prev.shipper
          ? { ...prev, shipper: { ...prev.shipper, location: { lng: p.lng, lat: p.lat } } }
          : prev,
      );
    });
    return () => {
      socket.off('delivery:location');
      socket.disconnect();
    };
  }, [enabled, reservationId, accessToken, qc]);

  return query;
}

// Shipper: đẩy vị trí hiện tại (theo dõi trực tiếp)
export function useUpdateMyLocation() {
  return useMutation({
    mutationFn: async (p: { lng: number; lat: number }) =>
      (await api.patch('/volunteers/me/location', p)).data.data,
  });
}

export function useCancelDelivery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { deliveryId: string; reason?: string }) =>
      (await api.post(`/deliveries/${p.deliveryId}/cancel`, { reason: p.reason })).data.data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['deliveries'] });
      void qc.invalidateQueries({ queryKey: ['volunteers', 'me'] });
    },
  });
}

export function useFailDelivery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { deliveryId: string; reason: string }) =>
      (await api.post(`/deliveries/${p.deliveryId}/fail`, { reason: p.reason })).data.data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['deliveries'] });
      void qc.invalidateQueries({ queryKey: ['volunteers', 'me'] });
    },
  });
}

export function useUpdateDeliveryStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { deliveryId: string; status: string; photo?: File }) => {
      const form = new FormData();
      form.append('status', params.status);
      if (params.photo) form.append('photo', params.photo);
      const { data } = await api.patch(`/deliveries/${params.deliveryId}/status`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return data.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['deliveries'] });
      void qc.invalidateQueries({ queryKey: ['volunteers', 'me'] });
    },
  });
}
