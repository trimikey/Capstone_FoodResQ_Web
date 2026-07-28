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
import { CharityOrgBadge, charityVerificationMeta } from '@/components/ui/CharityOrgBadge';
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
  const isCharityOrg = isReceiver && !!profile?.receiver?.isCharityOrg;
  const organizationName = profile?.receiver?.organizationName?.trim();
  const receiverVerificationStatus = profile?.receiver?.verificationStatus ?? null;
  const charityMeta = charityVerificationMeta(receiverVerificationStatus, status);
  const displayName = isCharityOrg ? organizationName || name : name;
  const displayRoleLabel = isCharityOrg ? 'Tổ chức từ thiện' : roleLabel(role);
  const faceBusy = enrolling || enrollFace.isPending;
  const faceEnrolled = confirmedFaceEnrollment || faceEnrollment.data?.enrolled === true;
  const contactRows = [
    email ? { icon: 'email-outline', label: 'Email', value: email } : null,
    profile?.phone ? { icon: 'phone-outline', label: 'Số điện thoại', value: profile.phone } : null,
    !isCharityOrg && profile?.provider?.address
      ? { icon: 'store-marker-outline', label: 'Địa chỉ cửa hàng', value: profile.provider.address }
      : null,
    !isCharityOrg && profile?.receiver?.address
      ? { icon: 'map-marker-radius-outline', label: 'Điểm giao mặc định', value: profile.receiver.address }
      : null,
  ].filter(Boolean) as { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; value: string }[];

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
              label={(displayName || email || '?').charAt(0).toUpperCase()}
              style={{ backgroundColor: COLORS.primary }}
            />
          )}
          <Text variant="titleLarge" style={styles.name}>
            {displayName}
          </Text>
          {isCharityOrg && organizationName && organizationName !== name ? (
            <Text variant="bodySmall" style={styles.orgOwner} numberOfLines={1}>
              Quản lý bởi {name}
            </Text>
          ) : null}
          {email ? (
            <Text variant="bodyMedium" style={styles.email}>
              {email}
            </Text>
          ) : null}

          {/* Badge vai trò + trạng thái */}
          <View style={styles.badgeRow}>
            <View style={[styles.badge, { backgroundColor: COLORS.primaryContainer }]}>
              <Text style={[styles.badgeText, { color: COLORS.primary }]}>
                {displayRoleLabel}
              </Text>
            </View>
            <View style={[styles.badge, { backgroundColor: sd.bg }]}>
              <Text style={[styles.badgeText, { color: sd.fg }]}>{sd.label}</Text>
            </View>
          </View>
          <CharityOrgBadge
            isCharityOrg={isCharityOrg}
            organizationName={organizationName}
            verificationStatus={receiverVerificationStatus}
            accountStatus={status}
          />
        </View>

        {isLoading && !profile ? (
          <ScreenState kind="loading" title="Đang tải hồ sơ" />
        ) : isError && !profile ? (
          <ScreenState kind="error" title="Không tải được hồ sơ" actionLabel="Thử lại" onAction={() => refetch()} />
        ) : (
          <>
            {isCharityOrg ? (
              <View style={styles.charityPanel}>
                <View style={styles.charityPanelTop}>
                  <View style={[styles.charityIcon, { backgroundColor: charityMeta.bg }]}>
                    <MaterialCommunityIcons name={charityMeta.icon} size={24} color={charityMeta.fg} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.charityTitle}>Hồ sơ tổ chức</Text>
                    <Text style={styles.charitySubtitle}>
                      {organizationName
                        ? 'Thông tin dùng cho chiến dịch bếp ăn cộng đồng.'
                        : 'Cần cập nhật tên tổ chức để hồ sơ rõ ràng hơn.'}
                    </Text>
                  </View>
                </View>
                <View style={styles.charityMetrics}>
                  <ImpactMetric icon="pot-steam-outline" label="Chiến dịch" value={formatCount(profile?.stats?.completedCount)} />
                  <ImpactMetric icon="scale-balance" label="Kg đã cứu" value={formatDecimal(profile?.stats?.kgSaved, '0.0')} />
                  <ImpactMetric icon="handshake-outline" label="NCC hỗ trợ" value={formatCount(profile?.stats?.providersHelped)} />
                </View>
              </View>
            ) : null}

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

            {/* Thông tin liên hệ */}
            {contactRows.length > 0 ? (
              <View style={styles.contactCard}>
                <View style={styles.sectionHead}>
                  <MaterialCommunityIcons name="card-account-phone-outline" size={21} color={COLORS.primary} />
                  <Text style={styles.cardTitle}>Thông tin liên hệ</Text>
                </View>
                <View style={styles.contactList}>
                  {contactRows.map((item) => (
                    <ContactRow key={item.label} icon={item.icon} label={item.label} value={item.value} />
                  ))}
                </View>
              </View>
            ) : null}

            {isCharityOrg ? (
              <View style={styles.card}>
                <View style={styles.sectionHead}>
                  <MaterialCommunityIcons name="map-marker-radius-outline" size={21} color={COLORS.primary} />
                  <Text style={styles.cardTitle}>Địa điểm hoạt động</Text>
                </View>
                <Text style={styles.emptyText}>
                  {profile?.receiver?.address
                    ? profile.receiver.address
                    : 'Chưa có điểm giao mặc định. Cập nhật địa chỉ để NCC và TNV phối hợp chính xác hơn.'}
                </Text>
              </View>
            ) : null}

            {isCharityOrg ? (
              <View style={styles.card}>
                <View style={styles.sectionHead}>
                  <MaterialCommunityIcons name="clipboard-text-outline" size={21} color={COLORS.primary} />
                  <Text style={styles.cardTitle}>Quản lý chiến dịch</Text>
                </View>
                <Text style={styles.emptyText}>
                  Mở bộ công cụ bếp ăn để tạo chiến dịch, theo dõi TNV, xác nhận quyên góp và cập nhật tiến độ.
                </Text>
                <Button
                  mode="contained"
                  icon="pot-steam-outline"
                  buttonColor={COLORS.primary}
                  style={styles.shortcutBtn}
                  onPress={() => router.push('/(app)/charity/campaigns')}
                >
                  Mở bếp ăn của tôi
                </Button>
              </View>
            ) : null}

            {isReceiver && !isCharityOrg ? (
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
        {isReceiver && !isCharityOrg ? (
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

function ImpactMetric({ icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <View style={styles.impactItem}>
      <MaterialCommunityIcons name={icon} size={18} color={COLORS.primary} />
      <Text style={styles.impactValue}>{value}</Text>
      <Text style={styles.impactLabel}>{label}</Text>
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

function ContactRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.contactRow}>
      <View style={styles.contactIcon}>
        <MaterialCommunityIcons name={icon} size={18} color={COLORS.primary} />
      </View>
      <View style={styles.contactText}>
        <Text style={styles.contactLabel}>{label}</Text>
        <Text style={styles.contactValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32 },
  header: { alignItems: 'center', gap: 4 },
  avatarImg: { width: 84, height: 84, borderRadius: 42 },
  name: { fontWeight: '700', marginTop: 10, color: COLORS.onSurface },
  orgOwner: { color: COLORS.onSurfaceVariant, maxWidth: '100%' },
  email: { color: COLORS.onSurfaceVariant },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 10 },
  badge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 12, fontWeight: '600' },
  errorBox: { alignItems: 'center', marginTop: 24 },
  charityPanel: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 16,
    marginTop: 18,
    borderWidth: 1,
    borderColor: COLORS.outline,
  },
  charityPanelTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  charityIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  charityTitle: { fontSize: 17, fontWeight: '800', color: COLORS.onSurface },
  charitySubtitle: { marginTop: 2, fontSize: 13, lineHeight: 18, color: COLORS.onSurfaceVariant },
  charityMetrics: { flexDirection: 'row', gap: 8, marginTop: 14 },
  impactItem: {
    flex: 1,
    minHeight: 86,
    borderRadius: 14,
    backgroundColor: COLORS.surfaceContainerLow,
    borderWidth: 1,
    borderColor: COLORS.outline,
    padding: 10,
    justifyContent: 'center',
  },
  impactValue: { marginTop: 4, fontSize: 18, fontWeight: '900', color: COLORS.onSurface },
  impactLabel: { marginTop: 2, fontSize: 11, fontWeight: '700', color: COLORS.onSurfaceVariant },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: COLORS.outline,
  },
  contactCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: COLORS.outline,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: COLORS.onSurface },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  contactList: { gap: 10 },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: COLORS.surfaceContainerLow,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
  },
  contactIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: COLORS.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactText: { flex: 1, minWidth: 0 },
  contactLabel: { fontSize: 12, fontWeight: '700', color: COLORS.onSurfaceVariant },
  contactValue: { marginTop: 3, fontSize: 14, lineHeight: 20, fontWeight: '700', color: COLORS.onSurface },
  emptyText: { fontSize: 13, lineHeight: 19, color: COLORS.onSurfaceVariant },
  shortcutBtn: { marginTop: 12, borderRadius: 12, paddingVertical: 2 },
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
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 4,
  },
  rowLabel: { flexShrink: 0, maxWidth: '46%', color: COLORS.onSurfaceVariant },
  rowValue: { flex: 1, minWidth: 0, color: COLORS.onSurface, fontWeight: '600', textAlign: 'right' },
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
