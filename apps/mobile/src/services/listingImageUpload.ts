import * as ImagePicker from 'expo-image-picker';
import { ImagePickCancelledError } from './avatarUpload';
import { uploadImageToBackend } from './imageUpload';
import { preprocessImage } from './imagePreprocess';

export { ImagePickCancelledError };

/**
 * Chọn nhiều ảnh từ thư viện cho tin thực phẩm (tối đa `limit`).
 * Trả về mảng URI local. Ném ImagePickCancelledError nếu huỷ.
 */
export async function pickListingImages(limit = 5): Promise<string[]> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    throw new Error('Cần quyền truy cập thư viện ảnh để chọn ảnh cho tin.');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: limit,
    quality: 0.7,
  });

  if (result.canceled || !result.assets?.length) {
    throw new ImagePickCancelledError();
  }
  return Promise.all(result.assets.map((a) => preprocessImage(a.uri, 'listing')));
}

/**
 * Upload 1 ảnh local lên backend (lưu ./uploads/listings) và trả về URL tuyệt đối.
 */
export async function uploadListingImage(localUri: string): Promise<string> {
  return uploadImageToBackend(localUri, 'listing');
}

/** Chọn nhiều ảnh rồi upload tất cả, trả mảng URL. */
export async function pickAndUploadListingImages(limit = 5): Promise<string[]> {
  const uris = await pickListingImages(limit);
  return Promise.all(uris.map((uri) => uploadListingImage(uri)));
}
