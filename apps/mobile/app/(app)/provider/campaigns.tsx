import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from 'react-native-paper';
import { FlashList } from '@shopify/flash-list';
import { router, Redirect } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { useCampaigns, type Campaign } from '@/hooks/useCampaigns';
import { CampaignCard } from '@/components/CampaignCard';
import { AppBackground } from '@/components/ui/AppBackground';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { ScreenState } from '@/components/ui/ScreenState';
import { mobileColors as COLORS, radius, spacing } from '@/theme/design';

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
      <AppBackground>
        <ScreenHeader title="Bếp ăn cộng đồng" />
        <FlashList
          data={items}
          keyExtractor={(item: Campaign) => item.id}
          renderItem={({ item, index }: { item: Campaign; index: number }) => (
            <CampaignCard
              campaign={item}
              index={index}
              onPress={() => router.push(`/(app)/provider/campaigns/${item.id}`)}
            />
          )}
          contentContainerStyle={styles.list}
          ListHeaderComponent={<ProviderCampaignHero total={items.length} />}
          ListEmptyComponent={renderEmpty}
          refreshing={isRefetching}
          onRefresh={() => refetch()}
        />
      </AppBackground>
    </SafeAreaView>
  );
}

function ProviderCampaignHero({ total }: { total: number }) {
  return (
    <View style={styles.hero}>
      <Text style={styles.heroKicker}>Donation missions</Text>
      <Text style={styles.heroTitle}>Góp nguyên liệu cho bếp ăn đang mở</Text>
      <View style={styles.heroStat}>
        <Text style={styles.heroStatValue}>{total}</Text>
        <Text style={styles.heroStatLabel}>chiến dịch có thể hỗ trợ</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  list: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.section },
  hero: {
    borderRadius: 28,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    backgroundColor: COLORS.primaryStrong,
  },
  heroKicker: { color: COLORS.secondaryContainer, fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  heroTitle: { marginTop: 4, color: COLORS.onPrimary, fontSize: 22, lineHeight: 28, fontWeight: '900' },
  heroStat: {
    marginTop: spacing.lg,
    borderRadius: radius.xl,
    padding: spacing.md,
    backgroundColor: COLORS.surface,
  },
  heroStatValue: { color: COLORS.onSurface, fontSize: 20, fontWeight: '900' },
  heroStatLabel: { color: COLORS.onSurfaceVariant, fontSize: 12, fontWeight: '700' },
});
