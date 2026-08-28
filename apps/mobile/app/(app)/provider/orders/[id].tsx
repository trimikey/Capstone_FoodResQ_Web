import { View, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Button } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { AppImage } from '@/components/ui/AppImage';
import { useAuth } from '@/hooks/useAuth';
import { useProviderReservationDetail, useProviderReservations } from '@/hooks/useProviderReservations';
import {
  reservationStatusDisplay,
  useCountdown,
} from '@/components/ProviderReservationCard';
import { ScreenState } from '@/components/ui/ScreenState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { StickyActionBar } from '@/components/ui/StickyActionBar';
import { SurfaceCard } from '@/components/ui/SurfaceCard';
import { BackButton } from '@/components/ui/BackButton';
import { DeferredRedirect } from '@/components/navigation/DeferredRedirect';
import { mobileColors as COLORS, radius, spacing } from '@/theme/design';

function fmtDateTime(iso?: string): string {
  if (!iso) return '-';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Chi tiết 1 đơn đặt — đọc từ cache danh sách provider (không cần endpoint riêng). */
export default function ProviderOrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { data, isLoading, refetch } = useProviderReservations();
  const cachedOrder = (data ?? []).find((r) => r.id === id);
  const detail = useProviderReservationDetail(cachedOrder ? undefined : id);
  const order = cachedOrder ?? detail.data;

  const sd = reservationStatusDisplay(order?.status);
  const countdown = useCountdown(
    order?.status === 'confirmed' ? order.qrExpiresAt : null
  );

  if (user && user.role !== 'provider') {
    return <DeferredRedirect href="/(app)/home" />;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <BackButton />
        <Text variant="titleMedium" style={styles.headerTitle}>Chi tiết đơn</Text>
        <View style={{ width: 24 }} />
      </View>

      {!order ? (
        <ScreenState
          kind={isLoading || detail.isLoading ? 'loading' : detail.isError ? 'error' : 'empty'}
          title={isLoading || detail.isLoading ? 'Đang tải đơn' : detail.isError ? 'Không tải được đơn' : 'Không tìm thấy đơn'}
          message={
            isLoading || detail.isLoading
              ? 'Vui lòng chờ trong giây lát.'
              : detail.isError
                ? 'Thử tải lại hoặc quay về danh sách đơn.'
                : 'Quay lại danh sách để chọn một đơn khác.'
          }
          actionLabel={detail.isError ? 'Thử lại' : undefined}
          onAction={detail.isError ? () => { void detail.refetch(); void refetch(); } : undefined}
        />
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.heroCard}>
              <View style={styles.heroIcon}>
                <MaterialCommunityIcons name="qrcode-scan" size={24} color={COLORS.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.heroKicker}>Provider order</Text>
                <Text style={styles.heroTitle} numberOfLines={2}>{order.listing.title}</Text>
                {countdown ? <Text style={styles.countdown}>QR còn {countdown}</Text> : null}
              </View>
              <StatusBadge label={sd.label} tone={order.status === 'completed' ? 'success' : order.status === 'confirmed' ? 'info' : 'neutral'} />
            </View>

            {/* Người nhận */}
            <Text style={styles.sectionLabel}>Người nhận</Text>
            <SurfaceCard style={styles.receiverRow}>
              {order.receiver.user.avatarUrl ? (
                <AppImage source={{ uri: order.receiver.user.avatarUrl }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarEmpty]}>
                  <MaterialCommunityIcons name="account" size={28} color={COLORS.onSurfaceVariant} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.receiverName}>{order.receiver.user.fullName}</Text>
                {order.receiver.user.phone ? (
                  <Text style={styles.meta}>{order.receiver.user.phone}</Text>
                ) : null}
              </View>
            </SurfaceCard>

            {/* Món + đơn */}
            <Text style={styles.sectionLabel}>Đơn đặt</Text>
            <SurfaceCard style={styles.itemRow}>
              <AppImage source={{ uri: order.listing.imageUrls?.[0] }} style={styles.itemImage} />
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.itemTitle} numberOfLines={2}>{order.listing.title}</Text>
                <Text style={styles.meta}>
                  Số lượng: {order.quantity} {order.listing.quantityUnit}
                </Text>
              </View>
            </SurfaceCard>

            <SurfaceCard style={styles.detailCard}>
              <Row icon="map-marker-outline" text={order.listing.pickupAddress} />
              <Row icon="clock-outline" text={`Đặt lúc ${fmtDateTime(order.createdAt)}`} />
            </SurfaceCard>
          </ScrollView>

          {order.status === 'confirmed' ? (
            <StickyActionBar>
              <Button
                mode="contained"
                icon="qrcode-scan"
                onPress={() => router.push('/(app)/provider/scan')}
                buttonColor={COLORS.primary}
                style={styles.actionBtn}
                labelStyle={{ fontSize: 16, fontWeight: 'bold' }}
              >
                Quét QR để giao
              </Button>
            </StickyActionBar>
          ) : null}
        </>
      )}
    </SafeAreaView>
  );
}

function Row({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.row}>
      <MaterialCommunityIcons
        name={icon as keyof typeof MaterialCommunityIcons.glyphMap}
        size={20}
        color={COLORS.primary}
      />
      <Text style={styles.rowText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    height: 56, paddingHorizontal: 16, backgroundColor: COLORS.surface,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 1, borderBottomColor: COLORS.outline,
  },
  headerTitle: { fontWeight: '700', color: COLORS.onSurface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  content: { padding: spacing.xl, paddingBottom: spacing.xl },
  heroCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    borderRadius: 28,
    padding: spacing.lg,
    backgroundColor: COLORS.primaryStrong,
  },
  heroIcon: {
    width: 46,
    height: 46,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
  },
  heroKicker: { color: COLORS.secondaryContainer, fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  heroTitle: { marginTop: 3, color: COLORS.onPrimary, fontSize: 20, lineHeight: 26, fontWeight: '900' },
  countdown: { marginTop: 5, fontSize: 13, fontWeight: '800', color: COLORS.secondaryContainer },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: COLORS.onSurfaceVariant, marginTop: 22, marginBottom: 8, textTransform: 'uppercase' },
  receiverRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.outline },
  avatarEmpty: { alignItems: 'center', justifyContent: 'center' },
  receiverName: { fontSize: 16, fontWeight: '700', color: COLORS.onSurface },
  meta: { fontSize: 14, color: COLORS.onSurfaceVariant },
  itemRow: { flexDirection: 'row', gap: spacing.md, padding: spacing.md },
  itemImage: { width: 76, height: 76, borderRadius: radius.lg, backgroundColor: COLORS.outline },
  itemTitle: { fontSize: 16, fontWeight: '900', color: COLORS.onSurface },
  detailCard: { marginTop: spacing.md, padding: spacing.lg, gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  rowText: { flex: 1, fontSize: 15, color: COLORS.onSurface },
  actionBtn: { borderRadius: 12, paddingVertical: 4 },
});
