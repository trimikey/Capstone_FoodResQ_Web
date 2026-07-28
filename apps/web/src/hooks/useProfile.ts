import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { UserRole, UserStatus, type ApiResponse } from '@foodresq/types';
import { useAuthStore } from '@/stores/auth.store';

/**
 * Thống kê hiển thị trên trang Hồ sơ — phạm vi trường phụ thuộc vào role.
 *
 * - Receiver: kgSaved / completedCount / cancelledCount / providersHelped
 * - Provider: listingsCount / activeListingsCount / completedOrdersCount / receiversHelped / totalKgRescued
 * - Volunteer: deliveriesCompleted / deliveriesInProgress / campaignsJoined
 *
 * Mọi role luôn có `kind` để FE phân biệt nhanh mà không cần switch trên role.
 */
export interface MeStats {
  kind: 'receiver' | 'provider' | 'volunteer' | 'admin';

  // Receiver
  kgSaved?: number;
  completedCount?: number;
  cancelledCount?: number;
  providersHelped?: number;

  // Provider
  listingsCount?: number;
  activeListingsCount?: number;
  completedOrdersCount?: number;
  receiversHelped?: number;
  totalKgRescued?: number;

  // Volunteer (shipper)
  deliveriesCompleted?: number;
  deliveriesInProgress?: number;
  campaignsJoined?: number;
}

export interface VolunteerInfo {
  specializations: { specialization: 'chef' | 'waiter' | 'shipper'; isVerified: boolean }[];
  rank: string;
  dedicationPoints: number;
}

export interface MeProvider {
  id: string;
  businessName: string;
  businessType: string;
  address: string;
  contactPhone: string | null;
  taxCode: string | null;
  isVerified: boolean;
  avgRating: number | null;
  verificationStatus: 'pending' | 'under_review' | 'approved' | 'rejected' | string;
  /** Tọa độ cửa hàng đã đăng ký — dùng để prefill khi tạo listing. */
  lng: number | null;
  lat: number | null;
}

export interface Me {
  id: string;
  email: string;
  phone: string | null;
  fullName: string;
  avatarUrl: string | null;
  role: UserRole;
  status: UserStatus;
  trustScore: number;
  createdAt: string;
  stats: MeStats;
  volunteer: VolunteerInfo | null;
  receiver: {
    isCharityOrg: boolean;
    organizationName: string | null;
    /** Địa chỉ + toạ độ điểm giao mặc định (đơn nhờ tình nguyện viên giao). */
    address: string | null;
    lng: number | null;
    lat: number | null;
  } | null;
  /** Chỉ có khi role = provider. Null với các role khác. */
  provider: MeProvider | null;
}

interface UpdateMeInput {
  fullName?: string;
  phone?: string;
  avatarUrl?: string;
  /** Provider: địa chỉ + vị trí cửa hàng · Receiver: điểm giao mặc định. */
  address?: string;
  lng?: number;
  lat?: number;
}

async function fetchMe(): Promise<Me> {
  const { data } = await api.get<ApiResponse<Me>>('/users/me');
  return data.data;
}

async function updateMe(input: UpdateMeInput): Promise<Me> {
  const { data } = await api.patch<ApiResponse<Me>>('/users/me', input);
  return data.data;
}

export function useMe(enabled = true) {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  // Cache theo userId — mỗi user có entry riêng → tránh hiển thị profile user cũ khi đăng nhập user mới
  return useQuery({
    queryKey: ['users', 'me', userId],
    queryFn: fetchMe,
    staleTime: 30_000,
    enabled: enabled && !!userId,
  });
}

export function useUpdateMe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateMe,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users', 'me'] });
    },
  });
}

export interface TrustHistoryItem {
  id: string;
  delta: number;
  reason: string;
  referenceType: string | null;
  referenceId: string | null;
  scoreBefore: number;
  scoreAfter: number;
  createdAt: string;
}

export interface TrustHistory {
  score: number;
  status: string;
  items: TrustHistoryItem[];
  recommendation: string | null;
}

export function useTrustHistory() {
  return useQuery({
    queryKey: ['users', 'me', 'trust-history'],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<TrustHistory>>('/users/me/trust-history');
      return data.data;
    },
    staleTime: 30_000,
  });
}
