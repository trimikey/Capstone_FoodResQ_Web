import { View, ActivityIndicator } from 'react-native';
import { Redirect, Tabs } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '@/hooks/useAuth';
import { useNotificationSocket } from '@/hooks/useNotifications';

const PRIMARY = '#10b981';
const INACTIVE = '#9ca3af';

/**
 * Layout nhóm route đã đăng nhập + AUTH GUARD. Tab bar đổi theo vai trò:
 * - receiver: Trang chủ · Đơn của tôi · Tài khoản
 * - provider: Tin của tôi · Đơn đặt · Quét QR · Bếp ăn · Tài khoản
 * - volunteer: Đơn cần giao · Đang giao · Hồ sơ
 * Tab không thuộc vai trò bị ẩn (href: null); màn chi tiết là route push (ẩn tab).
 */
export default function AppTabsLayout() {
  const { isInitialized, isAuthenticated, user } = useAuth();
  // Kết nối WS nhận thông báo realtime (tự bỏ qua khi chưa có token).
  useNotificationSocket();

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
  const isVolunteer = user?.role === 'volunteer';
  // Tab "chung" (receiver + provider) bị ẩn với volunteer; volunteer dùng nhánh riêng.
  const hideReceiver = isProvider || isVolunteer;

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
          href: hideReceiver ? null : undefined,
          title: 'Trang chủ',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="home-variant" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          href: hideReceiver ? null : undefined,
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
        name="provider/orders"
        options={{
          href: isProvider ? undefined : null,
          title: 'Đơn đặt',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="clipboard-text-outline" color={color} size={size} />
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
      <Tabs.Screen
        name="provider/campaigns"
        options={{
          href: isProvider ? undefined : null,
          title: 'Bếp ăn',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="silverware-fork-knife" color={color} size={size} />
          ),
        }}
      />

      {/* --- Volunteer tabs --- */}
      {/* GHI CHÚ: tab "Chiến dịch" (campaign volunteer) sẽ thêm ở task riêng — đừng thêm ở đây. */}
      <Tabs.Screen
        name="volunteer/offers"
        options={{
          href: isVolunteer ? undefined : null,
          title: 'Đơn cần giao',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="clipboard-arrow-down-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="volunteer/active"
        options={{
          href: isVolunteer ? undefined : null,
          title: 'Đang giao',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="truck-fast-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="volunteer/profile"
        options={{
          href: isVolunteer ? undefined : null,
          title: 'Hồ sơ',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="account-circle-outline" color={color} size={size} />
          ),
        }}
      />

      {/* --- Chung (receiver + provider; volunteer dùng "Hồ sơ" riêng ở trên) --- */}
      <Tabs.Screen
        name="profile"
        options={{
          href: isVolunteer ? null : undefined,
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
      <Tabs.Screen name="provider/orders/[id]" options={{ href: null }} />
      <Tabs.Screen name="provider/campaigns/[id]" options={{ href: null }} />
      {/* Volunteer: lịch sử giao hàng — route push từ màn Hồ sơ, ẩn khỏi tab bar */}
      <Tabs.Screen name="volunteer/history" options={{ href: null }} />
    </Tabs>
  );
}
