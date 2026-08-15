import { View, StyleSheet, Pressable, Linking } from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useDeliveryTracking, type DeliveryStatus } from '@/hooks/useDeliveries';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { AppImage } from '@/components/ui/AppImage';
import { mobileColors as COLORS, elevation, radius, spacing } from '@/theme/design';

interface Props {
  reservationId: string;
  /** avatarUrl từ ReservationDetail (tracking endpoint không trả avatar). */
  shipperAvatarUrl?: string | null;
}

/** Các bước hiển thị theo thứ tự (pending_assignment gộp vào "chờ tài xế" trước bước 1). */
const STEPS: { key: DeliveryStatus; label: string }[] = [
  { key: 'assigned', label: 'Tài xế đã nhận đơn' },
  { key: 'heading_to_provider', label: 'Đang tới lấy hàng' },
  { key: 'qc_completed', label: 'Đã lấy hàng' },
  { key: 'in_transit', label: 'Đang giao đến bạn' },
  { key: 'delivered', label: 'Đã giao thành công' },
];
const ORDER = ['pending_assignment', 'assigned', 'heading_to_provider', 'qc_completed', 'in_transit', 'delivered'];
function formatKm(km: unknown): string | null {
  if (km == null) return null;
  const n = Number(km);
  return Number.isFinite(n) ? `${n.toFixed(1)} km` : null;
}

/** Thẻ theo dõi giao hàng tận nơi: timeline trạng thái + thông tin shipper + khoảng cách. */
export function DeliveryTrackingCard({ reservationId, shipperAvatarUrl }: Props) {
  const { data, isLoading, isError } = useDeliveryTracking(reservationId);

  if (isLoading) {
    return (
      <View style={styles.card}>
        <ActivityIndicator color={COLORS.blue} />
      </View>
    );
  }
  if (isError || !data) {
    return (
      <View style={styles.card}>
        <Text style={styles.muted}>Chưa có thông tin giao hàng.</Text>
      </View>
    );
  }

  const failed = data.status === 'failed';
  const currentIndex = ORDER.indexOf(data.status);
  const distanceLabel = formatKm(data.distanceKm);

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.truckIcon}>
          <MaterialCommunityIcons name="truck-delivery-outline" size={22} color={COLORS.blue} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Theo dõi giao hàng</Text>
          <Text style={styles.muted}>Cập nhật trạng thái theo hành trình shipper</Text>
        </View>
        {distanceLabel ? <StatusBadge label={distanceLabel} tone="info" /> : null}
      </View>

      {failed ? (
        <View style={styles.noticeDanger}>
          <MaterialCommunityIcons name="alert-circle-outline" size={18} color={COLORS.danger} />
          <Text style={styles.failed}>Giao hàng thất bại. Vui lòng liên hệ hỗ trợ.</Text>
        </View>
      ) : data.status === 'pending_assignment' ? (
        <View style={styles.noticeInfo}>
          <ActivityIndicator size={16} color={COLORS.blue} />
          <Text style={styles.noticeText}>Đang tìm tài xế cho đơn của bạn...</Text>
        </View>
      ) : (
        <View style={styles.timeline}>
          {STEPS.map((step, i) => {
            const stepIndex = ORDER.indexOf(step.key);
            const done = currentIndex >= stepIndex;
            const active = currentIndex === stepIndex;
            return (
              <View key={step.key} style={styles.stepRow}>
                <View style={styles.stepIconCol}>
                  <MaterialCommunityIcons
                    name={done ? 'check-circle' : 'circle-outline'}
                    size={20}
                    color={done ? COLORS.teal : COLORS.muted}
                  />
                  {i < STEPS.length - 1 ? <View style={[styles.connector, done && styles.connectorDone]} /> : null}
                </View>
                <Text style={[styles.stepLabel, active && styles.stepLabelActive, !done && styles.stepLabelTodo]}>
                  {step.label}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {data.shipper ? (
        <View style={styles.shipperSection}>
          <View style={styles.shipperRow}>
            {shipperAvatarUrl ? (
              <AppImage source={{ uri: shipperAvatarUrl }} style={styles.avatarImg} />
            ) : (
              <View style={styles.avatar}>
                <MaterialCommunityIcons name="account" size={26} color={COLORS.onSurfaceVariant} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.shipperName}>{data.shipper.name}</Text>
              <View style={styles.shipperMeta}>
                <MaterialCommunityIcons name="check-decagram" size={13} color={COLORS.teal} />
                <Text style={styles.shipperRole}>Tài xế · Đã xác minh</Text>
              </View>
              {data.shipper.phone ? (
                <Text style={styles.shipperPhone}>{data.shipper.phone}</Text>
              ) : null}
            </View>
            {data.shipper.phone ? (
              <Pressable
                onPress={() => Linking.openURL(`tel:${data.shipper!.phone}`)}
                hitSlop={8}
                style={styles.callBtn}
              >
                <MaterialCommunityIcons name="phone" size={18} color={COLORS.blue} />
                <Text style={styles.callBtnText}>Gọi</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.xl,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    ...elevation.card,
  },
  truckIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.blueContainer,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  title: { fontSize: 16, fontWeight: '900', color: COLORS.onSurface },
  muted: { fontSize: 13, color: COLORS.onSurfaceVariant },
  noticeDanger: {
    borderRadius: radius.lg,
    padding: spacing.md,
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: COLORS.errorContainer,
  },
  noticeInfo: {
    borderRadius: radius.lg,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: COLORS.infoContainer,
  },
  noticeText: { flex: 1, fontSize: 13, fontWeight: '700', color: COLORS.onInfoContainer },
  failed: { flex: 1, fontSize: 14, color: COLORS.danger, fontWeight: '700' },
  timeline: { marginTop: 4 },
  stepRow: { flexDirection: 'row', gap: spacing.md },
  stepIconCol: { alignItems: 'center', width: 24 },
  connector: { width: 2, flex: 1, minHeight: 18, marginVertical: 2, backgroundColor: COLORS.outlineVariant },
  connectorDone: { backgroundColor: COLORS.teal },
  stepLabel: { fontSize: 14, color: COLORS.onSurface, paddingBottom: 14, fontWeight: '600' },
  stepLabelActive: { fontWeight: '900', color: COLORS.teal },
  stepLabelTodo: { color: COLORS.onSurfaceVariant },
  shipperSection: { marginTop: spacing.sm, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: COLORS.outlineVariant },
  shipperRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: COLORS.surfaceContainerLow, alignItems: 'center', justifyContent: 'center' },
  avatarImg: { width: 52, height: 52, borderRadius: 26 },
  shipperName: { fontSize: 15, fontWeight: '800', color: COLORS.onSurface },
  shipperMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  shipperRole: { fontSize: 12, color: COLORS.teal, fontWeight: '700' },
  shipperPhone: { fontSize: 13, color: COLORS.onSurfaceVariant, marginTop: 4, fontWeight: '600' },
  callBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.pill, backgroundColor: COLORS.blueContainer },
  callBtnText: { fontSize: 13, fontWeight: '800', color: COLORS.blue },
});
