import { useEffect, useMemo, useState } from 'react';
import { Animated, View, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Button, Text, Portal, Modal } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import {
  useNotifications,
  useUnreadCount,
  useMarkAllRead,
  useMarkRead,
  type AppNotification,
} from '../hooks/useNotifications';
import { mobileColors as COLORS, elevation, radius, spacing } from '@/theme/design';

type NotificationTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const TONE_STYLES: Record<NotificationTone, { bg: string; fg: string; soft: string }> = {
  success: { bg: COLORS.success, fg: COLORS.onPrimary, soft: COLORS.successContainer },
  warning: { bg: COLORS.warning, fg: COLORS.onPrimary, soft: COLORS.warningContainer },
  danger: { bg: COLORS.error, fg: COLORS.onPrimary, soft: COLORS.errorContainer },
  info: { bg: COLORS.info, fg: COLORS.onPrimary, soft: COLORS.infoContainer },
  neutral: { bg: COLORS.onSurfaceVariant, fg: COLORS.onPrimary, soft: COLORS.neutralContainer },
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

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function notificationMeta(n: AppNotification): {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  tone: NotificationTone;
  label: string;
} {
  const status = asString(n.data?.status);

  if (n.type === 'delivery') {
    return {
      icon: status === 'failed' ? 'truck-remove-outline' : 'truck-fast-outline',
      tone: status === 'failed' ? 'danger' : 'info',
      label: status === 'failed' ? 'Cần xử lý' : 'Giao hàng',
    };
  }
  if (n.type === 'reservation') {
    return {
      icon: status === 'completed' ? 'check-circle-outline' : 'clipboard-check-outline',
      tone: status === 'completed' ? 'success' : 'info',
      label: 'Đơn nhận',
    };
  }
  if (n.type === 'campaign') {
    return { icon: 'pot-steam-outline', tone: 'warning', label: 'Chiến dịch' };
  }
  if (n.type === 'bulk_run') {
    return { icon: 'package-variant-closed', tone: 'info', label: 'Giao sỉ' };
  }
  if (n.type === 'verification') {
    return { icon: 'shield-check-outline', tone: 'success', label: 'Xác minh' };
  }
  return { icon: 'bell-ring-outline', tone: 'neutral', label: 'Cập nhật' };
}

function detailPathForNotification(n: AppNotification, role?: string | null): string | null {
  const reservationId = asString(n.data?.reservationId);
  const listingId = asString(n.data?.listingId);
  const campaignId = asString(n.data?.campaignId);
  const deliveryId = asString(n.data?.deliveryId);
  const bulkRunId = asString(n.data?.bulkRunId);

  if (reservationId) {
    return role === 'provider'
      ? `/(app)/provider/orders/${reservationId}`
      : `/(app)/order/${reservationId}`;
  }
  if (listingId) {
    return role === 'provider'
      ? `/(app)/provider/${listingId}`
      : `/(app)/listing/${listingId}`;
  }
  if (campaignId) {
    if (role === 'provider') return `/(app)/provider/campaigns/${campaignId}`;
    if (role === 'volunteer') return `/(app)/volunteer/campaigns/${campaignId}`;
    return `/(app)/charity/campaigns/${campaignId}`;
  }
  if (deliveryId && role === 'volunteer') return '/(app)/volunteer/active';
  if (bulkRunId && role === 'volunteer') return '/(app)/volunteer/bulk';
  if (n.type === 'verification') return '/(app)/profile';
  return null;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const { data: unread = 0, refetch: refetchUnread } = useUnreadCount();
  const { data: items = [], refetch: refetchList } = useNotifications();
  const markAllRead = useMarkAllRead();
  const markRead = useMarkRead();
  const [shake] = useState(() => new Animated.Value(0));
  const unreadItems = useMemo(() => items.filter((item) => !item.isRead).length, [items]);
  const displayUnread = unread || unreadItems;

  useEffect(() => {
    if (displayUnread <= 0) return;
    shake.setValue(0);
    Animated.sequence([
      Animated.timing(shake, { toValue: 1, duration: 70, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -1, duration: 70, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 1, duration: 70, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 70, useNativeDriver: true }),
    ]).start();
  }, [displayUnread, shake]);

  const bellRotate = shake.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: ['-16deg', '0deg', '16deg'],
  });

  const openSheet = () => {
    setOpen(true);
    // Luôn lấy danh sách mới nhất khi mở (không phụ thuộc WS).
    void refetchList();
    void refetchUnread();
  };

  const onItemPress = (n: AppNotification) => {
    if (!n.isRead) markRead.mutate(n.id);
  };

  const onViewDetail = (n: AppNotification) => {
    const path = detailPathForNotification(n, user?.role);
    if (!path) {
      if (!n.isRead) markRead.mutate(n.id);
      return;
    }
    if (!n.isRead) markRead.mutate(n.id);
    setOpen(false);
    router.push(path as never);
  };

  return (
    <>
      <Pressable onPress={openSheet} hitSlop={8} style={styles.bellBtn}>
        <Animated.View style={{ transform: [{ rotate: bellRotate }] }}>
          <MaterialCommunityIcons
            name={displayUnread > 0 ? 'bell-ring-outline' : 'bell-outline'}
            size={26}
            color={displayUnread > 0 ? COLORS.rose : COLORS.onSurface}
          />
        </Animated.View>
        {displayUnread > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{displayUnread > 9 ? '9+' : displayUnread}</Text>
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
            <View>
              <Text variant="titleLarge" style={styles.sheetTitle}>Thông báo</Text>
              <Text style={styles.sheetSubtitle}>
                {displayUnread > 0 ? `${displayUnread} thông báo cần chú ý` : 'Bạn đã đọc hết thông báo'}
              </Text>
            </View>
            {displayUnread > 0 ? (
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
            <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
              {items.map((n) => {
                const meta = notificationMeta(n);
                const tone = TONE_STYLES[meta.tone];
                const detailPath = detailPathForNotification(n, user?.role);

                return (
                  <Pressable
                    key={n.id}
                    onPress={() => onItemPress(n)}
                    style={[styles.item, !n.isRead && [styles.itemUnread, { borderColor: tone.bg }]]}
                  >
                    <View style={styles.itemTop}>
                      <View style={[styles.itemIcon, { backgroundColor: tone.soft }]}>
                        <MaterialCommunityIcons name={meta.icon} size={20} color={tone.bg} />
                      </View>
                      <View style={styles.itemMain}>
                        <View style={styles.itemTitleRow}>
                          <Text style={styles.itemTitle} numberOfLines={2}>{n.title}</Text>
                          {!n.isRead ? (
                            <View style={[styles.newPill, { backgroundColor: tone.bg }]}>
                              <Text style={styles.newPillText}>Mới</Text>
                            </View>
                          ) : null}
                        </View>
                        <Text style={styles.itemType}>{meta.label} · {timeAgo(n.createdAt)}</Text>
                      </View>
                    </View>
                    <Text style={styles.itemBody} numberOfLines={4}>{n.body}</Text>
                    <View style={styles.itemFooter}>
                      <View style={styles.attentionLine}>
                        <View style={[styles.unreadDot, { backgroundColor: n.isRead ? COLORS.outlineVariant : tone.bg }]} />
                        <Text style={styles.itemTime}>{n.isRead ? 'Đã đọc' : 'Chưa đọc'}</Text>
                      </View>
                      {detailPath ? (
                        <Button
                          mode={n.isRead ? 'outlined' : 'contained'}
                          compact
                          icon="arrow-right"
                          contentStyle={styles.detailBtnContent}
                          labelStyle={styles.detailBtnLabel}
                          style={styles.detailBtn}
                          buttonColor={n.isRead ? undefined : COLORS.rose}
                          textColor={n.isRead ? COLORS.rose : COLORS.onPrimary}
                          onPress={() => onViewDetail(n)}
                        >
                          Xem chi tiết
                        </Button>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
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
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 19,
    height: 19,
    paddingHorizontal: 4,
    borderRadius: radius.pill,
    backgroundColor: COLORS.error,
    borderWidth: 2,
    borderColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: COLORS.onPrimary, fontSize: 10, fontWeight: '900' },
  sheet: {
    backgroundColor: COLORS.surface,
    marginHorizontal: spacing.md,
    borderRadius: 24,
    paddingVertical: spacing.lg,
    maxHeight: '82%',
    ...elevation.card,
  },
  sheetHeader: {
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  sheetTitle: { fontWeight: '900', color: COLORS.onSurface },
  sheetSubtitle: { marginTop: 2, color: COLORS.onSurfaceVariant, fontSize: 12, fontWeight: '700' },
  list: { paddingHorizontal: spacing.md },
  listContent: { paddingBottom: spacing.sm },
  item: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.xl,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    backgroundColor: COLORS.surface,
  },
  itemUnread: {
    backgroundColor: COLORS.roseContainer,
    borderWidth: 1.5,
  },
  itemTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  itemIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemMain: { flex: 1 },
  itemTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  itemTitle: { flex: 1, fontWeight: '900', color: COLORS.onSurface, fontSize: 15, lineHeight: 19 },
  itemType: { marginTop: 2, color: COLORS.onSurfaceVariant, fontSize: 11, fontWeight: '800' },
  newPill: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  newPillText: { color: COLORS.onPrimary, fontSize: 10, fontWeight: '900' },
  unreadDot: { width: 8, height: 8, borderRadius: 4 },
  itemBody: { color: COLORS.onSurfaceVariant, fontSize: 13, lineHeight: 18, marginTop: spacing.sm },
  itemFooter: {
    marginTop: spacing.md,
    alignItems: 'stretch',
    gap: spacing.sm,
  },
  attentionLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  itemTime: { color: COLORS.onSurfaceVariant, fontSize: 11, fontWeight: '700' },
  detailBtn: { alignSelf: 'stretch', borderRadius: radius.pill },
  detailBtnContent: { height: 38, flexDirection: 'row-reverse' },
  detailBtnLabel: { fontSize: 12, fontWeight: '900', marginHorizontal: 8 },
  empty: { alignItems: 'center', paddingVertical: 32, gap: 8 },
  emptyText: { color: COLORS.onSurfaceVariant },
});
