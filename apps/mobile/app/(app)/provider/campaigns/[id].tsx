import { useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Button, ActivityIndicator } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCampaignDetail } from '@/hooks/useCampaigns';
import { DonationDialog } from '@/components/DonationDialog';
import {
  statusMeta,
  formatDate,
  formatTime,
  charityName,
  slotProgress,
  canDonate,
} from '@/utils/campaign';

const COLORS = {
  primary: '#10b981',
  background: '#f8f9ff',
  surface: '#ffffff',
  onSurface: '#121c2a',
  onSurfaceVariant: '#6b7280',
  outline: '#e5e7eb',
};

/** Hàng thông tin có icon. */
function InfoRow({ icon, children }: { icon: any; children: React.ReactNode }) {
  return (
    <View style={styles.infoRow}>
      <MaterialCommunityIcons name={icon} size={18} color={COLORS.primary} />
      <Text style={styles.infoText}>{children}</Text>
    </View>
  );
}

/** Khối section có tiêu đề. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

/**
 * Chi tiết chiến dịch bếp ăn (Provider) — thông tin, thực đơn, lịch trình,
 * vật phẩm cần, tiến độ TNV, danh sách quyên góp + nút quyên góp nguyên liệu.
 */
export default function ProviderCampaignDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: c, isLoading, isError, refetch } = useCampaignDetail(id);
  const [dialogVisible, setDialogVisible] = useState(false);

  const Header = (
    <View style={styles.header}>
      <Pressable onPress={() => router.back()} hitSlop={8}>
        <MaterialCommunityIcons name="arrow-left" size={24} color={COLORS.onSurface} />
      </Pressable>
      <Text variant="titleMedium" style={styles.headerTitle}>Chi tiết chiến dịch</Text>
      <View style={{ width: 24 }} />
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {Header}
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (isError || !c) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {Header}
        <View style={styles.center}>
          <Text style={{ color: COLORS.onSurfaceVariant, marginBottom: 12 }}>
            Không tải được chiến dịch.
          </Text>
          <Button mode="contained" buttonColor={COLORS.primary} onPress={() => refetch()}>
            Thử lại
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  const sm = statusMeta(c.status);
  const slots = slotProgress(c);
  const donations = c.donations ?? [];
  const donatable = canDonate(c.status);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {Header}
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{c.title}</Text>
          <View style={[styles.badge, { backgroundColor: sm.bg }]}>
            <Text style={[styles.badgeText, { color: sm.color }]}>{sm.label}</Text>
          </View>
        </View>

        {c.description ? <Text style={styles.description}>{c.description}</Text> : null}

        <View style={styles.card}>
          <InfoRow icon="account-group-outline">{charityName(c)}</InfoRow>
          <InfoRow icon="calendar-clock">
            {formatDate(c.scheduledDate)} · {formatTime(c.startTime)}–{formatTime(c.endTime)}
          </InfoRow>
          <InfoRow icon="map-marker-outline">{c.kitchenAddress}</InfoRow>
          {c.expectedServings ? (
            <InfoRow icon="food-outline">Dự kiến phục vụ {c.expectedServings} suất</InfoRow>
          ) : null}
        </View>

        {slots.length > 0 ? (
          <Section title="Tình nguyện viên">
            {slots.map((s) => {
              const full = s.filled >= s.needed;
              return (
                <View key={s.role} style={styles.slotLine}>
                  <Text style={styles.slotLabel}>{s.label}</Text>
                  <Text style={[styles.slotCount, full && { color: COLORS.primary }]}>
                    {s.filled}/{s.needed} {full ? '· Đủ' : ''}
                  </Text>
                </View>
              );
            })}
          </Section>
        ) : null}

        {c.menuItems && c.menuItems.length > 0 ? (
          <Section title="Thực đơn">
            {c.menuItems.map((m, i) => (
              <View key={i} style={styles.bulletRow}>
                <MaterialCommunityIcons name="silverware-fork-knife" size={15} color={COLORS.onSurfaceVariant} />
                <Text style={styles.bulletText}>{m.name}{m.type ? ` (${m.type})` : ''}</Text>
              </View>
            ))}
          </Section>
        ) : null}

        {c.scheduleItems && c.scheduleItems.length > 0 ? (
          <Section title="Lịch trình">
            {c.scheduleItems.map((s, i) => (
              <View key={i} style={styles.bulletRow}>
                <Text style={styles.scheduleTime}>{formatTime(s.time)}</Text>
                <Text style={styles.bulletText}>{s.label}</Text>
              </View>
            ))}
          </Section>
        ) : null}

        {c.supplyItems && c.supplyItems.length > 0 ? (
          <Section title="Vật phẩm cần hỗ trợ">
            <View style={styles.tagRow}>
              {c.supplyItems.map((s, i) => (
                <View key={i} style={styles.tag}>
                  <Text style={styles.tagText}>{s}</Text>
                </View>
              ))}
            </View>
          </Section>
        ) : null}

        <Section title={`Đã quyên góp (${donations.length})`}>
          {donations.length === 0 ? (
            <Text style={styles.muted}>Chưa có quyên góp nào. Hãy là người đầu tiên chung tay!</Text>
          ) : (
            donations.map((d) => {
              const received = d.status === 'received';
              return (
                <View key={d.id} style={styles.donationRow}>
                  <MaterialCommunityIcons
                    name={received ? 'check-circle' : 'clock-outline'}
                    size={18}
                    color={received ? COLORS.primary : COLORS.onSurfaceVariant}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.donationItem}>
                      {d.itemName}{d.quantity ? ` · ${d.quantity}` : ''}
                    </Text>
                    <Text style={styles.muted}>
                      {d.provider.businessName} · {received ? 'Đã nhận' : 'Chờ xác nhận'}
                    </Text>
                    {d.note ? <Text style={styles.donationNote}>“{d.note}”</Text> : null}
                  </View>
                </View>
              );
            })
          )}
        </Section>
      </ScrollView>

      {/* Footer: nút quyên góp (chỉ khi chiến dịch còn nhận) */}
      <View style={styles.footer}>
        {donatable ? (
          <Button
            mode="contained"
            icon="hand-heart-outline"
            buttonColor={COLORS.primary}
            onPress={() => setDialogVisible(true)}
            contentStyle={{ height: 48 }}
            style={styles.donateBtn}
          >
            Quyên góp nguyên liệu
          </Button>
        ) : (
          <Text style={styles.footerNote}>Chiến dịch hiện không nhận quyên góp.</Text>
        )}
      </View>

      <DonationDialog
        visible={dialogVisible}
        campaignId={c.id}
        campaignTitle={c.title}
        onDismiss={() => setDialogVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    height: 56, paddingHorizontal: 20, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'space-between',
  },
  headerTitle: { fontWeight: '700', color: COLORS.onSurface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  title: { flex: 1, fontSize: 20, fontWeight: '700', color: COLORS.onSurface, lineHeight: 27 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, marginTop: 2 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  description: { fontSize: 14, color: COLORS.onSurfaceVariant, lineHeight: 21, marginBottom: 14 },
  card: {
    backgroundColor: COLORS.surface, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: COLORS.outline, gap: 10,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  infoText: { flex: 1, fontSize: 14, color: COLORS.onSurface },
  section: { marginTop: 20 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: COLORS.onSurface, marginBottom: 10 },
  slotLine: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  slotLabel: { fontSize: 14, color: COLORS.onSurface },
  slotCount: { fontSize: 14, fontWeight: '600', color: COLORS.onSurfaceVariant },
  bulletRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  bulletText: { flex: 1, fontSize: 14, color: COLORS.onSurface },
  scheduleTime: { fontSize: 13, fontWeight: '700', color: COLORS.primary, width: 52 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.outline, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  tagText: { fontSize: 13, color: COLORS.onSurface },
  muted: { fontSize: 13, color: COLORS.onSurfaceVariant, lineHeight: 19 },
  donationRow: { flexDirection: 'row', gap: 10, paddingVertical: 8, alignItems: 'flex-start' },
  donationItem: { fontSize: 14, fontWeight: '600', color: COLORS.onSurface },
  donationNote: { fontSize: 13, color: COLORS.onSurfaceVariant, fontStyle: 'italic', marginTop: 2 },
  footer: {
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20,
    borderTopWidth: 1, borderTopColor: COLORS.outline, backgroundColor: COLORS.surface,
  },
  donateBtn: { borderRadius: 12 },
  footerNote: { textAlign: 'center', fontSize: 14, color: COLORS.onSurfaceVariant },
});
