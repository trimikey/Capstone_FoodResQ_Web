import * as ImagePicker from 'expo-image-picker';
import { uploadImageToBackend } from './imageUpload';
import { preprocessImage } from './imagePreprocess';

/** Người dùng huỷ chọn ảnh — phân biệt với lỗi thật để không hiện toast lỗi. */
export class ImagePickCancelledError extends Error {
  constructor() {
    super('cancelled');
    this.name = 'ImagePickCancelledError';
  }
}

/**
 * Mở thư viện ảnh cho người dùng chọn 1 ảnh vuông (đã crop) để làm avatar.
 * Trả về URI local (file://). Ném ImagePickCancelledError nếu huỷ,
 * hoặc Error nếu bị từ chối quyền.
 */
export async function pickAvatarImage(): Promise<string> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    throw new Error('Cần quyền truy cập thư viện ảnh để chọn ảnh đại diện.');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.7,
  });

  if (result.canceled || !result.assets?.length) {
    throw new ImagePickCancelledError();
  }
  return preprocessImage(result.assets[0].uri, 'avatar');
}

/**
 * Upload ảnh local lên backend (lưu ./uploads/avatars) và trả về URL tuyệt đối
 * dùng làm avatarUrl. Hoạt động cho mọi kiểu đăng nhập (không cần phiên Firebase).
 */
export async function uploadAvatar(localUri: string): Promise<string> {
  return uploadImageToBackend(localUri, 'avatar');
}

/**
 * Tiện ích gộp: chọn ảnh rồi upload, trả download URL.
 * Ném ImagePickCancelledError nếu người dùng huỷ ở bước chọn.
 */
export async function pickAndUploadAvatar(): Promise<string> {
  const localUri = await pickAvatarImage();
  return uploadAvatar(localUri);
}
