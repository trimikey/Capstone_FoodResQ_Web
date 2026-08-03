import { useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Button, Portal, Dialog, TextInput } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import {
  useCampaignDetail,
  useStartCampaign,
  useCancelCampaign,
  useCompleteCampaign,
  useConfirmDonation,
  useCampaignChangeRequests,
  useSubmitCampaignChange,
  useCancelCampaignChange,
  useReviewAssignment,
  useProviders,
  useSendProviderRequest,
  useMySentProviderRequests,
  useSubmitProviderProposal,
  type Campaign,
  type CampaignChangeRequest,
  type SubmitCampaignChangeInput,
  type ProviderSummary,
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
  daysUntilUtcDate,
  formatCampaignDateRange,
  isSameUtcDate,
  ASSIGNMENT_ROLE_LABEL,
} from '@/utils/campaign';
import { formatMenuItem, formatSupplyItem } from '@/utils/campaignFormat';
import { getErrorMessage } from '@/hooks/useErrorHandler';
import { Popup } from '@/components/ui/AppPopup';
import { ScreenState } from '@/components/ui/ScreenState';
import { BackButton } from '@/components/ui/BackButton';
import { NotificationBell } from '@/components/NotificationBell';
import { mobileColors as COLORS } from '@/theme/design';

const CHANGE_STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'Chờ duyệt', color: '#d97706', bg: '#fffbeb' },
  approved: { label: 'Đã duyệt', color: '#059669', bg: '#ecfdf5' },
  rejected: { label: 'Bị từ chối', color: '#dc2626', bg: '#fef2f2' },
  cancelled: { label: 'Đã huỷ', color: '#6b7280', bg: '#f3f4f6' },
};
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
type CampaignAssignmentItem = NonNullable<Campaign['assignments']>[number];

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

function MetricTile({
  icon,
  label,
  value,
  helper,
}: {
  icon: any;
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <View style={styles.metricTile}>
      <MaterialCommunityIcons name={icon} size={18} color={COLORS.primary} />
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricHelper} numberOfLines={1}>{helper}</Text>
    </View>
  );
}

