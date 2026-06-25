import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient, {
  ApiResponse,
  ApiUserProfile,
  UpdateProfileInput,
  endpoints,
} from '../api/client';
import { useAuthStore } from '../stores/auth';

/** Hồ sơ đầy đủ của người dùng đang đăng nhập. Endpoint: GET /users/me */
export function useMyProfile() {
  return useQuery({
    queryKey: ['profile', 'me'],
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<ApiUserProfile>>(
        endpoints.users.me
      );
      return res.data.data;
    },
  });
}

/**
 * Cập nhật hồ sơ. Endpoint: PATCH /users/me.
 * Sau khi thành công: đồng bộ vào auth store (để header app cập nhật ngay)
 * và làm mới cache profile.
 */
export function useUpdateProfile() {
  const queryClient = useQueryClient();
  const updateUser = useAuthStore((s) => s.updateUser);

  return useMutation({
    mutationFn: async (input: UpdateProfileInput) => {
      const res = await apiClient.patch<ApiResponse<ApiUserProfile>>(
        endpoints.users.me,
        input
      );
      return res.data.data;
    },
    onSuccess: (data) => {
      updateUser({
        name: data.fullName ?? data.name ?? '',
        phone: data.phone ?? null,
        avatarUrl: data.avatarUrl ?? null,
      });
      queryClient.invalidateQueries({ queryKey: ['profile', 'me'] });
    },
  });
}
