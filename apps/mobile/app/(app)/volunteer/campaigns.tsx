import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, Pressable, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Button, Menu, Searchbar, SegmentedButtons } from 'react-native-paper';
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
  statusMeta,
  nextAssignmentStatus,
  assignmentStepRequiresPhoto,
  advanceTaskLabel,
  formatDate,
  formatTime,
} from '@/utils/campaign';

type Segment = 'open' | 'tasks';
type OpenFilter = 'all' | 'upcoming' | 'in_progress';
type TaskFilter = 'all' | 'pending' | 'active' | 'completed';
type TaskCampaignStatusFilter = 'all' | 'approved' | 'in_progress' | 'completed' | 'cancelled';
type DateFilter = 'all' | 'today' | 'next7' | 'past';

const PAGE_SIZE = 5;

const OPEN_STATUS_OPTIONS: { value: OpenFilter; label: string }[] = [
  { value: 'all', label: 'Tất cả trạng thái' },
  { value: 'upcoming', label: 'Sắp diễn ra' },
  { value: 'in_progress', label: 'Đang diễn ra' },
];

const CAMPAIGN_STATUS_OPTIONS: { value: TaskCampaignStatusFilter; label: string }[] = [
  { value: 'all', label: 'Mọi chiến dịch' },
  { value: 'approved', label: 'Đã duyệt' },
  { value: 'in_progress', label: 'Đang diễn ra' },
  { value: 'completed', label: 'Hoàn thành' },
  { value: 'cancelled', label: 'Đã huỷ' },
];

const DATE_OPTIONS: { value: DateFilter; label: string }[] = [
  { value: 'all', label: 'Mọi ngày' },
  { value: 'today', label: 'Hôm nay' },
  { value: 'next7', label: '7 ngày tới' },
  { value: 'past', label: 'Đã qua' },
];

interface CampaignTaskGroup {
  campaignId: string;
  campaign: CampaignTask['campaign'];
  tasks: CampaignTask[];
}

function normalizedSearch(value: string) {
  return value.trim().toLocaleLowerCase('vi-VN');
}

function taskMatchesFilter(task: CampaignTask, filter: TaskFilter) {
  if (filter === 'all') return true;
  if (filter === 'pending') {
    return task.status === 'assigned' && task.confirmationStatus === 'pending';
  }
  if (filter === 'completed') return task.status === 'completed';
  return ['assigned', 'checked_in', 'in_progress'].includes(task.status)
    && task.confirmationStatus !== 'pending';
}

function isApprovedTask(task: CampaignTask) {
  return task.status !== 'pending' && task.status !== 'rejected';
}

