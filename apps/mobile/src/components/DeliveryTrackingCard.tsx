import { View, StyleSheet, Pressable, Linking } from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useDeliveryTracking, type DeliveryStatus } from '@/hooks/useDeliveries';

interface Props {
  reservationId: string;
}

const COLORS = {
  primary: '#10b981',
  danger: '#ef4444',
  surface: '#ffffff',
  onSurface: '#121c2a',
  onSurfaceVariant: '#6b7280',
  outline: '#e5e7eb',
  muted: '#d1d5db',
};

/** Các bước hiển thị theo thứ tự (pending_assignment gộp vào "chờ tài xế" trước bước 1). */
const STEPS: { key: DeliveryStatus; label: string }[] = [
  { key: 'assigned', label: 'Tài xế đã nhận đơn' },
  { key: 'heading_to_provider', label: 'Đang tới lấy hàng' },
  { key: 'qc_completed', label: 'Đã lấy hàng' },
  { key: 'in_transit', label: 'Đang giao đến bạn' },
  { key: 'delivered', label: 'Đã giao thành công' },
];
const ORDER = ['pending_assignment', 'assigned', 'heading_to_provider', 'qc_completed', 'in_transit', 'delivered'];

/** Thẻ theo dõi giao hàng tận nơi: timeline trạng thái + thông tin shipper + khoảng cách. */
export function DeliveryTrackingCard({ reservationId }: Props) {
  const { data, isLoading, isError } = useDeliveryTracking(reservationId);

  if (isLoading) {
    return (
      <View style={styles.card}>
        <ActivityIndicator color={COLORS.primary} />
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

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <MaterialCommunityIcons name="truck-delivery-outline" size={20} color={COLORS.primary} />
        <Text style={styles.title}>Theo dõi giao hàng</Text>
        {data.distanceKm != null ? (
          <Text style={styles.distance}>{data.distanceKm.toFixed(1)} km</Text>
        ) : null}
      </View>

      {failed ? (
        <Text style={styles.failed}>Giao hàng thất bại. Vui lòng liên hệ hỗ trợ.</Text>
      ) : data.status === 'pending_assignment' ? (
        <Text style={styles.muted}>Đang tìm tài xế cho đơn của bạn…</Text>
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
                    color={done ? COLORS.primary : COLORS.muted}
                  />
                  {i < STEPS.length - 1 ? (
                    <View style={[styles.connector, { backgroundColor: done ? COLORS.primary : COLORS.muted }]} />
                  ) : null}
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
        <View style={styles.shipperRow}>
          <View style={styles.avatar}>
            <MaterialCommunityIcons name="account" size={22} color={COLORS.onSurfaceVariant} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.shipperName}>{data.shipper.name}</Text>
            <Text style={styles.muted}>Tài xế giao hàng</Text>
          </View>
          {data.shipper.phone ? (
            <Pressable
              onPress={() => Linking.openURL(`tel:${data.shipper!.phone}`)}
              hitSlop={8}
              style={styles.callBtn}
            >
              <MaterialCommunityIcons name="phone" size={20} color={COLORS.primary} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 16,
    padding: 16,
    borderRadius: 16,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.outline,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  title: { flex: 1, fontSize: 15, fontWeight: '700', color: COLORS.onSurface },
  distance: { fontSize: 13, fontWeight: '600', color: COLORS.primary },
  muted: { fontSize: 13, color: COLORS.onSurfaceVariant },
  failed: { fontSize: 14, color: COLORS.danger, fontWeight: '600' },
  timeline: { marginTop: 4 },
  stepRow: { flexDirection: 'row', gap: 10 },
  stepIconCol: { alignItems: 'center', width: 20 },
  connector: { width: 2, flex: 1, minHeight: 18, marginVertical: 2 },
  stepLabel: { fontSize: 14, color: COLORS.onSurface, paddingBottom: 14 },
  stepLabelActive: { fontWeight: '700', color: COLORS.primary },
  stepLabelTodo: { color: COLORS.onSurfaceVariant },
  shipperRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.outline },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.outline, alignItems: 'center', justifyContent: 'center' },
  shipperName: { fontSize: 15, fontWeight: '700', color: COLORS.onSurface },
  callBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ecfdf5' },
});
