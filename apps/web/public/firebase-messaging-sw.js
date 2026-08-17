/* Service worker nhận push FCM khi tab đóng/nền.
 * QUAN TRỌNG: điền firebaseConfig giống các biến NEXT_PUBLIC_FIREBASE_* trong .env.local
 * (config web của Firebase là công khai — không phải bí mật). */
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyBKiTVG0CW0Bb7uGVlKV29rmpMqoORE78g',
  authDomain: 'foodresq-53ae8.firebaseapp.com',
  projectId: 'foodresq-53ae8',
  messagingSenderId: '626222910753',
  appId: '1:626222910753:web:3ed225487536738dc10260',
});

const messaging = firebase.messaging();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function notificationLink(data) {
  const rawLink = typeof data?.link === 'string' ? data.link.trim() : '';
  if (rawLink) {
    if (/^https?:\/\//i.test(rawLink) || rawLink.startsWith('/')) return rawLink;
    if (UUID_RE.test(rawLink)) return `/campaigns/${rawLink}`;
    return `/${rawLink.replace(/^\/+/, '')}`;
  }

  const assignmentId = typeof data?.assignmentId === 'string' ? data.assignmentId.trim() : '';
  if (UUID_RE.test(assignmentId)) return `/my-tasks/${assignmentId}`;

  const campaignId = typeof data?.campaignId === 'string' ? data.campaignId.trim() : '';
  if (UUID_RE.test(campaignId)) return `/campaigns/${campaignId}`;

  return '/';
}

messaging.onBackgroundMessage((payload) => {
  const n = payload.notification || {};
  self.registration.showNotification(n.title || 'FoodResQ', {
    body: n.body || '',
    icon: '/Logo_FoodResQ.png',
    data: payload.data || {},
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = notificationLink(event.notification.data);
  event.waitUntil(clients.openWindow(link));
});
