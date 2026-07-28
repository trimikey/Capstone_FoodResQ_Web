import { useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Button } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { usePublicCampaignDetail, type CampaignDonation } from '@/hooks/useCampaigns';
import { useMyProfile } from '@/hooks/useProfile';
import { DonationDialog } from '@/components/DonationDialog';
import {
  statusMeta,
  formatDate,
  formatTime,
  slotProgress,
  canDonate,
} from '@/utils/campaign';
import { formatMenuItem, normalizeSupplyItem } from '@/utils/campaignFormat';
import { ScreenState } from '@/components/ui/ScreenState';
import { mobileColors as COLORS, spacing } from '@/theme/design';
import { AppImage } from '@/components/ui/AppImage';

type NormalizedSupply = { name: string; quantity?: number | null; unit?: string | null };

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

function DetailChip({ icon, label }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string }) {
  return (
    <View style={styles.detailChip}>
      <MaterialCommunityIcons name={icon} size={16} color={COLORS.primary} />
      <Text style={styles.detailChipText} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function StatPill({ value, label }: { value: string | number; label: string }) {
  return (
    <View style={styles.statPill}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function EmptyBox({ text }: { text: string }) {
  return (
    <View style={styles.emptyBox}>
      <Text style={styles.muted}>{text}</Text>
    </View>
  );
}

/**
 * Chi tiết chiến dịch bếp ăn (Provider) — thông tin, thực đơn, lịch trình,
 * vật phẩm cần, tiến độ TNV, danh sách quyên góp + nút quyên góp nguyên liệu.
 */
export default function ProviderCampaignDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: c, isLoading, isError, refetch } = usePublicCampaignDetail(id);
  const { data: profile } = useMyProfile(true);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState<NormalizedSupply | null>(null);

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
        <ScreenState kind="loading" title="Đang tải chiến dịch" />
      </SafeAreaView>
    );
  }

  if (isError || !c) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {Header}
        <ScreenState kind="error" title="Không tải được chiến dịch" actionLabel="Thử lại" onAction={() => refetch()} />
      </SafeAreaView>
    );
  }

  const sm = statusMeta(c.status);
  const slots = slotProgress(c);
  const donations = c.donations ?? [];
  const donatable = canDonate(c.status);
  const provider = profile?.provider;
  const verified = provider?.isVerified === true;
  const supplyList = (c.supplyItems ?? []).map(normalizeSupplyItem).filter(Boolean) as NormalizedSupply[];
  const donationsByItem = groupDonationsByItem(donations);
  const totalSlots = slots.reduce((sum, slot) => sum + slot.needed, 0);
  const filledSlots = slots.reduce((sum, slot) => sum + slot.filled, 0);
  const heroImage = c.imageUrls?.[0] ?? null;

  const openDonation = (item?: NormalizedSupply) => {
    setSelectedItem(item ?? null);
    setDialogVisible(true);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {Header}
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.heroCard}>
          {heroImage ? (
            <AppImage source={{ uri: heroImage }} style={styles.heroImage} />
          ) : null}
          {heroImage ? <View style={styles.heroOverlay} /> : null}
          <View style={styles.heroContent}>
            <View style={styles.heroTop}>
              <Text style={styles.heroKicker}>Chiến dịch bếp ăn</Text>
              <View style={[styles.badge, { backgroundColor: sm.bg }]}>
                <Text style={[styles.badgeText, { color: sm.color }]}>{sm.label}</Text>
              </View>
            </View>
            <Text style={styles.title} numberOfLines={3} ellipsizeMode="tail">{c.title}</Text>
            {c.description ? (
              <Text style={styles.description} numberOfLines={4} ellipsizeMode="tail">{c.description}</Text>
            ) : null}
            <View style={styles.heroStats}>
              <StatPill value={supplyList.length} label="món cần hỗ trợ" />
              <StatPill value={donations.length} label="lượt góp" />
              <StatPill value={totalSlots > 0 ? `${filledSlots}/${totalSlots}` : 0} label="TNV" />
            </View>
          </View>
        </View>

        <View style={styles.detailGrid}>
          <DetailChip icon="calendar-clock" label={`${formatDate(c.scheduledDate)} · ${formatTime(c.startTime)}-${formatTime(c.endTime)}`} />
          {c.expectedServings ? <DetailChip icon="food-outline" label={`${c.expectedServings} suất dự kiến`} /> : null}
        </View>

        <View style={styles.card}>
          <InfoRow icon="account-group-outline">{c.organizationName ?? 'Tổ chức từ thiện'}</InfoRow>
          <InfoRow icon="map-marker-outline">{c.kitchenAddress}</InfoRow>
        </View>

        <View style={[styles.providerCard, verified ? styles.providerReady : styles.providerBlocked]}>
          <View style={styles.providerIcon}>
            <MaterialCommunityIcons name={verified ? 'shield-check-outline' : 'shield-alert-outline'} size={22} color={verified ? COLORS.primary : COLORS.warning} />
          </View>
          <View style={styles.providerCopy}>
            <Text style={styles.providerLabel}>{verified ? 'Sẵn sàng quyên góp' : 'Chưa thể quyên góp'}</Text>
            <Text style={styles.providerName} numberOfLines={1}>{provider?.businessName ?? 'Chưa có hồ sơ NCC'}</Text>
            <Text style={styles.muted}>
              {provider
                ? verified
                  ? 'Hồ sơ đã xác minh. Bạn có thể chọn nguyên liệu và gửi đăng ký hỗ trợ.'
                  : 'Cần hồ sơ nhà cung cấp được duyệt trước khi đăng ký cung cấp nguyên liệu.'
                : 'Tạo hồ sơ nhà cung cấp trước khi đăng ký nguyên liệu.'}
            </Text>
          </View>
        </View>

        <Section title={`Nguyên liệu cần hỗ trợ (${supplyList.length})`}>
          {supplyList.length === 0 ? (
            <EmptyBox text="Ban tổ chức chưa liệt kê nguyên liệu cần hỗ trợ." />
          ) : (
            supplyList.map((s, index) => {
              const itemDonations = donationsByItem[s.name.trim().toLowerCase()] ?? [];
              const received = itemDonations.filter((d) => d.status === 'received').length;
              const promised = itemDonations.length - received;
              const providers = Array.from(new Set(itemDonations.map((d) => d.provider.businessName))).filter(Boolean);
              return (
                <View key={`${s.name}-${index}`} style={styles.supplyCard}>
                  <View style={styles.supplyIcon}>
                    <MaterialCommunityIcons name={iconForSupply(s.name)} size={20} color={COLORS.secondary} />
                  </View>
                  <View style={styles.supplyCopy}>
                    <Text style={styles.supplyName} numberOfLines={2}>{s.name}</Text>
                    <Text style={styles.muted}>
                      {s.quantity != null ? `Yêu cầu: ${s.quantity}${s.unit ? ` ${s.unit}` : ''}` : 'Không giới hạn số lượng'}
                    </Text>
                    {providers.length > 0 ? (
                      <Text style={styles.providerList} numberOfLines={1}>
                        NCC đăng ký: {providers.slice(0, 2).join(', ')}
                        {providers.length > 2 ? `, +${providers.length - 2}` : ''}
                      </Text>
                    ) : null}
                    <Text style={styles.supplyStatus}>
                      {received > 0 ? 'Đã nhận' : promised > 0 ? 'Đã hứa' : 'Chưa có'} - {itemDonations.length} lượt
                    </Text>
                  </View>
                  <Pressable
                    disabled={!donatable || !verified}
                    onPress={() => openDonation(s)}
                    style={({ pressed }) => [
                      styles.itemDonateButton,
                      (!donatable || !verified) && styles.disabledButton,
                      pressed && verified ? styles.pressedButton : null,
                    ]}
                  >
                    <Text style={styles.itemDonateText}>Góp</Text>
                  </Pressable>
                </View>
              );
            })
          )}
        </Section>

        {slots.length > 0 ? (
          <Section title="Tình nguyện viên">
            {slots.map((s) => {
              const full = s.filled >= s.needed;
              const pct = s.needed > 0 ? Math.min(100, (s.filled / s.needed) * 100) : 0;
              return (
                <View key={s.role} style={styles.slotCard}>
                  <View style={styles.slotLine}>
                    <Text style={styles.slotLabel}>{s.label}</Text>
                    <Text style={[styles.slotCount, full && { color: COLORS.primary }]}>
                      {s.filled}/{s.needed} {full ? '· Đủ' : ''}
                    </Text>
                  </View>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${pct}%` }]} />
                  </View>
                </View>
              );
            })}
          </Section>
        ) : null}

        {c.menuItems && c.menuItems.length > 0 ? (
          <Section title="Thực đơn">
            {c.menuItems.map((m, i) => (
              <View key={i} style={styles.infoCardRow}>
                <MaterialCommunityIcons name="silverware-fork-knife" size={15} color={COLORS.onSurfaceVariant} />
                <Text style={styles.bulletText}>{formatMenuItem(m)}</Text>
              </View>
            ))}
          </Section>
        ) : null}

        {c.scheduleItems && c.scheduleItems.length > 0 ? (
          <Section title="Lịch trình">
            {c.scheduleItems.map((s, i) => (
              <View key={i} style={styles.infoCardRow}>
                <Text style={styles.scheduleTime}>{formatTime(s.time)}</Text>
                <Text style={styles.bulletText}>{s.label}</Text>
              </View>
            ))}
          </Section>
        ) : null}

        <Section title={`Đã quyên góp (${donations.length})`}>
          {donations.length === 0 ? (
            <EmptyBox text="Chưa có quyên góp nào. Hãy là người đầu tiên chung tay." />
          ) : (
            donations.map((d) => {
              const received = d.status === 'received';
              return (
                <View key={d.id} style={styles.donationCard}>
                  <MaterialCommunityIcons
                    name={received ? 'check-circle' : 'clock-outline'}
                    size={18}
                    color={received ? COLORS.primary : COLORS.onSurfaceVariant}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.donationItem}>
                      {d.itemName}{d.quantity ? ` - ${d.quantity}` : ''}
                    </Text>
                    <Text style={styles.muted}>
                      {d.provider.businessName} - {received ? 'Đã nhận' : 'Chờ xác nhận'}
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
            disabled={!verified}
            onPress={() => openDonation()}
            contentStyle={{ height: 48 }}
            style={styles.donateBtn}
          >
            {verified ? 'Quyên góp nguyên liệu' : 'Hồ sơ NCC chưa được duyệt'}
          </Button>
        ) : (
          <Text style={styles.footerNote}>Chiến dịch hiện không nhận quyên góp.</Text>
        )}
      </View>

      <DonationDialog
        visible={dialogVisible}
        campaignId={c.id}
        campaignTitle={c.title}
        initialItem={selectedItem ? { name: selectedItem.name, unit: selectedItem.unit } : undefined}
        onDismiss={() => {
          setDialogVisible(false);
          setSelectedItem(null);
        }}
      />
    </SafeAreaView>
  );
}

function groupDonationsByItem(donations: CampaignDonation[]) {
  return donations.reduce<Record<string, CampaignDonation[]>>((acc, donation) => {
    const key = donation.itemName.trim().toLowerCase();
    if (!acc[key]) acc[key] = [];
    acc[key].push(donation);
    return acc;
  }, {});
}

function iconForSupply(name: string): keyof typeof MaterialCommunityIcons.glyphMap {
  const lower = name.toLowerCase();
  if (lower.includes('gạo') || lower.includes('cơm')) return 'rice';
  if (lower.includes('rau') || lower.includes('củ') || lower.includes('salad')) return 'leaf';
  if (lower.includes('thịt') || lower.includes('cá') || lower.includes('hải sản')) return 'fish';
  if (lower.includes('trứng')) return 'egg';
  if (lower.includes('sữa')) return 'water-outline';
  if (lower.includes('bánh')) return 'bread-slice-outline';
  if (lower.includes('nước')) return 'bottle-soda-outline';
  return 'package-variant-closed';
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    height: 56, paddingHorizontal: 20, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'space-between',
  },
  headerTitle: { fontWeight: '700', color: COLORS.onSurface },
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 132 },
  heroCard: {
    minHeight: 252,
    borderRadius: 24,
    marginBottom: spacing.lg,
    overflow: 'hidden',
    backgroundColor: COLORS.primary,
  },
  heroImage: StyleSheet.absoluteFill,
  heroOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(3, 96, 61, 0.82)',
  },
  heroContent: { flex: 1, padding: spacing.lg, justifyContent: 'space-between' },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  heroKicker: { flex: 1, color: COLORS.secondaryContainer, fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  title: { marginTop: 22, fontSize: 28, fontWeight: '900', color: '#ffffff', lineHeight: 35 },
  badge: { flexShrink: 0, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  description: { marginTop: 10, fontSize: 14, color: 'rgba(255,255,255,0.84)', lineHeight: 21 },
  heroStats: { flexDirection: 'row', gap: 8, marginTop: 20 },
  statPill: {
    flex: 1,
    minHeight: 62,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  statValue: { color: '#ffffff', fontSize: 18, fontWeight: '900' },
  statLabel: { marginTop: 2, color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '700' },
  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.md },
  detailChip: {
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.outline,
  },
  detailChipText: { flexShrink: 1, fontSize: 12, color: COLORS.onSurface, fontWeight: '700' },
  card: {
    backgroundColor: COLORS.surface, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: COLORS.outline, gap: 10,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  infoText: { flex: 1, fontSize: 14, color: COLORS.onSurface },
  section: { marginTop: 20 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: COLORS.onSurface, marginBottom: 10 },
  providerCard: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.outline,
    padding: 14,
    marginTop: spacing.md,
  },
  providerReady: { borderColor: 'rgba(16, 185, 129, 0.28)', backgroundColor: '#f4fbf7' },
  providerBlocked: { borderColor: 'rgba(245, 158, 11, 0.32)', backgroundColor: '#fffaf0' },
  providerIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
  },
  providerCopy: { flex: 1, minWidth: 0 },
  providerLabel: { fontSize: 11, fontWeight: '900', color: COLORS.primary, textTransform: 'uppercase' },
  providerName: { marginTop: 2, fontSize: 14, fontWeight: '800', color: COLORS.onSurface },
  supplyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.outline,
    padding: 12,
    marginBottom: 8,
  },
  supplyCopy: { flex: 1, minWidth: 0 },
  supplyIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.secondaryContainer,
  },
  supplyName: { fontSize: 14, fontWeight: '800', color: COLORS.onSurface },
  providerList: { marginTop: 2, fontSize: 12, color: COLORS.onSurfaceVariant },
  supplyStatus: { marginTop: 4, fontSize: 12, fontWeight: '700', color: COLORS.primary },
  itemDonateButton: {
    width: 64,
    height: 44,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
  },
  itemDonateText: { color: '#ffffff', fontSize: 14, fontWeight: '900' },
  disabledButton: { opacity: 0.42 },
  pressedButton: { transform: [{ scale: 0.98 }] },
  emptyBox: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.outline,
    backgroundColor: COLORS.surface,
    padding: 14,
  },
  slotCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.outline,
    backgroundColor: COLORS.surface,
    padding: 12,
    marginBottom: 8,
  },
  slotLine: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  slotLabel: { fontSize: 14, color: COLORS.onSurface },
  slotCount: { fontSize: 14, fontWeight: '600', color: COLORS.onSurfaceVariant },
  progressTrack: { height: 6, borderRadius: 999, overflow: 'hidden', backgroundColor: COLORS.secondaryContainer },
  progressFill: { height: '100%', borderRadius: 999, backgroundColor: COLORS.primary },
  infoCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.outline,
    backgroundColor: COLORS.surface,
    padding: 12,
    marginBottom: 8,
  },
  bulletText: { flex: 1, fontSize: 14, color: COLORS.onSurface },
  scheduleTime: { fontSize: 13, fontWeight: '700', color: COLORS.primary, width: 52 },
  muted: { fontSize: 13, color: COLORS.onSurfaceVariant, lineHeight: 19 },
  donationCard: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.outline,
    backgroundColor: COLORS.surface,
    padding: 12,
    marginBottom: 8,
  },
  donationItem: { fontSize: 14, fontWeight: '600', color: COLORS.onSurface },
  donationNote: { fontSize: 13, color: COLORS.onSurfaceVariant, fontStyle: 'italic', marginTop: 2 },
  footer: {
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20,
    borderTopWidth: 1, borderTopColor: COLORS.outline, backgroundColor: COLORS.surface,
  },
  donateBtn: { borderRadius: 12 },
  footerNote: { textAlign: 'center', fontSize: 14, color: COLORS.onSurfaceVariant },
});
