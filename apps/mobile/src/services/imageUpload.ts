import apiClient from '../api/client';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';
/** Origin để dựng URL ảnh tuyệt đối — ảnh serve ở /uploads (ngoài prefix /api/v1). */
const ORIGIN = API_URL.replace(/\/api\/v\d+\/?$/, '');

export type UploadKind = 'listing' | 'avatar';

/**
 * Upload 1 ảnh local lên backend (multipart) → trả về URL tuyệt đối (https/http).
 * Backend lưu vào ./uploads và serve qua /uploads; hoạt động cho mọi kiểu đăng nhập
 * (không phụ thuộc phiên Firebase Auth).
 */
export async function uploadImageToBackend(localUri: string, kind: UploadKind): Promise<string> {
  const name = localUri.split('/').pop() || `image_${kind}.jpg`;
  const ext = name.split('.').pop()?.toLowerCase();
  const type = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';

  const form = new FormData();
  form.append('file', { uri: localUri, name, type } as any);

  const res = await apiClient.post(`/uploads/image?kind=${kind}`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

  const url: string | undefined = res.data?.data?.url ?? res.data?.url;
  if (!url) throw new Error('Tải ảnh thất bại: phản hồi không hợp lệ.');
  return url.startsWith('http') ? url : `${ORIGIN}${url}`;
}
