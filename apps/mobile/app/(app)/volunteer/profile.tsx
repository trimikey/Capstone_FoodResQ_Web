import { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, Pressable } from 'react-native';
import {
  Text,
  Button,
  Avatar,
  ActivityIndicator,
  Dialog,
  Divider,
  Portal,
  Switch,
  Chip,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { useEnrollFace, useFaceEnrollment } from '@/hooks/useFaceEnrollment';
import { useVolunteerMe, useSetAvailability } from '@/hooks/useVolunteer';
import { volunteerRankLabel } from '@/utils/userFormat';
import { captureImage, pickImageFromLibrary } from '@/services/faceCapture';
import { getCurrentCoords } from '@/services/geolocation';
import { Popup, Toast } from '@/components/ui/AppPopup';
import { AppBackground } from '@/components/ui/AppBackground';
import { AppImage } from '@/components/ui/AppImage';
import { ScreenState } from '@/components/ui/ScreenState';
import { notifyError, notifySuccess, notifyWarning, selectionFeedback } from '@/services/haptics';
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

/**
 * Hồ sơ Tình nguyện viên (tab "Hồ sơ") — hạng, điểm cống hiến, đánh giá,
 * chuyên môn và các lối tắt đúng theo chuyên môn đã xác minh.
 */
export default function VolunteerProfileScreen() {
  const { user, logout, isLoading: authLoading } = useAuth();
  const { data: vol, isLoading, isError, refetch, isRefetching } = useVolunteerMe();
  const faceEnrollment = useFaceEnrollment();
  const refetchFaceEnrollment = faceEnrollment.refetch;
  const refetchVolunteerRef = useRef(refetch);
  const refetchFaceEnrollmentRef = useRef(refetchFaceEnrollment);
  const enrollFace = useEnrollFace();
  const setAvailability = useSetAvailability();
  const [toggling, setToggling] = useState(false);
  const [facePromptVisible, setFacePromptVisible] = useState(false);
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    refetchVolunteerRef.current = refetch;
    refetchFaceEnrollmentRef.current = refetchFaceEnrollment;
  }, [refetch, refetchFaceEnrollment]);

  useFocusEffect(
    useCallback(() => {
      void Promise.all([
        refetchVolunteerRef.current(),
        refetchFaceEnrollmentRef.current(),
      ]);
    }, [])
  );

  const handleEnrollFace = async (mode: 'camera' | 'library') => {
    try {
      const img = mode === 'camera' ? await captureImage('face') : await pickImageFromLibrary();
      if (!img) return;
      await enrollFace.mutateAsync({ selfie: img });
      await Promise.all([refetchFaceEnrollment(), refetch()]);
      setFacePromptVisible(false);
      void notifySuccess();
      Toast.show({
        type: 'success',
        text1: 'Đã cập nhật khuôn mặt',
        text2: 'Bạn có thể bật sẵn sàng nhận đơn ngay bây giờ.',
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

  const isFaceNotEnrolledError = (e: any) => {
    const code = e?.response?.data?.error?.code;
    const message = e?.response?.data?.error?.message ?? e?.message ?? '';
    return code === 'FACE_NOT_ENROLLED' || String(message).includes('FACE_NOT_ENROLLED');
  };

  const handleToggle = async (next: boolean) => {
    void selectionFeedback();
    setToggling(true);
    try {
      if (next) {
        const { coords, isFallback } = await getCurrentCoords();
        if (!coords) {
          void notifyWarning();
          Toast.show({
            type: 'warning',
            text1: 'Chưa lấy được vị trí hiện tại',
            text2: 'Hãy bật quyền định vị và thử lại để nhận đơn gần vị trí thật của bạn.',
          });
          return;
        }
        await setAvailability.mutateAsync({ isAvailable: true, lng: coords.lng, lat: coords.lat });
        void (isFallback ? notifyWarning() : notifySuccess());
        Toast.show({
          type: isFallback ? 'warning' : 'success',
          text1: 'Đã bật sẵn sàng nhận đơn',
          text2: isFallback
            ? 'Vị trí hiện tại chưa ổn định. Hãy kiểm tra GPS nếu lời mời chưa chính xác.'
            : 'Bạn sẽ nhận được lời mời giao hàng gần vị trí hiện tại.',
        });
      } else {
        await setAvailability.mutateAsync({ isAvailable: false });
        void notifySuccess();
        Toast.show({ type: 'info', text1: 'Đã tắt nhận đơn' });
      }
    } catch (e: any) {
      void notifyError();
      if (isFaceNotEnrolledError(e)) {
        setFacePromptVisible(true);
        return;
      }
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
  const avatarUrl = user?.avatarUrl?.trim() ?? '';
  const showAvatarImage = avatarUrl.length > 0 && failedAvatarUrl !== avatarUrl;
  const busy = toggling || setAvailability.isPending;
  const faceBusy = enrollFace.isPending;
  const faceEnrolled = faceEnrollment.data?.enrolled === true;
  const avgRatingLabel = formatDecimal(vol?.avgRating);
  const verifiedSpecs = vol?.specializations.filter((s) => s.isVerified).map((s) => s.specialization) ?? [];
  const hasChef = verifiedSpecs.includes('chef');
  const hasWaiter = verifiedSpecs.includes('waiter');
  const hasShipper = verifiedSpecs.includes('shipper');
  const hasKitchenRole = hasChef || hasWaiter || hasShipper;
  const primaryRoleLabel = vol ? primarySpecializationLabel(vol.specializations) : 'Chuyên môn';
  const headerStatus = hasShipper
    ? vol?.isAvailable
      ? 'Đang online nhận đơn giao hàng'
      : 'Đang tắt nhận đơn giao hàng'
    : hasChef
      ? 'Sẵn sàng tham gia ca bếp'
      : hasWaiter
        ? 'Sẵn sàng tham gia ca phục vụ'
        : 'Hồ sơ tình nguyện viên';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <AppBackground>
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
        >
        {/* Header: avatar + tên + hạng */}
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Chỉnh sửa ảnh đại diện"
            onPress={() => router.push('/(app)/profile/edit')}
            style={styles.avatarShell}
          >
            {showAvatarImage ? (
              <AppImage
                source={{ uri: avatarUrl }}
                style={styles.avatarImage}
                onError={() => setFailedAvatarUrl(avatarUrl)}
              />
            ) : (
              <Avatar.Text
                size={84}
                label={(name.trim().charAt(0) || '?').toUpperCase()}
                color={COLORS.onPrimary}
                labelStyle={styles.avatarLabel}
                style={styles.avatarFallback}
              />
            )}
            <View style={styles.avatarEdit}>
              <MaterialCommunityIcons name="pencil" size={14} color={COLORS.primary} />
            </View>
          </Pressable>
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

            {/* Công tắc sẵn sàng nhận đơn */}
            {hasShipper ? (
              <View style={styles.card}>
                <View style={styles.availRow}>
                  <MaterialCommunityIcons
                    name={vol.isAvailable ? 'motorbike' : 'sleep'}
                    size={24}
                    color={vol.isAvailable ? COLORS.teal : COLORS.onSurfaceVariant}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.availTitle}>Sẵn sàng nhận đơn</Text>
                    <Text style={styles.availSub}>
                      {vol.isAvailable
                        ? 'Đang bật - nhận lời mời giao hàng gần bạn'
                        : 'Đang tắt - không nhận lời mời mới'}
                    </Text>
                  </View>
                  {busy ? (
                    <ActivityIndicator color={COLORS.primary} />
                  ) : (
                    <Switch
                      value={vol.isAvailable}
                      onValueChange={handleToggle}
                      color={COLORS.blue}
                    />
                  )}
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
                    : 'Bắt buộc để bật sẵn sàng nhận đơn và xác minh khi giao nhận.'}
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
      </AppBackground>
      <FaceEnrollmentPrompt
        visible={facePromptVisible}
        busy={faceBusy}
        onDismiss={() => setFacePromptVisible(false)}
        onEnroll={handleEnrollFace}
      />
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

function FaceEnrollmentPrompt({
  visible,
  busy,
  onDismiss,
  onEnroll,
}: {
  visible: boolean;
  busy: boolean;
  onDismiss: () => void;
  onEnroll: (mode: 'camera' | 'library') => void;
}) {
  return (
    <Portal>
      <Dialog visible={visible} onDismiss={busy ? undefined : onDismiss} style={styles.faceDialog}>
        <Dialog.Content style={styles.faceDialogContent}>
          <View style={styles.faceDialogIcon}>
            <MaterialCommunityIcons name="shield-account-outline" size={34} color={COLORS.purple} />
          </View>
          <Text style={styles.faceDialogTitle}>Cần cập nhật khuôn mặt</Text>
          <Text style={styles.faceDialogText}>
            Bạn cần đăng ký khuôn mặt trước khi bật sẵn sàng nhận đơn. Thông tin này dùng để xác minh khi giao nhận.
          </Text>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onDismiss} textColor={COLORS.onSurfaceVariant} disabled={busy}>
            Để sau
          </Button>
          <Button
            mode="contained"
            icon={busy ? undefined : 'camera'}
            buttonColor={COLORS.primary}
            onPress={() => onEnroll('camera')}
            disabled={busy}
            style={styles.faceDialogPrimary}
          >
            {busy ? <ActivityIndicator color="#ffffff" size={16} /> : 'Cập nhật ngay'}
          </Button>
          <Button
            icon="image-outline"
            onPress={() => onEnroll('library')}
            textColor={COLORS.purple}
            disabled={busy}
          >
            Chọn ảnh
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
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
  avatarShell: {
    width: 84,
    height: 84,
    borderRadius: 42,
  },
  avatarImage: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: COLORS.teal,
  },
  avatarFallback: { backgroundColor: COLORS.teal },
  avatarLabel: { color: COLORS.onPrimary, fontSize: 30, fontWeight: '900' },
  avatarEdit: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.heroBlue,
  },
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
  faceDialog: { borderRadius: 24, backgroundColor: COLORS.surface },
  faceDialogContent: { alignItems: 'center', paddingTop: 8 },
  faceDialogIcon: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.purpleContainer,
    marginBottom: 12,
  },
  faceDialogTitle: { fontSize: 18, fontWeight: '800', color: COLORS.onSurface, textAlign: 'center' },
  faceDialogText: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.onSurfaceVariant,
    textAlign: 'center',
  },
  faceDialogPrimary: { borderRadius: 12 },
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
