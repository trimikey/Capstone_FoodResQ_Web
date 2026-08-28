import { useCallback, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Button, SegmentedButtons } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import {
  useCampaigns,
  useMyTasks,
  useAdvanceTask,
  useConfirmCampaignAssignment,
  type Campaign,
  type CampaignTask,
} from '@/hooks/useCampaigns';
import { CampaignCard } from '@/components/CampaignCard';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Popup } from '@/components/ui/AppPopup';
import { DeferredRedirect } from '@/components/navigation/DeferredRedirect';
import { getErrorMessage } from '@/hooks/useErrorHandler';
import { captureImage } from '@/services/faceCapture';
import { getCurrentCoords } from '@/services/geolocation';
import { notifyError, notifySuccess } from '@/services/haptics';
import { ScreenState } from '@/components/ui/ScreenState';
import { mobileColors as COLORS, elevation, radius, spacing } from '@/theme/design';
import {
  ASSIGNMENT_STEPS,
  ASSIGNMENT_STEP_ORDER,
  ASSIGNMENT_ROLE_LABEL,
  assignmentStatusMeta,
  nextAssignmentStatus,
  assignmentStepRequiresPhoto,
  advanceTaskLabel,
  formatDate,
  formatTime,
} from '@/utils/campaign';

type Segment = 'open' | 'tasks';

/**
 * Chiến dịch (tab volunteer) — 2 chế độ:
 * - "Đang mở": danh sách chiến dịch bếp ăn đang tuyển → bấm để xem chi tiết & đăng ký vai trò.
 * - "Việc của tôi": các công việc đã đăng ký, chuyển bước assigned → checked_in → in_progress
 *   → completed (kèm ảnh minh chứng ở bước làm việc/hoàn thành).
 */
