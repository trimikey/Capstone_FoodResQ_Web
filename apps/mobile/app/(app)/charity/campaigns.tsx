import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { IconButton, Text } from 'react-native-paper';
import { FlashList } from '@shopify/flash-list';
import { router, Redirect } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import {
  useCompletedCampaigns,
  useMyCampaigns,
  type Campaign,
  type CompletedCampaign,
} from '@/hooks/useCampaigns';
import { CampaignCard } from '@/components/CampaignCard';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { ScreenState } from '@/components/ui/ScreenState';
import { AppImage } from '@/components/ui/AppImage';
import { mobileColors as COLORS } from '@/theme/design';

/**
 * Bếp ăn của tôi (Charity-org) — danh sách chiến dịch do tổ chức tự tạo
 * (gồm cả bản nháp chờ admin duyệt). Bấm "+" để tạo mới; chạm thẻ để quản lý.
 */
export default function CharityCampaignsScreen() {
  const { user } = useAuth();
  const { data, isLoading, isError, refetch, isRefetching } = useMyCampaigns();
  const { data: completedCampaigns = [] } = useCompletedCampaigns();

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
        ListFooterComponent={<CompletedStories items={completedCampaigns} />}
        refreshing={isRefetching}
        onRefresh={() => refetch()}
      />
    </SafeAreaView>
  );
}

function CompletedStories({ items }: { items: CompletedCampaign[] }) {
  if (items.length === 0) return null;

  return (
    <View style={styles.completedSection}>
      <Text style={styles.sectionTitle}>Câu chuyện thành công</Text>
      {items.map((item) => (
        <View key={item.id} style={styles.completedCard}>
          {item.imageUrls?.[0] ? (
            <AppImage source={{ uri: item.imageUrls[0] }} style={styles.completedImage} />
          ) : (
            <View style={styles.completedFallback}>
              <Text style={styles.completedFallbackIcon}>✓</Text>
            </View>
          )}
          <View style={styles.completedBody}>
            <Text style={styles.completedTitle} numberOfLines={2}>{item.title}</Text>
            <Text style={styles.completedMeta} numberOfLines={1}>
              {new Date(item.scheduledDate).toLocaleDateString('vi-VN')}
              {item.organizationName ? ` · ${item.organizationName}` : ''}
            </Text>
            <View style={styles.completedStats}>
              <Text style={styles.completedStat}>{item.actualServings ?? 0} suất</Text>
              <Text style={styles.completedStat}>{item.peopleServed} người</Text>
              <Text style={styles.completedStat}>{item.volunteers} TNV</Text>
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  list: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 32 },
  completedSection: { marginTop: 12, paddingTop: 10 },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: COLORS.onSurface, marginBottom: 12 },
  completedCard: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.outline,
    padding: 12,
    marginBottom: 12,
  },
  completedImage: { width: 92, height: 92, borderRadius: 12 },
  completedFallback: {
    width: 92,
    height: 92,
    borderRadius: 12,
    backgroundColor: COLORS.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completedFallbackIcon: { fontSize: 32, color: COLORS.primary, fontWeight: '800' },
  completedBody: { flex: 1, minHeight: 92, justifyContent: 'space-between' },
  completedTitle: { fontSize: 15, fontWeight: '800', color: COLORS.onSurface, lineHeight: 20 },
  completedMeta: { fontSize: 12, color: COLORS.onSurfaceVariant },
  completedStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  completedStat: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primary,
    backgroundColor: COLORS.primaryContainer,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
});
