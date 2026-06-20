import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

// ── Types (khớp shape BE trả về) ────────────────────────────────────────────
interface ListingBrief {
  title: string;
  pickupAddress: string;
  imageUrls: string[];
}

export interface TaskOffer {
  id: string;
  deliveryId: string;
  status: string;
  expiresAt: string;
  offeredAt: string;
  delivery: {
    id: string;
    reservation: { listing: ListingBrief };
  };
}

export interface ActiveDelivery {
  id: string;
  status: 'assigned' | 'heading_to_provider' | 'qc_completed' | 'in_transit' | 'delivered';
  qcPhotoUrl: string | null;
  deliveryProofUrl: string | null;
  reservation: {
    id: string;
    quantity: number;
    listing: ListingBrief;
    receiver: { user: { fullName: string; phone: string | null } };
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
  const { data } = await api.get<{ data: VolunteerMe }>('/volunteers/me');
  return data.data;
}
async function fetchMyOffers(): Promise<TaskOffer[]> {
  const { data } = await api.get<{ data: TaskOffer[] }>('/deliveries/my/offers');
  return data.data;
}
async function fetchActiveDelivery(): Promise<ActiveDelivery | null> {
  const { data } = await api.get<{ data: ActiveDelivery | null }>('/deliveries/my/active');
  return data.data;
}

// ── Queries ──────────────────────────────────────────────────────────────────
export function useVolunteerMe() {
  return useQuery({ queryKey: ['volunteers', 'me'], queryFn: fetchVolunteerMe, staleTime: 60_000 });
}
export function useMyOffers(enabled = true) {
  return useQuery({
    queryKey: ['deliveries', 'offers'],
    queryFn: fetchMyOffers,
    enabled,
    refetchInterval: 15_000, // poll nhẹ để bắt offer mới
  });
}
export function useActiveDelivery() {
  return useQuery({
    queryKey: ['deliveries', 'active'],
    queryFn: fetchActiveDelivery,
    refetchInterval: 15_000,
  });
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
