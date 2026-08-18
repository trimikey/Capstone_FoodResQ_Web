import { useState } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Dialog, Portal, ProgressBar, Text, TextInput } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, type Href, useLocalSearchParams } from 'expo-router';
import {
  type AssignedDistribution,
  type DishProcessItem,
  type DishStep,
  useAdvanceTask,
  useCampaignSupplies,
  useCompleteAssignedDistribution,
  useCompleteDishStep,
  useFlagDishStepQcFail,
  useMyTaskDetail,
} from '@/hooks/useCampaigns';
import { VolunteerKitchenOpsPanel } from '@/components/kitchen/VolunteerKitchenOpsPanel';
import { ScreenState } from '@/components/ui/ScreenState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { AppImage } from '@/components/ui/AppImage';
import { Popup } from '@/components/ui/AppPopup';
import { BackButton } from '@/components/ui/BackButton';
import { NotificationBell } from '@/components/NotificationBell';
import { getErrorMessage } from '@/hooks/useErrorHandler';
import { captureImage } from '@/services/faceCapture';
import { getCurrentCoords } from '@/services/geolocation';
import { notifyError, notifySuccess } from '@/services/haptics';
import { formatDate, formatTime } from '@/utils/campaign';
import { mobileColors as COLORS, elevation, radius, spacing } from '@/theme/design';

const STEP_LABELS: Record<number, string> = {
  1: 'Kiểm tra nguyên liệu',
  2: 'Sơ chế & nấu',
  3: 'Kiểm tra chất lượng',
  4: 'Sẵn sàng phát',
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
  const taskQuery = useMyTaskDetail(assignmentId);
  const advance = useAdvanceTask();

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

  if (taskQuery.isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <TaskHeader title="Nhiệm vụ" />
        <ScreenState kind="loading" title="Đang tải nhiệm vụ" />
      </SafeAreaView>
    );
  }

  if (taskQuery.isError || !taskQuery.data) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <TaskHeader title="Nhiệm vụ" />
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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TaskHeader title={detail.assignment.role === 'chef' ? 'Ca bếp của tôi' : 'Ca phục vụ của tôi'} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={taskQuery.isRefetching} onRefresh={() => taskQuery.refetch()} />
        }
      >
        <View style={styles.hero}>
          <Text style={styles.heroKicker}>
            {detail.assignment.role === 'chef' ? 'Đầu bếp' : 'Phục vụ'}
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
              {formatDate(detail.campaign.scheduledDate)} · {formatTime(detail.campaign.startTime)}–{formatTime(detail.campaign.endTime)}
            </Text>
          </View>
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
        ) : detail.assignment.role === 'waiter' ? (
          <WaiterTask detail={detail} checkedIn={checkedIn} onRefresh={() => taskQuery.refetch()} />
        ) : (
          <ScreenState kind="empty" title="Nhiệm vụ này thuộc luồng giao hàng" />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function TaskHeader({ title }: { title: string }) {
  return (
    <View style={styles.header}>
      <BackButton onPress={() => router.back()} />
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
  const flagFail = useFlagDishStepQcFail();
  const [expandedRecipe, setExpandedRecipe] = useState<string | null>(null);
  const [qcTarget, setQcTarget] = useState<{ dish: DishProcessItem; step: DishStep } | null>(null);
  const [qcReason, setQcReason] = useState('');

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

  const submitQcFail = async () => {
    if (!qcTarget || !qcReason.trim()) return;
    try {
      await flagFail.mutateAsync({
        campaignId: detail.campaign.id,
        stepId: qcTarget.step.id,
        reason: qcReason.trim(),
      });
      void notifySuccess();
      Popup.show({ type: 'success', text1: 'Đã báo QC không đạt', text2: 'Tổ chức đã nhận cảnh báo.' });
      setQcTarget(null);
      setQcReason('');
      await onRefresh();
    } catch (error) {
      void notifyError();
      Popup.show({ type: 'error', text1: 'Không gửi được cảnh báo', text2: getErrorMessage(error) });
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
      {dishes.length === 0 ? (
        <View style={styles.card}><Text style={styles.muted}>Bếp trưởng chưa thêm món cho chiến dịch.</Text></View>
      ) : dishes.map((dish) => {
        const done = dish.steps.filter((step) => step.effectiveStatus === 'done').length;
        const recipeOpen = expandedRecipe === dish.id;
        return (
          <View key={dish.id} style={styles.dishCard}>
            <View style={styles.dishHead}>
              <View style={styles.flex}>
                <Text style={styles.dishTitle}>{dish.name}</Text>
                <Text style={styles.muted}>{dish.plannedServings ? `${dish.plannedServings} suất · ` : ''}{done}/{dish.steps.length} khâu</Text>
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
                canAct={checkedIn && detail.assignment.status !== 'completed'}
                pending={completeStep.isPending || flagFail.isPending}
                onComplete={() => handleComplete(step)}
                onQcFail={step.stepOrder === 3 ? () => setQcTarget({ dish, step }) : undefined}
              />
            ))}
          </View>
        );
      })}

      <VolunteerKitchenOpsPanel campaignId={detail.campaign.id} isChef isWaiter={false} />

      <Portal>
        <Dialog visible={!!qcTarget} onDismiss={() => !flagFail.isPending && setQcTarget(null)}>
          <Dialog.Title>Ngắt khẩn cấp — QC</Dialog.Title>
          <Dialog.Content>
            <Text style={styles.body}>Món: {qcTarget?.dish.name}. Tổ chức sẽ nhận cảnh báo ngay.</Text>
            <TextInput
              mode="outlined"
              label="Lý do không đạt *"
              value={qcReason}
              onChangeText={setQcReason}
              multiline
              numberOfLines={3}
              style={styles.dialogInput}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setQcTarget(null)} disabled={flagFail.isPending}>Huỷ</Button>
            <Button textColor={COLORS.error} loading={flagFail.isPending} disabled={!qcReason.trim() || flagFail.isPending} onPress={submitQcFail}>Báo không đạt</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
}

