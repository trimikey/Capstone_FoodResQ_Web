import * as ImagePicker from 'expo-image-picker';
import storage from '@react-native-firebase/storage';
import auth from '@react-native-firebase/auth';

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
  return result.assets[0].uri;
}

/**
 * Upload ảnh local lên Firebase Storage tại avatars/{uid}/... và trả về
 * download URL (https) dùng làm avatarUrl. Yêu cầu đã đăng nhập Firebase.
 */
export async function uploadAvatar(localUri: string): Promise<string> {
  const uid = auth().currentUser?.uid;
  if (!uid) throw new Error('Phiên đăng nhập không hợp lệ, vui lòng đăng nhập lại.');

  const path = `avatars/${uid}/avatar_${Date.now()}.jpg`;
  const ref = storage().ref(path);
  await ref.putFile(localUri);
  return ref.getDownloadURL();
}

/**
 * Tiện ích gộp: chọn ảnh rồi upload, trả download URL.
 * Ném ImagePickCancelledError nếu người dùng huỷ ở bước chọn.
 */
export async function pickAndUploadAvatar(): Promise<string> {
  const localUri = await pickAvatarImage();
  return uploadAvatar(localUri);
}