export default function VolunteerCampaignsScreen() {
  const params = useLocalSearchParams<{ segment?: Segment }>();
  const { user } = useAuth();
  const initialSegment: Segment = params.segment === 'tasks' ? 'tasks' : 'open';
  const [segment, setSegment] = useState<Segment>(initialSegment);

  const openQuery = useCampaigns();
  const tasksQuery = useMyTasks(user?.role === 'volunteer');
  const advanceMut = useAdvanceTask();
  const confirmMut = useConfirmCampaignAssignment();

  useFocusEffect(
    useCallback(() => {
      const nextSegment: Segment = params.segment === 'tasks' ? 'tasks' : 'open';
      setSegment((current) => (current === nextSegment ? current : nextSegment));
    }, [params.segment])
  );

  // Chỉ volunteer dùng tab này; role khác lỡ vào → về trang chủ.
  if (user && user.role !== 'volunteer') {
    return <DeferredRedirect href="/(app)/home" />;
  }

  const handleAdvance = async (task: CampaignTask) => {
    const next = nextAssignmentStatus(task.status);
    if (!next) return;

    let lng: number | undefined;
    let lat: number | undefined;
    if (next === 'checked_in') {
      const { coords } = await getCurrentCoords();
      if (!coords) {
        Popup.show({
          type: 'warning',
          text1: 'Cần vị trí để điểm danh',
          text2: 'Hãy bật quyền vị trí và đứng gần bếp trước khi thử lại.',
        });
        return;
      }
      lng = coords.lng;
      lat = coords.lat;
    }

    let photo;
    if (assignmentStepRequiresPhoto(next)) {
      try {
        photo = (await captureImage('id_card', 'proof')) ?? undefined;
      } catch (e: any) {
        Popup.show({ type: 'error', text1: 'Không mở được camera', text2: e?.message ?? 'Cần quyền camera.' });
        return;
      }
      if (!photo) {
        Popup.show({ type: 'info', text1: 'Cần ảnh minh chứng', text2: 'Hãy chụp ảnh để xác nhận bước này.' });
        return;
      }
    }
    try {
      const res = await advanceMut.mutateAsync({
        assignmentId: task.id,
        campaignId: task.campaign.id,
        lng,
        lat,
        photo,
      });
      void notifySuccess();
      Popup.show({
        type: 'success',
        text1: next === 'completed' ? 'Đã hoàn thành công việc' : next === 'checked_in' ? 'Đã điểm danh tại bếp' : 'Đã cập nhật',
        text2: res?.pointsAwarded ? `+${res.pointsAwarded} điểm cống hiến!` : undefined,
      });
    } catch (err) {
      void notifyError();
      Popup.show({ type: 'error', text1: 'Cập nhật thất bại', text2: getErrorMessage(err) });
    }
  };

  const openCampaignDetail = (campaignId: string, returnSegment: Segment) => {
    router.push({
      pathname: '/volunteer/campaigns/[id]',
      params: {
        id: campaignId,
        returnTo: '/volunteer/campaigns',
        returnSegment,
      },
    });
  };

  const openTaskDetail = (assignmentId: string) => {
    router.push({
      pathname: '/volunteer/tasks/[assignmentId]',
      params: { assignmentId },
    });
  };

  const renderOpenEmpty = () => {
    if (openQuery.isLoading) {
      return <ScreenState kind="loading" title="Đang tải chiến dịch" />;
    }
    if (openQuery.isError) {
      return (
        <ScreenState kind="error" title="Không tải được chiến dịch" onAction={() => openQuery.refetch()} />
      );
    }
    return (
      <ScreenState
        kind="empty"
        icon="charity"
        title="Chưa có chiến dịch nào"
        message="Hiện chưa có bếp ăn cộng đồng đang tuyển. Quay lại sau để đăng ký."
      />
    );
  };

  const renderTasksEmpty = () => {
    if (tasksQuery.isLoading) {
      return <ScreenState kind="loading" title="Đang tải công việc" />;
    }
    if (tasksQuery.isError) {
      return (
        <ScreenState kind="error" title="Không tải được công việc" onAction={() => tasksQuery.refetch()} />
      );
    }
    return (
      <ScreenState
        kind="empty"
        icon="clipboard-check-outline"
        title="Chưa đăng ký việc nào"
        message="Sang tab Đang mở để chọn một chiến dịch và đăng ký vai trò phù hợp."
      />
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title="Chiến dịch bếp ăn" />
      <View style={styles.hero}>
        <Text style={styles.heroKicker}>Volunteer kitchen</Text>
        <Text style={styles.heroTitle}>Chọn ca bếp ăn và theo dõi việc của bạn</Text>
      </View>
      <View style={styles.segmentWrap}>
        <SegmentedButtons
          value={segment}
          onValueChange={(v) => setSegment(v as Segment)}
          buttons={[
            { value: 'open', label: 'Đang mở', icon: 'charity' },
            { value: 'tasks', label: 'Việc của tôi', icon: 'clipboard-check-outline' },
          ]}
          theme={{ colors: { secondaryContainer: COLORS.purpleContainer, onSecondaryContainer: COLORS.purple } }}
        />
      </View>

      {segment === 'open' ? (
        <FlashList
          data={openQuery.data ?? []}
          keyExtractor={(item: Campaign) => item.id}
          renderItem={({ item }: { item: Campaign }) => (
            <CampaignCard campaign={item} onPress={() => openCampaignDetail(item.id, 'open')} />
          )}
          contentContainerStyle={styles.list}
          ListEmptyComponent={renderOpenEmpty}
          refreshing={openQuery.isRefetching}
          onRefresh={() => openQuery.refetch()}
        />
      ) : (
        <FlashList
          data={tasksQuery.data ?? []}
          keyExtractor={(item: CampaignTask) => item.id}
          renderItem={({ item }: { item: CampaignTask }) => (
            <TaskCard
              task={item}
              advancing={advanceMut.isPending}
              confirming={confirmMut.isPending}
              onAdvance={() => handleAdvance(item)}
              onConfirm={(decision) => confirmMut.mutate(
                { assignmentId: item.id, decision },
                {
                  onSuccess: () => Popup.show({
                    type: 'success',
                    text1: decision === 'confirmed' ? 'Đã xác nhận tham gia' : 'Đã từ chối ca',
                  }),
                  onError: (error) => Popup.show({ type: 'error', text1: 'Không cập nhật được', text2: getErrorMessage(error) }),
                },
              )}
              onOpen={() => openTaskDetail(item.id)}
            />
          )}
          contentContainerStyle={styles.list}
          ListEmptyComponent={renderTasksEmpty}
          refreshing={tasksQuery.isRefetching}
          onRefresh={() => tasksQuery.refetch()}
        />
      )}
    </SafeAreaView>
  );
}

/** Thẻ công việc TNV: chiến dịch + vai trò + timeline 4 bước + nút chuyển bước. */
function TaskCard({
  task,
  advancing,
  confirming,
  onAdvance,
  onConfirm,
  onOpen,
}: {
  task: CampaignTask;
  advancing: boolean;
  confirming: boolean;
  onAdvance: () => void;
  onConfirm: (decision: 'confirmed' | 'declined') => void;
  onOpen: () => void;
}) {
  const sm = assignmentStatusMeta(task.status);
  const currentIndex = ASSIGNMENT_STEP_ORDER.indexOf(task.status);
  const canAdvance = nextAssignmentStatus(task.status) != null;
  const hasRoleSpecificTask = task.role === 'chef' || task.role === 'waiter' || task.role === 'shipper';
  const needsConfirmation = task.status === 'assigned' && task.confirmationStatus === 'pending';

  return (
    <View style={styles.taskCard}>
      <View style={styles.taskHeader}>
        <Text style={styles.taskTitle} numberOfLines={2} onPress={onOpen}>
          {task.campaign.title}
        </Text>
        <StatusBadge label={sm.label} tone={task.status === 'completed' ? 'success' : 'info'} />
      </View>

      <View style={styles.metaRow}>
        <MaterialCommunityIcons name="account-hard-hat-outline" size={15} color={COLORS.onSurfaceVariant} />
        <Text style={styles.metaText}>Vai trò: {ASSIGNMENT_ROLE_LABEL[task.role] ?? task.role}</Text>
      </View>
      <View style={styles.metaRow}>
        <MaterialCommunityIcons name="calendar-clock" size={15} color={COLORS.onSurfaceVariant} />
        <Text style={styles.metaText}>
          {formatDate(task.campaign.scheduledDate)} - {formatTime(task.campaign.startTime)}-
          {formatTime(task.campaign.endTime)}
        </Text>
      </View>
      <View style={styles.metaRow}>
        <MaterialCommunityIcons name="map-marker-outline" size={15} color={COLORS.onSurfaceVariant} />
        <Text style={styles.metaText} numberOfLines={1}>{task.campaign.kitchenAddress}</Text>
      </View>

      {/* Timeline 4 bước */}
      <View style={styles.timeline}>
        {ASSIGNMENT_STEPS.map((step, i) => {
          const stepIndex = ASSIGNMENT_STEP_ORDER.indexOf(step.key);
          const done = currentIndex >= stepIndex;
          const active = currentIndex === stepIndex;
          return (
            <View key={step.key} style={styles.stepRow}>
              <View style={styles.stepIconCol}>
                <MaterialCommunityIcons
                  name={done ? 'check-circle' : 'circle-outline'}
                  size={18}
                  color={done ? COLORS.teal : COLORS.onMuted}
                />
                {i < ASSIGNMENT_STEPS.length - 1 ? (
                  <View style={[styles.connector, done && styles.connectorDone]} />
                ) : null}
              </View>
              <Text style={[styles.stepLabel, active && styles.stepLabelActive, !done && styles.stepLabelTodo]}>
                {step.label}
              </Text>
            </View>
          );
        })}
      </View>

      {needsConfirmation ? (
        <View style={styles.confirmActions}>
          <Button mode="outlined" disabled={confirming} onPress={() => onConfirm('declined')} style={{ flex: 1 }}>
            Từ chối
          </Button>
          <Button mode="contained" loading={confirming} disabled={confirming} onPress={() => onConfirm('confirmed')} style={{ flex: 1 }}>
            Xác nhận ca
          </Button>
        </View>
      ) : hasRoleSpecificTask ? (
        <Button
          mode="contained"
          icon={task.role === 'chef' ? 'chef-hat' : 'silverware-fork-knife'}
          buttonColor={COLORS.primary}
          onPress={onOpen}
          style={styles.taskBtn}
          contentStyle={{ height: 44 }}
        >
          Vào nhiệm vụ
        </Button>
      ) : canAdvance ? (
        <Button
          mode="contained"
          icon={assignmentStepRequiresPhotoIcon(task.status)}
          buttonColor={COLORS.primary}
          loading={advancing}
          disabled={advancing}
          onPress={onAdvance}
          style={styles.taskBtn}
          contentStyle={{ height: 44 }}
        >
          {advanceTaskLabel(task.status)}
        </Button>
      ) : (
        <Text style={styles.doneNote}>Bạn đã hoàn thành công việc này. Cảm ơn bạn!</Text>
      )}
    </View>
  );
}

/** Icon nút: camera khi bước kế cần ảnh, ngược lại mũi tên. */
function assignmentStepRequiresPhotoIcon(status: string): string {
  const next = nextAssignmentStatus(status);
  return next && assignmentStepRequiresPhoto(next) ? 'camera' : 'arrow-right-circle';
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  hero: {
    marginHorizontal: spacing.xl,
    marginTop: spacing.sm,
    borderRadius: 32,
    padding: spacing.xl,
    backgroundColor: COLORS.heroCampaign,
    ...elevation.card,
  },
  heroKicker: { color: COLORS.purpleContainer, fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  heroTitle: { marginTop: 5, color: COLORS.onPrimary, fontSize: 24, lineHeight: 30, fontWeight: '900' },
  segmentWrap: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.sm },
  list: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.section },
  center: { alignItems: 'center', justifyContent: 'center', paddingTop: 64, paddingHorizontal: 32 },
  emptyIcon: {
    width: 96, height: 96, borderRadius: 48, backgroundColor: COLORS.purpleContainer,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.onSurface, marginTop: 12, marginBottom: 8, textAlign: 'center' },
  emptyBody: { fontSize: 14, color: COLORS.onSurfaceVariant, textAlign: 'center', lineHeight: 21 },
  retryBtn: { marginTop: 16, borderRadius: 12 },
  // Task card
  taskCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 28,
    padding: spacing.xl,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    ...elevation.card,
  },
  taskHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, marginBottom: spacing.md },
  taskTitle: { flex: 1, fontSize: 19, fontWeight: '900', color: COLORS.onSurface, lineHeight: 24 },
  confirmActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 5 },
  metaText: { flex: 1, fontSize: 13, fontWeight: '600', color: COLORS.onSurfaceVariant },
  timeline: { marginTop: spacing.md, marginBottom: spacing.sm, borderRadius: radius.xl, padding: spacing.md, backgroundColor: COLORS.indigoContainer },
  stepRow: { flexDirection: 'row', gap: spacing.sm },
  stepIconCol: { alignItems: 'center', width: 18 },
  connector: { width: 2, flex: 1, minHeight: 12, marginVertical: 2, backgroundColor: COLORS.outlineVariant },
  connectorDone: { backgroundColor: COLORS.teal },
  stepLabel: { fontSize: 13, fontWeight: '600', color: COLORS.onSurface, paddingBottom: 10 },
  stepLabelActive: { fontWeight: '900', color: COLORS.indigo },
  stepLabelTodo: { color: COLORS.onSurfaceVariant },
  taskBtn: { borderRadius: radius.lg, marginTop: 6 },
  kitchenBtn: { borderRadius: radius.lg, marginTop: 8, borderColor: COLORS.purple },
  doneNote: { fontSize: 13, color: COLORS.teal, textAlign: 'center', marginTop: 8, fontWeight: '600' },
});