function Lifecycle({ status }: { status: Campaign['status'] }) {
  const steps: { key: Campaign['status']; label: string; icon: any }[] = [
    { key: 'draft', label: 'Chờ duyệt', icon: 'file-document-outline' },
    { key: 'open', label: 'Tuyển TNV', icon: 'account-plus-outline' },
    { key: 'in_progress', label: 'Đang nấu', icon: 'pot-steam-outline' },
    { key: 'completed', label: 'Hoàn tất', icon: 'check-circle-outline' },
  ];
  const order = steps.findIndex((step) => step.key === status);

  if (status === 'cancelled') {
    return (
      <View style={styles.lifecycle}>
        <MaterialCommunityIcons name="close-circle-outline" size={18} color={COLORS.error} />
        <Text style={[styles.lifecycleText, { color: COLORS.error }]}>Chiến dịch đã huỷ</Text>
      </View>
    );
  }

  return (
    <View style={styles.lifecycle}>
      {steps.map((step, index) => {
        const active = index <= order;
        return (
          <View key={step.key} style={styles.lifecycleStep}>
            <View style={[styles.lifecycleIcon, active && styles.lifecycleIconActive]}>
              <MaterialCommunityIcons name={step.icon} size={15} color={active ? '#fff' : COLORS.onSurfaceVariant} />
            </View>
            <Text style={[styles.lifecycleText, active && styles.lifecycleTextActive]} numberOfLines={1}>
              {step.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function assignmentReviewLabel(status: string): string {
  switch (status) {
    case 'assigned':
    case 'approved':
      return 'Đã duyệt';
    case 'rejected':
      return 'Đã từ chối';
    case 'pending':
      return 'Chờ duyệt';
    default:
      return status;
  }
}

function assignmentReviewTone(status: string): { color: string; bg: string } {
  switch (status) {
    case 'assigned':
    case 'approved':
    case 'completed':
      return { color: COLORS.primary, bg: COLORS.primaryContainer };
    case 'rejected':
    case 'absent':
      return { color: COLORS.error, bg: COLORS.errorContainer };
    case 'pending':
      return { color: '#b45309', bg: '#fef3c7' };
    default:
      return { color: COLORS.onSurfaceVariant, bg: COLORS.surfaceContainerLow };
  }
}

/**
 * Quản lý chiến dịch bếp ăn (Charity-org) — xem chi tiết + bắt đầu/kết thúc
 * chiến dịch, xác nhận nguyên liệu quyên góp, xem danh sách TNV đã ứng tuyển.
 */
export default function CharityCampaignDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: c, isLoading, isError, refetch } = useCampaignDetail(id);
  const startMut = useStartCampaign();
  const cancelMut = useCancelCampaign();
  const completeMut = useCompleteCampaign();
  const confirmMut = useConfirmDonation();
  const reviewAssignmentMut = useReviewAssignment();
  const canRequestProviders = c?.status === 'open' || c?.status === 'in_progress';
  const { data: providers = [] } = useProviders(canRequestProviders);
  const { data: sentProviderRequests = [] } = useMySentProviderRequests(canRequestProviders);
  const sendProviderRequestMut = useSendProviderRequest();
  const submitProviderProposalMut = useSubmitProviderProposal();
  const { data: shifts = [] } = useShifts(id);
  const { data: kitchenMenu = [] } = useMenuItems(id);
  const removeMenuMut = useRemoveMenuItem();
  const [completeVisible, setCompleteVisible] = useState(false);
  const [servings, setServings] = useState('');
  const [earlyEndAccepted, setEarlyEndAccepted] = useState(false);
  const [earlyEndReason, setEarlyEndReason] = useState('');
  const [shiftDialog, setShiftDialog] = useState(false);
  const [menuDialog, setMenuDialog] = useState(false);
  const [changeDialog, setChangeDialog] = useState(false);
  const [cancelVisible, setCancelVisible] = useState(false);
  const [proposalVisible, setProposalVisible] = useState(false);
  const [reviewShiftTarget, setReviewShiftTarget] = useState<CampaignAssignmentItem | null>(null);
  const [selectedReviewShiftId, setSelectedReviewShiftId] = useState('');

  const Header = (
    <View style={styles.header}>
      <BackButton />
      <Text variant="titleMedium" style={styles.headerTitle}>Quản lý chiến dịch</Text>
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
  const donations = c.donations ?? [];
  const assignments = c.assignments ?? [];
  const supplyProgress = c.supplyProgress ?? [];
  const pendingDonations = donations.filter((d) => d.status !== 'received').length;
  const receivedDonations = donations.length - pendingDonations;
  const pendingAssignments = assignments.filter((assignment) => assignment.status === 'pending').length;
  const totalSlots = slots.reduce((sum, slot) => sum + slot.needed, 0);
  const filledSlots = slots.reduce((sum, slot) => sum + slot.filled, 0);
  const actualServed = c.actualServings ?? c.distributionSummary?.servingsServed ?? null;
  const startDayOffset = daysUntilUtcDate(c.scheduledDate);
  const canStartToday = isSameUtcDate(c.scheduledDate);
  const endDayOffset = daysUntilUtcDate(c.endDate ?? c.scheduledDate);
  const isEarlyComplete = (endDayOffset ?? 0) > 0;
  const startButtonLabel = startDayOffset == null
    ? 'Bắt đầu chiến dịch'
    : startDayOffset > 0
      ? `Bắt đầu sau ${startDayOffset} ngày`
      : startDayOffset < 0
        ? 'Đã quá ngày tổ chức'
        : 'Bắt đầu chiến dịch';
  const eligibleReviewShifts = reviewShiftTarget
    ? shifts.filter((shift) => (!shift.role || shift.role === reviewShiftTarget.role) && shift.slotsFilled < shift.slotsNeeded)
    : [];

  const handleStart = async () => {
    if (!canStartToday) {
      Popup.show({
        type: 'warning',
        text1: 'Chưa thể bắt đầu',
        text2: startDayOffset && startDayOffset > 0
          ? `Chiến dịch chỉ bắt đầu vào ngày ${formatDate(c.scheduledDate)}.`
          : 'Ngày tổ chức không khớp hôm nay, vui lòng gửi yêu cầu thay đổi lịch nếu cần.',
      });
      return;
    }
    try {
      await startMut.mutateAsync(c.id);
      Popup.show({ type: 'success', text1: 'Đã bắt đầu chiến dịch' });
    } catch (err) {
      Popup.show({ type: 'error', text1: 'Không bắt đầu được', text2: getErrorMessage(err) });
    }
  };

  const handleCancelCampaign = async () => {
    try {
      await cancelMut.mutateAsync(c.id);
      setCancelVisible(false);
      Popup.show({ type: 'success', text1: 'Đã huỷ chiến dịch' });
    } catch (err) {
      Popup.show({ type: 'error', text1: 'Huỷ chiến dịch thất bại', text2: getErrorMessage(err) });
    }
  };

  const handleComplete = async () => {
    const n = parseInt(servings, 10);
    if (!Number.isFinite(n) || n < 0) {
      Popup.show({ type: 'warning', text1: 'Số suất không hợp lệ' });
      return;
    }
    if (isEarlyComplete) {
      if (!earlyEndAccepted) {
        Popup.show({ type: 'warning', text1: 'Cần xác nhận kết thúc sớm' });
        return;
      }
      if (earlyEndReason.trim().length < 5) {
        Popup.show({ type: 'warning', text1: 'Lý do quá ngắn', text2: 'Vui lòng nhập lý do kết thúc sớm rõ hơn.' });
        return;
      }
    }
    try {
      await completeMut.mutateAsync({
        id: c.id,
        actualServings: n,
        ...(isEarlyComplete ? {
          earlyEndConfirmation: 'EARLY_END' as const,
          earlyEndReason: earlyEndReason.trim(),
        } : {}),
      });
      setCompleteVisible(false);
      setServings('');
      setEarlyEndAccepted(false);
      setEarlyEndReason('');
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

  const submitReviewAssignment = async (assignmentId: string, action: 'approved' | 'rejected', shiftId?: string) => {
    try {
      await reviewAssignmentMut.mutateAsync({ campaignId: c.id, assignmentId, action, shiftId });
      setReviewShiftTarget(null);
      setSelectedReviewShiftId('');
      Popup.show({
        type: 'success',
        text1: action === 'approved' ? 'Đã duyệt tình nguyện viên' : 'Đã từ chối đăng ký',
      });
    } catch (err) {
      Popup.show({ type: 'error', text1: 'Cập nhật đăng ký thất bại', text2: getErrorMessage(err) });
    }
  };

  const handleReviewAssignment = async (assignment: CampaignAssignmentItem, action: 'approved' | 'rejected') => {
    if (action === 'rejected') {
      await submitReviewAssignment(assignment.id, action);
      return;
    }
    if (shifts.length === 0) {
      await submitReviewAssignment(assignment.id, action);
      return;
    }
    const firstAvailable = shifts.find((shift) => (!shift.role || shift.role === assignment.role) && shift.slotsFilled < shift.slotsNeeded);
    if (!firstAvailable) {
      Popup.show({
        type: 'warning',
        text1: 'Chưa có ca phù hợp',
        text2: 'Hãy tăng slot hoặc thêm ca trước khi duyệt tình nguyện viên này.',
      });
      return;
    }
    setReviewShiftTarget(assignment);
    setSelectedReviewShiftId(firstAvailable.id);
  };

  const handleSendProviderRequest = async (provider: ProviderSummary) => {
    const providerId = provider.providerProfile?.id;
    if (!providerId) return;
    try {
      await sendProviderRequestMut.mutateAsync({
        campaignId: c.id,
        providerId,
        message: `Tổ chức cần hỗ trợ nguyên liệu cho chiến dịch "${c.title}".`,
        durationMonths: 1,
      });
      Popup.show({ type: 'success', text1: 'Đã gửi yêu cầu hợp tác', text2: provider.providerProfile?.businessName ?? provider.fullName });
    } catch (err) {
      Popup.show({ type: 'error', text1: 'Gửi yêu cầu thất bại', text2: getErrorMessage(err) });
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {Header}
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.heroCard}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{c.title}</Text>
            <View style={[styles.badge, { backgroundColor: sm.bg }]}>
              <Text style={[styles.badgeText, { color: sm.color }]}>{sm.label}</Text>
            </View>
          </View>

          {c.description ? <Text style={styles.description}>{c.description}</Text> : null}

          <View style={styles.heroInfo}>
            <InfoRow icon="account-group-outline">{charityName(c)}</InfoRow>
            <InfoRow icon="calendar-clock">
              {formatCampaignDateRange(c)} - {formatTime(c.startTime)} đến {formatTime(c.endTime)}
            </InfoRow>
            <InfoRow icon="map-marker-outline">{c.kitchenAddress}</InfoRow>
          </View>
        </View>

        <View style={styles.metricDeck}>
          <MetricTile icon="food-outline" label="Suất ăn" value={actualServed != null ? String(actualServed) : String(c.expectedServings ?? 0)} helper={actualServed != null ? 'thực tế' : 'dự kiến'} />
          <MetricTile icon="account-group-outline" label="TNV" value={`${filledSlots}/${totalSlots}`} helper={pendingAssignments > 0 ? `${pendingAssignments} chờ duyệt` : 'đã đăng ký'} />
          <MetricTile icon="basket-check-outline" label="Donation" value={`${receivedDonations}/${donations.length}`} helper={pendingDonations > 0 ? `${pendingDonations} chờ nhận` : 'đã xử lý'} />
        </View>

        <Lifecycle status={c.status} />

        <Section title="Yêu cầu thay đổi">
          <Text style={styles.muted}>
            Xem lịch sử và gửi yêu cầu thay đổi ngày, giờ, địa chỉ hoặc số lượng tình nguyện viên khi chiến dịch đang tuyển.
          </Text>
          <Button
            mode="outlined"
            icon="tune"
            textColor={COLORS.primary}
            style={styles.outlineAction}
            onPress={() => setChangeDialog(true)}
          >
            Chi tiết & yêu cầu thay đổi
          </Button>
        </Section>

        {(c.status === 'open' || c.status === 'in_progress') ? (
          <Section title="Nhà cung cấp có thể hỗ trợ">
            {providers.length === 0 ? (
              <Text style={styles.muted}>Chưa có nhà cung cấp active listing phù hợp để gửi yêu cầu.</Text>
            ) : (
              providers.slice(0, 5).map((provider) => {
                const providerProfileId = provider.providerProfile?.id;
                const alreadySent = !!providerProfileId && sentProviderRequests.some((request) => {
                  const requestProvider = request.provider?.businessName;
                  return requestProvider && requestProvider === provider.providerProfile?.businessName && request.status === 'pending';
                });
                return (
                  <View key={provider.id} style={styles.providerRow}>
                    <MaterialCommunityIcons name="storefront-outline" size={18} color={COLORS.primary} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.providerName}>{provider.providerProfile?.businessName ?? provider.fullName}</Text>
                      <Text style={styles.muted}>
                        {provider.activeListingsCount ?? 0} tin đang mở
                        {provider.providerProfile?.address ? ` - ${provider.providerProfile.address}` : ''}
                      </Text>
                    </View>
                    <Button
                      mode="contained-tonal"
                      compact
                      textColor={COLORS.primary}
                      disabled={!providerProfileId || alreadySent || sendProviderRequestMut.isPending}
                      loading={sendProviderRequestMut.isPending && sendProviderRequestMut.variables?.providerId === providerProfileId}
                      onPress={() => handleSendProviderRequest(provider)}
                    >
                      {alreadySent ? 'Đã gửi' : 'Mời'}
                    </Button>
                  </View>
                );
              })
            )}
            <Button
              mode="outlined"
              icon="store-plus-outline"
              textColor={COLORS.primary}
              style={styles.outlineAction}
              onPress={() => setProposalVisible(true)}
            >
              Đề xuất NCC mới
            </Button>
          </Section>
        ) : null}

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
            assignments.map((a) => {
              const shift = a.shiftId ? shifts.find((s) => s.id === a.shiftId) : null;
              const statusTone = assignmentReviewTone(a.status);
              const roleLabel = ASSIGNMENT_ROLE_LABEL[a.role] ?? a.role;
              const isPending = a.status === 'pending';

              return (
                <View key={a.id} style={styles.assignCard}>
                  <View style={styles.assignHeader}>
                    <View style={styles.assignAvatar}>
                      <Text style={styles.assignAvatarText}>{a.volunteer.user.fullName.charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={styles.assignTitleBlock}>
                      <Text style={styles.assignName} numberOfLines={1}>{a.volunteer.user.fullName}</Text>
                      <Text style={styles.assignSubMeta}>Tình nguyện viên đăng ký chiến dịch</Text>
                    </View>
                    <View style={[styles.assignmentStatusPill, { backgroundColor: statusTone.bg }]}>
                      <Text style={[styles.assignmentStatusText, { color: statusTone.color }]}>
                        {assignmentReviewLabel(a.status)}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.assignInfoGrid}>
                    <View style={styles.assignInfoCell}>
                      <Text style={styles.assignInfoLabel}>Vai trò</Text>
                      <Text style={styles.assignInfoValue}>{roleLabel}</Text>
                    </View>
                    <View style={styles.assignInfoCell}>
                      <Text style={styles.assignInfoLabel}>Ca đăng ký</Text>
                      <Text style={styles.assignInfoValue}>
                        {shift ? `${shift.label} · ${shift.startTime}-${shift.endTime}` : 'Đăng ký vai trò tổng'}
                      </Text>
                    </View>
                    <View style={styles.assignInfoCell}>
                      <Text style={styles.assignInfoLabel}>Slot ca</Text>
                      <Text style={styles.assignInfoValue}>
                        {shift ? `${shift.slotsFilled}/${shift.slotsNeeded}` : 'Theo nhu cầu tổng'}
                      </Text>
                    </View>
                  </View>

                  {isPending ? (
                    <View style={styles.reviewActions}>
                      <Button
                        mode="outlined"
                        compact
                        icon="close"
                        textColor={COLORS.error}
                        style={styles.reviewRejectButton}
                        disabled={reviewAssignmentMut.isPending}
                        onPress={() => handleReviewAssignment(a, 'rejected')}
                      >
                        Từ chối
                      </Button>
                      <Button
                        mode="contained"
                        compact
                        icon="check"
                        buttonColor={COLORS.primary}
                        style={styles.reviewApproveButton}
                        disabled={reviewAssignmentMut.isPending}
                        onPress={() => handleReviewAssignment(a, 'approved')}
                      >
                        Duyệt
                      </Button>
                    </View>
                  ) : null}
                </View>
              );
            })
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

        {supplyProgress.length > 0 ? (
          <Section title="Chỉ tiêu nguyên liệu">
            {supplyProgress.map((item) => (
              <View key={item.name} style={styles.supplyProgressRow}>
                <View style={styles.supplyHeader}>
                  <Text style={styles.supplyName}>{item.name}</Text>
                  <Text style={[styles.supplyRemaining, item.isTargetMet && { color: COLORS.primary }]}>
                    {item.isTargetMet ? 'Đã đủ cam kết' : `Còn ${formatQuantity(item.remainingQuantity)} ${item.unit}`}
                  </Text>
                </View>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${item.progressPercent}%` }]} />
                </View>
                <Text style={styles.muted}>
                  Mục tiêu {formatQuantity(item.targetQuantity)} {item.unit} - đã cam kết{' '}
                  {formatQuantity(item.pledgedQuantity)} - đã nhận {formatQuantity(item.receivedQuantity)}
                  {item.receivedRemainingQuantity > 0 ? ` - còn chờ nhận ${formatQuantity(item.receivedRemainingQuantity)} ${item.unit}` : ''}
                </Text>
              </View>
            ))}
          </Section>
        ) : c.supplyItems && c.supplyItems.length > 0 ? (
          <Section title="Vật phẩm cần hỗ trợ">
            <View style={styles.tagRow}>
              {c.supplyItems.map((s, i) => (
                <View key={i} style={styles.tag}><Text style={styles.tagText}>{formatSupplyItem(s)}</Text></View>
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
          <View style={styles.footerActions}>
            <Button
              mode="outlined"
              icon="close-circle-outline"
              textColor={COLORS.error}
              disabled={cancelMut.isPending || startMut.isPending}
              onPress={() => setCancelVisible(true)}
              contentStyle={{ height: 48 }}
              style={[styles.footerBtn, styles.cancelBtn]}
            >
              Huỷ
            </Button>
            <Button
              mode="contained" icon="play-circle-outline" buttonColor={COLORS.primary}
              loading={startMut.isPending} disabled={startMut.isPending || cancelMut.isPending || !canStartToday}
              onPress={handleStart} contentStyle={{ height: 48 }} style={[styles.footerBtn, { flex: 1 }]}
            >
              {startButtonLabel}
            </Button>
          </View>
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
            {isEarlyComplete ? (
              <View style={styles.earlyEndBox}>
                <Text style={styles.earlyEndTitle}>Kết thúc trước ngày dự kiến</Text>
                <Text style={styles.muted}>
                  Chiến dịch còn lịch đến {formatDate(c.endDate ?? c.scheduledDate)}. Vui lòng xác nhận và ghi rõ lý do để tránh đóng nhầm.
                </Text>
                <Pressable
                  style={styles.ackRow}
                  onPress={() => setEarlyEndAccepted((prev) => !prev)}
                  disabled={completeMut.isPending}
                >
                  <View style={[styles.checkbox, earlyEndAccepted && styles.checkboxChecked]}>
                    {earlyEndAccepted ? <MaterialCommunityIcons name="check" size={15} color="#fff" /> : null}
                  </View>
                  <Text style={styles.ackText}>Tôi xác nhận muốn kết thúc chiến dịch sớm.</Text>
                </Pressable>
                <TextInput
                  mode="outlined"
                  multiline
                  numberOfLines={2}
                  label="Lý do kết thúc sớm"
                  value={earlyEndReason}
                  onChangeText={setEarlyEndReason}
                  outlineColor={COLORS.outline}
                  activeOutlineColor={COLORS.primary}
                  style={{ backgroundColor: COLORS.surface, marginTop: 10 }}
                  disabled={completeMut.isPending}
                />
              </View>
            ) : null}
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

        <Dialog visible={cancelVisible} onDismiss={() => !cancelMut.isPending && setCancelVisible(false)} style={styles.dialog}>
          <Dialog.Title style={styles.dialogTitle}>Huỷ chiến dịch?</Dialog.Title>
          <Dialog.Content>
            <Text style={styles.muted}>Chiến dịch đang mở sẽ chuyển sang trạng thái đã huỷ. Hành động này không thể hoàn tác.</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setCancelVisible(false)} textColor={COLORS.onSurfaceVariant} disabled={cancelMut.isPending}>
              Để sau
            </Button>
            <Button mode="contained" buttonColor={COLORS.error} onPress={handleCancelCampaign} loading={cancelMut.isPending} disabled={cancelMut.isPending}>
              Huỷ chiến dịch
            </Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog
          visible={!!reviewShiftTarget}
          onDismiss={() => {
            if (!reviewAssignmentMut.isPending) {
              setReviewShiftTarget(null);
              setSelectedReviewShiftId('');
            }
          }}
          style={styles.dialog}
        >
          <Dialog.Title style={styles.dialogTitle}>Chọn ca trước khi duyệt</Dialog.Title>
          <Dialog.ScrollArea style={styles.changeScrollArea}>
            <ScrollView contentContainerStyle={styles.changeContent}>
              {reviewShiftTarget ? (
                <Text style={styles.formHint}>
                  {reviewShiftTarget.volunteer.user.fullName} - {ASSIGNMENT_ROLE_LABEL[reviewShiftTarget.role] ?? reviewShiftTarget.role}
                </Text>
              ) : null}
              {eligibleReviewShifts.map((shift) => {
                const active = selectedReviewShiftId === shift.id;
                return (
                  <Pressable
                    key={shift.id}
                    onPress={() => setSelectedReviewShiftId(shift.id)}
                    style={[styles.reviewShiftOption, active && styles.reviewShiftOptionActive]}
                    disabled={reviewAssignmentMut.isPending}
                  >
                    <MaterialCommunityIcons
                      name={active ? 'radiobox-marked' : 'radiobox-blank'}
                      size={20}
                      color={active ? COLORS.primary : COLORS.onSurfaceVariant}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.shiftLabel}>{shift.label}</Text>
                      <Text style={styles.muted}>
                        {shift.startTime}-{shift.endTime} - {shift.role ? ASSIGNMENT_ROLE_LABEL[shift.role] ?? shift.role : 'Ca chung'} - {shift.slotsFilled}/{shift.slotsNeeded}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button
              onPress={() => {
                setReviewShiftTarget(null);
                setSelectedReviewShiftId('');
              }}
              textColor={COLORS.onSurfaceVariant}
              disabled={reviewAssignmentMut.isPending}
            >
              Huỷ
            </Button>
            <Button
              mode="contained"
              buttonColor={COLORS.primary}
              loading={reviewAssignmentMut.isPending}
              disabled={!reviewShiftTarget || !selectedReviewShiftId || reviewAssignmentMut.isPending}
              onPress={() => {
                if (reviewShiftTarget) {
                  void submitReviewAssignment(reviewShiftTarget.id, 'approved', selectedReviewShiftId);
                }
              }}
            >
              Duyệt & phân ca
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <CampaignChangeDialog
        visible={changeDialog}
        campaign={c}
        onDismiss={() => setChangeDialog(false)}
      />
      <ProviderProposalDialog
        visible={proposalVisible}
        pending={submitProviderProposalMut.isPending}
        onDismiss={() => setProposalVisible(false)}
        onSubmit={async (input) => {
          try {
            await submitProviderProposalMut.mutateAsync(input);
            setProposalVisible(false);
            Popup.show({ type: 'success', text1: 'Đã gửi đề xuất NCC mới' });
          } catch (err) {
            Popup.show({ type: 'error', text1: 'Gửi đề xuất thất bại', text2: getErrorMessage(err) });
          }
        }}
      />
      <ShiftDialog visible={shiftDialog} campaignId={c.id} onDismiss={() => setShiftDialog(false)} />
      <MenuItemDialog visible={menuDialog} campaignId={c.id} onDismiss={() => setMenuDialog(false)} />
    </SafeAreaView>
  );
}

function ProviderProposalDialog({
  visible,
  pending,
  onDismiss,
  onSubmit,
}: {
  visible: boolean;
  pending: boolean;
  onDismiss: () => void;
  onSubmit: (input: {
    businessName: string;
    contactName?: string;
    contactPhone?: string;
    contactEmail?: string;
    address?: string;
    note?: string;
    durationMonths?: number;
  }) => Promise<void>;
}) {
  const [businessName, setBusinessName] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [address, setAddress] = useState('');
  const [durationMonths, setDurationMonths] = useState('1');
  const [note, setNote] = useState('');

  const submit = async () => {
    const name = businessName.trim();
    if (name.length < 3) {
      Popup.show({ type: 'warning', text1: 'Tên NCC quá ngắn' });
      return;
    }
    const months = parseInt(durationMonths, 10);
    await onSubmit({
      businessName: name,
      ...(contactName.trim() ? { contactName: contactName.trim() } : {}),
      ...(contactPhone.trim() ? { contactPhone: contactPhone.trim() } : {}),
      ...(contactEmail.trim() ? { contactEmail: contactEmail.trim() } : {}),
      ...(address.trim() ? { address: address.trim() } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
      ...(Number.isFinite(months) && months > 0 ? { durationMonths: months } : {}),
    });
    setBusinessName('');
    setContactName('');
    setContactPhone('');
    setContactEmail('');
    setAddress('');
    setDurationMonths('1');
    setNote('');
  };

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={() => !pending && onDismiss()} style={styles.dialogLarge}>
        <Dialog.Title style={styles.dialogTitle}>Đề xuất NCC mới</Dialog.Title>
        <Dialog.ScrollArea style={styles.changeScrollArea}>
          <ScrollView contentContainerStyle={styles.changeContent}>
            <Text style={styles.formHint}>Gửi thông tin NCC để admin duyệt và tạo hồ sơ provider khi phù hợp.</Text>
            <TextInput mode="outlined" dense label="Tên NCC *" value={businessName} onChangeText={setBusinessName} style={styles.changeInput} />
            <TextInput mode="outlined" dense label="Người liên hệ" value={contactName} onChangeText={setContactName} style={styles.changeInput} />
            <TextInput mode="outlined" dense label="Số điện thoại" value={contactPhone} onChangeText={setContactPhone} keyboardType="phone-pad" style={styles.changeInput} />
            <TextInput mode="outlined" dense label="Email" value={contactEmail} onChangeText={setContactEmail} keyboardType="email-address" autoCapitalize="none" style={styles.changeInput} />
            <TextInput mode="outlined" dense label="Địa chỉ" value={address} onChangeText={setAddress} style={styles.changeInput} />
            <TextInput mode="outlined" dense label="Thời hạn hợp tác (tháng)" value={durationMonths} onChangeText={setDurationMonths} keyboardType="numeric" style={styles.changeInput} />
            <TextInput mode="outlined" dense multiline numberOfLines={2} label="Ghi chú" value={note} onChangeText={setNote} style={styles.changeInput} />
          </ScrollView>
        </Dialog.ScrollArea>
        <Dialog.Actions>
          <Button onPress={onDismiss} textColor={COLORS.onSurfaceVariant} disabled={pending}>Huỷ</Button>
          <Button mode="contained" buttonColor={COLORS.primary} onPress={submit} loading={pending} disabled={pending}>
            Gửi đề xuất
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

function CampaignChangeDialog({
  visible,
  campaign,
  onDismiss,
}: {
  visible: boolean;
  campaign: Campaign;
  onDismiss: () => void;
}) {
  const { data: requests = [], isLoading } = useCampaignChangeRequests(campaign.id, visible);
  const submitMut = useSubmitCampaignChange();
  const cancelChangeMut = useCancelCampaignChange();
  const editable = campaign.status === 'open';
  const hasPending = requests.some((r) => r.status === 'pending');

  const [scheduledDate, setScheduledDate] = useState(campaign.scheduledDate.slice(0, 10));
  const [endDate, setEndDate] = useState(campaign.endDate?.slice(0, 10) ?? '');
  const [startTime, setStartTime] = useState(campaign.startTime.slice(0, 5));
  const [endTime, setEndTime] = useState(campaign.endTime.slice(0, 5));
  const [kitchenAddress, setKitchenAddress] = useState(campaign.kitchenAddress);
  const [chefSlots, setChefSlots] = useState(String(campaign.chefSlotsNeeded));
  const [waiterSlots, setWaiterSlots] = useState(String(campaign.waiterSlotsNeeded));
  const [shipperSlots, setShipperSlots] = useState(String(campaign.shipperSlotsNeeded));
  const [reason, setReason] = useState('');

  const original = {
    scheduledDate: campaign.scheduledDate.slice(0, 10),
    endDate: campaign.endDate?.slice(0, 10) ?? '',
    startTime: campaign.startTime.slice(0, 5),
    endTime: campaign.endTime.slice(0, 5),
    kitchenAddress: campaign.kitchenAddress,
    chefSlotsNeeded: campaign.chefSlotsNeeded,
    waiterSlotsNeeded: campaign.waiterSlotsNeeded,
    shipperSlotsNeeded: campaign.shipperSlotsNeeded,
  };

  const diffInput = (): SubmitCampaignChangeInput => {
    const input: SubmitCampaignChangeInput = {};
    if (scheduledDate !== original.scheduledDate) input.scheduledDate = scheduledDate;
    if (endDate.trim() && endDate.trim() !== original.endDate) input.endDate = endDate.trim();
    if (startTime !== original.startTime) input.startTime = startTime;
    if (endTime !== original.endTime) input.endTime = endTime;
    if (kitchenAddress.trim() !== original.kitchenAddress) input.kitchenAddress = kitchenAddress.trim();

    const chef = parseInt(chefSlots, 10);
    const waiter = parseInt(waiterSlots, 10);
    const shipper = parseInt(shipperSlots, 10);
    if (Number.isFinite(chef) && chef !== original.chefSlotsNeeded) input.chefSlotsNeeded = chef;
    if (Number.isFinite(waiter) && waiter !== original.waiterSlotsNeeded) input.waiterSlotsNeeded = waiter;
    if (Number.isFinite(shipper) && shipper !== original.shipperSlotsNeeded) input.shipperSlotsNeeded = shipper;
    if (reason.trim()) input.reason = reason.trim();
    return input;
  };

  const handleSubmit = async () => {
    if (!editable) {
      Popup.show({ type: 'warning', text1: 'Chưa thể gửi yêu cầu', text2: 'Chỉ gửi được khi chiến dịch đang tuyển.' });
      return;
    }
    if (endTime <= startTime) {
      Popup.show({ type: 'warning', text1: 'Giờ không hợp lệ', text2: 'Giờ kết thúc phải sau giờ bắt đầu.' });
      return;
    }
    if (!DATE_ONLY_RE.test(scheduledDate) || (endDate.trim() && !DATE_ONLY_RE.test(endDate.trim()))) {
      Popup.show({ type: 'warning', text1: 'Ngày không hợp lệ', text2: 'Vui lòng nhập theo định dạng YYYY-MM-DD.' });
      return;
    }
    if (endDate.trim() && endDate.trim() < scheduledDate) {
      Popup.show({ type: 'warning', text1: 'Ngày kết thúc không hợp lệ', text2: 'Ngày kết thúc phải bằng hoặc sau ngày tổ chức.' });
      return;
    }
    if (kitchenAddress.trim().length < 5) {
      Popup.show({ type: 'warning', text1: 'Địa chỉ quá ngắn' });
      return;
    }
    const input = diffInput();
    const { reason: _reason, ...changes } = input;
    if (Object.keys(changes).length === 0) {
      Popup.show({ type: 'warning', text1: 'Chưa có thay đổi nào' });
      return;
    }
    try {
      await submitMut.mutateAsync({ id: campaign.id, input });
      setReason('');
      Popup.show({ type: 'success', text1: 'Đã gửi yêu cầu thay đổi' });
    } catch (err) {
      Popup.show({ type: 'error', text1: 'Gửi yêu cầu thất bại', text2: getErrorMessage(err) });
    }
  };

  const handleCancelChange = async (changeRequestId: string) => {
    try {
      await cancelChangeMut.mutateAsync({ changeRequestId, campaignId: campaign.id });
      Popup.show({ type: 'success', text1: 'Đã huỷ yêu cầu thay đổi' });
    } catch (err) {
      Popup.show({ type: 'error', text1: 'Huỷ yêu cầu thất bại', text2: getErrorMessage(err) });
    }
  };

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss} style={styles.dialogLarge}>
        <Dialog.Title style={styles.dialogTitle}>Yêu cầu thay đổi</Dialog.Title>
        <Dialog.ScrollArea style={styles.changeScrollArea}>
          <ScrollView contentContainerStyle={styles.changeContent}>
            {!editable ? (
              <Text style={styles.changeNotice}>
                Chỉ gửi được yêu cầu thay đổi khi chiến dịch đang ở trạng thái Đang tuyển. Trạng thái hiện tại: {statusMeta(campaign.status).label}.
              </Text>
            ) : (
              <>
                <Text style={styles.formHint}>Nhập trường cần đổi, hệ thống chỉ gửi phần khác với thông tin hiện tại.</Text>
                <View style={styles.changeGrid}>
                  <TextInput mode="outlined" dense label="Ngày" value={scheduledDate} onChangeText={setScheduledDate} style={styles.changeInput} />
                  <TextInput mode="outlined" dense label="Ngày kết thúc" value={endDate} onChangeText={setEndDate} style={styles.changeInput} />
                </View>
                <View style={styles.changeGrid}>
                  <TextInput mode="outlined" dense label="Bắt đầu" value={startTime} onChangeText={setStartTime} style={styles.changeInput} />
                  <TextInput mode="outlined" dense label="Kết thúc" value={endTime} onChangeText={setEndTime} style={styles.changeInput} />
                </View>
                <TextInput mode="outlined" dense label="Địa chỉ bếp" value={kitchenAddress} onChangeText={setKitchenAddress} style={styles.changeInput} />
                <View style={styles.changeGrid}>
                  <TextInput mode="outlined" dense label="Đầu bếp" keyboardType="numeric" value={chefSlots} onChangeText={setChefSlots} style={styles.changeInput} />
                  <TextInput mode="outlined" dense label="Phục vụ" keyboardType="numeric" value={waiterSlots} onChangeText={setWaiterSlots} style={styles.changeInput} />
                  <TextInput mode="outlined" dense label="Giao hàng" keyboardType="numeric" value={shipperSlots} onChangeText={setShipperSlots} style={styles.changeInput} />
                </View>
                <TextInput
                  mode="outlined"
                  dense
                  multiline
                  numberOfLines={2}
                  label="Lý do (tuỳ chọn)"
                  value={reason}
                  onChangeText={setReason}
                  style={styles.changeInput}
                />
                <Button
                  mode="contained"
                  icon="send"
                  buttonColor={COLORS.primary}
                  onPress={handleSubmit}
                  loading={submitMut.isPending}
                  disabled={submitMut.isPending || hasPending}
                >
                  {hasPending ? 'Đã có yêu cầu chờ duyệt' : 'Gửi yêu cầu'}
                </Button>
              </>
            )}

            <Text style={styles.historyTitle}>Lịch sử yêu cầu</Text>
            {isLoading ? (
              <Text style={styles.muted}>Đang tải lịch sử...</Text>
            ) : requests.length === 0 ? (
              <Text style={styles.muted}>Chưa có yêu cầu thay đổi nào.</Text>
            ) : (
              requests.map((request) => (
                <ChangeRequestRow
                  key={request.id}
                  request={request}
                  onCancel={handleCancelChange}
                  cancelling={cancelChangeMut.isPending}
                />
              ))
            )}
          </ScrollView>
        </Dialog.ScrollArea>
        <Dialog.Actions>
          <Button onPress={onDismiss} textColor={COLORS.onSurfaceVariant}>
            Đóng
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

function ChangeRequestRow({
  request,
  onCancel,
  cancelling,
}: {
  request: CampaignChangeRequest;
  onCancel: (id: string) => void;
  cancelling: boolean;
}) {
  const meta = CHANGE_STATUS_META[request.status] ?? { label: request.status, color: '#6b7280', bg: '#f3f4f6' };
  const parts = [
    request.scheduledDate ? `Ngày: ${formatDate(request.scheduledDate)}` : '',
    request.endDate ? `Ngày kết thúc: ${formatDate(request.endDate)}` : '',
    request.startTime || request.endTime ? `Giờ: ${formatTime(request.startTime ?? '')}-${formatTime(request.endTime ?? '')}` : '',
    request.kitchenAddress ? `Địa chỉ: ${request.kitchenAddress}` : '',
    request.chefSlotsNeeded != null ? `Đầu bếp: ${request.chefSlotsNeeded}` : '',
    request.waiterSlotsNeeded != null ? `Phục vụ: ${request.waiterSlotsNeeded}` : '',
    request.shipperSlotsNeeded != null ? `Giao hàng: ${request.shipperSlotsNeeded}` : '',
  ].filter(Boolean);

  return (
    <View style={styles.changeRow}>
      <View style={styles.changeRowHeader}>
        <View style={[styles.changeBadge, { backgroundColor: meta.bg }]}>
          <Text style={[styles.changeBadgeText, { color: meta.color }]}>{meta.label}</Text>
        </View>
        <Text style={styles.changeDate}>{new Date(request.createdAt).toLocaleDateString('vi-VN')}</Text>
      </View>
      {parts.map((part) => (
        <Text key={part} style={styles.changePart}>{part}</Text>
      ))}
      {request.reason ? <Text style={styles.changeReason}>Lý do: {request.reason}</Text> : null}
      {request.reviewNote ? <Text style={styles.changeReview}>Ghi chú admin: {request.reviewNote}</Text> : null}
      {request.status === 'pending' ? (
        <Button
          mode="text"
          compact
          textColor={COLORS.error}
          onPress={() => onCancel(request.id)}
          loading={cancelling}
          disabled={cancelling}
          style={styles.cancelChangeBtn}
        >
          Huỷ yêu cầu
        </Button>
      ) : null}
    </View>
  );
}

function formatQuantity(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toLocaleString('vi-VN', { maximumFractionDigits: 3 });
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    height: 56, paddingHorizontal: 20, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'space-between',
  },
  headerTitle: { flex: 1, textAlign: 'center', fontWeight: '700', color: COLORS.onSurface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24 },
  heroCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.outline,
    padding: 16,
  },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  title: { flex: 1, fontSize: 20, fontWeight: '700', color: COLORS.onSurface, lineHeight: 27 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, marginTop: 2 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  description: { fontSize: 14, color: COLORS.onSurfaceVariant, lineHeight: 21, marginBottom: 14 },
  heroInfo: { gap: 10 },
  card: {
    backgroundColor: COLORS.surface, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: COLORS.outline, gap: 10,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  infoText: { flex: 1, fontSize: 14, color: COLORS.onSurface },
  metricDeck: { flexDirection: 'row', gap: 8, marginTop: 12 },
  metricTile: {
    flex: 1,
    minHeight: 96,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.outline,
    padding: 10,
    justifyContent: 'center',
  },
  metricValue: { marginTop: 4, fontSize: 19, fontWeight: '900', color: COLORS.onSurface },
  metricLabel: { marginTop: 1, fontSize: 11, fontWeight: '800', color: COLORS.onSurface },
  metricHelper: { marginTop: 2, fontSize: 10, fontWeight: '700', color: COLORS.onSurfaceVariant },
  lifecycle: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.surfaceContainerLow,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.outline,
    padding: 10,
  },
  lifecycleStep: { flex: 1, alignItems: 'center', gap: 5 },
  lifecycleIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.outline,
  },
  lifecycleIconActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  lifecycleText: { fontSize: 10, fontWeight: '800', color: COLORS.onSurfaceVariant },
  lifecycleTextActive: { color: COLORS.primary },
  section: { marginTop: 20 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: COLORS.onSurface, marginBottom: 10 },
  slotLine: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  slotLabel: { fontSize: 14, color: COLORS.onSurface },
  slotCount: { fontSize: 14, fontWeight: '600', color: COLORS.onSurfaceVariant },
  assignCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.outline,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    gap: 10,
  },
  assignHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  assignAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assignAvatarText: { color: COLORS.onPrimary, fontWeight: '800', fontSize: 16 },
  assignTitleBlock: { flex: 1, minWidth: 0 },
  assignName: { fontSize: 15, fontWeight: '800', color: COLORS.onSurface },
  assignSubMeta: { fontSize: 12, color: COLORS.onSurfaceVariant, marginTop: 1 },
  assignInfoGrid: { gap: 8 },
  assignInfoCell: {
    backgroundColor: COLORS.surfaceContainerLow,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  assignInfoLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.onSurfaceVariant,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  assignInfoValue: { fontSize: 13, fontWeight: '700', color: COLORS.onSurface, lineHeight: 18 },
  rolePill: { backgroundColor: COLORS.primaryContainer, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  rolePillText: { fontSize: 12, fontWeight: '600', color: COLORS.primary },
  reviewActions: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'flex-end' },
  reviewRejectButton: { flex: 1, borderColor: COLORS.error },
  reviewApproveButton: { flex: 1 },
  reviewShiftOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: COLORS.outline,
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
    backgroundColor: COLORS.surface,
  },
  reviewShiftOptionActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryContainer,
  },
  assignmentStatusPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  assignmentStatusText: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  bulletRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  bulletText: { flex: 1, fontSize: 14, color: COLORS.onSurface },
  shiftRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.outline },
  shiftLabel: { fontSize: 14, fontWeight: '600', color: COLORS.onSurface },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  addBtn: { alignSelf: 'flex-start', marginTop: 8 },
  outlineAction: { alignSelf: 'flex-start', borderColor: COLORS.outline, marginTop: 10 },
  providerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.outline },
  providerName: { fontSize: 14, fontWeight: '700', color: COLORS.onSurface },
  scheduleTime: { fontSize: 13, fontWeight: '700', color: COLORS.primary, width: 52 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.outline, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  tagText: { fontSize: 13, color: COLORS.onSurface },
  supplyProgressRow: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.outline,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  supplyHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  supplyName: { flex: 1, fontSize: 14, fontWeight: '800', color: COLORS.onSurface },
  supplyRemaining: { fontSize: 12, fontWeight: '800', color: COLORS.onSurfaceVariant },
  progressTrack: { height: 8, borderRadius: 999, backgroundColor: COLORS.outline, overflow: 'hidden', marginBottom: 7 },
  progressFill: { height: '100%', borderRadius: 999, backgroundColor: COLORS.primary },
  muted: { fontSize: 13, color: COLORS.onSurfaceVariant, lineHeight: 19 },
  donationRow: { flexDirection: 'row', gap: 10, paddingVertical: 8, alignItems: 'center' },
  donationItem: { fontSize: 14, fontWeight: '600', color: COLORS.onSurface },
  donationNote: { fontSize: 13, color: COLORS.onSurfaceVariant, fontStyle: 'italic', marginTop: 2 },
  footer: {
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20,
    borderTopWidth: 1, borderTopColor: COLORS.outline, backgroundColor: COLORS.surface,
  },
  footerActions: { flexDirection: 'row', gap: 10 },
  footerBtn: { borderRadius: 12 },
  cancelBtn: { borderColor: COLORS.error, minWidth: 104 },
  footerNote: { textAlign: 'center', fontSize: 14, color: COLORS.onSurfaceVariant },
  dialog: { borderRadius: 20 },
  dialogLarge: { borderRadius: 20, maxHeight: '88%' },
  dialogTitle: { fontSize: 18, fontWeight: '700', color: COLORS.onSurface },
  earlyEndBox: {
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: 14,
    padding: 12,
    marginTop: 12,
  },
  earlyEndTitle: { fontSize: 13, fontWeight: '800', color: '#92400e', marginBottom: 4 },
  ackRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 10 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.outline,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
  },
  checkboxChecked: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  ackText: { flex: 1, fontSize: 13, color: COLORS.onSurface, lineHeight: 18 },
  changeScrollArea: { paddingHorizontal: 0 },
  changeContent: { paddingHorizontal: 24, paddingBottom: 8 },
  changeNotice: {
    fontSize: 13,
    color: COLORS.onSurfaceVariant,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 12,
    lineHeight: 19,
  },
  formHint: { fontSize: 12, color: COLORS.onSurfaceVariant, marginBottom: 10, lineHeight: 18 },
  changeGrid: { flexDirection: 'row', gap: 8 },
  changeInput: { flex: 1, backgroundColor: COLORS.surface, marginBottom: 10 },
  historyTitle: { fontSize: 14, fontWeight: '800', color: COLORS.onSurface, marginTop: 18, marginBottom: 8 },
  changeRow: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: COLORS.outline,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  changeRowHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  changeBadge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  changeBadgeText: { fontSize: 11, fontWeight: '800' },
  changeDate: { fontSize: 11, color: COLORS.onSurfaceVariant },
  changePart: { fontSize: 12, color: COLORS.onSurface, marginBottom: 3 },
  changeReason: { fontSize: 12, color: COLORS.onSurfaceVariant, fontStyle: 'italic', marginTop: 4 },
  changeReview: { fontSize: 12, color: COLORS.error, marginTop: 4 },
  cancelChangeBtn: { alignSelf: 'flex-start', marginTop: 4 },
});
