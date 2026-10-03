import { useCallback, useState } from 'react';
import { Keyboard, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, IconButton, ProgressBar, Text, TextInput } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import {
  type AssignedDistribution,
  type DishStep,
  type PickupOrder,
  useAdvanceTask,
  useCampaignSupplies,
  useConfirmIngredientPickup,
  useRetakeProofPhoto,
  useCompleteAssignedDistribution,
  useCompleteDishStep,
  useMyTaskDetail,
  qtyUnit,
} from '@/hooks/useCampaigns';
import { VolunteerKitchenOpsPanel } from '@/components/kitchen/VolunteerKitchenOpsPanel';
import { ScreenState } from '@/components/ui/ScreenState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { AppImage } from '@/components/ui/AppImage';
import { Popup } from '@/components/ui/AppPopup';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { BackButton } from '@/components/ui/BackButton';
import { NotificationBell } from '@/components/NotificationBell';
import { ReportIncidentButton } from '@/components/ReportIncidentButton';
import { getErrorMessage } from '@/hooks/useErrorHandler';
import { captureImage, type CapturedImage } from '@/services/faceCapture';
import { getCurrentCoords } from '@/services/geolocation';
import { notifyError, notifySuccess } from '@/services/haptics';
import { formatDate, formatTime } from '@/utils/campaign';
import { mobileColors as COLORS, elevation, radius, spacing } from '@/theme/design';

const STEP_LABELS: Record<number, string> = {
  1: 'Sơ chế',
  2: 'Nấu',
  3: 'Kiểm tra QC',
  4: 'Sẵn sàng xuất phát',
};

const STEP_ICONS: Record<number, string> = {
  1: 'basket-check-outline',
  2: 'pot-steam-outline',
  3: 'clipboard-check-outline',
  4: 'room-service-outline',
};

