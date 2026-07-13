import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { UserRole, UserStatus, type ApiResponse } from '@foodresq/types';

export interface MeStats {
  kgSaved: number;
  completedCount: number;
  cancelledCount: number;
  providersHelped: number;
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
  return useQuery({
    queryKey: ['users', 'me'],
    queryFn: fetchMe,
    staleTime: 5 * 60_000,
    enabled,
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
