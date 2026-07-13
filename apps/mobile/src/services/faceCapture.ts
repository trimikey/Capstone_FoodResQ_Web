import * as ImagePicker from 'expo-image-picker';
import { preprocessImage } from './imagePreprocess';
import type { ImageKind } from './imagePreprocess';

/** Ảnh đã chụp/chọn, sẵn sàng nhét vào FormData (RN multipart). */
export interface CapturedImage {
  uri: string;
  name: string;
  type: string;
}

function toCaptured(uri: string): CapturedImage {
  const name = uri.split('/').pop() || 'photo.jpg';
  const ext = name.split('.').pop()?.toLowerCase();
  const type = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  return { uri, name, type };
}

/**
 * Mở camera chụp ảnh xác minh. `face` dùng camera trước (selfie),
 * `id_card` dùng camera sau để chụp CCCD. Trả null nếu người dùng huỷ.
 */
export async function captureImage(type: 'face' | 'id_card', imageKind: ImageKind = 'proof'): Promise<CapturedImage | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new Error('Cần quyền camera để chụp ảnh xác minh.');

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    cameraType: type === 'face' ? ImagePicker.CameraType.front : ImagePicker.CameraType.back,
    quality: 0.7,
  });
  if (result.canceled || !result.assets?.length) return null;
  const uri = await preprocessImage(result.assets[0].uri, imageKind);
  return toCaptured(uri);
}

/** Chọn ảnh có sẵn từ thư viện (hữu ích để test trên emulator). */
export async function pickImageFromLibrary(imageKind: ImageKind = 'proof'): Promise<CapturedImage | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error('Cần quyền thư viện ảnh.');

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.7,
  });
  if (result.canceled || !result.assets?.length) return null;
  const uri = await preprocessImage(result.assets[0].uri, imageKind);
  return toCaptured(uri);
}
