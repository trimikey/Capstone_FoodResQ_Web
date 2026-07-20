import { View, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import {
  Text,
  Button,
  Avatar,
  Divider,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { useMyProfile } from '@/hooks/useProfile';
import { roleLabel, statusDisplay, volunteerRankLabel } from '@/utils/userFormat';
import { AppImage } from '@/components/ui/AppImage';
import { ScreenState } from '@/components/ui/ScreenState';
import { mobileColors as COLORS } from '@/theme/design';

function formatDecimal(value: unknown, fallback = '-'): string {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(1) : fallback;
}

function formatCount(value: unknown): string {
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : '0';
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

  // Ưu tiên dữ liệu /users/me; fallback về user trong store khi đang tải lần đầu.
  const name = profile?.fullName ?? user?.name ?? 'Người dùng';
  const email = profile?.email ?? user?.email ?? '';
  const role = profile?.role ?? user?.role;
  const status = profile?.status ?? user?.status;
  const avatarUrl = profile?.avatarUrl ?? user?.avatarUrl;
  const trustScore = profile?.trustScore ?? user?.trustScore;
  const sd = statusDisplay(status);

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

            {/* Số điện thoại */}
            {profile?.phone ? (
              <View style={styles.card}>
                <Row label="Số điện thoại" value={profile.phone} />
              </View>
            ) : null}
          </>
        )}

        {/* Hành động */}
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
  recipesBtn: { marginTop: 24, borderRadius: 12, borderColor: COLORS.primary },
  editBtn: { marginTop: 12, borderRadius: 12, paddingVertical: 4 },
  logout: { marginTop: 12, borderRadius: 12, borderColor: COLORS.error },
});
