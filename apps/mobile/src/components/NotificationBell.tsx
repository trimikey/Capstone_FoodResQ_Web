import { useState } from 'react';
import { View, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Button, Text, Portal, Modal } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import {
  useNotifications,
  useUnreadCount,
  useMarkAllRead,
  useMarkRead,
  type AppNotification,
} from '../hooks/useNotifications';

const COLORS = {
  surface: '#ffffff',
  onSurface: '#121c2a',
  onSurfaceVariant: '#6b7280',
  outline: '#e5e7eb',
  unreadBg: '#ecfdf5',
  badge: '#ef4444',
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'vừa xong';
  if (m < 60) return `${m} phút trước`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ trước`;
  return `${Math.floor(h / 24)} ngày trước`;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { data: unread = 0, refetch: refetchUnread } = useUnreadCount();
  const { data: items = [], refetch: refetchList } = useNotifications();
  const markAllRead = useMarkAllRead();
  const markRead = useMarkRead();

  const openSheet = () => {
    setOpen(true);
    // Luôn lấy danh sách mới nhất khi mở (không phụ thuộc WS).
    void refetchList();
    void refetchUnread();
  };

  const onItemPress = (n: AppNotification) => {
    if (!n.isRead) markRead.mutate(n.id);
    setOpen(false);
    const resId = n.data?.['reservationId'];
    if (n.type === 'reservation' && typeof resId === 'string') {
      router.push(`/(app)/provider/orders/${resId}`);
    }
  };

  return (
    <>
      <Pressable onPress={openSheet} hitSlop={8} style={styles.bellBtn}>
        <MaterialCommunityIcons name="bell-outline" size={24} color={COLORS.onSurface} />
        {unread > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text>
          </View>
        ) : null}
      </Pressable>

      <Portal>
        <Modal
          visible={open}
          onDismiss={() => setOpen(false)}
          contentContainerStyle={styles.sheet}
        >
          <View style={styles.sheetHeader}>
            <Text variant="titleMedium" style={styles.sheetTitle}>Thông báo</Text>
            {unread > 0 ? (
              <Button
                mode="text"
                compact
                onPress={() => markAllRead.mutate()}
                loading={markAllRead.isPending}
                disabled={markAllRead.isPending}
              >
                Đọc tất cả
              </Button>
            ) : null}
          </View>
          {items.length === 0 ? (
            <View style={styles.empty}>
              <MaterialCommunityIcons name="bell-sleep-outline" size={40} color={COLORS.onSurfaceVariant} />
              <Text style={styles.emptyText}>Chưa có thông báo</Text>
            </View>
          ) : (
            <ScrollView style={styles.list}>
              {items.map((n) => (
                <Pressable
                  key={n.id}
                  onPress={() => onItemPress(n)}
                  style={[styles.item, !n.isRead && styles.itemUnread]}
                >
                  <View style={styles.itemTitleRow}>
                    <Text style={styles.itemTitle}>{n.title}</Text>
                    {!n.isRead ? <View style={styles.unreadDot} /> : null}
                  </View>
                  <Text style={styles.itemBody}>{n.body}</Text>
                  <Text style={styles.itemTime}>{timeAgo(n.createdAt)}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </Modal>
      </Portal>
    </>
  );
}

const styles = StyleSheet.create({
  bellBtn: { padding: 4 },
  badge: {
    position: 'absolute', top: -2, right: -2, minWidth: 16, height: 16, paddingHorizontal: 3,
    borderRadius: 8, backgroundColor: COLORS.badge, alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '900' },
  sheet: {
    backgroundColor: COLORS.surface, marginHorizontal: 20, borderRadius: 16,
    paddingVertical: 16, maxHeight: '70%',
  },
  sheetHeader: {
    paddingHorizontal: 20,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetTitle: { fontWeight: '700', color: COLORS.onSurface },
  list: { paddingHorizontal: 12 },
  item: { paddingVertical: 12, paddingHorizontal: 12, borderRadius: 12, marginBottom: 4 },
  itemUnread: { backgroundColor: COLORS.unreadBg },
  itemTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemTitle: { flex: 1, fontWeight: '700', color: COLORS.onSurface, fontSize: 14 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.badge },
  itemBody: { color: COLORS.onSurfaceVariant, fontSize: 13, marginTop: 2 },
  itemTime: { color: '#9ca3af', fontSize: 11, marginTop: 4 },
  empty: { alignItems: 'center', paddingVertical: 32, gap: 8 },
  emptyText: { color: COLORS.onSurfaceVariant },
});
