import { useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Button, Portal, Dialog, TextInput } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import {
  useCampaignDetail,
  useStartCampaign,
  useCancelCampaign,
  useCompleteCampaign,
  useConfirmDonation,
  useCampaignChangeRequests,
  useSubmitCampaignChange,
  useCancelCampaignChange,
  type Campaign,
  type CampaignChangeRequest,
  type SubmitCampaignChangeInput,
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

const CHANGE_STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'Chờ duyệt', color: '#d97706', bg: '#fffbeb' },
  approved: { label: 'Đã duyệt', color: '#059669', bg: '#ecfdf5' },
  rejected: { label: 'Bị từ chối', color: '#dc2626', bg: '#fef2f2' },
  cancelled: { label: 'Đã huỷ', color: '#6b7280', bg: '#f3f4f6' },
};

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
  const cancelMut = useCancelCampaign();
  const completeMut = useCompleteCampaign();
  const confirmMut = useConfirmDonation();
  const { data: shifts = [] } = useShifts(id);
  const { data: kitchenMenu = [] } = useMenuItems(id);
  const removeMenuMut = useRemoveMenuItem();
  const [completeVisible, setCompleteVisible] = useState(false);
  const [servings, setServings] = useState('');
  const [shiftDialog, setShiftDialog] = useState(false);
  const [menuDialog, setMenuDialog] = useState(false);
  const [changeDialog, setChangeDialog] = useState(false);
  const [cancelVisible, setCancelVisible] = useState(false);

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
              loading={startMut.isPending} disabled={startMut.isPending || cancelMut.isPending}
              onPress={handleStart} contentStyle={{ height: 48 }} style={[styles.footerBtn, { flex: 1 }]}
            >
              Bắt đầu chiến dịch
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
      </Portal>

      <CampaignChangeDialog
        visible={changeDialog}
        campaign={c}
        onDismiss={() => setChangeDialog(false)}
      />
      <ShiftDialog visible={shiftDialog} campaignId={c.id} onDismiss={() => setShiftDialog(false)} />
      <MenuItemDialog visible={menuDialog} campaignId={c.id} onDismiss={() => setMenuDialog(false)} />
    </SafeAreaView>
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
  const [startTime, setStartTime] = useState(campaign.startTime.slice(0, 5));
  const [endTime, setEndTime] = useState(campaign.endTime.slice(0, 5));
  const [kitchenAddress, setKitchenAddress] = useState(campaign.kitchenAddress);
  const [chefSlots, setChefSlots] = useState(String(campaign.chefSlotsNeeded));
  const [waiterSlots, setWaiterSlots] = useState(String(campaign.waiterSlotsNeeded));
  const [shipperSlots, setShipperSlots] = useState(String(campaign.shipperSlotsNeeded));
  const [reason, setReason] = useState('');

  const original = {
    scheduledDate: campaign.scheduledDate.slice(0, 10),
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
  outlineAction: { alignSelf: 'flex-start', borderColor: COLORS.outline, marginTop: 10 },
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
  footerActions: { flexDirection: 'row', gap: 10 },
  footerBtn: { borderRadius: 12 },
  cancelBtn: { borderColor: COLORS.error, minWidth: 104 },
  footerNote: { textAlign: 'center', fontSize: 14, color: COLORS.onSurfaceVariant },
  dialog: { borderRadius: 20 },
  dialogLarge: { borderRadius: 20, maxHeight: '88%' },
  dialogTitle: { fontSize: 18, fontWeight: '700', color: COLORS.onSurface },
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
