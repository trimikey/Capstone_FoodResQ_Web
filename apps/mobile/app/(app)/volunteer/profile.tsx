import { useCallback } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import {
  Text,
  Button,
  Avatar,
  Divider,
  Chip,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { useEnrollFace, useFaceEnrollment } from '@/hooks/useFaceEnrollment';
import { useVolunteerMe, useUpdateLocation } from '@/hooks/useVolunteer';
import { useMyDeliveryShifts } from '@/hooks/useDeliveries';
import { volunteerRankLabel } from '@/utils/userFormat';
import { captureImage, pickImageFromLibrary } from '@/services/faceCapture';
import { getCurrentCoords } from '@/services/geolocation';
import { Popup, Toast } from '@/components/ui/AppPopup';
import { ScreenState } from '@/components/ui/ScreenState';
import { notifyError, notifySuccess, notifyWarning } from '@/services/haptics';
import { mobileColors as COLORS, elevation, radius, spacing } from '@/theme/design';

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

function primarySpecializationLabel(specs: { specialization: string; isVerified: boolean }[]): string {
  const verified = specs.filter((s) => s.isVerified).map((s) => s.specialization);
  const preferred = ['chef', 'waiter', 'shipper'].find((role) => verified.includes(role));
  return preferred ? specializationLabel(preferred) : 'Chờ duyệt';
}

function formatDecimal(value: unknown): string | null {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(1) : null;
}

function vnTodayKey(): string {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
}

function currentShiftPeriod(): 'midnight' | 'morning' | 'afternoon' | 'evening' {
  const nowVn = new Date(Date.now() + 7 * 3600_000);
  const hour = nowVn.getUTCHours();
  if (hour < 6) return 'midnight';
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

const PERIOD_LABEL: Record<string, string> = {
  midnight: 'Ca khuya',
  morning: 'Ca sáng',
  afternoon: 'Ca chiều',
  evening: 'Ca tối',
};

/**
 * Hồ sơ Tình nguyện viên (tab "Hồ sơ") — hạng, điểm cống hiến, đánh giá,
 * chuyên môn và các lối tắt đúng theo chuyên môn đã xác minh.
 */
export default function VolunteerProfileScreen() {
  const { user, logout, isLoading: authLoading } = useAuth();
  const { data: vol, isLoading, isError, refetch, isRefetching } = useVolunteerMe();
  const faceEnrollment = useFaceEnrollment();
  const refetchFaceEnrollment = faceEnrollment.refetch;
  const enrollFace = useEnrollFace();
  const updateLocation = useUpdateLocation();

  useFocusEffect(
    useCallback(() => {
      void Promise.all([refetch(), refetchFaceEnrollment()]);
    }, [refetch, refetchFaceEnrollment])
  );

  const handleEnrollFace = async (mode: 'camera' | 'library') => {
    try {
      const img = mode === 'camera' ? await captureImage('face') : await pickImageFromLibrary();
      if (!img) return;
      await enrollFace.mutateAsync({ selfie: img });
      await Promise.all([refetchFaceEnrollment(), refetch()]);
      void notifySuccess();
      Toast.show({
        type: 'success',
        text1: 'Đã cập nhật khuôn mặt',
        text2: 'Bạn có thể xác minh khi giao nhận đơn.',
      });
    } catch (e: any) {
      void notifyError();
      Popup.show({
        type: 'error',
        text1: 'Cập nhật khuôn mặt thất bại',
        text2: e?.response?.data?.error?.message ?? e?.message ?? 'Vui lòng thử lại.',
      });
    }
  };

  const handleUpdateLocation = async () => {
    try {
      const { coords, isFallback } = await getCurrentCoords();
      if (!coords) {
        void notifyWarning();
        Toast.show({
          type: 'warning',
          text1: 'Chưa lấy được vị trí hiện tại',
          text2: 'Hãy bật quyền định vị để tìm đơn gần vị trí thật của bạn.',
        });
        return;
      }
      await updateLocation.mutateAsync({ lng: coords.lng, lat: coords.lat });
      void (isFallback ? notifyWarning() : notifySuccess());
      Toast.show({
        type: isFallback ? 'warning' : 'success',
        text1: 'Đã cập nhật GPS',
        text2: isFallback
          ? 'Vị trí hiện tại chưa ổn định. Hãy kiểm tra GPS nếu danh sách đơn chưa chính xác.'
          : 'Danh sách đơn gần bạn sẽ dùng vị trí mới nhất.',
      });
    } catch (e: any) {
      void notifyError();
      Popup.show({
        type: 'error',
        text1: 'Cập nhật GPS thất bại',
        text2: e?.response?.data?.error?.message ?? 'Vui lòng thử lại.',
      });
    }
  };

  const name = user?.name || user?.email || 'Tình nguyện viên';
  const faceBusy = enrollFace.isPending;
  const faceEnrolled = faceEnrollment.data?.enrolled === true;
  const avgRatingLabel = formatDecimal(vol?.avgRating);
  const verifiedSpecs = vol?.specializations.filter((s) => s.isVerified).map((s) => s.specialization) ?? [];
  const hasChef = verifiedSpecs.includes('chef');
  const hasWaiter = verifiedSpecs.includes('waiter');
  const hasShipper = verifiedSpecs.includes('shipper');
  const hasKitchenRole = hasChef || hasWaiter || hasShipper;
  const deliveryShifts = useMyDeliveryShifts(hasShipper);
  const todayKey = vnTodayKey();
  const currentPeriod = currentShiftPeriod();
  const todaySlots = deliveryShifts.data?.slots.filter((slot) => slot.workDate === todayKey) ?? [];
  const onDeliveryShift = todaySlots.some((slot) => slot.period === currentPeriod);
  const upcomingShift = deliveryShifts.data?.slots
    .filter((slot) => slot.workDate > todayKey)
    .sort((a, b) => `${a.workDate}:${a.period}`.localeCompare(`${b.workDate}:${b.period}`))[0];
  const primaryRoleLabel = vol ? primarySpecializationLabel(vol.specializations) : 'Chuyên môn';
  const headerStatus = hasShipper
    ? onDeliveryShift
      ? 'Đang trong ca giao hàng'
      : 'Nhận đơn theo ca giao hàng đã đăng ký'
    : hasChef
      ? 'Sẵn sàng tham gia ca bếp'
      : hasWaiter
        ? 'Sẵn sàng tham gia ca phục vụ'
        : 'Hồ sơ tình nguyện viên';

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
              style={{ backgroundColor: COLORS.teal }}
            />
          )}
          <View style={styles.headerInfo}>
            <Text variant="titleLarge" style={styles.name}>
              {name}
            </Text>
            <Text style={styles.headerSub}>{headerStatus}</Text>
            {vol ? (
              <View style={styles.badgeRow}>
                <View style={[styles.badge, { backgroundColor: COLORS.tealContainer }]}>
                  <Text style={[styles.badgeText, { color: COLORS.teal }]}>
                    Hạng {volunteerRankLabel(vol.rank)}
                  </Text>
                </View>
                {avgRatingLabel ? (
                  <View style={[styles.badge, { backgroundColor: COLORS.warningContainer }]}>
                    <Text style={[styles.badgeText, { color: COLORS.onWarningContainer }]}>
                      ★ {avgRatingLabel}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>

        {isLoading && !vol ? (
          <ScreenState kind="loading" title="Đang tải hồ sơ" />
        ) : isError && !vol ? (
          <ScreenState kind="error" title="Không tải được hồ sơ" actionLabel="Thử lại" onAction={() => refetch()} />
        ) : vol ? (
          <>
            <View style={styles.quickStats}>
              <View style={styles.quickStat}>
                <Text style={styles.quickStatValue}>{vol.dedicationPoints}</Text>
                <Text style={styles.quickStatLabel}>điểm</Text>
              </View>
              <View style={styles.quickDivider} />
              <View style={styles.quickStat}>
                <Text style={styles.quickStatValue}>{avgRatingLabel ?? '-'}</Text>
                <Text style={styles.quickStatLabel}>rating</Text>
              </View>
              <View style={styles.quickDivider} />
              <View style={styles.quickStat}>
                <Text style={styles.quickStatValue} numberOfLines={1} adjustsFontSizeToFit>
                  {verifiedSpecs.length > 1 ? verifiedSpecs.length : primaryRoleLabel}
                </Text>
                <Text style={styles.quickStatLabel}>
                  {verifiedSpecs.length > 1 ? 'chuyên môn' : 'vai trò'}
                </Text>
              </View>
            </View>

            {/* Ca giao hàng thay cho công tắc sẵn sàng cũ */}
            {hasShipper ? (
              <View style={styles.card}>
                <View style={styles.availRow}>
                  <MaterialCommunityIcons
                    name={onDeliveryShift ? 'truck-check-outline' : 'calendar-clock'}
                    size={24}
                    color={onDeliveryShift ? COLORS.teal : COLORS.onSurfaceVariant}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.availTitle}>Ca giao hàng & GPS</Text>
                    <Text style={styles.availSub}>
                      {deliveryShifts.isLoading
                        ? 'Đang kiểm tra ca giao hàng...'
                        : onDeliveryShift
                          ? `Đang trong ${PERIOD_LABEL[currentPeriod]}. Bạn có thể tự nhận đơn phù hợp.`
                          : todaySlots.length
                            ? `Hôm nay có ${todaySlots.length} ca, hiện ngoài khung giờ nhận đơn.`
                            : upcomingShift
                              ? `Ca kế tiếp: ${upcomingShift.workDate} - ${PERIOD_LABEL[upcomingShift.period] ?? upcomingShift.period}.`
                              : 'Chưa đăng ký ca. Đơn gần bạn sẽ hiện nhưng không thể nhận ngoài ca.'}
                    </Text>
                  </View>
                </View>
                <View style={styles.shiftActions}>
                  <Button
                    mode="contained-tonal"
                    icon="calendar-edit"
                    buttonColor={COLORS.tealContainer}
                    textColor={COLORS.teal}
                    onPress={() => router.push('/(app)/volunteer/delivery-shifts')}
                    style={styles.shiftAction}
                  >
                    Sửa ca
                  </Button>
                  <Button
                    mode="outlined"
                    icon="crosshairs-gps"
                    loading={updateLocation.isPending}
                    disabled={updateLocation.isPending}
                    onPress={handleUpdateLocation}
                    textColor={COLORS.primary}
                    style={styles.shiftAction}
                  >
                    Cập nhật GPS
                  </Button>
                </View>
                <View style={styles.gpsHint}>
                  <MaterialCommunityIcons
                    name={vol.currentLocation ? 'map-marker-check-outline' : 'map-marker-alert-outline'}
                    size={16}
                    color={vol.currentLocation ? COLORS.teal : COLORS.warning}
                  />
                  <Text style={styles.gpsHintText}>
                    {vol.currentLocation
                      ? 'Đã có vị trí hiện tại. Tab Giao hàng vẫn tự lấy GPS tươi khi tìm đơn.'
                      : 'Chưa có vị trí lưu gần đây. Cập nhật GPS hoặc mở tab Giao hàng để lấy vị trí.'}
                  </Text>
                </View>
              </View>
            ) : null}

            {/* Xác minh khuôn mặt */}
            {hasShipper ? (
              <View style={styles.card}>
                <View style={styles.faceHead}>
                  <View style={styles.faceIcon}>
                    <MaterialCommunityIcons
                      name={faceEnrolled ? 'check-decagram' : 'face-man-profile'}
                      size={22}
                      color={COLORS.purple}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>Xác minh khuôn mặt</Text>
                    <Text style={styles.faceStatus}>
                      {faceEnrollment.isLoading
                        ? 'Đang kiểm tra trạng thái...'
                        : faceBusy
                          ? 'Đang cập nhật selfie...'
                          : faceEnrolled
                            ? 'Đã đăng ký khuôn mặt'
                            : 'Chưa đăng ký'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.faceHint}>
                  {faceEnrolled
                    ? 'Bạn đã đủ điều kiện xác minh khi giao nhận.'
                    : 'Bắt buộc để xác minh khi giao nhận đơn.'}
                </Text>
                {!faceEnrolled ? (
                  <View style={styles.faceActions}>
                    <Button
                      mode="contained"
                      icon="camera"
                      buttonColor={COLORS.primary}
                      loading={faceBusy}
                      disabled={faceBusy}
                      onPress={() => handleEnrollFace('camera')}
                      style={styles.faceButton}
                    >
                      {faceBusy ? 'Đang cập nhật...' : 'Đăng ký selfie'}
                    </Button>
                    <Button
                      mode="text"
                      icon="image-outline"
                      textColor={COLORS.onSurfaceVariant}
                      disabled={faceBusy}
                      onPress={() => handleEnrollFace('library')}
                    >
                      Chọn ảnh
                    </Button>
                  </View>
                ) : null}
              </View>
            ) : null}

            {/* Điểm cống hiến */}
            <View style={styles.card}>
              <View style={styles.pointRow}>
                <MaterialCommunityIcons name="medal-outline" size={22} color={COLORS.amber} />
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
                      selectedColor={s.isVerified ? COLORS.teal : COLORS.warning}
                    >
                      {specializationLabel(s.specialization)}
                      {s.isVerified ? '' : ' (chờ duyệt)'}
                    </Chip>
                  ))}
                </View>
              </View>
            ) : null}

            {/* Phương tiện */}
            {hasShipper ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Phương tiện</Text>
                <Divider style={{ marginVertical: 8 }} />
                <Row label="Loại xe" value={vehicleLabel(vol.vehicleType)} />
                <Row label="Biển số" value={vol.vehiclePlate ?? 'Chưa cập nhật'} />
              </View>
            ) : null}
          </>
        ) : null}

        {/* Hành động */}
        {hasKitchenRole ? (
          <Button
            mode={hasShipper ? 'outlined' : 'contained'}
            icon="charity"
            onPress={() => router.push('/(app)/volunteer/campaigns')}
            style={styles.actionBtn}
            buttonColor={hasShipper ? undefined : COLORS.primary}
            textColor={hasShipper ? COLORS.primary : undefined}
          >
            Chiến dịch bếp ăn
          </Button>
        ) : null}
        {hasShipper ? (
          <Button
            mode="contained"
            icon="history"
            onPress={() => router.push('/(app)/volunteer/history')}
            style={styles.actionBtn}
            buttonColor={COLORS.primary}
          >
            Lịch sử giao hàng
          </Button>
        ) : null}
        {hasChef ? (
          <Button
            mode="outlined"
            icon="chef-hat"
            onPress={() => router.push('/(app)/recipes')}
            style={styles.recipesBtn}
            textColor={COLORS.primary}
          >
            Công thức nấu ăn
          </Button>
        ) : null}
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
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.section },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: 32,
    backgroundColor: COLORS.heroBlue,
    ...elevation.card,
  },
  headerInfo: { flex: 1 },
  name: { fontWeight: '900', color: COLORS.onPrimary },
  headerSub: { marginTop: 3, color: COLORS.blueContainer, fontSize: 13, fontWeight: '700' },
  badgeRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  badge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 12, fontWeight: '900' },
  quickStats: {
    marginTop: spacing.md,
    borderRadius: radius.xl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: COLORS.surface,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    ...elevation.card,
  },
  quickStat: { flex: 1 },
  quickStatValue: { color: COLORS.onSurface, fontSize: 20, fontWeight: '900' },
  quickStatLabel: { marginTop: 2, color: COLORS.onSurfaceVariant, fontSize: 11, fontWeight: '800' },
  quickDivider: { width: 1, height: 34, backgroundColor: COLORS.outlineVariant, marginHorizontal: spacing.md },
  errorBox: { alignItems: 'center', marginTop: 24 },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 28,
    padding: spacing.lg,
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    ...elevation.card,
  },
  cardTitle: { fontSize: 16, fontWeight: '900', color: COLORS.onSurface },
  availRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  availTitle: { fontSize: 15, fontWeight: '700', color: COLORS.onSurface },
  availSub: { fontSize: 12, color: COLORS.onSurfaceVariant, marginTop: 2 },
  shiftActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  shiftAction: { flex: 1, borderRadius: radius.lg },
  gpsHint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    marginTop: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: COLORS.surfaceVariant,
    padding: spacing.sm,
  },
  gpsHintText: { flex: 1, color: COLORS.onSurfaceVariant, fontSize: 12, lineHeight: 17, fontWeight: '600' },
  faceHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  faceIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: COLORS.tealContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  faceStatus: { marginTop: 2, fontSize: 13, color: COLORS.onSurfaceVariant, fontWeight: '600' },
  faceHint: { marginTop: 10, fontSize: 13, lineHeight: 18, color: COLORS.onSurfaceVariant },
  faceActions: { marginTop: 12, gap: 8 },
  faceButton: { borderRadius: 12 },
  warnBox: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    padding: 10,
    borderRadius: 12,
    backgroundColor: COLORS.secondaryContainer,
  },
  warnText: { flex: 1, fontSize: 12, color: COLORS.warning, lineHeight: 17 },
  pointRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pointLabel: { flex: 1, fontSize: 15, color: COLORS.onSurface },
  pointValue: { fontSize: 20, fontWeight: '800', color: COLORS.amber },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: COLORS.surfaceContainerLow },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  rowLabel: { color: COLORS.onSurfaceVariant },
  rowValue: { color: COLORS.onSurface, fontWeight: '600' },
  actionBtn: { marginTop: spacing.xl, borderRadius: radius.lg, paddingVertical: 4 },
  recipesBtn: { marginTop: spacing.md, borderRadius: radius.lg, borderColor: COLORS.purple },
  logout: { marginTop: spacing.md, borderRadius: radius.lg, borderColor: COLORS.error },
});
