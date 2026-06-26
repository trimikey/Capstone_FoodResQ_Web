import { View, ActivityIndicator } from 'react-native';
import { Redirect, Tabs } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '@/hooks/useAuth';

const PRIMARY = '#10b981';
const INACTIVE = '#9ca3af';

/**
 * Layout nhóm route đã đăng nhập + AUTH GUARD. Tab bar đổi theo vai trò:
 * - receiver: Trang chủ · Đơn của tôi · Tài khoản
 * - provider: Tin của tôi · Quét QR · Tài khoản
 * Tab không thuộc vai trò bị ẩn (href: null); màn chi tiết là route push (ẩn tab).
 */
export default function AppTabsLayout() {
  const { isInitialized, isAuthenticated, user } = useAuth();

  if (!isInitialized) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={PRIMARY} />
      </View>
    );
  }

  if (!isAuthenticated) {
    return <Redirect href="/sign-in" />;
  }

  const isProvider = user?.role === 'provider';

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: PRIMARY,
        tabBarInactiveTintColor: INACTIVE,
        tabBarStyle: { height: 60, paddingBottom: 8, paddingTop: 6 },
      }}
    >
      {/* --- Receiver tabs --- */}
      <Tabs.Screen
        name="home"
        options={{
          href: isProvider ? null : undefined,
          title: 'Trang chủ',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="home-variant" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          href: isProvider ? null : undefined,
          title: 'Đơn của tôi',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="clipboard-list-outline" color={color} size={size} />
          ),
        }}
      />

      {/* --- Provider tabs --- */}
      <Tabs.Screen
        name="provider/listings"
        options={{
          href: isProvider ? undefined : null,
          title: 'Tin của tôi',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="storefront-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="provider/scan"
        options={{
          href: isProvider ? undefined : null,
          title: 'Quét QR',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="qrcode-scan" color={color} size={size} />
          ),
        }}
      />

      {/* --- Chung --- */}
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Tài khoản',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="account-circle-outline" color={color} size={size} />
          ),
        }}
      />

      {/* Màn chi tiết — route push, ẩn khỏi tab bar */}
      <Tabs.Screen name="listing/[id]" options={{ href: null }} />
      <Tabs.Screen name="order/[id]" options={{ href: null }} />
      <Tabs.Screen name="profile/edit" options={{ href: null }} />
      <Tabs.Screen name="provider/create" options={{ href: null }} />
      <Tabs.Screen name="provider/[id]" options={{ href: null }} />
    </Tabs>
  );
}
