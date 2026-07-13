import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { router, Redirect } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { useCampaigns, type Campaign } from '@/hooks/useCampaigns';
import { CampaignCard } from '@/components/CampaignCard';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { ScreenState } from '@/components/ui/ScreenState';
import { mobileColors as COLORS } from '@/theme/design';

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
      return <ScreenState kind="loading" title="Đang tải chiến dịch" />;
    }
    if (isError) {
      return (
        <ScreenState
          kind="error"
          title="Không tải được chiến dịch"
          actionLabel="Thử lại"
          onAction={() => refetch()}
        />
      );
    }
    return (
      <ScreenState
        kind="empty"
        icon="silverware-fork-knife"
        title="Chưa có chiến dịch nào"
        message="Hiện chưa có bếp ăn cộng đồng đang mở. Quay lại sau để quyên góp nguyên liệu."
      />
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
});