function DishStepRow({ step, previousDone, canAct, pending, onComplete, onQcFail }: {
  step: DishStep;
  previousDone: boolean;
  canAct: boolean;
  pending: boolean;
  onComplete: () => void;
  onQcFail?: () => void;
}) {
  const done = step.effectiveStatus === 'done';
  const available = step.effectiveStatus === 'available';
  const qcFailed = !!step.qcFailedAt;
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
          {done ? `Hoàn thành ${formatDateTime(step.completedAt)}` : qcFailed ? step.qcFailureReason : !previousDone ? 'Chờ khâu trước hoàn thành' : `Dự kiến ${step.scheduledTime}`}
        </Text>
        {step.completedByVolunteer?.user.fullName ? <Text style={styles.smallMuted}>bởi {step.completedByVolunteer.user.fullName}</Text> : null}
        {step.proofUrl ? <AppImage source={{ uri: step.proofUrl }} style={styles.stepProof} /> : null}
        {available && canAct && !qcFailed ? (
          <View style={styles.stepActions}>
            <Button mode="contained" compact icon="camera" loading={pending} disabled={pending} onPress={onComplete}>
              {step.stepOrder === 3 ? 'Kiểm tra & xác nhận' : 'Chụp ảnh & xác nhận'}
            </Button>
            {onQcFail ? <Button compact textColor={COLORS.error} disabled={pending} onPress={onQcFail}>QC không đạt</Button> : null}
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
  const [closing, setClosing] = useState<AssignedDistribution | null>(null);
  const [actualServings, setActualServings] = useState('');
  const [note, setNote] = useState('');

  const dishes = detail.dishes ?? [];
  const distributions = detail.distributions ?? [];
  const readyDishes = dishes.filter((dish) =>
    dish.steps.some((step) => step.stepOrder === 4 && step.effectiveStatus === 'done')
  );

  const openClose = (distribution: AssignedDistribution) => {
    setClosing(distribution);
    setActualServings(String(distribution.servingsServed));
    setNote('');
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
    try {
      // QUY TẮC: 1 suất = 1 người — BE tự ghi số người = số suất, không gửi riêng.
      await complete.mutateAsync({
        distributionId: closing.id,
        campaignId: detail.campaign.id,
        actualServings: servings,
        note: note.trim() || undefined,
      });
      void notifySuccess();
      Popup.show({ type: 'success', text1: `Đã chốt ${servings}/${closing.servingsServed} suất` });
      setClosing(null);
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
            </View>
          ) : (
            <View style={styles.distributionActions}>
              <Button
                mode="outlined"
                icon="qrcode-scan"
                disabled={!checkedIn}
                onPress={() => router.push(
                  `/(app)/volunteer/scan-handoff?campaignId=${encodeURIComponent(detail.campaign.id)}&distributionId=${encodeURIComponent(distribution.id)}&roundLabel=${encodeURIComponent(distribution.roundLabel ?? 'Đợt phân phát')}` as Href
                )}
              >
                Quét người nhận
              </Button>
              <Button mode="contained" icon="check" disabled={!checkedIn} onPress={() => openClose(distribution)}>
                Phát xong
              </Button>
            </View>
          )}
        </View>
      ))}

      <Portal>
        <Dialog visible={!!closing} onDismiss={() => !complete.isPending && setClosing(null)}>
          <Dialog.Title>Chốt đợt phát</Dialog.Title>
          <Dialog.Content style={styles.dialogBody}>
            <Text style={styles.muted}>Kế hoạch: {closing?.servingsServed ?? 0} suất</Text>
            <TextInput mode="outlined" label="Số suất thực phát *" value={actualServings} onChangeText={setActualServings} keyboardType="number-pad" />
            {/* 1 suất = 1 người — số người nhận tự ghi bằng số suất, không nhập tay */}
            <Text style={styles.muted}>Mỗi suất phát cho đúng 1 người — hệ thống tự ghi số người nhận bằng số suất.</Text>
            <TextInput mode="outlined" label="Ghi chú" value={note} onChangeText={setNote} multiline numberOfLines={3} />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setClosing(null)} disabled={complete.isPending}>Huỷ</Button>
            <Button mode="contained" loading={complete.isPending} disabled={complete.isPending} onPress={submitClose}>Xác nhận</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
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
  distributionCard: { padding: spacing.lg, borderRadius: 24, borderWidth: 1, borderColor: COLORS.outlineVariant, backgroundColor: COLORS.surface, ...elevation.card },
  pointRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.outlineVariant },
  pointIndex: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.primaryContainer },
  pointIndexText: { color: COLORS.primary, fontSize: 11, fontWeight: '900' },
  pointTitle: { color: COLORS.onSurface, fontSize: 13, fontWeight: '800' },
  completedBox: { marginTop: 10, padding: 10, borderRadius: radius.md, backgroundColor: COLORS.successContainer },
  completedText: { color: COLORS.success, fontSize: 12, fontWeight: '700', lineHeight: 17 },
  distributionActions: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  dialogBody: { gap: 12 },
  dialogInput: { marginTop: 12 },
});
