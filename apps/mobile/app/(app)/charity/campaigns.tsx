import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { IconButton } from 'react-native-paper';
import { FlashList } from '@shopify/flash-list';
import { router, Redirect } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { useMyCampaigns, type Campaign } from '@/hooks/useCampaigns';
import { CampaignCard } from '@/components/CampaignCard';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { ScreenState } from '@/components/ui/ScreenState';
import { mobileColors as COLORS } from '@/theme/design';

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
        icon="pot-steam-outline"
        title="Chưa có chiến dịch nào"
        message="Tạo chiến dịch đầu tiên để kêu gọi tình nguyện viên và nhận nguyên liệu."
        actionLabel="Tạo chiến dịch"
        onAction={() => router.push('/(app)/charity/campaigns/create')}
      />
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
});
