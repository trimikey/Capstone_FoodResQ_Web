import { useCallback, useEffect } from 'react';
import { AppState, View, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Button } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCampaignDetail, useMyTasks, useApplyCampaign, type AssignmentRole } from '@/hooks/useCampaigns';
import { useShifts, useMenuItems, useApplyShift, type CampaignShift } from '@/hooks/useKitchenOps';
import { useVolunteerMe } from '@/hooks/useVolunteer';
import { VolunteerKitchenOpsPanel } from '@/components/kitchen/VolunteerKitchenOpsPanel';
import {
  statusMeta,
  formatDate,
  formatTime,
  charityName,
  slotProgress,
  canApplyCampaign,
  ASSIGNMENT_ROLE_LABEL,
} from '@/utils/campaign';
import { formatMenuItem, formatSupplyItem } from '@/utils/campaignFormat';
import { getErrorMessage } from '@/hooks/useErrorHandler';
import { Popup } from '@/components/ui/AppPopup';
import { ScreenState } from '@/components/ui/ScreenState';
import { BackButton } from '@/components/ui/BackButton';
import { NotificationBell } from '@/components/NotificationBell';
import { mobileColors as COLORS, elevation, radius, spacing } from '@/theme/design';

const ASSIGNMENT_ROLES: AssignmentRole[] = ['chef', 'waiter', 'shipper'];

function shiftApplyLabel(role?: AssignmentRole): string {
  switch (role) {
    case 'chef':
      return 'Đăng ký ca bếp';
    case 'waiter':
      return 'Đăng ký ca phục vụ';
    case 'shipper':
      return 'Đăng ký ca vận chuyển';
    default:
      return 'Đăng ký ca';
  }
}

