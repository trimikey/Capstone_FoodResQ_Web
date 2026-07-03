import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, ActivityIndicator, Button, IconButton } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { router, Redirect } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { useMyCampaigns, type Campaign } from '@/hooks/useCampaigns';
import { CampaignCard } from '@/components/CampaignCard';
import { ScreenHeader } from '@/components/ui/ScreenHeader';

const COLORS = {
  primary: '#10b981',
  background: '#f8f9ff',
  onSurface: '#121c2a',
  onSurfaceVariant: '#6b7280',
};

/**
 * Bếp ăn của tôi (Charity-org) — danh sách chiến dịch do tổ chức tự tạo
 * (gồm cả bản nháp chờ admin duyệt). Bấm "+" để tạo mới; chạm thẻ để quản lý.
 */
export default function CharityCampaignsScreen() {
  const { user } = useAuth();
  const { data, isLoading, isError, refetch, isRefetching } = useMyCampaigns();

  // Chỉ receiver (charity-org) dùng tab này; role khác lỡ vào → về trang chủ.
  if (user && user.role !== 'receiver') {
    return <Redirect href="/(app)/home" />;
  }

  const items = data ?? [];

  const renderEmpty = () => {
    if (isLoading) {
      return (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      );
    }
    if (isError) {
      return (
        <View style={styles.center}>
          <MaterialCommunityIcons name="alert-circle-outline" size={48} color="#ef4444" />
          <Text style={styles.emptyTitle}>Không tải được chiến dịch</Text>
          <Button mode="contained" buttonColor={COLORS.primary} onPress={() => refetch()} style={styles.retryBtn}>
            Thử lại
          </Button>
        </View>
      );
    }
    return (
      <View style={styles.center}>
        <View style={styles.emptyIcon}>
          <MaterialCommunityIcons name="pot-steam-outline" size={48} color={COLORS.primary} />
        </View>
        <Text style={styles.emptyTitle}>Chưa có chiến dịch nào</Text>
        <Text style={styles.emptyBody}>
          Tạo chiến dịch bếp ăn đầu tiên để kêu gọi tình nguyện viên và nhận quyên góp nguyên liệu.
        </Text>
        <Button
          mode="contained"
          icon="plus"
          buttonColor={COLORS.primary}
          onPress={() => router.push('/(app)/charity/campaigns/create')}
          style={styles.retryBtn}
        >
          Tạo chiến dịch
        </Button>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader
        title="Bếp ăn của tôi"
        right={
          <IconButton
            icon="plus"
            mode="contained"
            containerColor={COLORS.primary}
            iconColor="#fff"
            size={20}
            onPress={() => router.push('/(app)/charity/campaigns/create')}
          />
        }
      />
      <FlashList
        data={items}
        keyExtractor={(item: Campaign) => item.id}
        renderItem={({ item }: { item: Campaign }) => (
          <CampaignCard campaign={item} onPress={() => router.push(`/(app)/charity/campaigns/${item.id}`)} />
        )}
        contentContainerStyle={styles.list}
        ListEmptyComponent={renderEmpty}
        refreshing={isRefetching}
        onRefresh={() => refetch()}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  list: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 32 },
  center: { alignItems: 'center', justifyContent: 'center', paddingTop: 80, paddingHorizontal: 32 },
  emptyIcon: {
    width: 96, height: 96, borderRadius: 48, backgroundColor: '#ecfdf5',
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.onSurface, marginTop: 12, marginBottom: 8, textAlign: 'center' },
  emptyBody: { fontSize: 14, color: COLORS.onSurfaceVariant, textAlign: 'center', lineHeight: 21 },
  retryBtn: { marginTop: 16, borderRadius: 12 },
});
