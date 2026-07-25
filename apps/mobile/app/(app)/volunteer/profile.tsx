import { useCallback, useState } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl } from 'react-native';
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
import { ScreenState } from '@/components/ui/ScreenState';
import { notifyError, notifySuccess, notifyWarning, selectionFeedback } from '@/services/haptics';
import { mobileColors as COLORS } from '@/theme/design';

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

function formatDecimal(value: unknown): string | null {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(1) : null;
}

/**
 * Hồ sơ Tình nguyện viên (tab "Hồ sơ") — hạng, điểm cống hiến, đánh giá,
 * chuyên môn, phương tiện + công tắc "Sẵn sàng nhận đơn" (kèm vị trí từ
 * expo-location). Lối tắt sang Lịch sử giao hàng + đăng xuất.
 */
export default function VolunteerProfileScreen() {
  const { user, logout, isLoading: authLoading } = useAuth();
  const { data: vol, isLoading, isError, refetch, isRefetching } = useVolunteerMe();
  const faceEnrollment = useFaceEnrollment();
  const refetchFaceEnrollment = faceEnrollment.refetch;
  const enrollFace = useEnrollFace();
  const setAvailability = useSetAvailability();
  const [toggling, setToggling] = useState(false);
  const [facePromptVisible, setFacePromptVisible] = useState(false);

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
        await setAvailability.mutateAsync({ isAvailable: true, lng: coords.lng, lat: coords.lat });
        void (isFallback ? notifyWarning() : notifySuccess());
        Toast.show({
          type: isFallback ? 'warning' : 'success',
          text1: 'Đã bật sẵn sàng nhận đơn',
          text2: isFallback
            ? 'Không lấy được vị trí thật, đang dùng vị trí mặc định. Hãy bật định vị để nhận đơn gần bạn.'
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
  const busy = toggling || setAvailability.isPending;
  const faceBusy = enrollFace.isPending;
  const faceEnrolled = faceEnrollment.data?.enrolled === true;
  const avgRatingLabel = formatDecimal(vol?.avgRating);

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
              <View style={[styles.badge, { backgroundColor: COLORS.primaryContainer }]}>
                <Text style={[styles.badgeText, { color: COLORS.primary }]}>
                  Hạng {volunteerRankLabel(vol.rank)}
                </Text>
              </View>
              {avgRatingLabel ? (
                <View style={[styles.badge, { backgroundColor: COLORS.secondaryContainer }]}>
                  <Text style={[styles.badgeText, { color: COLORS.warning }]}>
                    ★ {avgRatingLabel}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>

        {isLoading && !vol ? (
          <ScreenState kind="loading" title="Đang tải hồ sơ" />
        ) : isError && !vol ? (
          <ScreenState kind="error" title="Không tải được hồ sơ" actionLabel="Thử lại" onAction={() => refetch()} />
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
                    color={COLORS.primary}
                  />
                )}
              </View>
              {!vol.isShipper ? (
                <View style={styles.warnBox}>
                  <MaterialCommunityIcons name="alert" size={18} color={COLORS.warning} />
                  <Text style={styles.warnText}>
                    Chuyên môn &quot;Giao hàng&quot; của bạn chưa được xác minh. Bạn có thể chưa nhận được
                    lời mời cho đến khi quản trị viên duyệt.
                  </Text>
                </View>
              ) : null}
            </View>

            {/* Xác minh khuôn mặt */}
            <View style={styles.card}>
              <View style={styles.faceHead}>
                <View style={styles.faceIcon}>
                  <MaterialCommunityIcons
                    name={faceEnrolled ? 'check-decagram' : 'face-man-profile'}
                    size={22}
                    color={COLORS.primary}
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
          icon="chef-hat"
          onPress={() => router.push('/(app)/recipes')}
          style={styles.recipesBtn}
          textColor={COLORS.primary}
        >
          Công thức nấu ăn
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
            <MaterialCommunityIcons name="shield-account-outline" size={34} color={COLORS.primary} />
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
            textColor={COLORS.primary}
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
  faceHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  faceIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: COLORS.primaryContainer,
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
    backgroundColor: COLORS.primaryContainer,
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
  pointValue: { fontSize: 20, fontWeight: '800', color: COLORS.primary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: COLORS.surfaceContainerLow },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  rowLabel: { color: COLORS.onSurfaceVariant },
  rowValue: { color: COLORS.onSurface, fontWeight: '600' },
  actionBtn: { marginTop: 24, borderRadius: 12, paddingVertical: 4 },
  recipesBtn: { marginTop: 12, borderRadius: 12, borderColor: COLORS.primary },
  logout: { marginTop: 12, borderRadius: 12, borderColor: COLORS.error },
});
