import { View, StyleSheet } from 'react-native';
import { Text, Button, Avatar } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/hooks/useAuth';

/**
 * Tài khoản — placeholder cho Luồng 4 (Profile & Logout).
 * Logout đã nối thật; sau khi logout, auth guard ở (app)/_layout tự redirect về /sign-in.
 * Dev A: bổ sung GET /auth/me, trạng thái verify, chỉnh sửa hồ sơ.
 */
export default function ProfileTab() {
  const { user, logout, isLoading } = useAuth();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Avatar.Text
          size={72}
          label={(user?.name || user?.email || '?').charAt(0).toUpperCase()}
        />
        <Text variant="titleMedium" style={styles.name}>
          {user?.name || 'Người dùng'}
        </Text>
        <Text variant="bodyMedium" style={styles.email}>
          {user?.email || ''}
        </Text>
        {user?.role ? (
          <Text variant="bodySmall" style={styles.role}>
            Vai trò: {user.role}
          </Text>
        ) : null}
      </View>

      <Button
        mode="outlined"
        icon="logout"
        onPress={logout}
        loading={isLoading}
        disabled={isLoading}
        style={styles.logout}
      >
        Đăng xuất
      </Button>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20, paddingTop: 16 },
  header: { alignItems: 'center', gap: 6, marginTop: 16 },
  name: { fontWeight: '700', marginTop: 8 },
  email: { color: '#6b7280' },
  role: { color: '#9ca3af', marginTop: 2 },
  logout: { marginTop: 'auto', marginBottom: 24 },
});
