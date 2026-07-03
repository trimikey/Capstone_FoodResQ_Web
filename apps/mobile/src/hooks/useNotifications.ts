import { useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { io, type Socket } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient, { ApiResponse, endpoints } from '../api/client';
import { useAuthStore } from '../stores/auth';
import { Popup } from '../components/ui/AppPopup';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';
/** Origin cho WebSocket — bỏ prefix /api/v1 (gateway gắn ở gốc). */
const SOCKET_URL = API_URL.replace(/\/api\/v\d+\/?$/, '');

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  isRead: boolean;
  createdAt: string;
}

/** Danh sách 50 thông báo gần nhất. GET /notifications/my */
export function useNotifications() {
  return useQuery({
    queryKey: ['notifications', 'my'],
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<AppNotification[]>>(endpoints.notifications.my);
      return res.data.data;
    },
    staleTime: 30_000,
  });
}

/** Số thông báo chưa đọc. GET /notifications/unread-count */
export function useUnreadCount() {
  return useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<{ count: number }>>(
        endpoints.notifications.unreadCount
      );
      return res.data.data.count;
    },
    staleTime: 30_000,
  });
}

/** Đánh dấu tất cả đã đọc. PATCH /notifications/read-all */
export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await apiClient.patch(endpoints.notifications.readAll);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

/** Đánh dấu một thông báo đã đọc. PATCH /notifications/:id/read */
export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.patch(endpoints.notifications.read(id));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

/**
 * Kết nối WebSocket nhận thông báo realtime. Gọi 1 lần ở layout đã đăng nhập.
 * Lắng `notification:new` → popup + làm mới danh sách/đếm chưa đọc.
 */
export function useNotificationSocket() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const qc = useQueryClient();
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    let socket: Socket | null = null;
    let cancelled = false;

    (async () => {
      // Dùng token MỚI NHẤT từ AsyncStorage (refresh interceptor cập nhật ở đây),
      // tránh token cũ trong store khiến gateway từ chối handshake → disconnect.
      const token = (await AsyncStorage.getItem('accessToken')) || accessToken;
      if (cancelled) return;

      socket = io(SOCKET_URL, {
        auth: { token },
        transports: ['websocket'],
        reconnection: true,
      });
      socketRef.current = socket;

      if (__DEV__) {
        socket.on('connect', () => console.log('[notif-ws] connected', socket?.id));
        socket.on('connect_error', (e) => console.log('[notif-ws] connect_error', e.message));
        socket.on('disconnect', (r) => console.log('[notif-ws] disconnect', r));
      }

      socket.on('notification:new', (n: AppNotification) => {
        if (__DEV__) console.log('[notif-ws] notification:new', n.title);
        Popup.show({ type: 'info', text1: n.title, text2: n.body });
        void qc.invalidateQueries({ queryKey: ['notifications'] });
      });
    })();

    return () => {
      cancelled = true;
      socket?.off('notification:new');
      socket?.disconnect();
      socketRef.current = null;
    };
  }, [accessToken, qc]);
}
