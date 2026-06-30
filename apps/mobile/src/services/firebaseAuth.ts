import auth from '@react-native-firebase/auth';
import {
  GoogleSignin,
  statusCodes,
  isErrorWithCode,
} from '@react-native-google-signin/google-signin';

/**
 * Web client ID (OAuth 2.0) của Firebase — lấy từ google-services.json
 * (oauth_client có client_type = 3) hoặc Firebase Console → Authentication → Google.
 * Đặt trong .env: EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
 */
const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';

let configured = false;
function ensureConfigured() {
  if (configured) return;
  GoogleSignin.configure({ webClientId: WEB_CLIENT_ID });
  configured = true;
}

/** Người dùng bấm huỷ hộp thoại đăng nhập — phân biệt với lỗi thật để không hiện toast lỗi. */
export class AuthCancelledError extends Error {
  constructor() {
    super('cancelled');
    this.name = 'AuthCancelledError';
  }
}

/**
 * Đăng nhập Google → trả về Firebase ID token để gửi backend /auth/firebase.
 */
export async function signInWithGoogle(): Promise<string> {
  ensureConfigured();
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

  let googleIdToken: string | null;
  try {
    const result = await GoogleSignin.signIn();
    // v13+: { type: 'success' | 'cancelled', data }
    if (result.type === 'cancelled') throw new AuthCancelledError();
    googleIdToken = result.data?.idToken ?? null;
  } catch (err) {
    if (isErrorWithCode(err) && err.code === statusCodes.SIGN_IN_CANCELLED) {
      throw new AuthCancelledError();
    }
    throw err;
  }

  if (!googleIdToken) throw new Error('Không lấy được Google ID token');

  const credential = auth.GoogleAuthProvider.credential(googleIdToken);
  const userCredential = await auth().signInWithCredential(credential);
  return userCredential.user.getIdToken();
}

/**
 * Đăng xuất khỏi Firebase + Google (gọi kèm khi logout app).
 * Thu hồi luôn quyền OAuth (revokeAccess) để lần đăng nhập sau hiện lại
 * màn chọn tài khoản + màn consent — như người dùng hoàn toàn mới.
 */
export async function signOutFirebase(): Promise<void> {
  ensureConfigured();
  try {
    await GoogleSignin.revokeAccess();
  } catch {
    // bỏ qua nếu chưa cấp quyền / chưa từng đăng nhập Google
  }
  try {
    await GoogleSignin.signOut();
  } catch {
    // bỏ qua nếu chưa từng đăng nhập Google
  }
  if (auth().currentUser) await auth().signOut();
}
