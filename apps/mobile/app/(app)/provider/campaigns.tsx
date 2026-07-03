import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, ActivityIndicator, Button } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { router, Redirect } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { useCampaigns, type Campaign } from '@/hooks/useCampaigns';
import { CampaignCard } from '@/components/CampaignCard';
import { ScreenHeader } from '@/components/ui/ScreenHeader';

const COLORS = {
  primary: '#10b981',
  background: '#f8f9ff',
  onSurface: '#121c2a',
  onSurfaceVariant: '#6b7280',
};

/**
 * Bếp ăn (Provider) — danh sách chiến dịch cộng đồng đang mở/đang diễn ra.
 * Provider chọn 1 chiến dịch để xem chi tiết và quyên góp nguyên liệu.
 */
export default function ProviderCampaignsScreen() {
  const { user } = useAuth();
  const { data, isLoading, isError, refetch, isRefetching } = useCampaigns();

  // Chỉ provider dùng tab này; role khác lỡ vào → về trang chủ.
  if (user && user.role !== 'provider') {
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
          <MaterialCommunityIcons name="silverware-fork-knife" size={48} color={COLORS.primary} />
        </View>
        <Text style={styles.emptyTitle}>Chưa có chiến dịch nào</Text>
        <Text style={styles.emptyBody}>
          Hiện chưa có bếp ăn cộng đồng nào đang mở. Quay lại sau để chung tay quyên góp nguyên liệu nhé.
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title="Bếp ăn cộng đồng" />
      <FlashList
        data={items}
        keyExtractor={(item: Campaign) => item.id}
        renderItem={({ item }: { item: Campaign }) => (
          <CampaignCard campaign={item} onPress={() => router.push(`/(app)/provider/campaigns/${item.id}`)} />
        )}
        estimatedItemSize={170}
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
