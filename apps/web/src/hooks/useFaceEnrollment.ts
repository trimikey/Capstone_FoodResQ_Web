import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface FaceEnrollmentStatus {
  enrolled: boolean;
  faceImageUrl: string | null;
  idCardImageUrl: string | null;
}

interface EnrollFaceResult {
  enrolled: boolean;
  enrolledWith: 'face' | 'id_card';
  matchDistance: number | null;
  message: string;
}

async function fetchFaceEnrollment(): Promise<FaceEnrollmentStatus> {
  const { data } = await api.get<{ data: FaceEnrollmentStatus }>('/users/me/face-enrollment');
  return data.data;
}

// Chỉ cần một trong hai: selfie hoặc ảnh CCCD (người không có CCCD dùng selfie)
async function enrollFace(params: { idCard?: File; selfie?: File }): Promise<EnrollFaceResult> {
  const formData = new FormData();
  if (params.idCard) formData.append('idCard', params.idCard);
  if (params.selfie) formData.append('selfie', params.selfie);
  const { data } = await api.post<{ data: EnrollFaceResult }>(
    '/users/me/face-enrollment',
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
  return data.data;
}

export function useFaceEnrollment(enabled = true) {
  return useQuery({
    queryKey: ['users', 'me', 'face-enrollment'],
    queryFn: fetchFaceEnrollment,
    staleTime: 5 * 60_000,
    enabled,
  });
}

export function useEnrollFace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: enrollFace,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users', 'me', 'face-enrollment'] });
    },
  });
}
