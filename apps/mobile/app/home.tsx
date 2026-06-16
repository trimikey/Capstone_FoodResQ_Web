import { View, StyleSheet } from 'react-native';
import { Text, Button } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';

export default function HomeScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    router.replace('/sign-in');
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text variant="headlineMedium">Xin chào{user?.name ? `, ${user.name}` : ''} 👋</Text>
      <Text variant="bodyMedium" style={styles.subtitle}>
        Bạn đã đăng nhập thành công vào FoodResQ.
      </Text>
      <Button mode="outlined" onPress={handleLogout} style={styles.button}>
        Đăng xuất
      </Button>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 },
  subtitle: { textAlign: 'center', color: '#666' },
  button: { marginTop: 16 },
});
