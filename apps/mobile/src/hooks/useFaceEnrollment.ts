import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient, { ApiResponse, endpoints } from '../api/client';
import type { CapturedImage } from '../services/faceCapture';

/** Trạng thái đăng ký khuôn mặt. GET /users/me/face-enrollment */
export interface FaceEnrollmentStatus {
  enrolled: boolean;
  faceImageUrl: string | null;
  idCardImageUrl: string | null;
}

export function useFaceEnrollment() {
  return useQuery({
    queryKey: ['faceEnrollment'],
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<FaceEnrollmentStatus>>(
        endpoints.users.faceEnrollment
      );
      return res.data.data;
    },
  });
}

/** Đăng ký khuôn mặt bằng selfie và/hoặc ảnh CCCD. POST /users/me/face-enrollment */
export function useEnrollFace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ selfie, idCard }: { selfie?: CapturedImage; idCard?: CapturedImage }) => {
      const form = new FormData();
      if (selfie) form.append('selfie', selfie as unknown as Blob);
      if (idCard) form.append('idCard', idCard as unknown as Blob);
      const res = await apiClient.post<
        ApiResponse<{ enrolled: boolean; enrolledWith: string; message: string }>
      >(endpoints.users.faceEnrollment, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['faceEnrollment'] });
    },
  });
}
