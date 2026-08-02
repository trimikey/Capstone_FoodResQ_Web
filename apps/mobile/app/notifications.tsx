import { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import {
  useMarkAllRead,
  useMarkRead,
  useNotifications,
  useUnreadCount,
  type AppNotification,
} from '@/hooks/useNotifications';
import { mobileColors as COLORS, radius, spacing } from '@/theme/design';

type NotificationTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const TONE_STYLES: Record<NotificationTone, { bg: string; soft: string; surface: string }> = {
  success: { bg: COLORS.success, soft: COLORS.successContainer, surface: '#f0fdf4' },
  warning: { bg: COLORS.warning, soft: COLORS.warningContainer, surface: '#fffbeb' },
  danger: { bg: COLORS.error, soft: COLORS.errorContainer, surface: '#fff1f2' },
  info: { bg: COLORS.info, soft: COLORS.infoContainer, surface: '#eff6ff' },
  neutral: { bg: COLORS.onSurfaceVariant, soft: COLORS.neutralContainer, surface: COLORS.surface },
};

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function formatNotificationTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${hh}:${mm} - ${dd}/${month}/${date.getFullYear()}`;
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
  return { icon: 'bell-ring-outline', tone: 'neutral', label: 'Thông báo chung' };
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
    return role === 'provider' ? `/(app)/provider/${listingId}` : `/(app)/listing/${listingId}`;
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

function fallbackPathForRole(role?: string | null): string {
  if (role === 'provider') return '/provider/listings';
  if (role === 'volunteer') return '/volunteer/offers';
  return '/home';
}

function isSafeReturnPath(path?: string | null): path is string {
  return !!path && path.startsWith('/') && !path.startsWith('//') && path !== '/notifications';
}

function NotificationRow({
  item,
  role,
  onRead,
}: {
  item: AppNotification;
  role?: string | null;
  onRead: (id: string) => void;
}) {
  const meta = notificationMeta(item);
  const tone = TONE_STYLES[meta.tone];
  const detailPath = detailPathForNotification(item, role);

  const handlePress = () => {
    if (!item.isRead) onRead(item.id);
    const campaignId = asString(item.data?.campaignId);
    if (campaignId && role === 'volunteer') {
      router.push({
        pathname: '/volunteer/campaigns/[id]',
        params: {
          id: campaignId,
          returnTo: '/notifications',
        },
      });
      return;
    }
    if (detailPath) router.push(detailPath as never);
  };

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: item.isRead ? COLORS.surface : tone.surface },
        pressed && styles.rowPressed,
      ]}
    >
      <View style={[styles.iconBubble, { backgroundColor: tone.soft }]}>
        <MaterialCommunityIcons name={meta.icon} size={24} color={tone.bg} />
      </View>

      <View style={styles.rowBody}>
        <View style={styles.titleLine}>
          <Text style={styles.rowTitle} numberOfLines={2}>
            {meta.label}
          </Text>
          {!item.isRead ? <View style={[styles.unreadDot, { backgroundColor: tone.bg }]} /> : null}
        </View>
        <Text style={styles.message} numberOfLines={4}>
          {item.title ? `${item.title} - ${item.body}` : item.body}
        </Text>
        <Text style={styles.time}>{formatNotificationTime(item.createdAt)}</Text>
      </View>

      {detailPath ? (
        <MaterialCommunityIcons name="chevron-right" size={22} color={COLORS.onSurfaceVariant} />
      ) : null}
    </Pressable>
  );
}

export default function NotificationsScreen() {
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const { data: items = [], isFetching, refetch } = useNotifications();
  const { data: unread = 0 } = useUnreadCount();
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return items.filter((item) => {
      if (unreadOnly && item.isRead) return false;
      if (!normalizedQuery) return true;
      return `${item.title} ${item.body} ${notificationMeta(item).label}`
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [items, query, unreadOnly]);

  const handleBack = () => {
    if (router.canDismiss()) {
      router.dismiss();
      return;
    }
    if (router.canGoBack()) {
      router.back();
      return;
    }
    if (isSafeReturnPath(returnTo)) {
      router.navigate(returnTo as never);
      return;
    }
    router.navigate(fallbackPathForRole(user?.role) as never);
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.leftActions}>
          <Pressable onPress={handleBack} hitSlop={10} style={styles.iconButton}>
            <MaterialCommunityIcons name="chevron-left" size={28} color={COLORS.onSurface} />
          </Pressable>
        </View>
        <Text style={styles.headerTitle}>Thông báo</Text>
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => setSearchVisible((value) => !value)}
            hitSlop={10}
            style={styles.iconButton}
          >
            <MaterialCommunityIcons name="magnify" size={24} color={COLORS.onSurface} />
          </Pressable>
          <Pressable
            onPress={() => setUnreadOnly((value) => !value)}
            hitSlop={10}
            style={[styles.iconButton, unreadOnly && styles.iconButtonActive]}
          >
            <MaterialCommunityIcons
              name={unreadOnly ? 'filter-check-outline' : 'filter-variant'}
              size={24}
              color={unreadOnly ? COLORS.primary : COLORS.onSurface}
            />
          </Pressable>
        </View>
      </View>

      {searchVisible ? (
        <View style={styles.searchWrap}>
          <MaterialCommunityIcons name="magnify" size={22} color={COLORS.onSurfaceVariant} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Tìm thông báo"
            placeholderTextColor={COLORS.onSurfaceVariant}
            style={styles.searchInput}
            returnKeyType="search"
          />
          {query.length > 0 ? (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <MaterialCommunityIcons name="close-circle" size={20} color={COLORS.onSurfaceVariant} />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View style={styles.summaryBar}>
        <Pressable
          onPress={() => setUnreadOnly(false)}
          style={[styles.segment, !unreadOnly && styles.segmentActive]}
        >
          <Text style={[styles.segmentText, !unreadOnly && styles.segmentTextActive]}>Tất cả</Text>
        </Pressable>
        <Pressable
          onPress={() => setUnreadOnly(true)}
          style={[styles.segment, unreadOnly && styles.segmentActive]}
        >
          <Text style={[styles.segmentText, unreadOnly && styles.segmentTextActive]}>
            Chưa đọc {unread > 0 ? `(${unread})` : ''}
          </Text>
        </Pressable>
        {unread > 0 ? (
          <Button
            mode="text"
            compact
            onPress={() => markAllRead.mutate()}
            loading={markAllRead.isPending}
            disabled={markAllRead.isPending}
            labelStyle={styles.readAllLabel}
          >
            Đọc tất cả
          </Button>
        ) : null}
      </View>

      <FlatList
        data={filteredItems}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <NotificationRow
            item={item}
            role={user?.role}
            onRead={(id) => markRead.mutate(id)}
          />
        )}
        refreshControl={
          <RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={COLORS.primary} />
        }
        contentContainerStyle={[
          styles.listContent,
          filteredItems.length === 0 && styles.emptyListContent,
        ]}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <MaterialCommunityIcons
                name={unreadOnly ? 'email-open-outline' : 'bell-sleep-outline'}
                size={30}
                color={COLORS.primary}
              />
            </View>
            <Text style={styles.emptyTitle}>
              {query.trim() ? 'Không tìm thấy thông báo' : 'Chưa có thông báo'}
            </Text>
            <Text style={styles.emptyBody}>
              {unreadOnly ? 'Bạn đã xử lý hết các thông báo chưa đọc.' : 'Thông báo mới sẽ xuất hiện tại đây.'}
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.surface,
  },
  header: {
    minHeight: 64,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.outlineVariant,
    backgroundColor: COLORS.surface,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonActive: {
    backgroundColor: COLORS.primaryContainer,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: COLORS.onSurface,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '800',
  },
  headerActions: {
    width: 84,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.xs,
  },
  leftActions: {
    width: 84,
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchWrap: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    height: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: COLORS.surfaceVariant,
  },
  searchInput: {
    flex: 1,
    color: COLORS.onSurface,
    fontSize: 14,
    fontWeight: '600',
    paddingVertical: 0,
  },
  summaryBar: {
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: COLORS.surface,
  },
  segment: {
    minHeight: 32,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surfaceVariant,
  },
  segmentActive: {
    backgroundColor: COLORS.primaryContainer,
  },
  segmentText: {
    color: COLORS.onSurfaceVariant,
    fontSize: 12,
    fontWeight: '800',
  },
  segmentTextActive: {
    color: COLORS.primaryStrong,
  },
  readAllLabel: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: '900',
  },
  listContent: {
    paddingBottom: spacing.section,
  },
  emptyListContent: {
    flexGrow: 1,
  },
  row: {
    minHeight: 96,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  rowPressed: {
    opacity: 0.78,
  },
  iconBubble: {
    width: 46,
    height: 46,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  titleLine: {
    minHeight: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowTitle: {
    flex: 1,
    color: COLORS.onSurface,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '800',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  message: {
    marginTop: 2,
    color: COLORS.onSurface,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '500',
  },
  time: {
    marginTop: spacing.sm,
    color: COLORS.onSurfaceVariant,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.outlineVariant,
    marginLeft: 78,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.section,
    gap: spacing.sm,
  },
  emptyIcon: {
    width: 58,
    height: 58,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primaryContainer,
  },
  emptyTitle: {
    marginTop: spacing.sm,
    color: COLORS.onSurface,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptyBody: {
    color: COLORS.onSurfaceVariant,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    textAlign: 'center',
  },
});
