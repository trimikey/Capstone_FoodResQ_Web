import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { io, type Socket } from 'socket.io-client';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  isRead: boolean;
  createdAt: string;
}

function notificationCampaignId(n: AppNotification): string | null {
  return typeof n.data?.campaignId === 'string' && n.data.campaignId.length > 0
    ? n.data.campaignId
    : null;
}

function refreshCampaignQueries(qc: ReturnType<typeof useQueryClient>, campaignId: string) {
  void qc.invalidateQueries({ queryKey: ['campaigns', 'manage-detail', campaignId] });
  void qc.invalidateQueries({ queryKey: ['campaigns', 'public', campaignId] });
  void qc.invalidateQueries({ queryKey: ['campaigns', 'open'] });
  void qc.invalidateQueries({ queryKey: ['campaigns', 'mine'] });
  void qc.invalidateQueries({ queryKey: ['campaigns', 'my-tasks'] });
  void qc.refetchQueries({ queryKey: ['campaigns', 'manage-detail', campaignId], type: 'active' });
  void qc.refetchQueries({ queryKey: ['campaigns', 'public', campaignId], type: 'active' });
  void qc.refetchQueries({ queryKey: ['campaigns', 'open'], type: 'active' });
  void qc.refetchQueries({ queryKey: ['campaigns', 'mine'], type: 'active' });
  void qc.refetchQueries({ queryKey: ['campaigns', 'my-tasks'], type: 'active' });
}

// Socket nối tới origin của API (bỏ hậu tố /api/v1)
function socketUrl(): string {
  const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
  return base.replace(/\/api\/v1\/?$/, '');
}

export function useNotifications() {
  return useQuery({
    queryKey: ['notifications', 'my'],
    queryFn: async () => (await api.get('/notifications/my')).data.data as AppNotification[],
    staleTime: 30_000,
  });
}

export function useUnreadCount() {
  return useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: async () => (await api.get('/notifications/unread-count')).data.data as { count: number },
    staleTime: 30_000,
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => (await api.patch('/notifications/read-all')).data.data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.patch(`/notifications/${id}/read`)).data.data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

/** Kết nối WebSocket khi đã đăng nhập; nhận `notification:new` → toast + refresh badge. */
export function useNotificationSocket() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const qc = useQueryClient();
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    const socket = io(socketUrl(), {
      auth: { token: accessToken },
      transports: ['websocket'],
      reconnection: true,
    });
    socketRef.current = socket;

    socket.on('notification:new', (n: AppNotification) => {
      toast(n.title, { description: n.body });
      void qc.invalidateQueries({ queryKey: ['notifications'] });
      const campaignId = notificationCampaignId(n);
      if (campaignId) refreshCampaignQueries(qc, campaignId);
    });

    return () => {
      socket.off('notification:new');
      socket.disconnect();
      socketRef.current = null;
    };
  }, [accessToken, qc]);
}