function dateOnlyTime(value?: string | null) {
  if (!value) return null;
  const text = value.slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const date = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function taskDateTime(task: CampaignTask) {
  return dateOnlyTime(task.workDate ?? task.campaign.scheduledDate) ?? 0;
}

function campaignDateTime(campaign: Pick<Campaign, 'scheduledDate'> | CampaignTask['campaign']) {
  return dateOnlyTime(campaign.scheduledDate) ?? 0;
}

function matchesDateFilter(value: string | null | undefined, filter: DateFilter) {
  if (filter === 'all') return true;
  const target = dateOnlyTime(value);
  if (target == null) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayTime = today.getTime();
  if (filter === 'today') return target === todayTime;
  if (filter === 'past') return target < todayTime;
  const next7 = todayTime + 7 * 86_400_000;
  return target >= todayTime && target <= next7;
}

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
  const [search, setSearch] = useState('');
  const [openFilter, setOpenFilter] = useState<OpenFilter>('all');
  const [taskFilter, setTaskFilter] = useState<TaskFilter>('all');
  const [taskCampaignStatusFilter, setTaskCampaignStatusFilter] = useState<TaskCampaignStatusFilter>('all');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [openPage, setOpenPage] = useState(1);
  const [taskPage, setTaskPage] = useState(1);
  const [screenFocused, setScreenFocused] = useState(false);
  const isVolunteer = user?.role === 'volunteer';
  const queriesEnabled = isVolunteer;
  const pollingEnabled = screenFocused && isVolunteer;

  const openQuery = useCampaigns(queriesEnabled, pollingEnabled);
  const tasksQuery = useMyTasks(queriesEnabled, pollingEnabled);
  const { refetch: refetchOpenCampaigns } = openQuery;
  const { refetch: refetchMyTasks } = tasksQuery;
  const advanceMut = useAdvanceTask();
  const confirmMut = useConfirmCampaignAssignment();

  const filteredOpenCampaigns = useMemo(() => {
    const query = normalizedSearch(search);
    return (openQuery.data ?? []).filter((campaign) => {
      const matchesSearch = !query || [campaign.title, campaign.kitchenAddress]
        .some((value) => value?.toLocaleLowerCase('vi-VN').includes(query));
      const matchesStatus = openFilter === 'all'
        || (openFilter === 'upcoming' && campaign.status === 'approved')
        || (openFilter === 'in_progress' && campaign.status === 'in_progress');
      return matchesSearch && matchesStatus && matchesDateFilter(campaign.scheduledDate, dateFilter);
    }).sort((a, b) => campaignDateTime(b) - campaignDateTime(a));
  }, [dateFilter, openFilter, openQuery.data, search]);

  const approvedTasks = useMemo(
    () => (tasksQuery.data ?? []).filter(isApprovedTask),
    [tasksQuery.data],
  );

  const taskStatusCounts = useMemo(() => {
    const counts = { all: 0, pending: 0, active: 0, completed: 0 };
    for (const task of approvedTasks) {
      counts.all += 1;
      if (taskMatchesFilter(task, 'pending')) counts.pending += 1;
      else if (taskMatchesFilter(task, 'completed')) counts.completed += 1;
      else if (taskMatchesFilter(task, 'active')) counts.active += 1;
    }
    return counts;
  }, [approvedTasks]);

  const taskGroups = useMemo<CampaignTaskGroup[]>(() => {
    const query = normalizedSearch(search);
    const grouped = new Map<string, CampaignTaskGroup>();
    for (const task of approvedTasks) {
      const matchesSearch = !query || [task.campaign.title, task.campaign.kitchenAddress]
        .some((value) => value?.toLocaleLowerCase('vi-VN').includes(query));
      const matchesCampaignStatus = taskCampaignStatusFilter === 'all'
        || task.campaign.status === taskCampaignStatusFilter;
      const matchesDate = matchesDateFilter(task.workDate ?? task.campaign.scheduledDate, dateFilter);
      if (!matchesSearch || !taskMatchesFilter(task, taskFilter) || !matchesCampaignStatus || !matchesDate) continue;
      const current = grouped.get(task.campaign.id);
      if (current) current.tasks.push(task);
      else grouped.set(task.campaign.id, {
        campaignId: task.campaign.id,
        campaign: task.campaign,
        tasks: [task],
      });
    }
    return [...grouped.values()].map((group) => ({
      ...group,
      tasks: group.tasks.sort((a, b) => taskDateTime(b) - taskDateTime(a)),
    })).sort((a, b) => {
      const latestA = Math.max(...a.tasks.map(taskDateTime), campaignDateTime(a.campaign));
      const latestB = Math.max(...b.tasks.map(taskDateTime), campaignDateTime(b.campaign));
      return latestB - latestA;
    });
  }, [approvedTasks, dateFilter, search, taskCampaignStatusFilter, taskFilter]);

  const openTotalPages = Math.max(1, Math.ceil(filteredOpenCampaigns.length / PAGE_SIZE));
  const taskTotalPages = Math.max(1, Math.ceil(taskGroups.length / PAGE_SIZE));
  const effectiveOpenPage = Math.min(openPage, openTotalPages);
  const effectiveTaskPage = Math.min(taskPage, taskTotalPages);
  const pagedOpenCampaigns = filteredOpenCampaigns.slice(
    (effectiveOpenPage - 1) * PAGE_SIZE,
    effectiveOpenPage * PAGE_SIZE,
  );
  const pagedTaskGroups = taskGroups.slice(
    (effectiveTaskPage - 1) * PAGE_SIZE,
    effectiveTaskPage * PAGE_SIZE,
  );

  useFocusEffect(
    useCallback(() => {
      setScreenFocused(true);
      const nextSegment: Segment = params.segment === 'tasks' ? 'tasks' : 'open';
      setSegment((current) => (current === nextSegment ? current : nextSegment));
      if (isVolunteer) {
        void refetchOpenCampaigns();
        void refetchMyTasks();
      }
      return () => setScreenFocused(false);
    }, [isVolunteer, params.segment, refetchOpenCampaigns, refetchMyTasks])
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && screenFocused && isVolunteer) {
        void refetchOpenCampaigns();
        void refetchMyTasks();
      }
    });
    return () => sub.remove();
  }, [isVolunteer, refetchOpenCampaigns, refetchMyTasks, screenFocused]);

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
      pathname: '/(app)/volunteer/campaigns/[id]',
      params: {
        id: campaignId,
        returnTo: '/(app)/volunteer/campaigns',
        returnSegment,
      },
    });
  };

  const openTaskDetail = (assignmentId: string) => {
    router.push({
      pathname: '/(app)/volunteer/tasks/[assignmentId]',
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

      <View style={styles.filters}>
        <Searchbar
          value={search}
          onChangeText={(value) => {
            setSearch(value);
            setOpenPage(1);
            setTaskPage(1);
          }}
          placeholder="Tìm theo tên hoặc địa chỉ"
          style={styles.search}
          inputStyle={styles.searchInput}
        />
        {/* Bố cục lọc gọn: trạng thái việc = 4 ô đếm (bấm để lọc), các tiêu chí phụ
            gom vào nút thả xuống trên CÙNG một hàng — trước đây 4 tầng chip xếp
            chồng (trạng thái lặp 2 lần) chiếm gần nửa màn hình. */}
        {segment === 'tasks' ? (
          <View style={styles.taskStatusSummary}>
            <TaskStatusSummaryItem label="Tất cả" value={taskStatusCounts.all} selected={taskFilter === 'all'} onPress={() => { setTaskFilter('all'); setTaskPage(1); }} />
            <TaskStatusSummaryItem label="Chờ xác nhận" value={taskStatusCounts.pending} tone="amber" selected={taskFilter === 'pending'} onPress={() => { setTaskFilter('pending'); setTaskPage(1); }} />
            <TaskStatusSummaryItem label="Đang làm" value={taskStatusCounts.active} tone="blue" selected={taskFilter === 'active'} onPress={() => { setTaskFilter('active'); setTaskPage(1); }} />
            <TaskStatusSummaryItem label="Xong" value={taskStatusCounts.completed} tone="green" selected={taskFilter === 'completed'} onPress={() => { setTaskFilter('completed'); setTaskPage(1); }} />
          </View>
        ) : null}
        <View style={styles.dropdownRow}>
          {segment === 'open' ? (
            <FilterDropdown
              icon="progress-clock"
              value={openFilter}
              options={OPEN_STATUS_OPTIONS}
              onChange={(v) => { setOpenFilter(v); setOpenPage(1); }}
            />
          ) : (
            <FilterDropdown
              icon="flag-outline"
              value={taskCampaignStatusFilter}
              options={CAMPAIGN_STATUS_OPTIONS}
              onChange={(v) => { setTaskCampaignStatusFilter(v); setTaskPage(1); }}
            />
          )}
          <FilterDropdown
            icon="calendar-range"
            value={dateFilter}
            options={DATE_OPTIONS}
            onChange={(v) => { setDateFilter(v); setOpenPage(1); setTaskPage(1); }}
          />
          {(segment === 'open' ? openFilter !== 'all' : taskCampaignStatusFilter !== 'all') || dateFilter !== 'all' ? (
            <Pressable
              onPress={() => {
                setOpenFilter('all');
                setTaskCampaignStatusFilter('all');
                setDateFilter('all');
                setOpenPage(1);
                setTaskPage(1);
              }}
              style={styles.clearFilters}
              accessibilityRole="button"
              accessibilityLabel="Xoá bộ lọc"
            >
              <MaterialCommunityIcons name="close-circle" size={16} color={COLORS.onSurfaceVariant} />
              <Text style={styles.clearFiltersText}>Xoá lọc</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {segment === 'open' ? (
        <FlashList
          data={pagedOpenCampaigns}
          keyExtractor={(item: Campaign) => item.id}
          renderItem={({ item }: { item: Campaign }) => (
            <CampaignCard campaign={item} onPress={() => openCampaignDetail(item.id, 'open')} />
          )}
          contentContainerStyle={styles.list}
          ListEmptyComponent={renderOpenEmpty}
          ListFooterComponent={filteredOpenCampaigns.length > 0 ? (
            <Pagination page={effectiveOpenPage} totalPages={openTotalPages} onChange={setOpenPage} />
          ) : null}
          refreshing={openQuery.isRefetching}
          onRefresh={() => openQuery.refetch()}
        />
      ) : (
        <FlashList
          data={pagedTaskGroups}
          keyExtractor={(item: CampaignTaskGroup) => item.campaignId}
          renderItem={({ item }: { item: CampaignTaskGroup }) => (
            <TaskGroupCard
              group={item}
              advancing={advanceMut.isPending}
              confirming={confirmMut.isPending}
              onAdvance={handleAdvance}
              onConfirm={(task, decision) => confirmMut.mutate(
                { assignmentId: task.id, decision },
                {
                  onSuccess: () => Popup.show({
                    type: 'success',
                    text1: decision === 'confirmed' ? 'Xác nhận ca thành công' : 'Đã từ chối ca',
                  }),
                  onError: (error) => Popup.show({ type: 'error', text1: 'Không cập nhật được', text2: getErrorMessage(error) }),
                },
              )}
              onOpen={openTaskDetail}
            />
          )}
          contentContainerStyle={styles.list}
          ListEmptyComponent={renderTasksEmpty}
          ListFooterComponent={taskGroups.length > 0 ? (
            <Pagination page={effectiveTaskPage} totalPages={taskTotalPages} onChange={setTaskPage} />
          ) : null}
          refreshing={tasksQuery.isRefetching}
          onRefresh={() => tasksQuery.refetch()}
        />
      )}
    </SafeAreaView>
  );
}

/** Nút thả xuống cho một tiêu chí lọc — hiện giá trị đang chọn, nổi màu khi khác mặc định. */
function FilterDropdown<T extends string>({
  icon,
  value,
  options,
  onChange,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value) ?? options[0];
  const active = value !== options[0].value;
  return (
    <Menu
      visible={open}
      onDismiss={() => setOpen(false)}
      anchorPosition="bottom"
      anchor={
        <Pressable
          onPress={() => setOpen(true)}
          style={[styles.dropdownPill, active && styles.dropdownPillActive]}
          accessibilityRole="button"
          accessibilityLabel={`Lọc: ${current.label}`}
        >
          <MaterialCommunityIcons name={icon} size={16} color={active ? COLORS.purple : COLORS.onSurfaceVariant} />
          <Text style={[styles.dropdownText, active && styles.dropdownTextActive]} numberOfLines={1}>
            {current.label}
          </Text>
          <MaterialCommunityIcons name="chevron-down" size={16} color={active ? COLORS.purple : COLORS.onSurfaceVariant} />
        </Pressable>
      }
    >
      {options.map((o) => (
        <Menu.Item
          key={o.value}
          title={o.label}
          leadingIcon={o.value === value ? 'check' : undefined}
          onPress={() => {
            onChange(o.value);
            setOpen(false);
          }}
        />
      ))}
    </Menu>
  );
}

const SUMMARY_TONES = {
  default: COLORS.onSurface,
  amber: '#B45309',
  blue: '#1D4ED8',
  green: '#15803D',
} as const;

function TaskStatusSummaryItem({
  label,
  value,
  selected,
  onPress,
  tone = 'default',
}: {
  label: string;
  value: number;
  selected: boolean;
  onPress: () => void;
  tone?: keyof typeof SUMMARY_TONES;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.statusSummaryItem, selected && styles.statusSummaryItemSelected]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <Text style={[styles.statusSummaryValue, { color: SUMMARY_TONES[tone] }, selected && styles.statusSummaryValueSelected]}>{value}</Text>
      <Text style={[styles.statusSummaryLabel, selected && styles.statusSummaryLabelSelected]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (page: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <View style={styles.pagination}>
      <Button mode="outlined" compact disabled={page <= 1} onPress={() => onChange(page - 1)}>
        Trước
      </Button>
      <Text style={styles.pageLabel}>{page}/{totalPages}</Text>
      <Button mode="outlined" compact disabled={page >= totalPages} onPress={() => onChange(page + 1)}>
        Sau
      </Button>
    </View>
  );
}

function TaskGroupCard({
  group,
  advancing,
  confirming,
  onAdvance,
  onConfirm,
  onOpen,
}: {
  group: CampaignTaskGroup;
  advancing: boolean;
  confirming: boolean;
  onAdvance: (task: CampaignTask) => void;
  onConfirm: (task: CampaignTask, decision: 'confirmed' | 'declined') => void;
  onOpen: (assignmentId: string) => void;
}) {
  const campaignStatus = statusMeta(group.campaign.status);
  return (
    <View style={styles.taskGroupCard}>
      <View style={styles.taskGroupHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.taskGroupTitle}>{group.campaign.title}</Text>
          <View style={styles.metaRow}>
            <MaterialCommunityIcons name="map-marker-outline" size={15} color={COLORS.onSurfaceVariant} />
            <Text style={styles.metaText} numberOfLines={1}>{group.campaign.kitchenAddress}</Text>
          </View>
        </View>
        <View style={styles.groupBadges}>
          <View style={[styles.campaignStatusBadge, { backgroundColor: campaignStatus.bg }]}>
            <Text style={[styles.campaignStatusBadgeText, { color: campaignStatus.color }]}>{campaignStatus.label}</Text>
          </View>
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{group.tasks.length} ca</Text>
          </View>
        </View>
      </View>
      {group.tasks.map((task) => (
        <TaskCard
          key={task.id}
          task={task}
          grouped
          advancing={advancing}
          confirming={confirming}
          onAdvance={() => onAdvance(task)}
          onConfirm={(decision) => onConfirm(task, decision)}
          onOpen={() => onOpen(task.id)}
        />
      ))}
    </View>
  );
}

/** Thẻ công việc TNV: chiến dịch + vai trò + timeline 4 bước + nút chuyển bước. */
function TaskCard({
  task,
  grouped = false,
  advancing,
  confirming,
  onAdvance,
  onConfirm,
  onOpen,
}: {
  task: CampaignTask;
  grouped?: boolean;
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
    <View style={grouped ? styles.groupedTask : styles.taskCard}>
      <View style={styles.taskHeader}>
        <View style={{ flex: 1 }}>
          <Text style={grouped ? styles.taskDateTitle : styles.taskTitle} numberOfLines={2} onPress={onOpen}>
            {grouped
              ? `${formatDate(task.workDate ?? task.campaign.scheduledDate)} · ${task.shift?.label ?? ASSIGNMENT_ROLE_LABEL[task.role] ?? task.role}`
              : task.campaign.title}
          </Text>
        </View>
        <StatusBadge label={sm.label} tone={task.status === 'completed' ? 'success' : 'info'} />
      </View>

      <View style={styles.metaRow}>
        <MaterialCommunityIcons name="account-hard-hat-outline" size={15} color={COLORS.onSurfaceVariant} />
        <Text style={styles.metaText}>Vai trò: {ASSIGNMENT_ROLE_LABEL[task.role] ?? task.role}</Text>
      </View>
      <View style={styles.metaRow}>
        <MaterialCommunityIcons name="calendar-clock" size={15} color={COLORS.onSurfaceVariant} />
        <Text style={styles.metaText}>
          Ngày làm: {formatDate(task.workDate ?? task.campaign.scheduledDate)} ·{' '}
          {formatTime(task.shift?.startTime ?? task.campaign.startTime)}–
          {formatTime(task.shift?.endTime ?? task.campaign.endTime)}
        </Text>
      </View>
      {!grouped ? <View style={styles.metaRow}>
        <MaterialCommunityIcons name="map-marker-outline" size={15} color={COLORS.onSurfaceVariant} />
        <Text style={styles.metaText} numberOfLines={1}>{task.campaign.kitchenAddress}</Text>
      </View> : null}

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
  filters: { paddingHorizontal: spacing.xl, paddingBottom: spacing.sm },
  search: { height: 46, borderRadius: radius.xl, backgroundColor: COLORS.surface },
  searchInput: { minHeight: 0, fontSize: 14 },
  taskStatusSummary: { flexDirection: 'row', gap: spacing.sm, paddingTop: spacing.sm },
  dropdownRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm, paddingTop: spacing.sm },
  dropdownPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    backgroundColor: COLORS.surface,
  },
  dropdownPillActive: { borderColor: COLORS.purple, backgroundColor: COLORS.purpleContainer },
  dropdownText: { fontSize: 13, fontWeight: '700', color: COLORS.onSurfaceVariant },
  dropdownTextActive: { color: COLORS.purple },
  clearFilters: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36, paddingHorizontal: 6 },
  clearFiltersText: { fontSize: 12, fontWeight: '700', color: COLORS.onSurfaceVariant },
  statusSummaryItem: {
    flex: 1,
    minHeight: 56,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  statusSummaryItemSelected: {
    borderColor: COLORS.purple,
    backgroundColor: COLORS.purpleContainer,
  },
  statusSummaryValue: { fontSize: 18, fontWeight: '900', color: COLORS.onSurface },
  statusSummaryValueSelected: { color: COLORS.purple },
  statusSummaryLabel: { marginTop: 2, fontSize: 11, fontWeight: '800', color: COLORS.onSurfaceVariant },
  statusSummaryLabelSelected: { color: COLORS.purple },
  list: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.section },
  pagination: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  pageLabel: { minWidth: 42, textAlign: 'center', color: COLORS.onSurface, fontWeight: '800' },
  center: { alignItems: 'center', justifyContent: 'center', paddingTop: 64, paddingHorizontal: 32 },
  emptyIcon: {
    width: 96, height: 96, borderRadius: 48, backgroundColor: COLORS.purpleContainer,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.onSurface, marginTop: 12, marginBottom: 8, textAlign: 'center' },
  emptyBody: { fontSize: 14, color: COLORS.onSurfaceVariant, textAlign: 'center', lineHeight: 21 },
  retryBtn: { marginTop: 16, borderRadius: 12 },
  // Task card
  taskGroupCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 28,
    padding: spacing.xl,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    ...elevation.card,
  },
  taskGroupHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingBottom: spacing.sm },
  taskGroupTitle: { fontSize: 19, fontWeight: '900', color: COLORS.onSurface, lineHeight: 24, marginBottom: 6 },
  groupBadges: { alignItems: 'flex-end', gap: spacing.xs, maxWidth: 112 },
  campaignStatusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  campaignStatusBadgeText: { fontSize: 11, fontWeight: '900' },
  countBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: COLORS.purpleContainer },
  countBadgeText: { color: COLORS.purple, fontSize: 12, fontWeight: '900' },
  groupedTask: { paddingTop: spacing.md, marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: COLORS.outlineVariant },
  taskDateTitle: { fontSize: 15, fontWeight: '900', color: COLORS.onSurface, lineHeight: 20 },
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
