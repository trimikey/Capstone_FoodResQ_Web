import { useState } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import {
  Text,
  Button,
  Avatar,
  Divider,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { useEnrollFace, useFaceEnrollment } from '@/hooks/useFaceEnrollment';
import { useMyProfile } from '@/hooks/useProfile';
import { roleLabel, statusDisplay, volunteerRankLabel } from '@/utils/userFormat';
import { AppImage } from '@/components/ui/AppImage';
import { Popup } from '@/components/ui/AppPopup';
import { ScreenState } from '@/components/ui/ScreenState';
import { captureImage, pickImageFromLibrary } from '@/services/faceCapture';
import { mobileColors as COLORS } from '@/theme/design';

type FaceFeedback = {
  type: 'info' | 'success' | 'error';
  message: string;
};

function formatDecimal(value: unknown, fallback = '-'): string {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(1) : fallback;
}

function formatCount(value: unknown): string {
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : '0';
}

function getFaceFeedbackStyle(type: FaceFeedback['type']) {
  if (type === 'success') return styles.faceFeedbackSuccess;
  if (type === 'error') return styles.faceFeedbackError;
  return styles.faceFeedbackInfo;
}

function getFaceFeedbackTextStyle(type: FaceFeedback['type']) {
  if (type === 'success') return styles.faceFeedbackTextSuccess;
  if (type === 'error') return styles.faceFeedbackTextError;
  return styles.faceFeedbackTextInfo;
}

/**
 * Tài khoản (Luồng 4) — hiển thị hồ sơ đầy đủ từ GET /users/me:
 * avatar, vai trò, trạng thái xác minh, điểm uy tín, thống kê đóng góp.
 * Nút "Chỉnh sửa hồ sơ" mở màn /profile/edit. Logout đã nối; sau khi
 * logout, auth guard ở (app)/_layout tự redirect về /sign-in.
 */
export default function ProfileTab() {
  const { user, logout, isLoading: authLoading } = useAuth();
  const { data: profile, isLoading, isError, refetch, isRefetching } =
    useMyProfile();
  const faceEnrollment = useFaceEnrollment();
  const enrollFace = useEnrollFace();
  const [enrolling, setEnrolling] = useState(false);
  const [faceFeedback, setFaceFeedback] = useState<FaceFeedback | null>(null);
  const [confirmedFaceEnrollment, setConfirmedFaceEnrollment] = useState(false);

  // Ưu tiên dữ liệu /users/me; fallback về user trong store khi đang tải lần đầu.
  const name = profile?.fullName ?? user?.name ?? 'Người dùng';
  const email = profile?.email ?? user?.email ?? '';
  const role = profile?.role ?? user?.role;
  const status = profile?.status ?? user?.status;
  const avatarUrl = profile?.avatarUrl ?? user?.avatarUrl;
  const trustScore = profile?.trustScore ?? user?.trustScore;
  const sd = statusDisplay(status);
  const isReceiver = role === 'receiver';
  const faceBusy = enrolling || enrollFace.isPending;
  const faceEnrolled = confirmedFaceEnrollment || faceEnrollment.data?.enrolled === true;

  const handleEnrollFace = async (source: 'camera' | 'library') => {
    try {
      setEnrolling(true);
      setFaceFeedback({
        type: 'info',
        message: source === 'camera' ? 'Đang mở camera để chụp selfie...' : 'Đang mở thư viện ảnh...',
      });
      const photo = source === 'camera' ? await captureImage('face') : await pickImageFromLibrary();
      if (!photo) {
        setFaceFeedback({
          type: 'info',
          message: source === 'camera' ? 'Bạn đã huỷ chụp selfie.' : 'Bạn chưa chọn ảnh nào.',
        });
        return;
      }
      setFaceFeedback({ type: 'info', message: 'Đang tải ảnh selfie lên hệ thống...' });
      const result = await enrollFace.mutateAsync({ selfie: photo });
      if (!result?.enrolled) {
        throw new Error(result?.message ?? 'Hệ thống chưa xác nhận đăng ký khuôn mặt.');
      }
      setConfirmedFaceEnrollment(true);
      setFaceFeedback({
        type: 'success',
        message: 'Cập nhật khuôn mặt thành công. Hệ thống đã tải lại trạng thái xác minh mới nhất.',
      });
      await Promise.all([faceEnrollment.refetch(), refetch()]);
      Popup.show({
        type: 'success',
        text1: 'Cập nhật khuôn mặt thành công',
        text2: 'Trạng thái xác minh đã được làm mới.',
      });
    } catch (e: unknown) {
      const message =
        typeof e === 'object' && e && 'response' in e
          ? (e as { response?: { data?: { error?: { message?: string } } }; message?: string }).response?.data?.error?.message ??
            (e as { message?: string }).message
          : e instanceof Error
            ? e.message
            : undefined;
      setFaceFeedback({
        type: 'error',
        message: message ?? 'Không thể đăng ký khuôn mặt. Vui lòng thử lại.',
      });
      Popup.show({
        type: 'error',
        text1: 'Đăng ký khuôn mặt thất bại',
        text2: message ?? 'Vui lòng thử lại.',
      });
    } finally {
      setEnrolling(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
        }
      >
        {/* Header: avatar + tên + email */}
        <View style={styles.header}>
          {avatarUrl ? (
            <AppImage source={{ uri: avatarUrl }} style={styles.avatarImg} />
          ) : (
            <Avatar.Text
              size={84}
              label={(name || email || '?').charAt(0).toUpperCase()}
              style={{ backgroundColor: COLORS.primary }}
            />
          )}
          <Text variant="titleLarge" style={styles.name}>
            {name}
          </Text>
          {email ? (
            <Text variant="bodyMedium" style={styles.email}>
              {email}
            </Text>
          ) : null}

          {/* Badge vai trò + trạng thái */}
          <View style={styles.badgeRow}>
            <View style={[styles.badge, { backgroundColor: COLORS.primaryContainer }]}>
              <Text style={[styles.badgeText, { color: COLORS.primary }]}>
                {roleLabel(role)}
              </Text>
            </View>
            <View style={[styles.badge, { backgroundColor: sd.bg }]}>
              <Text style={[styles.badgeText, { color: sd.fg }]}>{sd.label}</Text>
            </View>
          </View>
        </View>

        {isLoading && !profile ? (
          <ScreenState kind="loading" title="Đang tải hồ sơ" />
        ) : isError && !profile ? (
          <ScreenState kind="error" title="Không tải được hồ sơ" actionLabel="Thử lại" onAction={() => refetch()} />
        ) : (
          <>
            {/* Điểm uy tín */}
            {typeof trustScore === 'number' ? (
              <View style={styles.card}>
                <View style={styles.trustRow}>
                  <MaterialCommunityIcons
                    name="shield-check"
                    size={22}
                    color={COLORS.primary}
                  />
                  <Text style={styles.trustLabel}>Điểm uy tín</Text>
                  <Text style={styles.trustValue}>{trustScore}</Text>
                </View>
              </View>
            ) : null}

            {/* Thống kê đóng góp */}
            {profile?.stats ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Thống kê</Text>
                <Divider style={{ marginVertical: 8 }} />
                <View style={styles.statsGrid}>
                  <Stat
                    label="Kg đã cứu"
                    value={formatDecimal(profile.stats.kgSaved, '0.0')}
                  />
                  <Stat
                    label="Hoàn thành"
                    value={formatCount(profile.stats.completedCount)}
                  />
                  <Stat
                    label="Đã huỷ"
                    value={formatCount(profile.stats.cancelledCount)}
                  />
                  <Stat
                    label="NCC đã giúp"
                    value={formatCount(profile.stats.providersHelped)}
                  />
                </View>
              </View>
            ) : null}

            {/* Thông tin tình nguyện viên */}
            {profile?.volunteer ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Tình nguyện viên</Text>
                <Divider style={{ marginVertical: 8 }} />
                <Row
                  label="Hạng"
                  value={volunteerRankLabel(profile.volunteer.rank)}
                />
                <Row
                  label="Điểm cống hiến"
                  value={String(profile.volunteer.dedicationPoints)}
                />
              </View>
            ) : null}

            {/* Số điện thoại + địa chỉ theo vai trò */}
            {profile?.phone || profile?.provider?.address || profile?.receiver?.address ? (
              <View style={styles.card}>
                {profile?.phone ? <Row label="Số điện thoại" value={profile.phone} /> : null}
                {profile?.provider?.address ? (
                  <Row label="Địa chỉ cửa hàng" value={profile.provider.address} />
                ) : null}
                {profile?.receiver?.address ? (
                  <Row label="Điểm giao mặc định" value={profile.receiver.address} />
                ) : null}
              </View>
            ) : null}

            {isReceiver ? (
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
                    ? 'Bạn đã đủ điều kiện xác minh khi nhận hàng.'
                    : 'Dùng để đối chiếu khi bạn nhận hàng bằng QR hoặc cần tự xác minh đơn.'}
                </Text>
                {faceFeedback ? (
                  <View style={[styles.faceFeedback, getFaceFeedbackStyle(faceFeedback.type)]}>
                    <MaterialCommunityIcons
                      name={
                        faceFeedback.type === 'success'
                          ? 'check-circle-outline'
                          : faceFeedback.type === 'error'
                            ? 'alert-circle-outline'
                            : 'progress-upload'
                      }
                      size={18}
                      color={
                        faceFeedback.type === 'success'
                          ? COLORS.primary
                          : faceFeedback.type === 'error'
                            ? COLORS.error
                            : COLORS.onSurfaceVariant
                      }
                    />
                    <Text style={[styles.faceFeedbackText, getFaceFeedbackTextStyle(faceFeedback.type)]}>
                      {faceFeedback.message}
                    </Text>
                  </View>
                ) : null}
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
          </>
        )}

        {/* Hành động */}
        {isReceiver ? (
          <Button
            mode="outlined"
            icon="flag-outline"
            onPress={() => router.push('/reports' as Href)}
            style={styles.reportsBtn}
            textColor={COLORS.primary}
          >
            Báo cáo của tôi
          </Button>
        ) : null}
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
          mode="contained"
          icon="account-edit"
          onPress={() => router.push('/(app)/profile/edit')}
          style={styles.editBtn}
          buttonColor={COLORS.primary}
        >
          Chỉnh sửa hồ sơ
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statItem}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
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
  avatarImg: { width: 84, height: 84, borderRadius: 42 },
  name: { fontWeight: '700', marginTop: 10, color: COLORS.onSurface },
  email: { color: COLORS.onSurfaceVariant },
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
  trustRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  trustLabel: { flex: 1, fontSize: 15, color: COLORS.onSurface },
  trustValue: { fontSize: 20, fontWeight: '800', color: COLORS.primary },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  statItem: { width: '50%', paddingVertical: 8, alignItems: 'center' },
  statValue: { fontSize: 20, fontWeight: '800', color: COLORS.onSurface },
  statLabel: { fontSize: 12, color: COLORS.onSurfaceVariant, marginTop: 2 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  rowLabel: { color: COLORS.onSurfaceVariant },
  rowValue: { color: COLORS.onSurface, fontWeight: '600' },
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
  faceFeedback: {
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  faceFeedbackInfo: {
    backgroundColor: COLORS.surfaceContainerLow,
    borderColor: COLORS.outline,
  },
  faceFeedbackSuccess: {
    backgroundColor: COLORS.primaryContainer,
    borderColor: COLORS.primary,
  },
  faceFeedbackError: {
    backgroundColor: '#fef2f2',
    borderColor: COLORS.error,
  },
  faceFeedbackText: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  faceFeedbackTextInfo: { color: COLORS.onSurfaceVariant },
  faceFeedbackTextSuccess: { color: COLORS.primary },
  faceFeedbackTextError: { color: COLORS.error },
  faceActions: { marginTop: 12, gap: 8 },
  faceButton: { borderRadius: 12 },
  reportsBtn: { marginTop: 24, borderRadius: 12, borderColor: COLORS.primary },
  recipesBtn: { marginTop: 12, borderRadius: 12, borderColor: COLORS.primary },
  editBtn: { marginTop: 12, borderRadius: 12, paddingVertical: 4 },
  logout: { marginTop: 12, borderRadius: 12, borderColor: COLORS.error },
});
