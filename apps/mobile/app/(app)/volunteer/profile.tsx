import { useState } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import {
  Text,
  Button,
  Avatar,
  ActivityIndicator,
  Divider,
  Switch,
  Chip,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { useVolunteerMe, useSetAvailability } from '@/hooks/useVolunteer';
import { volunteerRankLabel } from '@/utils/userFormat';
import { getCurrentCoords } from '@/services/geolocation';
import { Popup } from '@/components/ui/AppPopup';

const COLORS = {
  primary: '#10b981',
  background: '#f8f9ff',
  surface: '#ffffff',
  onSurface: '#121c2a',
  onSurfaceVariant: '#6b7280',
  outline: '#e5e7eb',
  error: '#ba1a1a',
  warning: '#f59e0b',
};

function vehicleLabel(t?: string | null): string {
  switch (t) {
    case 'motorbike':
      return 'Xe máy';
    case 'bicycle':
      return 'Xe đạp';
    case 'car':
      return 'Ô tô';
    case 'truck':
      return 'Xe tải';
    default:
      return t ?? 'Chưa cập nhật';
  }
}

function specializationLabel(s: string): string {
  switch (s) {
    case 'shipper':
      return 'Giao hàng';
    case 'chef':
      return 'Đầu bếp';
    case 'waiter':
      return 'Phục vụ';
    default:
      return s;
  }
}

/**
 * Hồ sơ Tình nguyện viên (tab "Hồ sơ") — hạng, điểm cống hiến, đánh giá,
 * chuyên môn, phương tiện + công tắc "Sẵn sàng nhận đơn" (kèm vị trí từ
 * expo-location). Lối tắt sang Lịch sử giao hàng + đăng xuất.
 */
export default function VolunteerProfileScreen() {
  const { user, logout, isLoading: authLoading } = useAuth();
  const { data: vol, isLoading, isError, refetch, isRefetching } = useVolunteerMe();
  const setAvailability = useSetAvailability();
  const [toggling, setToggling] = useState(false);

  const handleToggle = async (next: boolean) => {
    setToggling(true);
    try {
      if (next) {
        const { coords, isFallback } = await getCurrentCoords();
        await setAvailability.mutateAsync({ isAvailable: true, lng: coords.lng, lat: coords.lat });
        Popup.show({
          type: isFallback ? 'warning' : 'success',
          text1: 'Đã bật sẵn sàng nhận đơn',
          text2: isFallback
            ? 'Không lấy được vị trí thật, đang dùng vị trí mặc định. Hãy bật định vị để nhận đơn gần bạn.'
            : 'Bạn sẽ nhận được lời mời giao hàng gần vị trí hiện tại.',
        });
      } else {
        await setAvailability.mutateAsync({ isAvailable: false });
        Popup.show({ type: 'info', text1: 'Đã tắt nhận đơn' });
      }
    } catch (e: any) {
      Popup.show({
        type: 'error',
        text1: 'Cập nhật trạng thái thất bại',
        text2: e?.response?.data?.error?.message ?? 'Vui lòng thử lại.',
      });
    } finally {
      setToggling(false);
    }
  };

  const name = user?.name || user?.email || 'Tình nguyện viên';
  const busy = toggling || setAvailability.isPending;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
      >
        {/* Header: avatar + tên + hạng */}
        <View style={styles.header}>
          {user?.avatarUrl ? (
            <Avatar.Image size={84} source={{ uri: user.avatarUrl }} />
          ) : (
            <Avatar.Text
              size={84}
              label={name.charAt(0).toUpperCase()}
              style={{ backgroundColor: COLORS.primary }}
            />
          )}
          <Text variant="titleLarge" style={styles.name}>
            {name}
          </Text>
          {vol ? (
            <View style={styles.badgeRow}>
              <View style={[styles.badge, { backgroundColor: '#eef2ff' }]}>
                <Text style={[styles.badgeText, { color: '#4338ca' }]}>
                  Hạng {volunteerRankLabel(vol.rank)}
                </Text>
              </View>
              {vol.avgRating != null ? (
                <View style={[styles.badge, { backgroundColor: '#fef3c7' }]}>
                  <Text style={[styles.badgeText, { color: '#b45309' }]}>
                    ★ {vol.avgRating.toFixed(1)}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>

        {isLoading && !vol ? (
          <ActivityIndicator style={{ marginTop: 24 }} color={COLORS.primary} />
        ) : isError && !vol ? (
          <View style={styles.errorBox}>
            <Text style={{ color: COLORS.onSurfaceVariant, marginBottom: 8 }}>
              Không tải được hồ sơ tình nguyện viên.
            </Text>
            <Button mode="text" onPress={() => refetch()} textColor={COLORS.primary}>
              Thử lại
            </Button>
          </View>
        ) : vol ? (
          <>
            {/* Công tắc sẵn sàng nhận đơn */}
            <View style={styles.card}>
              <View style={styles.availRow}>
                <MaterialCommunityIcons
                  name={vol.isAvailable ? 'motorbike' : 'sleep'}
                  size={24}
                  color={vol.isAvailable ? COLORS.primary : COLORS.onSurfaceVariant}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.availTitle}>Sẵn sàng nhận đơn</Text>
                  <Text style={styles.availSub}>
                    {vol.isAvailable
                      ? 'Đang bật — nhận lời mời giao hàng gần bạn'
                      : 'Đang tắt — không nhận lời mời mới'}
                  </Text>
                </View>
                {busy ? (
                  <ActivityIndicator color={COLORS.primary} />
                ) : (
                  <Switch
                    value={vol.isAvailable}
                    onValueChange={handleToggle}
                    color={COLORS.primary}
                  />
                )}
              </View>
              {!vol.isShipper ? (
                <View style={styles.warnBox}>
                  <MaterialCommunityIcons name="alert" size={18} color={COLORS.warning} />
                  <Text style={styles.warnText}>
                    Chuyên môn "Giao hàng" của bạn chưa được xác minh. Bạn có thể chưa nhận được
                    lời mời cho đến khi quản trị viên duyệt.
                  </Text>
                </View>
              ) : null}
            </View>

            {/* Điểm cống hiến */}
            <View style={styles.card}>
              <View style={styles.pointRow}>
                <MaterialCommunityIcons name="medal-outline" size={22} color={COLORS.primary} />
                <Text style={styles.pointLabel}>Điểm cống hiến</Text>
                <Text style={styles.pointValue}>{vol.dedicationPoints}</Text>
              </View>
            </View>

            {/* Chuyên môn */}
            {vol.specializations.length > 0 ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Chuyên môn</Text>
                <Divider style={{ marginVertical: 8 }} />
                <View style={styles.chips}>
                  {vol.specializations.map((s) => (
                    <Chip
                      key={s.specialization}
                      icon={s.isVerified ? 'check-decagram' : 'clock-outline'}
                      style={styles.chip}
                      selectedColor={s.isVerified ? COLORS.primary : COLORS.warning}
                    >
                      {specializationLabel(s.specialization)}
                      {s.isVerified ? '' : ' (chờ duyệt)'}
                    </Chip>
                  ))}
                </View>
              </View>
            ) : null}

            {/* Phương tiện */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Phương tiện</Text>
              <Divider style={{ marginVertical: 8 }} />
              <Row label="Loại xe" value={vehicleLabel(vol.vehicleType)} />
              <Row label="Biển số" value={vol.vehiclePlate ?? 'Chưa cập nhật'} />
            </View>
          </>
        ) : null}

        {/* Hành động */}
        <Button
          mode="contained"
          icon="history"
          onPress={() => router.push('/(app)/volunteer/history')}
          style={styles.actionBtn}
          buttonColor={COLORS.primary}
        >
          Lịch sử giao hàng
        </Button>
        <Button
          mode="outlined"
          icon="logout"
          onPress={logout}
          loading={authLoading}
          disabled={authLoading}
          style={styles.logout}
          textColor={COLORS.error}
        >
          Đăng xuất
        </Button>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32 },
  header: { alignItems: 'center', gap: 4 },
  name: { fontWeight: '700', marginTop: 10, color: COLORS.onSurface },
  badgeRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  badge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 12, fontWeight: '600' },
  errorBox: { alignItems: 'center', marginTop: 24 },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: COLORS.outline,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: COLORS.onSurface },
  availRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  availTitle: { fontSize: 15, fontWeight: '700', color: COLORS.onSurface },
  availSub: { fontSize: 12, color: COLORS.onSurfaceVariant, marginTop: 2 },
  warnBox: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    padding: 10,
    borderRadius: 12,
    backgroundColor: '#fffbeb',
  },
  warnText: { flex: 1, fontSize: 12, color: '#92400e', lineHeight: 17 },
  pointRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pointLabel: { flex: 1, fontSize: 15, color: COLORS.onSurface },
  pointValue: { fontSize: 20, fontWeight: '800', color: COLORS.primary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: '#f9fafb' },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  rowLabel: { color: COLORS.onSurfaceVariant },
  rowValue: { color: COLORS.onSurface, fontWeight: '600' },
  actionBtn: { marginTop: 24, borderRadius: 12, paddingVertical: 4 },
  logout: { marginTop: 12, borderRadius: 12, borderColor: COLORS.error },
});
