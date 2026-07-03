// FCM push (web). Tự bỏ qua nếu thiếu cấu hình NEXT_PUBLIC_FIREBASE_* hoặc trình duyệt không hỗ trợ.
import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging';
import { api } from '@/lib/api';
import { firebaseConfig as config, getFirebaseApp } from '@/lib/firebase';

const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

function isConfigured(): boolean {
  return !!(config.apiKey && config.projectId && config.messagingSenderId && config.appId && VAPID_KEY);
}

let registered = false;

/**
 * Xin quyền + lấy FCM token + gửi lên backend. Gọi sau khi đăng nhập.
 * An toàn để gọi nhiều lần (chỉ chạy 1 lần / phiên).
 */
export async function registerPush(): Promise<void> {
  if (registered || typeof window === 'undefined') return;
  if (!isConfigured()) return; // chưa cấu hình Firebase → bỏ qua êm
  if (!(await isSupported().catch(() => false))) return;
  if (!('serviceWorker' in navigator) || !('Notification' in window)) return;

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;

    const swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    const messaging = getMessaging(getFirebaseApp());
    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: swReg });
    if (!token) return;

    await api.post('/notifications/device-token', { token, platform: 'web' });
    registered = true;

    // Thông báo khi đang mở tab (foreground)
    onMessage(messaging, (payload) => {
      const n = payload.notification;
      if (n?.title && typeof window !== 'undefined') {
        // Lazy import sonner để tránh phụ thuộc vòng
        import('sonner').then(({ toast }) => toast(n.title!, { description: n.body })).catch(() => {});
      }
    });
  } catch {
    // im lặng — push là tính năng bổ trợ
  }
}