function InfoRow({ icon, children }: { icon: any; children: React.ReactNode }) {
  return (
    <View style={styles.infoRow}>
      <MaterialCommunityIcons name={icon} size={18} color={COLORS.purple} />
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
 * Chi tiết chiến dịch (Volunteer) — xem thông tin + đăng ký vai trò.
 * Mỗi vai trò chỉ đăng ký được khi: chiến dịch đang tuyển/diễn ra, TNV có đúng
 * chuyên môn, slot chưa đầy và chưa đăng ký vai trò đó.
 */
export default function VolunteerCampaignDetailScreen() {
  const { id, returnTo, returnSegment } = useLocalSearchParams<{
    id: string;
    returnTo?: string;
    returnSegment?: 'open' | 'tasks';
  }>();
  const { data: c, isLoading, isError, refetch } = useCampaignDetail(id);
  const { data: volunteerProfile } = useVolunteerMe();
  const { data: myTasks, refetch: refetchTasks } = useMyTasks(true);
  const { data: shifts = [], refetch: refetchShifts } = useShifts(id);
  const { data: kitchenMenu = [] } = useMenuItems(id);
  const applyMut = useApplyCampaign();
  const applyShiftMut = useApplyShift();

  const refetchCampaignState = useCallback(() => {
    void Promise.all([refetch(), refetchShifts(), refetchTasks()]);
  }, [refetch, refetchShifts, refetchTasks]);

  useFocusEffect(
    useCallback(() => {
      refetchCampaignState();
    }, [refetchCampaignState])
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refetchCampaignState();
    });
    return () => sub.remove();
  }, [refetchCampaignState]);

  const myCampaignTasks = (myTasks ?? []).filter((t) => t.campaign.id === id);
  const hasPendingApplication = myCampaignTasks.some((t) => t.status === 'pending');

  useEffect(() => {
    if (!hasPendingApplication) return;
    const timer = setInterval(refetchCampaignState, 4_000);
    return () => clearInterval(timer);
  }, [hasPendingApplication, refetchCampaignState]);

  const handleBack = () => {
    if (returnTo === '/notifications' || returnTo === '/(app)/notifications') {
      router.dismissTo('/notifications');
      return;
    }
    if (returnTo === '/volunteer/campaigns' || returnTo === '/(app)/volunteer/campaigns') {
      router.navigate({
        pathname: '/volunteer/campaigns',
        params: returnSegment ? { segment: returnSegment } : undefined,
      });
      return;
    }
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.navigate('/volunteer/campaigns');
  };

  const Header = (
    <View style={styles.header}>
      <BackButton onPress={handleBack} />
      <Text variant="titleMedium" style={styles.headerTitle}>Chi tiết chiến dịch</Text>
      <NotificationBell />
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
  const open = canApplyCampaign(c.status);
  const hasShiftSchedule = shifts.length > 0;
  // Chỉ chuyên môn đã xác minh mới được dùng để đăng ký ca.
  const verifiedSpecs = new Set(
    (volunteerProfile?.specializations ?? []).filter((s) => s.isVerified).map((s) => s.specialization)
  );
  // Role-level apply chỉ là assignment tổng không gắn ca. Shift-level apply phải xét theo shiftId.
  const appliedRoles = new Set(myCampaignTasks.filter((t) => !t.shiftId).map((t) => t.role));
  const shiftApplications = new Map(myCampaignTasks.filter((t) => t.shiftId).map((t) => [t.shiftId, t]));

  const pickShiftRole = (shift: CampaignShift): AssignmentRole | undefined => {
    if (shift.role) return shift.role;
    return ASSIGNMENT_ROLES.find((role) => verifiedSpecs.has(role));
  };

  const handleApply = async (role: AssignmentRole) => {
    try {
      await applyMut.mutateAsync({ campaignId: c.id, role });
      Popup.show({ type: 'success', text1: `Đã đăng ký ${ASSIGNMENT_ROLE_LABEL[role]}`, text2: 'Xem ở "Việc của tôi".' });
    } catch (err) {
      Popup.show({ type: 'error', text1: 'Đăng ký thất bại', text2: getErrorMessage(err) });
    }
  };

  const handleApplyShift = async (shift: CampaignShift) => {
    const roleToSend = pickShiftRole(shift);
    if (!roleToSend) {
      Popup.show({ type: 'warning', text1: 'Chưa có vai trò phù hợp', text2: 'Cập nhật chuyên môn hoặc chọn ca theo vai trò khác.' });
      return;
    }
    try {
      await applyShiftMut.mutateAsync({ campaignId: c.id, shiftId: shift.id, role: roleToSend });
      await Promise.all([refetch(), refetchShifts(), refetchTasks()]);
      Popup.show({ type: 'success', text1: shiftApplyLabel(roleToSend), text2: shift.label });
    } catch (err) {
      Popup.show({ type: 'error', text1: 'Đăng ký ca thất bại', text2: getErrorMessage(err) });
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
        </View>

        {/* Đăng ký vai trò */}
        {slots.length > 0 ? (
          <Section title={hasShiftSchedule ? 'Nhu cầu tình nguyện' : 'Đăng ký vai trò tình nguyện'}>
            {!open ? (
              <Text style={styles.muted}>Chiến dịch hiện không nhận đăng ký.</Text>
            ) : null}
            {hasShiftSchedule && open ? (
              <Text style={styles.hint}>Chiến dịch này đăng ký theo ca. Chọn ca làm việc phù hợp ở bên dưới.</Text>
            ) : null}
            {slots.map((s) => {
              const full = s.filled >= s.needed;
              const hasSpec = verifiedSpecs.has(s.role);
              const applied = appliedRoles.has(s.role);
              const disabled = !open || full || !hasSpec || applied || hasShiftSchedule || applyMut.isPending;
              // Lý do không đăng ký được (ưu tiên rõ ràng cho TNV).
              let reason: string | null = null;
              if (hasShiftSchedule) reason = 'Chọn ca bên dưới';
              else if (applied) reason = 'Đã đăng ký';
              else if (!hasSpec) reason = 'Chưa có chuyên môn này';
              else if (full) reason = 'Đã đủ người';
              return (
                <View key={s.role} style={styles.roleRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.roleLabel}>{s.label}</Text>
                    <Text style={[styles.roleCount, full && { color: COLORS.teal }]}>
                      {s.filled}/{s.needed} {full ? '- Đủ' : 'đã đăng ký'}
                    </Text>
                  </View>
                  {applied && !hasShiftSchedule ? (
                    <View style={styles.appliedPill}>
                      <MaterialCommunityIcons name="check-circle" size={16} color={COLORS.teal} />
                      <Text style={styles.appliedPillText}>Đã đăng ký</Text>
                    </View>
                  ) : reason ? (
                    <View style={styles.disabledPill}>
                      <Text style={styles.disabledPillText}>{reason}</Text>
                    </View>
                  ) : (
                    <Button
                      mode="contained"
                      compact
                      buttonColor={COLORS.primary}
                      disabled={disabled}
                      loading={applyMut.isPending && applyMut.variables?.role === s.role}
                      onPress={() => handleApply(s.role)}
                    >
                      {reason ?? 'Đăng ký'}
                    </Button>
                  )}
                </View>
              );
            })}
            {open && slots.some((s) => verifiedSpecs.has(s.role)) ? null : open ? (
              <Text style={styles.hint}>
                Bạn chưa có chuyên môn phù hợp với chiến dịch này. Cập nhật chuyên môn ở mục Hồ sơ.
              </Text>
            ) : null}
          </Section>
        ) : (
          <Section title="Đăng ký vai trò tình nguyện">
            <Text style={styles.muted}>Chiến dịch này không cần tuyển tình nguyện viên.</Text>
          </Section>
        )}

        {/* Ca làm việc (kitchen-ops) — đăng ký theo ca */}
        {shifts.length > 0 ? (
          <Section title="Ca làm việc">
            {shifts.map((s) => {
              const full = s.slotsFilled >= s.slotsNeeded;
              const roleToSend = pickShiftRole(s);
              const shiftApplication = shiftApplications.get(s.id);
              const alreadyApplied = !!shiftApplication;
              const eligible = !!roleToSend && (!s.role || verifiedSpecs.has(s.role));
              const disabled = !open || full || !eligible || applyShiftMut.isPending;
              const rejected = shiftApplication?.status === 'rejected';
              const activeApplication = alreadyApplied && !rejected;
              const appliedLabel = shiftApplication?.status === 'pending'
                ? 'Chờ duyệt'
                : rejected
                  ? 'Đã từ chối'
                  : 'Đã duyệt';
              const reason = full ? 'Đã đủ' : activeApplication ? appliedLabel : !eligible ? 'Không hợp chuyên môn' : null;
              return (
                <View key={s.id} style={styles.shiftRow}>
                  <View style={styles.shiftInfo}>
                    <Text style={styles.shiftLabel}>{s.label}</Text>
                    <Text style={styles.shiftMeta}>
                      {s.startTime}-{s.endTime}
                      {s.role ? ` - ${ASSIGNMENT_ROLE_LABEL[s.role] ?? s.role}` : ' - Chung'} - {s.slotsFilled}/{s.slotsNeeded}
                    </Text>
                  </View>
                  <View style={styles.shiftAction}>
                    {activeApplication ? (
                      <View style={[styles.appliedPill, styles.shiftPill]}>
                        <MaterialCommunityIcons
                          name={shiftApplication?.status === 'pending' ? 'clock-outline' : 'check-circle'}
                          size={16}
                          color={COLORS.teal}
                        />
                        <Text style={styles.appliedPillText}>{appliedLabel}</Text>
                      </View>
                    ) : rejected ? (
                      <View style={[styles.rejectedPill, styles.shiftPill]}>
                        <MaterialCommunityIcons name="close-circle-outline" size={16} color={COLORS.error} />
                        <Text style={styles.rejectedPillText}>Đã từ chối</Text>
                      </View>
                    ) : reason ? (
                      <View style={[styles.disabledPill, styles.shiftPill]}>
                        <Text style={styles.disabledPillText}>{reason}</Text>
                      </View>
                    ) : (
                      <Button
                        mode="contained"
                        compact
                        buttonColor={COLORS.primary}
                        disabled={disabled}
                        loading={applyShiftMut.isPending && applyShiftMut.variables?.shiftId === s.id}
                        onPress={() => handleApplyShift(s)}
                        style={styles.shiftButton}
                        contentStyle={styles.shiftButtonContent}
                      >
                        {shiftApplyLabel(roleToSend)}
                      </Button>
                    )}
                  </View>
                </View>
              );
            })}
          </Section>
        ) : null}

        {kitchenMenu.length > 0 ? (
          <Section title="Thực đơn cập nhật">
            {kitchenMenu.map((m) => (
              <View key={m.id} style={styles.bulletRow}>
                <MaterialCommunityIcons name="silverware-fork-knife" size={15} color={COLORS.onSurfaceVariant} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.bulletText}>{m.recipe?.name ?? m.customName ?? 'Món'}</Text>
                  {m.plannedServings ? <Text style={styles.muted}>Dự kiến {m.plannedServings} suất</Text> : null}
                </View>
              </View>
            ))}
          </Section>
        ) : null}

        {c.menuItems && c.menuItems.length > 0 ? (
          <Section title={kitchenMenu.length > 0 ? 'Thực đơn dự kiến (lúc tạo)' : 'Thực đơn'}>
            {c.menuItems.map((m, i) => (
              <View key={i} style={styles.bulletRow}>
                <MaterialCommunityIcons name="silverware-fork-knife" size={15} color={COLORS.onSurfaceVariant} />
                <Text style={styles.bulletText}>{formatMenuItem(m)}</Text>
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
                <View key={i} style={styles.tag}><Text style={styles.tagText}>{formatSupplyItem(s)}</Text></View>
              ))}
            </View>
          </Section>
        ) : null}

        <VolunteerKitchenOpsPanel
          campaignId={c.id}
          isChef={verifiedSpecs.has('chef')}
          isWaiter={verifiedSpecs.has('waiter')}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    height: 56, paddingHorizontal: 20, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'space-between',
  },
  headerTitle: { flex: 1, textAlign: 'center', fontWeight: '900', color: COLORS.onSurface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.section },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: spacing.md,
    padding: spacing.lg,
    borderRadius: 30,
    backgroundColor: COLORS.heroCampaign,
    ...elevation.card,
  },
  title: { flex: 1, fontSize: 22, fontWeight: '900', color: COLORS.onPrimary, lineHeight: 28 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, marginTop: 2 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  description: { fontSize: 14, color: COLORS.onSurfaceVariant, lineHeight: 21, marginBottom: 14 },
  card: {
    backgroundColor: COLORS.surface, borderRadius: 28, padding: spacing.lg,
    borderWidth: 1, borderColor: COLORS.outlineVariant, gap: 10,
    ...elevation.card,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  infoText: { flex: 1, fontSize: 14, color: COLORS.onSurface },
  section: { marginTop: spacing.xl, padding: spacing.lg, borderRadius: 28, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.outlineVariant, ...elevation.card },
  sectionTitle: { fontSize: 16, fontWeight: '900', color: COLORS.onSurface, marginBottom: 10 },
  roleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.outlineVariant,
  },
  roleLabel: { fontSize: 14, fontWeight: '900', color: COLORS.onSurface },
  roleCount: { fontSize: 13, color: COLORS.onSurfaceVariant, marginTop: 2 },
  appliedPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.tealContainer, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  appliedPillText: { fontSize: 13, fontWeight: '600', color: COLORS.teal },
  rejectedPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#fee2e2', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  rejectedPillText: { fontSize: 13, fontWeight: '700', color: COLORS.error },
  disabledPill: { backgroundColor: COLORS.surfaceContainerLow, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  disabledPillText: { fontSize: 13, fontWeight: '700', color: COLORS.onSurfaceVariant },
  hint: { fontSize: 13, color: COLORS.onSurfaceVariant, fontStyle: 'italic', marginTop: 10, lineHeight: 19 },
  muted: { fontSize: 13, color: COLORS.onSurfaceVariant, lineHeight: 19 },
  shiftRow: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.outlineVariant,
  },
  shiftInfo: { gap: 2 },
  shiftAction: { marginTop: spacing.sm, alignItems: 'flex-end' },
  shiftPill: { alignSelf: 'flex-end', maxWidth: '100%' },
  shiftButton: { alignSelf: 'flex-end', borderRadius: radius.pill },
  shiftButtonContent: { minHeight: 38, paddingHorizontal: spacing.md },
  shiftLabel: { fontSize: 14, fontWeight: '600', color: COLORS.onSurface },
  shiftMeta: { fontSize: 13, color: COLORS.onSurfaceVariant, marginTop: 2 },
  bulletRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  bulletText: { flex: 1, fontSize: 14, color: COLORS.onSurface },
  scheduleTime: { fontSize: 13, fontWeight: '700', color: COLORS.indigo, width: 52 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { backgroundColor: COLORS.surfaceContainerLow, borderWidth: 1, borderColor: COLORS.outlineVariant, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 6 },
  tagText: { fontSize: 13, color: COLORS.onSurface },
});
