import { StyleSheet, View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Text } from 'react-native-paper';
import { FlashList } from '@shopify/flash-list';
import { router, Redirect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '@/hooks/useAuth';
import {
  useCompletedCampaigns,
  useMyCampaigns,
  type Campaign,
  type CompletedCampaign,
} from '@/hooks/useCampaigns';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { ScreenState } from '@/components/ui/ScreenState';
import { AppImage } from '@/components/ui/AppImage';
import { formatDate, formatTime, slotProgress, statusMeta } from '@/utils/campaign';
import { mobileColors as COLORS } from '@/theme/design';

/**
 * Bếp ăn của tôi (Charity-org) — danh sách chiến dịch do tổ chức tự tạo
 * (gồm cả bản nháp chờ admin duyệt). Bấm thẻ để quản lý, nút tạo nằm trong khối tổng quan.
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
  const summary = {
    total: items.length,
    open: items.filter((item) => item.status === 'open').length,
    active: items.filter((item) => item.status === 'in_progress').length,
    done: items.filter((item) => item.status === 'completed').length,
    needsAction: items.filter((item) => {
      const pendingDonations = item.donations?.some((donation) => donation.status !== 'received');
      const pendingAssignments = item.assignments?.some((assignment) => assignment.status === 'pending');
      return item.status === 'draft' || pendingDonations || pendingAssignments;
    }).length,
  };

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
      <ScreenHeader title="Bếp ăn của tôi" showBell={false} />
      <FlashList
        data={items}
        keyExtractor={(item: Campaign) => item.id}
        renderItem={({ item }: { item: Campaign }) => (
          <CampaignOpsCard campaign={item} onPress={() => router.push(`/(app)/charity/campaigns/${item.id}`)} />
        )}
        contentContainerStyle={styles.list}
        ListEmptyComponent={renderEmpty}
        ListHeaderComponent={items.length > 0 ? <SummaryBand summary={summary} /> : null}
        ListFooterComponent={<CompletedStories items={completedCampaigns} />}
        refreshing={isRefetching}
        onRefresh={() => refetch()}
      />
    </SafeAreaView>
  );
}

function SummaryBand({
  summary,
}: {
  summary: { total: number; open: number; active: number; done: number; needsAction: number };
}) {
  return (
    <View style={styles.summary}>
      <View style={styles.summaryHead}>
        <View>
          <Text style={styles.summaryTitle}>Tổng quan điều phối</Text>
          <Text style={styles.summarySub}>Theo dõi nhanh các chiến dịch bếp ăn.</Text>
        </View>
      </View>
      <Button
        mode="contained"
        icon="plus"
        buttonColor={COLORS.primary}
        style={styles.createBtn}
        contentStyle={styles.createBtnContent}
        labelStyle={styles.createBtnLabel}
        onPress={() => router.push('/(app)/charity/campaigns/create')}
      >
        Tạo chiến dịch
      </Button>
      <View style={styles.metricGrid}>
        <Metric label="Tổng" value={summary.total} />
        <Metric label="Đang tuyển" value={summary.open} tone="success" />
        <Metric label="Đang diễn ra" value={summary.active} tone="info" />
        <Metric label="Hoàn tất" value={summary.done} tone="success" />
        <Metric label="Cần xử lý" value={summary.needsAction} tone="warning" />
      </View>
    </View>
  );
}

function Metric({ label, value, tone = 'neutral' }: { label: string; value: number; tone?: 'neutral' | 'success' | 'warning' | 'info' }) {
  const color =
    tone === 'success' ? COLORS.primary :
    tone === 'warning' ? COLORS.warning :
    tone === 'info' ? COLORS.info :
    COLORS.onSurface;
  return (
    <View style={styles.metric}>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
      <Text style={styles.metricLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function CampaignOpsCard({ campaign, onPress }: { campaign: Campaign; onPress: () => void }) {
  const meta = statusMeta(campaign.status);
  const slots = slotProgress(campaign);
  const needed = slots.reduce((sum, slot) => sum + slot.needed, 0);
  const filled = slots.reduce((sum, slot) => sum + slot.filled, 0);
  const pendingDonations = campaign.donations?.filter((donation) => donation.status !== 'received').length ?? 0;
  const pendingAssignments = campaign.assignments?.filter((assignment) => assignment.status === 'pending').length ?? 0;
  const servings =
    campaign.status === 'completed' && campaign.actualServings != null
      ? `${campaign.actualServings} suất thực tế`
      : campaign.expectedServings != null
        ? `${campaign.expectedServings} suất dự kiến`
        : 'Chưa đặt mục tiêu suất';

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.campaignCard, pressed && styles.cardPressed]}>
      <View style={styles.campaignTop}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.campaignTitle} numberOfLines={2}>{campaign.title}</Text>
          <Text style={styles.campaignMeta} numberOfLines={1}>
            {formatDate(campaign.scheduledDate)} - {formatTime(campaign.startTime)} đến {formatTime(campaign.endTime)}
          </Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: meta.bg }]}>
          <Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text>
        </View>
      </View>

      <View style={styles.campaignInfo}>
        <InfoChip icon="map-marker-outline" text={campaign.kitchenAddress} />
        <InfoChip icon="food-outline" text={servings} />
        <InfoChip icon="account-group-outline" text={`${filled}/${needed} TNV đã đủ chỗ`} />
      </View>

      {pendingDonations > 0 || pendingAssignments > 0 ? (
        <View style={styles.actionStrip}>
          <MaterialCommunityIcons name="alert-circle-outline" size={17} color={COLORS.warning} />
          <Text style={styles.actionText}>
            {[
              pendingDonations > 0 ? `${pendingDonations} quyên góp chờ xác nhận` : '',
              pendingAssignments > 0 ? `${pendingAssignments} TNV chờ duyệt` : '',
            ].filter(Boolean).join(' - ')}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function InfoChip({ icon, text }: { icon: any; text: string }) {
  return (
    <View style={styles.infoChip}>
      <MaterialCommunityIcons name={icon} size={15} color={COLORS.onSurfaceVariant} />
      <Text style={styles.infoChipText} numberOfLines={1}>{text}</Text>
    </View>
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
              {item.organizationName ? ` - ${item.organizationName}` : ''}
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
  summary: {
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.outline,
    padding: 16,
    marginBottom: 14,
  },
  summaryHead: { gap: 4 },
  summaryTitle: { fontSize: 18, fontWeight: '900', color: COLORS.onSurface },
  summarySub: { marginTop: 2, fontSize: 12, color: COLORS.onSurfaceVariant },
  createBtn: { marginTop: 14, borderRadius: 14, alignSelf: 'stretch' },
  createBtnContent: { minHeight: 48 },
  createBtnLabel: { fontSize: 15, fontWeight: '800' },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  metric: {
    flexBasis: '31%',
    flexGrow: 1,
    minHeight: 72,
    borderRadius: 14,
    backgroundColor: COLORS.surfaceContainerLow,
    borderWidth: 1,
    borderColor: COLORS.outline,
    paddingHorizontal: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  metricValue: { fontSize: 20, fontWeight: '900' },
  metricLabel: { marginTop: 2, fontSize: 10, fontWeight: '700', color: COLORS.onSurfaceVariant },
  campaignCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.outline,
    padding: 14,
    marginBottom: 12,
  },
  cardPressed: { opacity: 0.88, transform: [{ scale: 0.99 }] },
  campaignTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  campaignTitle: { fontSize: 16, fontWeight: '900', color: COLORS.onSurface, lineHeight: 22 },
  campaignMeta: { marginTop: 4, fontSize: 12, color: COLORS.onSurfaceVariant, fontWeight: '600' },
  statusBadge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  statusText: { fontSize: 11, fontWeight: '800' },
  campaignInfo: { gap: 8, marginTop: 12 },
  infoChip: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 22 },
  infoChipText: { flex: 1, fontSize: 13, color: COLORS.onSurfaceVariant, fontWeight: '600' },
  actionStrip: {
    marginTop: 12,
    borderRadius: 12,
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionText: { flex: 1, fontSize: 12, fontWeight: '700', color: COLORS.warning },
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
