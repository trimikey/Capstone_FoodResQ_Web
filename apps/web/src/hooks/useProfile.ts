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
  receiver: { isCharityOrg: boolean; organizationName: string | null } | null;
}

interface UpdateMeInput {
  fullName?: string;
  phone?: string;
  avatarUrl?: string;
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
