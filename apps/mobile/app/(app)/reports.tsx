import { View, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { ScreenState } from '@/components/ui/ScreenState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { SurfaceCard } from '@/components/ui/SurfaceCard';
import { useMyReports, type MyReport } from '@/hooks/useReports';
import { mobileColors as COLORS, radius, spacing } from '@/theme/design';

const TARGET_LABEL: Record<string, string> = {
  listing: 'Tin thực phẩm',
  delivery: 'Giao hàng',
  user: 'Người dùng',
  campaign: 'Chiến dịch',
};

const REASON_LABEL: Record<string, string> = {
  spoiled_food: 'Thực phẩm hỏng',
  unsafe_food: 'Không an toàn',
  no_show_provider: 'NCC không có mặt',
  fraud: 'Gian lận',
  other: 'Khác',
};

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function statusColor(status: string) {
  if (status === 'resolved' || status === 'closed') return 'success';
  if (status === 'rejected') return 'danger';
  return 'warning';
}

export default function MyReportsScreen() {
  const { data = [], isLoading, isError, refetch, isRefetching } = useMyReports();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title="Báo cáo của tôi" showBell={false} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
      >
        {isLoading ? (
          <ScreenState kind="loading" title="Đang tải báo cáo" />
        ) : isError ? (
          <ScreenState kind="error" title="Không tải được báo cáo" actionLabel="Thử lại" onAction={() => refetch()} />
        ) : data.length === 0 ? (
          <ScreenState kind="empty" title="Chưa có báo cáo nào" />
        ) : (
          <>
            <View style={styles.hero}>
              <Text style={styles.heroKicker}>Safety center</Text>
              <Text style={styles.heroTitle}>Theo dõi các báo cáo đã gửi</Text>
              <Text style={styles.heroMeta}>{data.length} báo cáo trong tài khoản</Text>
            </View>
            {data.map((report) => <ReportCard key={report.id} report={report} />)}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ReportCard({ report }: { report: MyReport }) {
  const sc = statusColor(report.status);
  return (
    <SurfaceCard style={styles.card}>
      <View style={styles.cardHead}>
        <View style={styles.iconBox}>
          <MaterialCommunityIcons name="flag-outline" size={20} color={COLORS.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{TARGET_LABEL[report.targetType] ?? report.targetType}</Text>
          <Text style={styles.meta}>{fmtDate(report.createdAt)}</Text>
        </View>
        <StatusBadge label={report.status} tone={sc} />
      </View>
      <Text style={styles.reason}>{REASON_LABEL[report.reason] ?? report.reason}</Text>
      {report.description ? <Text style={styles.description}>{report.description}</Text> : null}
      {report.targetType === 'delivery' ? (
        <Text style={styles.targetHint}>Mã giao hàng: {report.targetId}</Text>
      ) : report.targetType === 'listing' ? (
        <Text style={styles.targetHint}>Mã tin: {report.targetId}</Text>
      ) : null}
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.section, gap: spacing.md },
  hero: {
    borderRadius: 28,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    backgroundColor: COLORS.primaryStrong,
  },
  heroKicker: { color: COLORS.secondaryContainer, fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  heroTitle: { marginTop: 4, color: COLORS.onPrimary, fontSize: 22, lineHeight: 28, fontWeight: '900' },
  heroMeta: { marginTop: spacing.md, color: COLORS.secondaryContainer, fontSize: 13, fontWeight: '700' },
  card: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: radius.lg,
    backgroundColor: COLORS.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { fontSize: 15, fontWeight: '800', color: COLORS.onSurface },
  meta: { marginTop: 2, fontSize: 12, color: COLORS.onSurfaceVariant },
  reason: { fontSize: 14, fontWeight: '700', color: COLORS.onSurface },
  description: { fontSize: 13, color: COLORS.onSurfaceVariant, lineHeight: 19 },
  targetHint: { fontSize: 11, color: COLORS.onSurfaceVariant },
});
