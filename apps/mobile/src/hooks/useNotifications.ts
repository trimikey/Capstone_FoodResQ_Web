import { useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { io, type Socket } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import apiClient, { ApiResponse, endpoints } from '../api/client';
import { useAuthStore } from '../stores/auth';
import { Popup, Toast } from '../components/ui/AppPopup';
import { notifyError, notifySuccess } from '../services/haptics';
import type { TaskOffer } from './useDeliveries';
import type { CampaignTask } from './useCampaigns';

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

interface DeliveryOfferEvent {
  deliveryId?: string;
}

function formatKm(km: unknown): string {
  const n = Number(km);
  return Number.isFinite(n) ? `${n.toFixed(1)} km` : 'Chưa rõ khoảng cách';
}

function formatOfferPopup(offer: TaskOffer) {
  const { delivery } = offer;
  const reservation = delivery.reservation;
  const transport = delivery.campaignTransport;
  const title = reservation?.listing.title ?? transport?.campaignTitle ?? 'Chuyến giao chiến dịch';
  const pickup = delivery.pickup.address ?? reservation?.listing.pickupAddress ?? 'Chưa có địa chỉ lấy hàng';
  const destination = delivery.destination.address ?? reservation?.receiver?.address ?? 'Chưa có địa chỉ giao hàng';

  return [
    title,
    `Khoảng cách: ${formatKm(delivery.distanceKm)}`,
    `Lấy: ${pickup}`,
    `Giao: ${destination}`,
  ].join('\n');
}

function notificationCampaignId(n: AppNotification): string | null {
  return typeof n.data?.campaignId === 'string' && n.data.campaignId.length > 0
    ? n.data.campaignId
    : null;
}

function notificationString(n: AppNotification, key: string): string | null {
  return typeof n.data?.[key] === 'string' && n.data[key].length > 0 ? n.data[key] : null;
}

function patchCampaignTaskFromNotification(qc: ReturnType<typeof useQueryClient>, n: AppNotification) {
  const assignmentId = notificationString(n, 'assignmentId');
  const status = notificationString(n, 'status');
  if (!assignmentId || !status) return;

  qc.setQueryData<CampaignTask[]>(['campaign-tasks'], (current) =>
    current?.map((task) =>
      task.id === assignmentId
        ? {
            ...task,
            status,
            shiftId: notificationString(n, 'shiftId') ?? task.shiftId,
          }
        : task
    )
  );
}

function refreshCampaignQueries(qc: ReturnType<typeof useQueryClient>, campaignId: string, notification?: AppNotification) {
  if (notification) patchCampaignTaskFromNotification(qc, notification);
  void qc.invalidateQueries({ queryKey: ['campaign', campaignId] });
  void qc.invalidateQueries({ queryKey: ['campaigns', 'public', campaignId] });
  void qc.invalidateQueries({ queryKey: ['campaigns'] });
  void qc.invalidateQueries({ queryKey: ['campaign-tasks'] });
  void qc.invalidateQueries({ queryKey: ['kitchen', 'shifts', campaignId] });
  void qc.refetchQueries({ queryKey: ['campaign', campaignId], type: 'active' });
  void qc.refetchQueries({ queryKey: ['campaigns', 'public', campaignId], type: 'active' });
  void qc.refetchQueries({ queryKey: ['campaigns'], type: 'active' });
  void qc.refetchQueries({ queryKey: ['campaign-tasks'], type: 'active' });
  void qc.refetchQueries({ queryKey: ['kitchen', 'shifts', campaignId], type: 'active' });
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
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ['notifications'] });
      const previousItems = qc.getQueryData<AppNotification[]>(['notifications', 'my']);
      const previousUnread = qc.getQueryData<number>(['notifications', 'unread']);
      qc.setQueryData<AppNotification[]>(['notifications', 'my'], (old) =>
        old?.map((item) => ({ ...item, isRead: true }))
      );
      qc.setQueryData(['notifications', 'unread'], 0);
      return { previousItems, previousUnread };
    },
    mutationFn: async () => {
      await apiClient.patch(endpoints.notifications.readAll);
    },
    onError: (_err, _vars, context) => {
      if (context?.previousItems) qc.setQueryData(['notifications', 'my'], context.previousItems);
      if (typeof context?.previousUnread === 'number') {
        qc.setQueryData(['notifications', 'unread'], context.previousUnread);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

/** Đánh dấu một thông báo đã đọc. PATCH /notifications/:id/read */
export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: ['notifications'] });
      const previousItems = qc.getQueryData<AppNotification[]>(['notifications', 'my']);
      const previousUnread = qc.getQueryData<number>(['notifications', 'unread']);
      const wasUnread = previousItems?.some((item) => item.id === id && !item.isRead) ?? false;
      qc.setQueryData<AppNotification[]>(['notifications', 'my'], (old) =>
        old?.map((item) => (item.id === id ? { ...item, isRead: true } : item))
      );
      if (wasUnread) {
        qc.setQueryData<number>(['notifications', 'unread'], (old) => Math.max((old ?? 1) - 1, 0));
      }
      return { previousItems, previousUnread };
    },
    mutationFn: async (id: string) => {
      await apiClient.patch(endpoints.notifications.read(id));
    },
    onError: (_err, _vars, context) => {
      if (context?.previousItems) qc.setQueryData(['notifications', 'my'], context.previousItems);
      if (typeof context?.previousUnread === 'number') {
        qc.setQueryData(['notifications', 'unread'], context.previousUnread);
      }
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
        Toast.show({ type: 'info', text1: n.title, text2: n.body });
        void qc.invalidateQueries({ queryKey: ['notifications'] });
        const campaignId = notificationCampaignId(n);
        if (campaignId) refreshCampaignQueries(qc, campaignId, n);
      });

      socket.on('delivery:offer', async (event: DeliveryOfferEvent) => {
        if (__DEV__) console.log('[notif-ws] delivery:offer', event.deliveryId);
        void qc.invalidateQueries({ queryKey: ['deliveries', 'offers'] });

        try {
          const res = await apiClient.get<ApiResponse<TaskOffer[]>>(endpoints.deliveries.myOffers);
          const offer = res.data.data.find((item) => item.deliveryId === event.deliveryId) ?? res.data.data[0];
          if (!offer) return;

          Popup.show({
            type: 'info',
            text1: 'Có đơn giao mới',
            text2: formatOfferPopup(offer),
            duration: 0,
            secondaryAction: {
              label: 'Bỏ qua',
              onPress: async () => {
                try {
                  await apiClient.post(endpoints.deliveries.reject(offer.deliveryId), {
                    reason: 'Shipper bỏ qua từ popup',
                  });
                  void notifySuccess();
                  Popup.hide();
                  Toast.show({ type: 'info', text1: 'Đã bỏ qua lời mời' });
                  void qc.invalidateQueries({ queryKey: ['deliveries', 'offers'] });
                } catch (e: any) {
                  void notifyError();
                  Popup.show({
                    type: 'error',
                    text1: 'Bỏ qua thất bại',
                    text2: e?.response?.data?.error?.message ?? 'Vui lòng thử lại.',
                  });
                }
              },
            },
            primaryAction: {
              label: 'Nhận đơn',
              onPress: async () => {
                try {
                  await apiClient.post(endpoints.deliveries.accept(offer.deliveryId));
                  void notifySuccess();
                  Popup.hide();
                  Toast.show({ type: 'success', text1: 'Đã nhận đơn' });
                  void qc.invalidateQueries({ queryKey: ['deliveries'] });
                  void qc.invalidateQueries({ queryKey: ['volunteer', 'me'] });
                  router.replace('/(app)/volunteer/active');
                } catch (e: any) {
                  void notifyError();
                  Popup.show({
                    type: 'error',
                    text1: 'Nhận đơn thất bại',
                    text2: e?.response?.data?.error?.message ?? 'Đơn có thể đã được nhận hoặc hết hạn.',
                  });
                  void qc.invalidateQueries({ queryKey: ['deliveries'] });
                }
              },
            },
          });
        } catch (e) {
          if (__DEV__) console.log('[notif-ws] delivery:offer fetch failed', e);
        }
      });
    })();

    return () => {
      cancelled = true;
      socket?.off('notification:new');
      socket?.off('delivery:offer');
      socket?.disconnect();
      socketRef.current = null;
    };
  }, [accessToken, qc]);
}
