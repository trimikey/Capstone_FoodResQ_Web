import * as ImagePicker from 'expo-image-picker';
import { ImagePickCancelledError } from './avatarUpload';
import { uploadImageToBackend } from './imageUpload';
import { preprocessImage } from './imagePreprocess';
import { waitForNativePickerReady } from './nativePickerReady';

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

  await waitForNativePickerReady();
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
 * Yêu cầu quyền camera và chụp một ảnh món ăn bằng camera sau.
 * Ném ImagePickCancelledError nếu người dùng đóng camera mà không chụp.
 */
export async function captureListingImage(): Promise<string> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    throw new Error(
      perm.canAskAgain
        ? 'Cần quyền camera để chụp ảnh món ăn.'
        : 'Quyền camera đang bị tắt. Vui lòng bật quyền Camera cho FoodResQ trong Cài đặt.',
    );
  }

  await waitForNativePickerReady();
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    cameraType: ImagePicker.CameraType.back,
    allowsEditing: false,
    quality: 0.7,
  });

  if (result.canceled || !result.assets?.length) {
    throw new ImagePickCancelledError();
  }

  return preprocessImage(result.assets[0].uri, 'listing');
}

/**
 * Upload 1 ảnh local lên backend và trả về URL tuyệt đối.
 */
export async function uploadListingImage(localUri: string): Promise<string> {
  return uploadImageToBackend(localUri, 'listing');
}

/** Chọn nhiều ảnh rồi upload tất cả, trả mảng URL. */
export async function pickAndUploadListingImages(limit = 5): Promise<string[]> {
  const uris = await pickListingImages(limit);
  return Promise.all(uris.map((uri) => uploadListingImage(uri)));
}

/** Chụp một ảnh món ăn rồi upload lên backend. */
export async function captureAndUploadListingImage(): Promise<string> {
  const uri = await captureListingImage();
  return uploadListingImage(uri);
}
