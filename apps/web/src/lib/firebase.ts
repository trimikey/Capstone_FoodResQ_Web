// Firebase web app dùng chung (Auth + FCM). Đọc cấu hình từ NEXT_PUBLIC_FIREBASE_*.
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';

export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/** Đủ cấu hình để đăng nhập (Auth) chưa. */
export function isFirebaseConfigured(): boolean {
  return !!(
    firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId &&
    firebaseConfig.appId
  );
}

let app: FirebaseApp | null = null;
export function getFirebaseApp(): FirebaseApp {
  if (!app) app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  return app;
}

/**
 * Mở popup đăng nhập Google → trả về **Firebase ID token** để gửi lên backend
 * (POST /auth/google { idToken }). Backend verify bằng firebase-admin.
 */
export async function signInWithGoogle(): Promise<string> {
  const { getAuth, GoogleAuthProvider, signInWithPopup } = await import('firebase/auth');
  const auth = getAuth(getFirebaseApp());
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth, provider);
  return result.user.getIdToken();
}
