import { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, ActivityIndicator, Button, SegmentedButtons } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { router, Redirect } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import {
  useCampaigns,
  useMyTasks,
  useAdvanceTask,
  type Campaign,
  type CampaignTask,
} from '@/hooks/useCampaigns';
import { CampaignCard } from '@/components/CampaignCard';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Popup } from '@/components/ui/AppPopup';
import { getErrorMessage } from '@/hooks/useErrorHandler';
import { captureImage } from '@/services/faceCapture';
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

const COLORS = {
  primary: '#10b981',
  background: '#f8f9ff',
  surface: '#ffffff',
  onSurface: '#121c2a',
  onSurfaceVariant: '#6b7280',
  outline: '#e5e7eb',
  muted: '#d1d5db',
};

type Segment = 'open' | 'tasks';

/**
 * Chiến dịch (tab volunteer) — 2 chế độ:
 * - "Đang mở": danh sách chiến dịch bếp ăn đang tuyển → bấm để xem chi tiết & đăng ký vai trò.
 * - "Việc của tôi": các công việc đã đăng ký, chuyển bước assigned → checked_in → in_progress
 *   → completed (kèm ảnh minh chứng ở bước làm việc/hoàn thành).
 */
export default function VolunteerCampaignsScreen() {
  const { user } = useAuth();
  const [segment, setSegment] = useState<Segment>('open');

  const openQuery = useCampaigns();
  const tasksQuery = useMyTasks(user?.role === 'volunteer');
  const advanceMut = useAdvanceTask();

  // Chỉ volunteer dùng tab này; role khác lỡ vào → về trang chủ.
  if (user && user.role !== 'volunteer') {
    return <Redirect href="/(app)/home" />;
  }

  const handleAdvance = async (task: CampaignTask) => {
    const next = nextAssignmentStatus(task.status);
    if (!next) return;
    let photo;
    if (assignmentStepRequiresPhoto(next)) {
      try {
        photo = (await captureImage('id_card')) ?? undefined;
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
      const res = await advanceMut.mutateAsync({ assignmentId: task.id, photo });
      Popup.show({
        type: 'success',
        text1: next === 'completed' ? 'Đã hoàn thành công việc 🎉' : 'Đã cập nhật',
        text2: res?.pointsAwarded ? `+${res.pointsAwarded} điểm cống hiến!` : undefined,
      });
    } catch (err) {
      Popup.show({ type: 'error', text1: 'Cập nhật thất bại', text2: getErrorMessage(err) });
    }
  };

  const renderOpenEmpty = () => {
    if (openQuery.isLoading) {
      return (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      );
    }
    if (openQuery.isError) {
      return (
        <View style={styles.center}>
          <MaterialCommunityIcons name="alert-circle-outline" size={48} color="#ef4444" />
          <Text style={styles.emptyTitle}>Không tải được chiến dịch</Text>
          <Button mode="contained" buttonColor={COLORS.primary} onPress={() => openQuery.refetch()} style={styles.retryBtn}>
            Thử lại
          </Button>
        </View>
      );
    }
    return (
      <View style={styles.center}>
        <View style={styles.emptyIcon}>
          <MaterialCommunityIcons name="charity" size={48} color={COLORS.primary} />
        </View>
        <Text style={styles.emptyTitle}>Chưa có chiến dịch nào</Text>
        <Text style={styles.emptyBody}>
          Hiện chưa có bếp ăn cộng đồng nào đang tuyển. Quay lại sau để chung tay nhé.
        </Text>
      </View>
    );
  };

  const renderTasksEmpty = () => {
    if (tasksQuery.isLoading) {
      return (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      );
    }
    if (tasksQuery.isError) {
      return (
        <View style={styles.center}>
          <MaterialCommunityIcons name="alert-circle-outline" size={48} color="#ef4444" />
          <Text style={styles.emptyTitle}>Không tải được công việc</Text>
          <Button mode="contained" buttonColor={COLORS.primary} onPress={() => tasksQuery.refetch()} style={styles.retryBtn}>
            Thử lại
          </Button>
        </View>
      );
    }
    return (
      <View style={styles.center}>
        <View style={styles.emptyIcon}>
          <MaterialCommunityIcons name="clipboard-check-outline" size={48} color={COLORS.primary} />
        </View>
        <Text style={styles.emptyTitle}>Chưa đăng ký việc nào</Text>
        <Text style={styles.emptyBody}>
          Sang tab "Đang mở" để chọn một chiến dịch và đăng ký vai trò phù hợp.
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title="Chiến dịch bếp ăn" />
      <View style={styles.segmentWrap}>
        <SegmentedButtons
          value={segment}
          onValueChange={(v) => setSegment(v as Segment)}
          buttons={[
            { value: 'open', label: 'Đang mở', icon: 'charity' },
            { value: 'tasks', label: 'Việc của tôi', icon: 'clipboard-check-outline' },
          ]}
          theme={{ colors: { secondaryContainer: '#ecfdf5', onSecondaryContainer: COLORS.primary } }}
        />
      </View>

      {segment === 'open' ? (
        <FlashList
          data={openQuery.data ?? []}
          keyExtractor={(item: Campaign) => item.id}
          renderItem={({ item }: { item: Campaign }) => (
            <CampaignCard campaign={item} onPress={() => router.push(`/(app)/volunteer/campaigns/${item.id}`)} />
          )}
          estimatedItemSize={170}
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
              onAdvance={() => handleAdvance(item)}
              onOpen={() => router.push(`/(app)/volunteer/campaigns/${item.campaign.id}`)}
            />
          )}
          estimatedItemSize={220}
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
  onAdvance,
  onOpen,
}: {
  task: CampaignTask;
  advancing: boolean;
  onAdvance: () => void;
  onOpen: () => void;
}) {
  const sm = assignmentStatusMeta(task.status);
  const currentIndex = ASSIGNMENT_STEP_ORDER.indexOf(task.status);
  const canAdvance = nextAssignmentStatus(task.status) != null;

  return (
    <View style={styles.taskCard}>
      <View style={styles.taskHeader}>
        <Text style={styles.taskTitle} numberOfLines={2} onPress={onOpen}>
          {task.campaign.title}
        </Text>
        <View style={[styles.badge, { backgroundColor: sm.bg }]}>
          <Text style={[styles.badgeText, { color: sm.color }]}>{sm.label}</Text>
        </View>
      </View>

      <View style={styles.metaRow}>
        <MaterialCommunityIcons name="account-hard-hat-outline" size={15} color={COLORS.onSurfaceVariant} />
        <Text style={styles.metaText}>Vai trò: {ASSIGNMENT_ROLE_LABEL[task.role] ?? task.role}</Text>
      </View>
      <View style={styles.metaRow}>
        <MaterialCommunityIcons name="calendar-clock" size={15} color={COLORS.onSurfaceVariant} />
        <Text style={styles.metaText}>
          {formatDate(task.campaign.scheduledDate)} · {formatTime(task.campaign.startTime)}–
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
                  color={done ? COLORS.primary : COLORS.muted}
                />
                {i < ASSIGNMENT_STEPS.length - 1 ? (
                  <View style={[styles.connector, { backgroundColor: done ? COLORS.primary : COLORS.muted }]} />
                ) : null}
              </View>
              <Text style={[styles.stepLabel, active && styles.stepLabelActive, !done && styles.stepLabelTodo]}>
                {step.label}
              </Text>
            </View>
          );
        })}
      </View>

      {canAdvance ? (
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
        <Text style={styles.doneNote}>Bạn đã hoàn thành công việc này. Cảm ơn bạn! 💚</Text>
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
  segmentWrap: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  list: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 32 },
  center: { alignItems: 'center', justifyContent: 'center', paddingTop: 64, paddingHorizontal: 32 },
  emptyIcon: {
    width: 96, height: 96, borderRadius: 48, backgroundColor: '#ecfdf5',
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.onSurface, marginTop: 12, marginBottom: 8, textAlign: 'center' },
  emptyBody: { fontSize: 14, color: COLORS.onSurfaceVariant, textAlign: 'center', lineHeight: 21 },
  retryBtn: { marginTop: 16, borderRadius: 12 },
  // Task card
  taskCard: {
    backgroundColor: COLORS.surface, borderRadius: 16, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: COLORS.outline,
  },
  taskHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  taskTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: COLORS.onSurface, lineHeight: 21 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  metaText: { flex: 1, fontSize: 13, color: COLORS.onSurfaceVariant },
  timeline: { marginTop: 10, marginBottom: 4 },
  stepRow: { flexDirection: 'row', gap: 10 },
  stepIconCol: { alignItems: 'center', width: 18 },
  connector: { width: 2, flex: 1, minHeight: 12, marginVertical: 2 },
  stepLabel: { fontSize: 13, color: COLORS.onSurface, paddingBottom: 10 },
  stepLabelActive: { fontWeight: '700', color: COLORS.primary },
  stepLabelTodo: { color: COLORS.onSurfaceVariant },
  taskBtn: { borderRadius: 12, marginTop: 6 },
  doneNote: { fontSize: 13, color: COLORS.primary, textAlign: 'center', marginTop: 8, fontWeight: '600' },
});
