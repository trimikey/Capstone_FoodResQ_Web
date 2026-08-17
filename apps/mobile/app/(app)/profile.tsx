import { useState } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import {
  Text,
  Button,
  Avatar,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { useEnrollFace, useFaceEnrollment } from '@/hooks/useFaceEnrollment';
import { useMyProfile } from '@/hooks/useProfile';
import { displayRoleLabel, statusDisplay, volunteerRankLabel } from '@/utils/userFormat';
import { AppBackground } from '@/components/ui/AppBackground';
import { AppImage } from '@/components/ui/AppImage';
import { Popup } from '@/components/ui/AppPopup';
import { ScreenState } from '@/components/ui/ScreenState';
import { captureImage, pickImageFromLibrary } from '@/services/faceCapture';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { SurfaceCard } from '@/components/ui/SurfaceCard';
import { mobileColors as COLORS, radius, spacing } from '@/theme/design';

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
  const receiver = profile?.receiver ?? user?.receiver;
  const isCharityOrg = !!receiver?.isCharityOrg;
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
      <AppBackground>
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
          }
        >
        <View style={styles.hero}>
          {avatarUrl ? (
            <AppImage source={{ uri: avatarUrl }} style={styles.avatarImg} />
          ) : (
            <Avatar.Text
              size={84}
              label={(name || email || '?').charAt(0).toUpperCase()}
              style={styles.avatarFallback}
            />
          )}
          <Text variant="titleLarge" style={styles.name} numberOfLines={2}>
            {name}
          </Text>
          {email ? (
            <Text variant="bodyMedium" style={styles.email}>
              {email}
            </Text>
          ) : null}

          <View style={styles.badgeRow}>
            <StatusBadge label={displayRoleLabel(role, isCharityOrg)} tone="info" />
            <View style={[styles.statusBadge, { backgroundColor: sd.bg }]}>
              <Text style={[styles.statusBadgeText, { color: sd.fg }]}>{sd.label}</Text>
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
              <SurfaceCard style={styles.trustCard}>
                <View style={styles.trustRow}>
                  <View style={styles.trustIcon}>
                    <MaterialCommunityIcons name="shield-check" size={22} color={COLORS.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.trustLabel}>Điểm uy tín</Text>
                    <Text style={styles.trustHint}>Dùng cho xác minh, nhận món và giao hàng</Text>
                  </View>
                  <Text style={styles.trustValue}>{trustScore}</Text>
                </View>
              </SurfaceCard>
            ) : null}

            {/* Thống kê đóng góp */}
            {profile?.stats ? (
              <SurfaceCard style={styles.card}>
                <Text style={styles.cardTitle}>Thống kê</Text>
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
              </SurfaceCard>
            ) : null}

            {/* Thông tin tình nguyện viên */}
            {profile?.volunteer ? (
              <SurfaceCard style={styles.card}>
                <Text style={styles.cardTitle}>Tình nguyện viên</Text>
                <Row
                  label="Hạng"
                  value={volunteerRankLabel(profile.volunteer.rank)}
                />
                <Row
                  label="Điểm cống hiến"
                  value={String(profile.volunteer.dedicationPoints)}
                />
              </SurfaceCard>
            ) : null}

            {/* Số điện thoại + địa chỉ theo vai trò */}
            {profile?.phone || profile?.provider?.address || profile?.receiver?.address || receiver?.isCharityOrg ? (
              <SurfaceCard style={styles.card}>
                {profile?.phone ? <Row label="Số điện thoại" value={profile.phone} /> : null}
                {profile?.provider?.address ? (
                  <Row label="Địa chỉ cửa hàng" value={profile.provider.address} />
                ) : null}
                {profile?.receiver?.address ? (
                  <Row label="Điểm giao mặc định" value={profile.receiver.address} />
                ) : null}
                {receiver?.isCharityOrg ? (
                  <Row label="Tên tổ chức" value={receiver.organizationName ?? 'Chưa cập nhật'} />
                ) : null}
              </SurfaceCard>
            ) : null}

            {isReceiver && !isCharityOrg ? (
              <SurfaceCard style={styles.card}>
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
                    ? 'Bạn đã đủ điều kiện xác minh khi nhận hàng. Có thể cập nhật selfie nếu ảnh cũ không còn hiển thị.'
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
                      {faceBusy ? 'Đang cập nhật...' : faceEnrolled ? 'Cập nhật selfie' : 'Đăng ký selfie'}
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
              </SurfaceCard>
            ) : null}

            {isReceiver && !isCharityOrg ? (
              <SurfaceCard style={styles.card}>
                <View style={styles.handoffHead}>
                  <View style={styles.handoffIcon}>
                    <MaterialCommunityIcons name="qrcode-scan" size={22} color={COLORS.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>Nhận suất ăn cộng đồng</Text>
                    <Text style={styles.handoffHint}>
                      Hiển thị mã QR khi nhận suất ăn và phản hồi sau khi được phục vụ.
                    </Text>
                  </View>
                </View>
                <Button
                  mode="contained"
                  icon="qrcode"
                  buttonColor={COLORS.primary}
                  onPress={() => router.push('/(app)/meals/qr' as Href)}
                  style={styles.handoffButton}
                >
                  Mở mã nhận suất ăn
                </Button>
              </SurfaceCard>
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
        <SurfaceCard style={styles.actionCard}>
          <Button
            mode="outlined"
            icon="chef-hat"
            onPress={() => router.push('/(app)/recipes')}
            style={styles.actionBtn}
            textColor={COLORS.primary}
          >
            Công thức nấu ăn
          </Button>
          <Button
            mode="contained"
            icon="account-edit"
            onPress={() => router.push('/(app)/profile/edit')}
            style={styles.actionBtn}
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
            style={[styles.actionBtn, styles.logout]}
            textColor={COLORS.error}
          >
            Đăng xuất
          </Button>
        </SurfaceCard>
        </ScrollView>
      </AppBackground>
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
      <Text style={styles.rowLabel} numberOfLines={2}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={3}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.section },
  hero: {
    alignItems: 'center',
    gap: 4,
    borderRadius: 30,
    padding: spacing.xxl,
    backgroundColor: COLORS.primaryStrong,
  },
  avatarImg: { width: 88, height: 88, borderRadius: 44, borderWidth: 3, borderColor: COLORS.surface },
  avatarFallback: { backgroundColor: COLORS.surface },
  name: { fontWeight: '900', marginTop: 10, color: COLORS.onPrimary, textAlign: 'center' },
  email: { color: COLORS.secondaryContainer },
  badgeRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999 },
  statusBadgeText: { fontSize: 12, fontWeight: '800' },
  errorBox: { alignItems: 'center', marginTop: 24 },
  card: {
    padding: spacing.lg,
    marginTop: spacing.lg,
  },
  cardTitle: { fontSize: 16, fontWeight: '900', color: COLORS.onSurface, marginBottom: spacing.md },
  trustCard: { marginTop: spacing.lg, padding: spacing.lg },
  trustRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  trustIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primaryContainer,
  },
  trustLabel: { fontSize: 15, fontWeight: '900', color: COLORS.onSurface },
  trustHint: { marginTop: 2, fontSize: 12, color: COLORS.onSurfaceVariant },
  trustValue: { fontSize: 24, fontWeight: '900', color: COLORS.primary },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  statItem: {
    width: '48%',
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    alignItems: 'center',
    backgroundColor: COLORS.surfaceContainerLow,
  },
  statValue: { fontSize: 20, fontWeight: '900', color: COLORS.onSurface },
  statLabel: { fontSize: 12, color: COLORS.onSurfaceVariant, marginTop: 2, fontWeight: '700' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.outlineVariant,
  },
  rowLabel: { flex: 1, fontSize: 14, color: COLORS.onSurfaceVariant },
  rowValue: { flex: 1.5, fontSize: 14, color: COLORS.onSurface, fontWeight: '600', textAlign: 'right' },
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
    backgroundColor: COLORS.errorContainer,
    borderColor: COLORS.error,
  },
  faceFeedbackText: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  faceFeedbackTextInfo: { color: COLORS.onSurfaceVariant },
  faceFeedbackTextSuccess: { color: COLORS.primary },
  faceFeedbackTextError: { color: COLORS.error },
  faceActions: { marginTop: 12, gap: 8 },
  faceButton: { borderRadius: 12 },
  handoffHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  handoffIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: COLORS.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handoffHint: { marginTop: 2, fontSize: 13, lineHeight: 18, color: COLORS.onSurfaceVariant },
  handoffButton: { marginTop: 12, borderRadius: 12 },
  reportsBtn: { marginTop: 24, borderRadius: 12, borderColor: COLORS.primary },
  actionCard: { marginTop: spacing.xl, padding: spacing.md, gap: spacing.sm },
  actionBtn: { borderRadius: radius.md, paddingVertical: 3 },
  logout: { marginTop: 12, borderRadius: 12, borderColor: COLORS.error },
});