function parseNonNegativeInt(value: string) {
  const n = Number.parseInt(value.trim(), 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function formatDateTime(value?: string | null) {
  if (!value) return '';
  return new Date(value).toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

export default function VolunteerTaskDetailScreen() {
  const { assignmentId } = useLocalSearchParams<{ assignmentId: string }>();
  const [screenFocused, setScreenFocused] = useState(false);
  const taskQuery = useMyTaskDetail(assignmentId, true, screenFocused);
  const refetchTask = taskQuery.refetch;
  const advance = useAdvanceTask();

  useFocusEffect(
    useCallback(() => {
      setScreenFocused(true);
      void refetchTask();
      return () => setScreenFocused(false);
    }, [refetchTask])
  );

  const handleBack = () => {
    router.replace({ pathname: '/(app)/volunteer/campaigns', params: { segment: 'tasks' } });
  };

  const handleCheckIn = async () => {
    const detail = taskQuery.data;
    if (!detail) return;
    try {
      const { coords } = await getCurrentCoords();
      if (!coords) {
        Popup.show({
          type: 'warning',
          text1: 'Cần vị trí để điểm danh',
          text2: 'Hãy bật vị trí và đứng gần bếp trước khi thử lại.',
        });
        return;
      }
      await advance.mutateAsync({
        assignmentId: detail.assignment.id,
        campaignId: detail.campaign.id,
        lng: coords.lng,
        lat: coords.lat,
      });
      void notifySuccess();
      Popup.show({ type: 'success', text1: 'Đã điểm danh tại bếp' });
      await taskQuery.refetch();
    } catch (error) {
      void notifyError();
      Popup.show({ type: 'error', text1: 'Điểm danh thất bại', text2: getErrorMessage(error) });
    }
  };

  if (!screenFocused || taskQuery.isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <TaskHeader title="Nhiệm vụ" onBack={handleBack} />
        <ScreenState kind="loading" title="Đang tải nhiệm vụ" />
      </SafeAreaView>
    );
  }

  if (taskQuery.isError || !taskQuery.data) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <TaskHeader title="Nhiệm vụ" onBack={handleBack} />
        <ScreenState
          kind="error"
          title="Không tải được nhiệm vụ"
          actionLabel="Thử lại"
          onAction={() => taskQuery.refetch()}
        />
      </SafeAreaView>
    );
  }

  const detail = taskQuery.data;
  const checkedIn = ['checked_in', 'in_progress', 'completed'].includes(detail.assignment.status);
  const workDate = detail.assignment.workDate ?? detail.campaign.scheduledDate;
  const shiftStartTime = detail.assignment.shift?.startTime ?? detail.campaign.startTime;
  const shiftEndTime = detail.assignment.shift?.endTime ?? detail.campaign.endTime;
  const campaignSpansMultipleDays = Boolean(
    detail.campaign.endDate && detail.campaign.endDate !== detail.campaign.scheduledDate,
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TaskHeader title={detail.assignment.role === 'chef' ? 'Ca bếp của tôi' : 'Ca vận hành của tôi'} onBack={handleBack} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={taskQuery.isRefetching} onRefresh={() => taskQuery.refetch()} />
        }
      >
        <View style={styles.hero}>
          <Text style={styles.heroKicker}>
            {detail.assignment.role === 'chef' ? 'Đầu bếp' : 'Giao nhận / phục vụ'}
            {detail.assignment.shift ? ` · ${detail.assignment.shift.label}` : ''}
          </Text>
          <Text style={styles.heroTitle}>{detail.campaign.title}</Text>
          <View style={styles.heroMeta}>
            <MaterialCommunityIcons name="map-marker-outline" size={16} color={COLORS.secondaryContainer} />
            <Text style={styles.heroMetaText}>{detail.campaign.kitchenAddress}</Text>
          </View>
          <View style={styles.heroMeta}>
            <MaterialCommunityIcons name="calendar-clock" size={16} color={COLORS.secondaryContainer} />
            <Text style={styles.heroMetaText}>
              Ngày làm: {formatDate(workDate)} · {formatTime(shiftStartTime)}–{formatTime(shiftEndTime)}
            </Text>
          </View>
          {campaignSpansMultipleDays ? (
            <View style={styles.heroMeta}>
              <MaterialCommunityIcons name="calendar-range" size={16} color={COLORS.secondaryContainer} />
              <Text style={styles.heroMetaText}>
                Chiến dịch: {formatDate(detail.campaign.scheduledDate)}–{formatDate(detail.campaign.endDate!)}
              </Text>
            </View>
          ) : null}
          <View style={styles.heroStatusRow}>
            <StatusBadge
              label={checkedIn ? 'Đã điểm danh' : 'Chưa điểm danh'}
              tone={checkedIn ? 'success' : 'warning'}
            />
            {detail.assignment.checkInLateMinutes ? (
              <StatusBadge label={`Trễ ${detail.assignment.checkInLateMinutes} phút`} tone="danger" />
            ) : null}
          </View>
        </View>

        {!checkedIn ? (
          <View style={styles.notice}>
            <MaterialCommunityIcons name="map-marker-check-outline" size={24} color={COLORS.warning} />
            <View style={styles.flex}>
              <Text style={styles.noticeTitle}>Điểm danh để bắt đầu ca</Text>
              <Text style={styles.muted}>Ứng dụng sẽ xác minh bạn đang ở gần bếp.</Text>
            </View>
            <Button
              mode="contained"
              compact
              loading={advance.isPending}
              disabled={advance.isPending || detail.campaign.status !== 'in_progress'}
              onPress={handleCheckIn}
            >
              Điểm danh
            </Button>
          </View>
        ) : null}

        {detail.assignment.role === 'chef' ? (
          <ChefTask detail={detail} checkedIn={checkedIn} onRefresh={() => taskQuery.refetch()} />
        ) : detail.assignment.role === 'waiter' || detail.assignment.role === 'shipper' ? (
          <WaiterTask detail={detail} checkedIn={checkedIn} onRefresh={() => taskQuery.refetch()} />
        ) : (
          <ScreenState kind="empty" title="Nhiệm vụ này thuộc luồng giao hàng" />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function TaskHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={styles.header}>
      <BackButton onPress={onBack} />
      <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
      <NotificationBell />
    </View>
  );
}

function ChefTask({ detail, checkedIn, onRefresh }: {
  detail: NonNullable<ReturnType<typeof useMyTaskDetail>['data']>;
  checkedIn: boolean;
  onRefresh: () => Promise<unknown> | void;
}) {
  const supplies = useCampaignSupplies(detail.campaign.id);
  const completeStep = useCompleteDishStep();
  const [expandedRecipe, setExpandedRecipe] = useState<string | null>(null);

  const dishes = detail.dishes ?? [];
  const team = detail.cookingTeam ?? [];
  const totalSteps = dishes.reduce((sum, dish) => sum + dish.steps.length, 0);
  const doneSteps = dishes.reduce(
    (sum, dish) => sum + dish.steps.filter((step) => step.effectiveStatus === 'done').length,
    0,
  );
  const progress = totalSteps ? doneSteps / totalSteps : 0;

  const handleComplete = async (step: DishStep) => {
    try {
      const photo = await captureImage('id_card', 'proof');
      if (!photo) return;
      await completeStep.mutateAsync({ campaignId: detail.campaign.id, stepId: step.id, proof: photo });
      void notifySuccess();
      Popup.show({ type: 'success', text1: `Đã hoàn thành “${STEP_LABELS[step.stepOrder]}”` });
      await onRefresh();
    } catch (error) {
      void notifyError();
      Popup.show({ type: 'error', text1: 'Không thể xác nhận khâu', text2: getErrorMessage(error) });
    }
  };


  return (
    <>
      <Section title="Tiến độ chế biến" icon="progress-check">
        <View style={styles.progressHead}>
          <Text style={styles.progressValue}>{doneSteps}/{totalSteps} khâu</Text>
          <Text style={styles.muted}>{Math.round(progress * 100)}%</Text>
        </View>
        <ProgressBar progress={progress} color={COLORS.success} style={styles.progressBar} />
      </Section>

      {team.length ? (
        <Section title={`Đội bếp (${team.length})`} icon="account-group-outline">
          <View style={styles.chipList}>
            {team.map((member, index) => (
              <View
                key={member.assignmentId ?? `${member.volunteerId}-${member.shift?.id ?? member.shift?.label ?? 'shift'}-${index}`}
                style={[styles.personChip, member.isMe && styles.personChipMine]}
              >
                <MaterialCommunityIcons name="account-circle" size={20} color={member.isMe ? COLORS.primary : COLORS.onSurfaceVariant} />
                <View style={styles.flex}>
                  <Text style={styles.personName}>{member.isMe ? `${member.fullName} (Bạn)` : member.fullName}</Text>
                  {member.shift ? <Text style={styles.smallMuted}>{member.shift.label} · {member.shift.startTime}–{member.shift.endTime}</Text> : null}
                </View>
              </View>
            ))}
          </View>
        </Section>
      ) : null}

      <Section title="Nguyên liệu" icon="basket-outline">
        {supplies.isLoading ? <Text style={styles.muted}>Đang tải nguyên liệu…</Text> : null}
        {(supplies.data?.requested ?? []).map((item, index) => (
          <InfoLine
            key={`${item.name}-${index}`}
            icon="clipboard-list-outline"
            title={item.name}
            subtitle={item.quantity != null ? `Cần ${item.quantity}${item.unit ? ` ${item.unit}` : ''}` : 'Theo nhu cầu chiến dịch'}
          />
        ))}
        {(supplies.data?.items ?? []).map((item) => (
          <InfoLine
            key={item.itemName}
            icon="check-circle-outline"
            title={item.itemName}
            subtitle={`Đã nhận ${item.entries} lượt${item.quantities.length ? ` · ${item.quantities.join(' + ')}` : ''}`}
            success
          />
        ))}
        {!supplies.isLoading && !(supplies.data?.requested.length || supplies.data?.items.length) ? (
          <Text style={styles.muted}>Chưa có dữ liệu nguyên liệu.</Text>
        ) : null}
      </Section>

      <View style={styles.sectionHeaderOutside}>
        <MaterialCommunityIcons name="pot-steam-outline" size={22} color={COLORS.primary} />
        <Text style={styles.sectionOutsideTitle}>Món cần chuẩn bị ({dishes.length})</Text>
      </View>
      {/* Chưa đủ nguyên liệu → cả chuỗi khâu khoá; nói rõ còn thiếu gì. */}
      {detail.ingredients && !detail.ingredients.ready && dishes.length > 0 ? (
        <View style={styles.ingredientsWarn}>
          <MaterialCommunityIcons name="package-variant-closed-remove" size={20} color="#B45309" />
          <View style={{ flex: 1 }}>
            <Text style={styles.ingredientsWarnTitle}>Chưa đủ nguyên liệu — chưa thể sơ chế & nấu</Text>
            <Text style={styles.ingredientsWarnText}>
              Còn thiếu: {detail.ingredients.missing.map((m) => `${m.name} ${m.missing} ${m.unit}`).join(', ')}.
              {' '}Bếp nhận đủ hàng thì khâu sơ chế sẽ tự mở.
            </Text>
          </View>
        </View>
      ) : null}
      {dishes.length === 0 ? (
        <View style={styles.card}><Text style={styles.muted}>Bếp trưởng chưa thêm món cho chiến dịch.</Text></View>
      ) : dishes.map((dish) => {
        const done = dish.steps.filter((step) => step.effectiveStatus === 'done').length;
        const recipeOpen = expandedRecipe === dish.id;
        const dishCancelled = dish.steps.some((step) => step.stepOrder === 3 && step.reviewStatus === 'rejected');
        return (
          <View key={dish.id} style={styles.dishCard}>
            <View style={styles.dishHead}>
              <View style={styles.flex}>
                <Text style={styles.dishTitle}>{dish.name}</Text>
                <Text style={styles.muted}>{dish.plannedServings ? `${dish.plannedServings} suất · ` : ''}{done}/{dish.steps.length} khâu</Text>
                {dishCancelled ? (
                  <Text style={styles.stepRejectedText}>
                    Món đã bị huỷ vì QC không đạt.
                  </Text>
                ) : null}
              </View>
              <Text style={styles.dishPercent}>{dish.steps.length ? Math.round((done / dish.steps.length) * 100) : 0}%</Text>
            </View>

            {dish.recipe ? (
              <Pressable style={styles.recipeToggle} onPress={() => setExpandedRecipe(recipeOpen ? null : dish.id)}>
                <MaterialCommunityIcons name={recipeOpen ? 'chevron-up' : 'chevron-down'} size={20} color={COLORS.primary} />
                <Text style={styles.recipeToggleText}>{recipeOpen ? 'Thu gọn công thức' : 'Xem công thức & nguyên liệu'}</Text>
              </Pressable>
            ) : null}
            {recipeOpen && dish.recipe ? (
              <View style={styles.recipeBox}>
                {dish.recipe.description ? <Text style={styles.body}>{dish.recipe.description}</Text> : null}
                {dish.recipe.ingredients.length ? (
                  <View>
                    <Text style={styles.fieldLabel}>Nguyên liệu</Text>
                    {dish.recipe.ingredients.map((ingredient, index) => (
                      <Text key={`${ingredient.name}-${index}`} style={styles.bullet}>• {ingredient.name}{ingredient.quantity ? ` — ${ingredient.quantity}` : ''}</Text>
                    ))}
                  </View>
                ) : null}
                {dish.recipe.instructions ? (
                  <View><Text style={styles.fieldLabel}>Cách làm</Text><Text style={styles.body}>{dish.recipe.instructions}</Text></View>
                ) : null}
              </View>
            ) : null}

            {dish.steps.map((step, index) => (
              <DishStepRow
                key={step.id}
                step={step}
                previousDone={index === 0 || dish.steps[index - 1]?.effectiveStatus === 'done'}
                canAct={checkedIn && detail.assignment.status !== 'completed' && !dishCancelled}
                pending={completeStep.isPending}
                awaitingQcReview={
                  step.stepOrder === 4 &&
                  dish.steps[index - 1]?.effectiveStatus === 'done' &&
                  dish.steps[index - 1]?.reviewStatus !== 'approved'
                }
                onComplete={() => handleComplete(step)}
              />
            ))}
          </View>
        );
      })}

      <VolunteerKitchenOpsPanel campaignId={detail.campaign.id} isChef isWaiter={false} />

    </>
  );
}

function DishStepRow({ step, previousDone, canAct, pending, awaitingQcReview, onComplete }: {
  step: DishStep;
  previousDone: boolean;
  canAct: boolean;
  pending: boolean;
  awaitingQcReview?: boolean;
  onComplete: () => void;
}) {
  const done = step.effectiveStatus === 'done';
  const available = step.effectiveStatus === 'available';
  const qcFailed = !!step.qcFailedAt;
  const isQcStep = step.stepOrder === 3;
  return (
    <View style={[styles.stepCard, done && styles.stepDone, qcFailed && styles.stepFailed]}>
      <View style={[styles.stepIcon, done && styles.stepIconDone, qcFailed && styles.stepIconFailed]}>
        <MaterialCommunityIcons
          name={qcFailed ? 'alert-octagon' : done ? 'check' : (STEP_ICONS[step.stepOrder] as never)}
          size={20}
          color={done || qcFailed ? COLORS.onPrimary : COLORS.onSurfaceVariant}
        />
      </View>
      <View style={styles.flex}>
        <Text style={styles.stepTitle}>{STEP_LABELS[step.stepOrder] ?? step.stepName}</Text>
        <Text style={styles.smallMuted}>
          {done
            ? `Hoàn thành ${formatDateTime(step.completedAt)}`
            : qcFailed
              ? step.qcFailureReason
              : awaitingQcReview
                ? 'Chờ tổ chức duyệt ảnh QC'
                : step.lockedReason === 'ingredients'
                  ? 'Chờ bếp nhận đủ nguyên liệu'
                  : !previousDone
                  ? 'Chờ khâu trước hoàn thành'
                  : `Dự kiến ${step.scheduledTime}`}
        </Text>
        {step.completedByVolunteer?.user.fullName ? <Text style={styles.smallMuted}>bởi {step.completedByVolunteer.user.fullName}</Text> : null}
        {step.proofUrl ? <AppImage source={{ uri: step.proofUrl }} style={styles.stepProof} /> : null}
        {isQcStep && step.reviewStatus === 'pending' ? (
          <Text style={styles.stepPendingText}>Chờ tổ chức duyệt ảnh QC.</Text>
        ) : null}
        {isQcStep && step.reviewStatus === 'approved' ? (
          <Text style={styles.stepApprovedText}>Tổ chức đã duyệt ảnh QC.</Text>
        ) : null}
        {isQcStep && step.reviewStatus === 'rejected' ? (
          <Text style={styles.stepRejectedText}>
            Món đã bị huỷ vì QC không đạt{step.reviewNote ? `: ${step.reviewNote}` : ''}.
          </Text>
        ) : null}
        {available && canAct && !qcFailed ? (
          <View style={styles.stepActions}>
            <Button mode="contained" compact icon="camera" loading={pending} disabled={pending} onPress={onComplete}>
              {step.stepOrder === 3 ? 'Kiểm tra & xác nhận' : 'Chụp ảnh & xác nhận'}
            </Button>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function WaiterTask({ detail, checkedIn, onRefresh }: {
  detail: NonNullable<ReturnType<typeof useMyTaskDetail>['data']>;
  checkedIn: boolean;
  onRefresh: () => Promise<unknown> | void;
}) {
  const complete = useCompleteAssignedDistribution();
  const confirmPickup = useConfirmIngredientPickup();
  const retake = useRetakeProofPhoto();
  /** Khoá của ảnh đang được chụp lại — để chỉ nút đó quay vòng. */
  const [retakingKey, setRetakingKey] = useState<string | null>(null);
  // Chiến dịch kết thúc thì ảnh bằng chứng đã lên báo cáo — không cho sửa nữa.
  const canRetake = detail.campaign.status !== 'completed' && detail.campaign.status !== 'cancelled';
  const [closing, setClosing] = useState<AssignedDistribution | null>(null);
  const [confirmingPickup, setConfirmingPickup] = useState<PickupOrder | null>(null);
  const [actualServings, setActualServings] = useState('');
  const [receivedKg, setReceivedKg] = useState('');
  const [note, setNote] = useState('');
  /** Ảnh chốt đợt phát theo từng điểm — mỗi điểm cần ít nhất 1 ảnh. */
  const [distributionPhotos, setDistributionPhotos] = useState<{ photo: CapturedImage; pointIndex: number }[]>([]);
  const [pickupPhoto, setPickupPhoto] = useState<CapturedImage | null>(null);

  const dishes = detail.dishes ?? [];
  const distributions = detail.distributions ?? [];
  const pickupOrders = detail.pickupOrders ?? [];
  const readyDishes = dishes.filter((dish) =>
    dish.steps.some((step) => step.stepOrder === 4 && step.effectiveStatus === 'done')
  );

  const closingSlots = closing
    ? closing.points.length > 0
      ? closing.points.map((pt, i) => ({ index: i, label: pt.label, address: pt.address }))
      : [{ index: -1, label: 'Ảnh bằng chứng phân phát', address: '' }]
    : [];
  const photoDoneCount = closingSlots.filter((sl) => distributionPhotos.some((p) => p.pointIndex === sl.index)).length;
  const plannedServings = closing?.servingsServed ?? 0;
  const servingsValue = parseNonNegativeInt(actualServings);
  const servingsInvalid = actualServings.trim() !== '' && (servingsValue == null || servingsValue > plannedServings);
  const leftover = servingsValue != null && servingsValue <= plannedServings ? plannedServings - servingsValue : 0;

  const bumpServings = (delta: number) => {
    const next = Math.min(plannedServings, Math.max(0, (servingsValue ?? 0) + delta));
    setActualServings(String(next));
  };

  const closeDistributionSheet = () => {
    if (complete.isPending) return;
    Keyboard.dismiss();
    setClosing(null);
    setDistributionPhotos([]);
  };

  const openClose = (distribution: AssignedDistribution) => {
    setClosing(distribution);
    setActualServings(String(distribution.servingsServed));
    setNote('');
    setDistributionPhotos([]);
  };

  const openPickupConfirm = (order: PickupOrder) => {
    setConfirmingPickup(order);
    setReceivedKg(order.quantityKg != null ? String(order.quantityKg) : '');
    setNote('');
    setPickupPhoto(null);
  };

  const closePickupConfirm = () => {
    if (confirmPickup.isPending) return;
    Keyboard.dismiss();
    setConfirmingPickup(null);
    setPickupPhoto(null);
  };

  const submitClose = async () => {
    if (!closing) return;
    const servings = parseNonNegativeInt(actualServings);
    if (servings == null || servings > closing.servingsServed) {
      Popup.show({
        type: 'warning',
        text1: 'Số liệu không hợp lệ',
        text2: `Số suất thực phát không vượt ${closing.servingsServed} (số đã lên kế hoạch).`,
      });
      return;
    }
    const missing = closingSlots.filter((sl) => !distributionPhotos.some((p) => p.pointIndex === sl.index));
    if (missing.length > 0) {
      Popup.show({
        type: 'warning',
        text1: 'Thiếu ảnh bằng chứng',
        text2:
          closingSlots.length > 1
            ? `Mỗi điểm phát cần ít nhất 1 ảnh — còn thiếu điểm ${missing.map((sl) => sl.index + 1).join(', ')}.`
            : 'Chụp ít nhất 1 ảnh tại điểm phát làm bằng chứng đã giao.',
      });
      return;
    }
    try {
      // QUY TẮC: 1 suất = 1 người — BE tự ghi số người = số suất, không gửi riêng.
      await complete.mutateAsync({
        distributionId: closing.id,
        campaignId: detail.campaign.id,
        actualServings: servings,
        note: note.trim() || undefined,
        photos: distributionPhotos,
      });
      void notifySuccess();
      Popup.show({ type: 'success', text1: `Đã chốt ${servings}/${closing.servingsServed} suất` });
      setClosing(null);
      setDistributionPhotos([]);
      await onRefresh();
    } catch (error) {
      void notifyError();
      Popup.show({ type: 'error', text1: 'Không chốt được đợt phát', text2: getErrorMessage(error) });
    }
  };

  const openDirections = async (lat?: number | null, lng?: number | null) => {
    if (lat == null || lng == null) return;
    await Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`);
  };

  const capturePickupPhoto = async () => {
    try {
      Keyboard.dismiss();
      const photo = await captureImage('id_card', 'proof');
      if (photo) setPickupPhoto(photo);
    } catch (error) {
      void notifyError();
      Popup.show({ type: 'error', text1: 'Không chụp được ảnh', text2: getErrorMessage(error) });
    }
  };

  const captureDistributionPhoto = async (pointIndex: number) => {
    try {
      Keyboard.dismiss();
      const photo = await captureImage('id_card', 'proof');
      if (photo) setDistributionPhotos((prev) => [...prev, { photo, pointIndex }]);
    } catch (error) {
      void notifyError();
      Popup.show({ type: 'error', text1: 'Không chụp được ảnh', text2: getErrorMessage(error) });
    }
  };

  /** Chụp lại ảnh bằng chứng đã gửi (chụp nhầm / ảnh mờ) — chỉ thay ảnh, số liệu giữ nguyên. */
  const retakeProof = async (kind: 'pickup' | 'distribution', id: string, pointIndex?: number) => {
    if (retake.isPending) return;
    try {
      const photo = await captureImage('id_card', 'proof');
      if (!photo) return;
      setRetakingKey(`${kind}:${id}:${pointIndex ?? ''}`);
      await retake.mutateAsync({ kind, id, photo, pointIndex });
      void notifySuccess();
      Popup.show({ type: 'success', text1: 'Đã thay ảnh bằng chứng' });
      await onRefresh();
    } catch (error) {
      void notifyError();
      Popup.show({ type: 'error', text1: 'Không thay được ảnh', text2: getErrorMessage(error) });
    } finally {
      setRetakingKey(null);
    }
  };

  const submitPickupConfirm = async () => {
    if (!confirmingPickup) return;
    const kg = Number.parseFloat(receivedKg.replace(',', '.').trim());
    if (!Number.isFinite(kg) || kg < 0) {
      Popup.show({
        type: 'warning',
        text1: 'Số lượng không hợp lệ',
        text2: `Nhập số ${qtyUnit(confirmingPickup)} thực nhận trước khi xác nhận.`,
      });
      return;
    }
    if (!pickupPhoto) {
      Popup.show({
        type: 'warning',
        text1: 'Thiếu ảnh nguyên liệu',
        text2: 'Chụp ảnh nguyên liệu để kiểm tra lại trước khi gửi xác nhận.',
      });
      return;
    }
    try {
      Keyboard.dismiss();
      const providerRequestId = confirmingPickup.providerRequestId || confirmingPickup.id;
      await confirmPickup.mutateAsync({
        requestId: providerRequestId,
        receivedKg: kg,
        photo: pickupPhoto,
        note: note.trim() || undefined,
      });
      void notifySuccess();
      Popup.show({ type: 'success', text1: `Đã xác nhận lấy ${kg} ${qtyUnit(confirmingPickup)} nguyên liệu` });
      setConfirmingPickup(null);
      setPickupPhoto(null);
      await onRefresh();
    } catch (error) {
      void notifyError();
      Popup.show({ type: 'error', text1: 'Không xác nhận được đơn nguyên liệu', text2: getErrorMessage(error) });
    }
  };

  return (
    <>
      {detail.assignment.shift ? (
        <Section title="Ca trực được phân" icon="calendar-clock">
          <Text style={styles.cardTitle}>{detail.assignment.shift.label}</Text>
          <Text style={styles.muted}>{detail.assignment.shift.startTime}–{detail.assignment.shift.endTime}</Text>
        </Section>
      ) : null}

      <Section title="Món sẵn sàng chia suất" icon="room-service-outline">
        <View style={styles.progressHead}>
          <Text style={styles.progressValue}>{readyDishes.length}/{dishes.length} món</Text>
          <Text style={styles.muted}>đã qua khâu 4</Text>
        </View>
        {dishes.length === 0 ? <Text style={styles.muted}>Chiến dịch chưa có món trong thực đơn.</Text> : null}
        {dishes.map((dish) => {
          const readyStep = dish.steps.find((step) => step.stepOrder === 4);
          const ready = readyStep?.effectiveStatus === 'done';
          const current = dish.steps.find((step) => step.effectiveStatus !== 'done');
          return (
            <InfoLine
              key={dish.id}
              icon={ready ? 'check-circle-outline' : 'timer-sand'}
              title={dish.name}
              subtitle={ready ? `Sẵn sàng${readyStep?.completedAt ? ` lúc ${formatDateTime(readyStep.completedAt)}` : ''}` : `Bếp đang ở “${current?.stepName ?? 'chờ cập nhật'}”${current?.scheduledTime ? ` · ${current.scheduledTime}` : ''}`}
              success={ready}
              trailing={dish.plannedServings ? `${dish.plannedServings} suất` : undefined}
            />
          );
        })}
      </Section>

      {pickupOrders.length > 0 ? (
        <>
          <View style={styles.sectionHeaderOutside}>
            <MaterialCommunityIcons name="truck-delivery-outline" size={22} color={COLORS.primary} />
            <Text style={styles.sectionOutsideTitle}>Đơn nguyên liệu cần lấy ({pickupOrders.length})</Text>
          </View>
          {pickupOrders.map((order) => {
            const done = !!order.pickup || order.delivery?.status === 'delivered';
            return (
              <View key={order.id} style={styles.pickupCard}>
                <View style={styles.dishHead}>
                  <View style={styles.flex}>
                    <Text style={styles.dishTitle}>{order.providerName}</Text>
                    <Text style={styles.muted}>
                      {order.ingredientName ?? 'Nguyên liệu chiến dịch'}
                      {order.quantityKg != null ? ` · cần lấy ${order.quantityKg} ${qtyUnit(order)}` : ''}
                    </Text>
                    <Text style={styles.smallMuted}>
                      {order.pickupStartTime && order.pickupEndTime
                        ? `Khung lấy ${formatTime(order.pickupStartTime)}–${formatTime(order.pickupEndTime)}`
                        : 'Chưa hẹn khung lấy'}
                      {order.distanceKm != null ? ` · cách bếp ~${order.distanceKm} km` : ''}
                    </Text>
                  </View>
                  <StatusBadge label={done ? 'Đã lấy' : 'Cần lấy'} tone={done ? 'success' : 'warning'} />
                </View>

                <View style={styles.pickupBody}>
                  <InfoLine
                    icon="store-marker-outline"
                    title="Điểm lấy"
                    subtitle={order.providerAddress ?? 'Chưa có địa chỉ NCC'}
                  />
                  <InfoLine
                    icon="home-map-marker"
                    title="Giao về bếp"
                    subtitle={order.kitchenAddress}
                  />
                  {order.message ? (
                    <InfoLine icon="message-text-outline" title="Ghi chú" subtitle={order.message} />
                  ) : null}
                  {order.pickup ? (
                    <View style={styles.completedBox}>
                      <Text style={styles.completedText}>
                        Đã nhận {order.pickup.receivedKg} {qtyUnit(order)}
                        {order.pickup.requestedKg != null ? ` / đặt ${order.pickup.requestedKg} ${qtyUnit(order)}` : ''}
                        {order.pickup.confirmedAt ? ` · ${formatDateTime(order.pickup.confirmedAt)}` : ''}
                      </Text>
                      {order.pickup.photoUrl ? (
                        <AppImage source={{ uri: order.pickup.photoUrl }} style={styles.pickupProof} />
                      ) : null}
                      {canRetake ? (
                        <Button
                          compact
                          icon="camera-retake-outline"
                          textColor={COLORS.success}
                          loading={retakingKey === `pickup:${order.providerRequestId || order.id}:`}
                          disabled={retake.isPending}
                          onPress={() => retakeProof('pickup', order.providerRequestId || order.id)}
                          style={styles.retakeBtn}
                        >
                          Chụp lại ảnh
                        </Button>
                      ) : null}
                    </View>
                  ) : null}
                </View>

                <View style={styles.distributionActions}>
                  {order.lat != null && order.lng != null ? (
                    <Button compact icon="directions" onPress={() => openDirections(order.lat, order.lng)}>Đi NCC</Button>
                  ) : null}
                  {!done ? (
                    <ReportIncidentButton
                      campaignId={detail.campaign.id}
                      context="pickup"
                      referenceId={order.id}
                      subject={[order.ingredientName, order.providerName].filter(Boolean).join(' · ')}
                    />
                  ) : null}
                  <Button
                    mode="contained"
                    icon="camera"
                    disabled={!checkedIn || done || confirmPickup.isPending}
                    loading={confirmPickup.isPending && confirmingPickup?.id === order.id}
                    onPress={() => openPickupConfirm(order)}
                  >
                    Xác nhận lấy
                  </Button>
                </View>
              </View>
            );
          })}
        </>
      ) : null}

      <View style={styles.sectionHeaderOutside}>
        <MaterialCommunityIcons name="food-takeout-box-outline" size={22} color={COLORS.primary} />
        <Text style={styles.sectionOutsideTitle}>Đợt phát được giao ({distributions.length})</Text>
      </View>
      {distributions.length === 0 ? (
        <View style={styles.card}><Text style={styles.muted}>Tổ chức chưa giao đợt phát nào cho bạn.</Text></View>
      ) : distributions.map((distribution) => (
        <View key={distribution.id} style={styles.distributionCard}>
          <View style={styles.dishHead}>
            <View style={styles.flex}>
              <Text style={styles.dishTitle}>{distribution.roundLabel || 'Đợt phân phát'}</Text>
              <Text style={styles.muted}>{distribution.servingsServed} suất · {distribution.peopleServed} người</Text>
            </View>
            <StatusBadge label={distribution.completedAt ? 'Đã chốt' : 'Cần thực hiện'} tone={distribution.completedAt ? 'success' : 'warning'} />
          </View>
          {distribution.points.map((point, index) => (
            <View key={`${distribution.id}-${index}`} style={styles.pointRow}>
              <View style={styles.pointIndex}><Text style={styles.pointIndexText}>{index + 1}</Text></View>
              <View style={styles.flex}>
                <Text style={styles.pointTitle}>{point.label}</Text>
                <Text style={styles.smallMuted}>{point.address}</Text>
              </View>
              {point.lat != null && point.lng != null ? (
                <Button compact icon="directions" onPress={() => openDirections(point.lat, point.lng)}>Đi</Button>
              ) : null}
            </View>
          ))}
          {distribution.completedAt ? (
            <View style={styles.completedBox}>
              <Text style={styles.completedText}>
                Đã phát {distribution.actualServings ?? distribution.servingsServed}/{distribution.servingsServed} suất cho {distribution.actualPeopleServed ?? distribution.peopleServed} người · {formatDateTime(distribution.completedAt)}
              </Text>
              {distribution.photoUrl ? (
                <AppImage source={{ uri: distribution.photoUrl }} style={styles.distributionProof} />
              ) : null}
              {canRetake
                ? (distribution.points.length > 1 ? distribution.points.map((_, i) => i) : [undefined]).map((pointIndex) => (
                    <Button
                      key={`retake-${pointIndex ?? 'all'}`}
                      compact
                      icon="camera-retake-outline"
                      textColor={COLORS.success}
                      loading={retakingKey === `distribution:${distribution.id}:${pointIndex ?? ''}`}
                      disabled={retake.isPending}
                      onPress={() => retakeProof('distribution', distribution.id, pointIndex)}
                      style={styles.retakeBtn}
                    >
                      {pointIndex == null ? 'Chụp lại ảnh' : `Chụp lại ảnh điểm ${pointIndex + 1}`}
                    </Button>
                  ))
                : null}
            </View>
          ) : (
            <View style={styles.distributionActions}>
              <ReportIncidentButton
                campaignId={detail.campaign.id}
                context="distribution"
                referenceId={distribution.id}
                subject={distribution.roundLabel || 'Đợt phân phát'}
              />
              <Button
                mode="contained"
                icon="camera"
                disabled={!checkedIn}
                onPress={() => openClose(distribution)}
              >
                Chụp ảnh xác nhận
              </Button>
            </View>
          )}
        </View>
      ))}

      <BottomSheet
        visible={!!closing}
        onClose={closeDistributionSheet}
        busy={complete.isPending}
        icon="food-takeout-box-outline"
        title="Chốt đợt phát"
        subtitle="Nhập số suất thực phát và chụp ảnh tại từng điểm trước khi gửi."
        footer={
          <>
            <Button mode="outlined" onPress={closeDistributionSheet} disabled={complete.isPending} style={styles.sheetBtn}>
              Huỷ
            </Button>
            <Button
              mode="contained"
              icon="check"
              loading={complete.isPending}
              disabled={complete.isPending || photoDoneCount < closingSlots.length}
              onPress={submitClose}
              style={styles.sheetSubmitBtn}
            >
              Xác nhận đã phát
            </Button>
          </>
        }
      >
        {closing ? (
          <>
            {/* Tóm tắt đợt đang chốt */}
            <View style={styles.pickupSummary}>
              <View style={styles.pickupSummaryRow}>
                <MaterialCommunityIcons name="flag-checkered" size={18} color={COLORS.primary} />
                <Text style={styles.pickupSummaryTitle}>{closing.roundLabel || 'Đợt phân phát'}</Text>
              </View>
              <Text style={styles.pickupSummaryText}>
                Kế hoạch {plannedServings} suất
                {closing.points.length > 0 ? ` · ${closing.points.length} điểm phát` : ''}
              </Text>
            </View>

            {/* Số suất thực phát — stepper để chỉnh nhanh, vẫn gõ tay được */}
            <View style={styles.sheetBlock}>
              <Text style={styles.sheetLabel}>Số suất thực phát *</Text>
              <View style={styles.stepperRow}>
                <IconButton
                  icon="minus"
                  mode="outlined"
                  size={20}
                  onPress={() => bumpServings(-1)}
                  disabled={complete.isPending || (servingsValue ?? 0) <= 0}
                  style={styles.stepperBtn}
                  accessibilityLabel="Giảm 1 suất"
                />
                <TextInput
                  mode="outlined"
                  value={actualServings}
                  onChangeText={(v) => setActualServings(v.replace(/[^0-9]/g, ''))}
                  keyboardType="number-pad"
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                  right={<TextInput.Affix text={`/ ${plannedServings}`} />}
                  error={servingsInvalid}
                  style={styles.stepperInput}
                  contentStyle={styles.stepperInputText}
                />
                <IconButton
                  icon="plus"
                  mode="outlined"
                  size={20}
                  onPress={() => bumpServings(1)}
                  disabled={complete.isPending || (servingsValue ?? 0) >= plannedServings}
                  style={styles.stepperBtn}
                  accessibilityLabel="Tăng 1 suất"
                />
              </View>
              {servingsInvalid ? (
                <Text style={styles.sheetError}>Nhập số từ 0 đến {plannedServings}.</Text>
              ) : leftover > 0 ? (
                <View style={styles.leftoverBox}>
                  <MaterialCommunityIcons name="package-variant" size={16} color={COLORS.onWarningContainer} />
                  <Text style={styles.leftoverText}>
                    Còn dư {leftover} suất — ghi chú bên dưới cách xử lý (gửi lại bếp, chuyển điểm khác…).
                  </Text>
                </View>
              ) : null}
              {/* 1 suất = 1 người — số người nhận tự ghi bằng số suất, không nhập tay */}
              <View style={styles.sheetHintRow}>
                <MaterialCommunityIcons name="account-multiple-check-outline" size={16} color={COLORS.onSurfaceVariant} />
                <Text style={styles.sheetHint}>
                  1 suất = 1 người · hệ thống tự ghi <Text style={styles.sheetHintStrong}>{servingsValue ?? 0} người nhận</Text>
                </Text>
              </View>
            </View>

            {/* Mỗi điểm phát ≥ 1 ảnh bằng chứng đã giao tới đó */}
            <View style={styles.sheetBlock}>
              <View style={styles.sheetLabelRow}>
                <Text style={[styles.sheetLabel, styles.flex]}>Ảnh bằng chứng tại điểm phát *</Text>
                <View style={[styles.countPill, photoDoneCount === closingSlots.length && styles.countPillDone]}>
                  <Text style={[styles.countPillText, photoDoneCount === closingSlots.length && styles.countPillTextDone]}>
                    {photoDoneCount}/{closingSlots.length} điểm
                  </Text>
                </View>
              </View>
              {closingSlots.map((sl) => {
                const mine = distributionPhotos.filter((p) => p.pointIndex === sl.index);
                const has = mine.length > 0;
                return (
                  <View key={sl.index} style={[styles.proofSlot, has && styles.proofSlotDone]}>
                    <View style={styles.proofSlotHead}>
                      <View style={[styles.proofSlotIndex, has && styles.proofSlotIndexDone]}>
                        {has ? (
                          <MaterialCommunityIcons name="check" size={14} color={COLORS.white} />
                        ) : (
                          <Text style={styles.proofSlotIndexText}>{sl.index >= 0 ? sl.index + 1 : '•'}</Text>
                        )}
                      </View>
                      <View style={styles.flex}>
                        <Text style={styles.proofSlotTitle} numberOfLines={2}>{sl.label}</Text>
                        {sl.address ? <Text style={styles.smallMuted} numberOfLines={2}>{sl.address}</Text> : null}
                      </View>
                    </View>
                    <View style={styles.proofThumbRow}>
                      {mine.map((p, k) => (
                        <View key={`${sl.index}-${k}`} style={styles.proofThumbWrap}>
                          <AppImage source={{ uri: p.photo.uri }} style={styles.proofThumb} />
                          <Pressable
                            onPress={() => setDistributionPhotos((prev) => prev.filter((x) => x !== p))}
                            disabled={complete.isPending}
                            hitSlop={8}
                            style={styles.proofThumbRemove}
                            accessibilityLabel="Xoá ảnh"
                          >
                            <MaterialCommunityIcons name="close" size={13} color={COLORS.white} />
                          </Pressable>
                        </View>
                      ))}
                      {mine.length < 3 ? (
                        <Pressable
                          onPress={() => captureDistributionPhoto(sl.index)}
                          disabled={complete.isPending}
                          style={({ pressed }) => [styles.proofAddTile, pressed && styles.proofAddTilePressed]}
                          accessibilityLabel={`Chụp ảnh cho ${sl.label}`}
                        >
                          <MaterialCommunityIcons name="camera-plus-outline" size={22} color={COLORS.primary} />
                          <Text style={styles.proofAddText}>{has ? 'Thêm' : 'Chụp ảnh'}</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </View>

            <TextInput
              mode="outlined"
              label="Ghi chú (tuỳ chọn)"
              placeholder="VD: mưa lớn nên ít người tới, dư 12 suất đã gửi lại bếp."
              value={note}
              onChangeText={setNote}
              multiline
              numberOfLines={3}
              maxLength={500}
              style={styles.pickupInput}
            />
          </>
        ) : null}
      </BottomSheet>
      <BottomSheet
        visible={!!confirmingPickup}
        onClose={closePickupConfirm}
        busy={confirmPickup.isPending}
        icon="basket-check-outline"
        title="Xác nhận lấy nguyên liệu"
        subtitle="Nhập số lượng thực nhận, chụp ảnh rồi kiểm tra lại trước khi gửi."
        footer={
          <>
            <Button mode="outlined" icon="camera" onPress={capturePickupPhoto} disabled={confirmPickup.isPending} style={styles.sheetBtn}>
              {pickupPhoto ? 'Chụp lại' : 'Chụp ảnh'}
            </Button>
            <Button
              mode="contained"
              icon="check"
              loading={confirmPickup.isPending}
              disabled={confirmPickup.isPending || !pickupPhoto}
              onPress={submitPickupConfirm}
              style={styles.sheetSubmitBtn}
            >
              Xác nhận gửi
            </Button>
          </>
        }
      >
        {confirmingPickup ? (
              <>
                <View style={styles.pickupSummary}>
                  <View style={styles.pickupSummaryRow}>
                    <MaterialCommunityIcons name="store-marker-outline" size={18} color={COLORS.primary} />
                    <Text style={styles.pickupSummaryTitle}>{confirmingPickup.providerName}</Text>
                  </View>
                  <Text style={styles.pickupSummaryText}>
                    {confirmingPickup.ingredientName ?? 'Nguyên liệu chiến dịch'}
                    {confirmingPickup.quantityKg != null ? ` · đặt ${confirmingPickup.quantityKg} ${qtyUnit(confirmingPickup)}` : ''}
                  </Text>
                  {confirmingPickup.pickupStartTime && confirmingPickup.pickupEndTime ? (
                    <Text style={styles.pickupSummaryTime}>
                      Khung lấy {formatTime(confirmingPickup.pickupStartTime)}-{formatTime(confirmingPickup.pickupEndTime)}
                    </Text>
                  ) : null}
                </View>

                <View style={styles.pickupFieldGroup}>
                  <TextInput
                    mode="outlined"
                    label={`Số ${qtyUnit(confirmingPickup)} thực nhận *`}
                    right={<TextInput.Affix text={qtyUnit(confirmingPickup)} />}
                    value={receivedKg}
                    onChangeText={setReceivedKg}
                    keyboardType="decimal-pad"
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                    style={styles.pickupInput}
                  />
                  <TextInput
                    mode="outlined"
                    label="Ghi chú"
                    value={note}
                    onChangeText={setNote}
                    multiline
                    numberOfLines={3}
                    blurOnSubmit
                    returnKeyType="done"
                    style={styles.pickupInput}
                  />
                </View>

                {pickupPhoto ? (
                  <View style={styles.pickupPhotoReview}>
                    <View style={styles.pickupPhotoHead}>
                      <MaterialCommunityIcons name="check-circle-outline" size={18} color={COLORS.success} />
                      <Text style={styles.pickupPhotoTitle}>Ảnh nguyên liệu đã chụp</Text>
                    </View>
                    <AppImage source={{ uri: pickupPhoto.uri }} style={styles.pickupPhotoPreview} />
                    <Button compact icon="camera-retake-outline" onPress={capturePickupPhoto} disabled={confirmPickup.isPending}>
                      Chụp lại
                    </Button>
                  </View>
                ) : (
                  <View style={styles.pickupPhotoEmpty}>
                    <View style={styles.pickupPhotoEmptyIcon}>
                      <MaterialCommunityIcons name="camera-outline" size={28} color={COLORS.primary} />
                    </View>
                    <Text style={styles.pickupPhotoEmptyTitle}>Chưa có ảnh bằng chứng</Text>
                    <Text style={styles.pickupPhotoEmptyText}>Chụp bao/hộp nguyên liệu rõ nhãn và số lượng để bếp đối chiếu.</Text>
                    <Button mode="contained-tonal" icon="camera" onPress={capturePickupPhoto} disabled={confirmPickup.isPending}>
                      Chụp ảnh
                    </Button>
                  </View>
                )}
              </>
        ) : null}
      </BottomSheet>
    </>
  );
}

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <View style={styles.sectionHead}>
        <MaterialCommunityIcons name={icon as never} size={21} color={COLORS.primary} />
        <Text style={styles.cardTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function InfoLine({ icon, title, subtitle, success, trailing }: {
  icon: string;
  title: string;
  subtitle: string;
  success?: boolean;
  trailing?: string;
}) {
  return (
    <View style={styles.infoLine}>
      <MaterialCommunityIcons name={icon as never} size={19} color={success ? COLORS.success : COLORS.onSurfaceVariant} />
      <View style={styles.flex}>
        <Text style={styles.infoTitle}>{title}</Text>
        <Text style={styles.smallMuted}>{subtitle}</Text>
      </View>
      {trailing ? <Text style={styles.trailing}>{trailing}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { height: 56, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '900', color: COLORS.onSurface },
  content: { padding: spacing.lg, paddingBottom: spacing.section, gap: spacing.md },
  flex: { flex: 1 },
  hero: { padding: spacing.xl, borderRadius: 30, backgroundColor: COLORS.heroCampaign, ...elevation.card },
  heroKicker: { color: COLORS.purpleContainer, fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  heroTitle: { marginTop: 5, marginBottom: 10, color: COLORS.onPrimary, fontSize: 23, lineHeight: 29, fontWeight: '900' },
  heroMeta: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 4 },
  heroMetaText: { flex: 1, color: COLORS.secondaryContainer, fontSize: 13, lineHeight: 18 },
  heroStatusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 13 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: spacing.md, borderRadius: radius.lg, backgroundColor: COLORS.warningContainer },
  noticeTitle: { fontSize: 14, fontWeight: '800', color: COLORS.onSurface },
  card: { padding: spacing.lg, borderRadius: 24, borderWidth: 1, borderColor: COLORS.outlineVariant, backgroundColor: COLORS.surface, gap: 10, ...elevation.card },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { flex: 1, fontSize: 16, fontWeight: '900', color: COLORS.onSurface },
  body: { color: COLORS.onSurfaceVariant, fontSize: 13, lineHeight: 20 },
  muted: { color: COLORS.onSurfaceVariant, fontSize: 13, lineHeight: 18 },
  smallMuted: { color: COLORS.onSurfaceVariant, fontSize: 11, lineHeight: 16 },
  progressHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  progressValue: { fontSize: 15, fontWeight: '800', color: COLORS.onSurface },
  progressBar: { height: 8, borderRadius: 4, backgroundColor: COLORS.surfaceVariant },
  chipList: { gap: 8 },
  personChip: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: radius.md, backgroundColor: COLORS.surfaceVariant },
  personChipMine: { borderWidth: 1, borderColor: COLORS.primary, backgroundColor: COLORS.primaryContainer },
  personName: { color: COLORS.onSurface, fontSize: 13, fontWeight: '700' },
  infoLine: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 7, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.outlineVariant },
  infoTitle: { color: COLORS.onSurface, fontSize: 13, fontWeight: '700' },
  trailing: { color: COLORS.primary, fontSize: 11, fontWeight: '800' },
  sectionHeaderOutside: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, paddingHorizontal: 4 },
  sectionOutsideTitle: { color: COLORS.onSurface, fontSize: 18, fontWeight: '900' },
  dishCard: { borderRadius: 24, borderWidth: 1, borderColor: COLORS.outlineVariant, backgroundColor: COLORS.surface, overflow: 'hidden', ...elevation.card },
  dishHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: spacing.lg },
  dishTitle: { color: COLORS.onSurface, fontSize: 16, fontWeight: '900' },
  dishPercent: { color: COLORS.success, fontSize: 20, fontWeight: '900' },
  recipeToggle: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  recipeToggleText: { color: COLORS.primary, fontSize: 12, fontWeight: '800' },
  recipeBox: { marginHorizontal: spacing.lg, marginBottom: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: COLORS.surfaceVariant, gap: 8 },
  fieldLabel: { marginTop: 3, color: COLORS.primary, fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  bullet: { color: COLORS.onSurfaceVariant, fontSize: 12, lineHeight: 18 },
  stepCard: { flexDirection: 'row', gap: 10, padding: spacing.md, borderTopWidth: 1, borderTopColor: COLORS.outlineVariant, backgroundColor: COLORS.surface },
  stepDone: { backgroundColor: COLORS.successContainer },
  stepFailed: { backgroundColor: COLORS.errorContainer },
  stepIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surfaceVariant },
  stepIconDone: { backgroundColor: COLORS.success },
  stepIconFailed: { backgroundColor: COLORS.error },
  stepTitle: { color: COLORS.onSurface, fontSize: 13, fontWeight: '800' },
  stepProof: { width: '100%', height: 110, borderRadius: radius.md, marginTop: 8 },
  stepActions: { alignItems: 'flex-start', gap: 2, marginTop: 8 },
  stepPendingText: { color: COLORS.warning, fontSize: 11, fontWeight: '700', lineHeight: 16, marginTop: 4 },
  stepApprovedText: { color: COLORS.success, fontSize: 11, fontWeight: '700', lineHeight: 16, marginTop: 4 },
  stepRejectedText: { color: COLORS.error, fontSize: 11, fontWeight: '700', lineHeight: 16, marginTop: 4 },
  distributionCard: { padding: spacing.lg, borderRadius: 24, borderWidth: 1, borderColor: COLORS.outlineVariant, backgroundColor: COLORS.surface, ...elevation.card },
  pickupCard: { borderRadius: 24, borderWidth: 1, borderColor: COLORS.outlineVariant, backgroundColor: COLORS.surface, overflow: 'hidden', ...elevation.card },
  pickupBody: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: 6 },
  pickupProof: { width: '100%', height: 130, borderRadius: radius.md, marginTop: 8 },
  distributionProof: { width: '100%', height: 130, borderRadius: radius.md, marginTop: 8 },
  pointRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.outlineVariant },
  pointIndex: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.primaryContainer },
  pointIndexText: { color: COLORS.primary, fontSize: 11, fontWeight: '900' },
  pointTitle: { color: COLORS.onSurface, fontSize: 13, fontWeight: '800' },
  completedBox: { marginTop: 10, padding: 10, borderRadius: radius.md, backgroundColor: COLORS.successContainer },
  completedText: { color: COLORS.success, fontSize: 12, fontWeight: '700', lineHeight: 17 },
  retakeBtn: { alignSelf: 'flex-start', marginTop: 6 },
  distributionActions: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  // ── Bottom sheet chốt đợt phát / xác nhận lấy nguyên liệu ──
  sheetBtn: { minWidth: 96 },
  sheetSubmitBtn: { flex: 1 },
  sheetBlock: { gap: 8 },
  sheetLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sheetLabel: { color: COLORS.onSurface, fontSize: 13, fontWeight: '900' },
  sheetError: { color: COLORS.error, fontSize: 12, fontWeight: '700' },
  sheetHintRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sheetHint: { flex: 1, color: COLORS.onSurfaceVariant, fontSize: 12, lineHeight: 17 },
  sheetHintStrong: { color: COLORS.onSurface, fontWeight: '800' },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepperBtn: { margin: 0, borderRadius: radius.md, borderColor: COLORS.outline },
  stepperInput: { flex: 1, backgroundColor: COLORS.surface },
  stepperInputText: { textAlign: 'center', fontSize: 20, fontWeight: '900' },
  leftoverBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    padding: 10,
    borderRadius: radius.md,
    backgroundColor: COLORS.warningContainer,
  },
  leftoverText: { flex: 1, color: COLORS.onWarningContainer, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  countPill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: COLORS.surfaceVariant },
  countPillDone: { backgroundColor: COLORS.successContainer },
  countPillText: { color: COLORS.onSurfaceVariant, fontSize: 11, fontWeight: '800' },
  countPillTextDone: { color: COLORS.onSuccessContainer },
  proofSlot: {
    gap: 10,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    backgroundColor: COLORS.surface,
  },
  proofSlotDone: { borderColor: '#bbe5c6', backgroundColor: '#f4fbf6' },
  proofSlotHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  proofSlotIndex: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primaryContainer,
  },
  proofSlotIndexDone: { backgroundColor: COLORS.success },
  proofSlotIndexText: { color: COLORS.primary, fontSize: 11, fontWeight: '900' },
  proofSlotTitle: { color: COLORS.onSurface, fontSize: 13, lineHeight: 18, fontWeight: '800' },
  proofThumbRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingLeft: 34 },
  proofThumbWrap: { width: 72, height: 72 },
  proofThumb: { width: 72, height: 72, borderRadius: radius.md },
  proofThumbRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(18, 28, 42, 0.7)',
  },
  proofAddTile: {
    width: 72,
    height: 72,
    gap: 2,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primaryContainer,
  },
  proofAddTilePressed: { opacity: 0.7 },
  proofAddText: { color: COLORS.primary, fontSize: 10, fontWeight: '800' },
  ingredientsWarn: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#FDE68A',
    backgroundColor: '#FFFBEB',
  },
  ingredientsWarnTitle: { fontSize: 14, fontWeight: '700', color: '#78350F' },
  ingredientsWarnText: { marginTop: 2, fontSize: 12, lineHeight: 17, color: '#92400E' },
  distributionPhotoEmpty: {
    alignItems: 'center',
    gap: 10,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: COLORS.primaryContainer,
    backgroundColor: COLORS.surfaceVariant,
  },
  distributionPhotoReview: {
    gap: 10,
    padding: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    backgroundColor: COLORS.surfaceVariant,
  },
  distributionPhotoPreview: { width: '100%', height: 170, borderRadius: radius.md },
  pickupSummary: {
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: COLORS.primaryContainer,
    gap: 5,
  },
  pickupSummaryRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  pickupSummaryTitle: { flex: 1, color: COLORS.onSurface, fontSize: 14, lineHeight: 19, fontWeight: '900' },
  pickupSummaryText: { color: COLORS.onSurface, fontSize: 13, lineHeight: 18, fontWeight: '700' },
  pickupSummaryTime: { color: COLORS.primary, fontSize: 12, lineHeight: 17, fontWeight: '800' },
  pickupFieldGroup: { gap: 10 },
  pickupInput: { backgroundColor: COLORS.surface },
  pickupPhotoEmpty: {
    alignItems: 'center',
    gap: 10,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: COLORS.primaryContainer,
    backgroundColor: COLORS.surfaceVariant,
  },
  pickupPhotoEmptyIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
  },
  pickupPhotoEmptyTitle: { color: COLORS.onSurface, fontSize: 15, fontWeight: '900' },
  pickupPhotoEmptyText: { color: COLORS.onSurfaceVariant, fontSize: 12, lineHeight: 17, textAlign: 'center' },
  pickupPhotoReview: {
    gap: 10,
    padding: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    backgroundColor: COLORS.surfaceVariant,
  },
  pickupPhotoHead: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 4, paddingTop: 2 },
  pickupPhotoTitle: { flex: 1, color: COLORS.onSurface, fontSize: 13, fontWeight: '800' },
  pickupPhotoPreview: { width: '100%', height: 190, borderRadius: radius.md },
});
