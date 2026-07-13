import { useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Button, Portal, Dialog, TextInput } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import {
  useCampaignDetail,
  useStartCampaign,
  useCompleteCampaign,
  useConfirmDonation,
} from '@/hooks/useCampaigns';
import { useShifts, useMenuItems, useRemoveMenuItem } from '@/hooks/useKitchenOps';
import { ShiftDialog } from '@/components/kitchen/ShiftDialog';
import { MenuItemDialog } from '@/components/kitchen/MenuItemDialog';
import {
  statusMeta,
  formatDate,
  formatTime,
  charityName,
  slotProgress,
  canStartCampaign,
  canCompleteCampaign,
  ASSIGNMENT_ROLE_LABEL,
} from '@/utils/campaign';
import { getErrorMessage } from '@/hooks/useErrorHandler';
import { Popup } from '@/components/ui/AppPopup';
import { ScreenState } from '@/components/ui/ScreenState';
import { mobileColors as COLORS } from '@/theme/design';

function InfoRow({ icon, children }: { icon: any; children: React.ReactNode }) {
  return (
    <View style={styles.infoRow}>
      <MaterialCommunityIcons name={icon} size={18} color={COLORS.primary} />
      <Text style={styles.infoText}>{children}</Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

/**
 * Quản lý chiến dịch bếp ăn (Charity-org) — xem chi tiết + bắt đầu/kết thúc
 * chiến dịch, xác nhận nguyên liệu quyên góp, xem danh sách TNV đã ứng tuyển.
 */
export default function CharityCampaignDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: c, isLoading, isError, refetch } = useCampaignDetail(id);
  const startMut = useStartCampaign();
  const completeMut = useCompleteCampaign();
  const confirmMut = useConfirmDonation();
  const { data: shifts = [] } = useShifts(id);
  const { data: kitchenMenu = [] } = useMenuItems(id);
  const removeMenuMut = useRemoveMenuItem();
  const [completeVisible, setCompleteVisible] = useState(false);
  const [servings, setServings] = useState('');
  const [shiftDialog, setShiftDialog] = useState(false);
  const [menuDialog, setMenuDialog] = useState(false);

  const Header = (
    <View style={styles.header}>
      <Pressable onPress={() => router.back()} hitSlop={8}>
        <MaterialCommunityIcons name="arrow-left" size={24} color={COLORS.onSurface} />
      </Pressable>
      <Text variant="titleMedium" style={styles.headerTitle}>Quản lý chiến dịch</Text>
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
  const assignments = c.assignments ?? [];
  const pendingDonations = donations.filter((d) => d.status !== 'received').length;

  const handleStart = async () => {
    try {
      await startMut.mutateAsync(c.id);
      Popup.show({ type: 'success', text1: 'Đã bắt đầu chiến dịch' });
    } catch (err) {
      Popup.show({ type: 'error', text1: 'Không bắt đầu được', text2: getErrorMessage(err) });
    }
  };

  const handleComplete = async () => {
    const n = parseInt(servings, 10);
    if (!Number.isFinite(n) || n < 0) {
      Popup.show({ type: 'warning', text1: 'Số suất không hợp lệ' });
      return;
    }
    try {
      await completeMut.mutateAsync({ id: c.id, actualServings: n });
      setCompleteVisible(false);
      setServings('');
      Popup.show({ type: 'success', text1: 'Đã kết thúc chiến dịch', text2: `Đã phục vụ ${n} suất.` });
    } catch (err) {
      Popup.show({ type: 'error', text1: 'Không kết thúc được', text2: getErrorMessage(err) });
    }
  };

  const handleConfirmDonation = async (donationId: string) => {
    try {
      await confirmMut.mutateAsync({ donationId, campaignId: c.id });
      Popup.show({ type: 'success', text1: 'Đã xác nhận nhận nguyên liệu' });
    } catch (err) {
      Popup.show({ type: 'error', text1: 'Xác nhận thất bại', text2: getErrorMessage(err) });
    }
  };

  const handleRemoveMenu = async (itemId: string) => {
    try {
      await removeMenuMut.mutateAsync({ itemId, campaignId: c.id });
      Popup.show({ type: 'info', text1: 'Đã xoá món' });
    } catch (err) {
      Popup.show({ type: 'error', text1: 'Xoá món thất bại', text2: getErrorMessage(err) });
    }
  };

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
            {formatDate(c.scheduledDate)} - {formatTime(c.startTime)}-{formatTime(c.endTime)}
          </InfoRow>
          <InfoRow icon="map-marker-outline">{c.kitchenAddress}</InfoRow>
          {c.expectedServings ? (
            <InfoRow icon="food-outline">Dự kiến phục vụ {c.expectedServings} suất</InfoRow>
          ) : null}
          {c.status === 'completed' && c.actualServings != null ? (
            <InfoRow icon="check-circle-outline">Đã phục vụ thực tế {c.actualServings} suất</InfoRow>
          ) : null}
        </View>

        {slots.length > 0 ? (
          <Section title="Tình nguyện viên cần tuyển">
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

        <Section title={`TNV đã ứng tuyển (${assignments.length})`}>
          {assignments.length === 0 ? (
            <Text style={styles.muted}>Chưa có tình nguyện viên nào ứng tuyển.</Text>
          ) : (
            assignments.map((a) => (
              <View key={a.id} style={styles.assignRow}>
                <MaterialCommunityIcons name="account-outline" size={18} color={COLORS.onSurfaceVariant} />
                <Text style={styles.assignName}>{a.volunteer.user.fullName}</Text>
                <View style={styles.rolePill}>
                  <Text style={styles.rolePillText}>{ASSIGNMENT_ROLE_LABEL[a.role] ?? a.role}</Text>
                </View>
              </View>
            ))
          )}
        </Section>

        {/* Ca làm việc (kitchen-ops) */}
        <Section title={`Ca làm việc (${shifts.length})`}>
          {shifts.length === 0 ? (
            <Text style={styles.muted}>Chưa có ca làm việc nào.</Text>
          ) : (
            shifts.map((s) => {
              const full = s.slotsFilled >= s.slotsNeeded;
              return (
                <View key={s.id} style={styles.shiftRow}>
                  <MaterialCommunityIcons name="clock-outline" size={18} color={COLORS.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.shiftLabel}>{s.label}</Text>
                    <Text style={styles.muted}>
                      {s.startTime}-{s.endTime}
                      {s.role ? ` - ${ASSIGNMENT_ROLE_LABEL[s.role] ?? s.role}` : ' - Chung'}
                    </Text>
                  </View>
                  <Text style={[styles.slotCount, full && { color: COLORS.primary }]}>
                    {s.slotsFilled}/{s.slotsNeeded}
                  </Text>
                </View>
              );
            })
          )}
          <Button mode="text" icon="plus" textColor={COLORS.primary} onPress={() => setShiftDialog(true)} compact style={styles.addBtn}>
            Thêm ca
          </Button>
        </Section>

        {/* Món theo công thức (kitchen-ops menu-items) */}
        <Section title={`Món theo công thức (${kitchenMenu.length})`}>
          {kitchenMenu.length === 0 ? (
            <Text style={styles.muted}>Chưa có món nào. Thêm từ thư viện công thức hoặc món tự do.</Text>
          ) : (
            kitchenMenu.map((m) => (
              <View key={m.id} style={styles.menuRow}>
                <MaterialCommunityIcons name="silverware-fork-knife" size={16} color={COLORS.onSurfaceVariant} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.bulletText}>{m.recipe?.name ?? m.customName ?? 'Món'}</Text>
                  {m.plannedServings ? <Text style={styles.muted}>Dự kiến {m.plannedServings} suất</Text> : null}
                </View>
                <Pressable onPress={() => handleRemoveMenu(m.id)} hitSlop={8} disabled={removeMenuMut.isPending}>
                  <MaterialCommunityIcons name="close-circle" size={20} color={COLORS.error} />
                </Pressable>
              </View>
            ))
          )}
          <Button mode="text" icon="plus" textColor={COLORS.primary} onPress={() => setMenuDialog(true)} compact style={styles.addBtn}>
            Thêm món
          </Button>
        </Section>

        {c.menuItems && c.menuItems.length > 0 ? (
          <Section title="Thực đơn dự kiến (lúc tạo)">
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
                <View key={i} style={styles.tag}><Text style={styles.tagText}>{s}</Text></View>
              ))}
            </View>
          </Section>
        ) : null}

        <Section title={`Nguyên liệu quyên góp (${donations.length})`}>
          {donations.length === 0 ? (
            <Text style={styles.muted}>Chưa có quyên góp nào.</Text>
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
                    <Text style={styles.donationItem}>{d.itemName}{d.quantity ? ` - ${d.quantity}` : ''}</Text>
                    <Text style={styles.muted}>
                      {d.provider.businessName} - {received ? 'Đã nhận' : 'Chờ xác nhận'}
                    </Text>
                    {d.note ? <Text style={styles.donationNote}>“{d.note}”</Text> : null}
                  </View>
                  {!received ? (
                    <Button
                      mode="contained-tonal"
                      compact
                      textColor={COLORS.primary}
                      loading={confirmMut.isPending}
                      disabled={confirmMut.isPending}
                      onPress={() => handleConfirmDonation(d.id)}
                    >
                      Đã nhận
                    </Button>
                  ) : null}
                </View>
              );
            })
          )}
        </Section>
      </ScrollView>

      {/* Footer: hành động theo trạng thái */}
      <View style={styles.footer}>
        {canStartCampaign(c.status) ? (
          <Button
            mode="contained" icon="play-circle-outline" buttonColor={COLORS.primary}
            loading={startMut.isPending} disabled={startMut.isPending}
            onPress={handleStart} contentStyle={{ height: 48 }} style={styles.footerBtn}
          >
            Bắt đầu chiến dịch
          </Button>
        ) : canCompleteCampaign(c.status) ? (
          <Button
            mode="contained" icon="flag-checkered" buttonColor={COLORS.primary}
            onPress={() => setCompleteVisible(true)} contentStyle={{ height: 48 }} style={styles.footerBtn}
          >
            Kết thúc & nhập số suất
          </Button>
        ) : c.status === 'draft' ? (
          <Text style={styles.footerNote}>Chiến dịch đang chờ quản trị viên duyệt.</Text>
        ) : (
          <Text style={styles.footerNote}>
            {pendingDonations > 0
              ? `Còn ${pendingDonations} quyên góp chờ xác nhận.`
              : 'Chiến dịch đã hoàn tất.'}
          </Text>
        )}
      </View>

      <Portal>
        <Dialog visible={completeVisible} onDismiss={() => !completeMut.isPending && setCompleteVisible(false)} style={styles.dialog}>
          <Dialog.Title style={styles.dialogTitle}>Kết thúc chiến dịch</Dialog.Title>
          <Dialog.Content>
            <Text style={styles.muted}>Nhập số suất ăn đã phục vụ thực tế.</Text>
            <TextInput
              mode="outlined" keyboardType="numeric" label="Số suất thực tế"
              value={servings} onChangeText={setServings}
              outlineColor={COLORS.outline} activeOutlineColor={COLORS.primary}
              style={{ backgroundColor: COLORS.surface, marginTop: 12 }}
              disabled={completeMut.isPending}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setCompleteVisible(false)} textColor={COLORS.onSurfaceVariant} disabled={completeMut.isPending}>
              Huỷ
            </Button>
            <Button mode="contained" buttonColor={COLORS.primary} onPress={handleComplete} loading={completeMut.isPending} disabled={completeMut.isPending}>
              Xác nhận
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <ShiftDialog visible={shiftDialog} campaignId={c.id} onDismiss={() => setShiftDialog(false)} />
      <MenuItemDialog visible={menuDialog} campaignId={c.id} onDismiss={() => setMenuDialog(false)} />
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
  assignRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  assignName: { flex: 1, fontSize: 14, color: COLORS.onSurface },
  rolePill: { backgroundColor: COLORS.primaryContainer, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  rolePillText: { fontSize: 12, fontWeight: '600', color: COLORS.primary },
  bulletRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  bulletText: { flex: 1, fontSize: 14, color: COLORS.onSurface },
  shiftRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.outline },
  shiftLabel: { fontSize: 14, fontWeight: '600', color: COLORS.onSurface },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  addBtn: { alignSelf: 'flex-start', marginTop: 8 },
  scheduleTime: { fontSize: 13, fontWeight: '700', color: COLORS.primary, width: 52 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.outline, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  tagText: { fontSize: 13, color: COLORS.onSurface },
  muted: { fontSize: 13, color: COLORS.onSurfaceVariant, lineHeight: 19 },
  donationRow: { flexDirection: 'row', gap: 10, paddingVertical: 8, alignItems: 'center' },
  donationItem: { fontSize: 14, fontWeight: '600', color: COLORS.onSurface },
  donationNote: { fontSize: 13, color: COLORS.onSurfaceVariant, fontStyle: 'italic', marginTop: 2 },
  footer: {
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20,
    borderTopWidth: 1, borderTopColor: COLORS.outline, backgroundColor: COLORS.surface,
  },
  footerBtn: { borderRadius: 12 },
  footerNote: { textAlign: 'center', fontSize: 14, color: COLORS.onSurfaceVariant },
  dialog: { borderRadius: 20 },
  dialogTitle: { fontSize: 18, fontWeight: '700', color: COLORS.onSurface },
});
