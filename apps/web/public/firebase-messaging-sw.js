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
  const link = (event.notification.data && event.notification.data.link) || '/';
  event.waitUntil(clients.openWindow(link));
});
