import { View, ActivityIndicator } from 'react-native';
import { Tabs } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '@/hooks/useAuth';
import { useMyProfile } from '@/hooks/useProfile';
import { useNotificationSocket } from '@/hooks/useNotifications';
import { DeferredRedirect } from '@/components/navigation/DeferredRedirect';
import { mobileColors as COLORS } from '@/theme/design';

/**
 * Layout nhóm route đã đăng nhập + AUTH GUARD. Tab bar đổi theo vai trò:
 * - receiver: Trang chủ · Đơn của tôi · Tài khoản
 * - provider: Tin của tôi · Đơn đặt · Quét QR · Bếp ăn · Tài khoản
 * - volunteer: tab hiển thị theo chuyên môn đã xác minh
 * Tab không thuộc vai trò bị ẩn (href: null); màn chi tiết là route push (ẩn tab).
 */
export default function AppTabsLayout() {
  const { isInitialized, isAuthenticated, user } = useAuth();
  // Kết nối WS nhận thông báo realtime (tự bỏ qua khi chưa có token).
  useNotificationSocket();

  const isProvider = user?.role === 'provider';
  const isVolunteer = user?.role === 'volunteer';
  const isReceiver = user?.role === 'receiver';
  // Cờ tổ chức từ thiện và chuyên môn TNV nằm trong hồ sơ (GET /users/me).
  // PHẢI gọi trước mọi early-return để giữ đúng thứ tự hooks (tránh "rendered fewer hooks" khi logout).
  const { data: profile } = useMyProfile(isReceiver || isVolunteer);
  const isCharityOrg = isReceiver && !!profile?.receiver?.isCharityOrg;
  const verifiedVolunteerSpecs = new Set(
    (profile?.volunteer?.specializations ?? [])
      .filter((s) => s.isVerified)
      .map((s) => s.specialization)
  );
  const hasVerifiedChef = verifiedVolunteerSpecs.has('chef');
  const hasVerifiedWaiter = verifiedVolunteerSpecs.has('waiter');
  const hasVerifiedShipper = verifiedVolunteerSpecs.has('shipper');
  const profilePending = isVolunteer && !profile?.volunteer;
  const hasKitchenRole = hasVerifiedChef || hasVerifiedWaiter || hasVerifiedShipper;
  const showShipperTabs = isVolunteer && hasVerifiedShipper;
  const showCampaignTab = isVolunteer && (profilePending || hasKitchenRole);
  // Tab "chung" (receiver + provider) bị ẩn với volunteer; volunteer dùng nhánh riêng.
  const hideReceiver = isProvider || isVolunteer;

  if (!isInitialized) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!isAuthenticated) {
    return <DeferredRedirect href="/sign-in" />;
  }

  return (
    <Tabs
      initialRouteName={
        isVolunteer ? 'volunteer/campaigns' :
        isProvider ? 'provider/listings' :
        'home'
      }
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.navActive,
        tabBarInactiveTintColor: COLORS.navInactive,
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

      {/* --- Charity-org tab (receiver có isCharityOrg) --- */}
      <Tabs.Screen
        name="charity/campaigns"
        options={{
          href: isCharityOrg ? undefined : null,
          title: 'Bếp ăn của tôi',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="pot-steam-outline" color={color} size={size} />
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
      <Tabs.Screen
        name="volunteer/offers"
        options={{
          href: showShipperTabs ? undefined : null,
          title: 'Giao hàng',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="truck-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="volunteer/active"
        options={{
          href: null,
          title: 'Đang giao',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="truck-fast-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="volunteer/bulk"
        options={{
          href: showShipperTabs ? undefined : null,
          title: 'Giao sỉ',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="package-variant-closed" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="volunteer/campaigns"
        options={{
          href: showCampaignTab ? undefined : null,
          title: 'Chiến dịch',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="charity" color={color} size={size} />
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
      <Tabs.Screen name="reports" options={{ href: null }} />
      <Tabs.Screen name="profile/edit" options={{ href: null }} />
      <Tabs.Screen name="meals/qr" options={{ href: null }} />
      <Tabs.Screen name="provider/create" options={{ href: null }} />
      <Tabs.Screen name="provider/[id]" options={{ href: null }} />
      <Tabs.Screen name="provider/orders/[id]" options={{ href: null }} />
      <Tabs.Screen name="provider/campaigns/[id]" options={{ href: null }} />
      {/* Charity-org: tạo + quản lý chi tiết chiến dịch — route push, ẩn khỏi tab bar */}
      <Tabs.Screen name="charity/campaigns/create" options={{ href: null }} />
      <Tabs.Screen name="charity/campaigns/[id]" options={{ href: null }} />
      {/* Volunteer: lịch sử giao hàng — route push từ màn Hồ sơ, ẩn khỏi tab bar */}
      <Tabs.Screen name="volunteer/history" options={{ href: null }} />
      <Tabs.Screen name="volunteer/delivery-shifts" options={{ href: null }} />
      <Tabs.Screen name="volunteer/scan-handoff" options={{ href: null }} />
      {/* Công thức nấu ăn — route push từ màn Hồ sơ, ẩn khỏi tab bar */}
      <Tabs.Screen name="recipes/index" options={{ href: null }} />
      <Tabs.Screen name="recipes/[id]" options={{ href: null }} />
      <Tabs.Screen name="recipes/create" options={{ href: null }} />
      {/* Volunteer: chi tiết chiến dịch (đăng ký vai trò) — route push, ẩn khỏi tab bar */}
      <Tabs.Screen name="volunteer/campaigns/[id]" options={{ href: null }} />
      {/* Volunteer: màn tác nghiệp riêng theo assignment cho chef/waiter */}
      <Tabs.Screen name="volunteer/tasks/[assignmentId]" options={{ href: null }} />
    </Tabs>
  );
}
