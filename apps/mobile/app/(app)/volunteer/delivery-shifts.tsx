/* Hallmark · pre-emit critique: P5 H5 E4 S5 R5 V4
 * Existing mobile system preserved · utilitarian schedule workbench · no decorative motion
 */
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator, Button, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  useMyDeliveryShifts,
  useMyWeeklyAvailability,
  useSetMyDeliveryShifts,
  useSetMyWeeklyAvailability,
  type DeliveryShiftSlot,
  type ShiftPeriod,
  type WeeklyAvailabilitySlot,
} from '@/hooks/useDeliveries';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Popup, Toast } from '@/components/ui/AppPopup';
import { mobileColors as COLORS, elevation, radius, spacing } from '@/theme/design';

const SHIFT_PERIODS: { id: ShiftPeriod; label: string; time: string }[] = [
  { id: 'midnight', label: 'Ca khuya', time: '00:00-06:00' },
  { id: 'morning', label: 'Ca sáng', time: '06:00-12:00' },
  { id: 'afternoon', label: 'Ca chiều', time: '12:00-18:00' },
  { id: 'evening', label: 'Ca tối', time: '18:00-24:00' },
];

const WEEK_DAYS = [
  { id: 1, label: 'T2' },
  { id: 2, label: 'T3' },
  { id: 3, label: 'T4' },
  { id: 4, label: 'T5' },
  { id: 5, label: 'T6' },
  { id: 6, label: 'T7' },
  { id: 7, label: 'CN' },
] as const;

function cellKey(workDate: string, period: string): string {
  return `${workDate}:${period}`;
}

function availabilityKey(dayOfWeek: number, period: string): string {
  return `${dayOfWeek}:${period}`;
}

function vnTodayKey(): string {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
}

function addDaysKey(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function mondayOfKey(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  const diffToMonday = (d.getUTCDay() + 6) % 7;
  return addDaysKey(dateKey, -diffToMonday);
}

function isoDowOfKey(dateKey: string): number {
  const d = new Date(`${dateKey}T00:00:00Z`);
  return d.getUTCDay() || 7;
}

function dayLabel(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  const names = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  return `${names[d.getUTCDay()]} ${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
}

function fmtVn(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function DeliveryShiftsScreen() {
  const shifts = useMyDeliveryShifts();
  const availability = useMyWeeklyAvailability();
  const save = useSetMyDeliveryShifts();
  const saveAvailability = useSetMyWeeklyAvailability();
  const [draft, setDraft] = useState<Set<string> | null>(null);
  const [availabilityDraft, setAvailabilityDraft] = useState<Set<string> | null>(null);

  const data = shifts.data;
  const window_ = data?.window;
  const editable = !!window_ && (window_.alwaysOpen || window_.open);
  const todayKey = vnTodayKey();
  const baseMonday = mondayOfKey(window_?.editableFrom ?? todayKey);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDaysKey(baseMonday, i)), [baseMonday]);
  const weekEnd = days[6];
  const serverSelected = useMemo(
    () => new Set((data?.slots ?? []).map((slot) => cellKey(slot.workDate, slot.period))),
    [data?.slots],
  );
  const serverAvailability = useMemo(
    () => new Set((availability.data?.slots ?? []).map((slot) => availabilityKey(slot.dayOfWeek, slot.period))),
    [availability.data?.slots],
  );
  const selectedAvailability = availabilityDraft ?? serverAvailability;
  const availabilityCount = selectedAvailability.size;
  const weekHasSaved = days.some((day) =>
    SHIFT_PERIODS.some((period) => serverSelected.has(cellKey(day, period.id))),
  );
  const suggested = useMemo(() => {
    const next = new Set<string>();
    if (!editable || weekHasSaved) return next;
    for (const day of days) {
      if (day < todayKey) continue;
      const dow = isoDowOfKey(day);
      for (const slot of availability.data?.slots ?? []) {
        if (slot.dayOfWeek === dow) next.add(cellKey(day, slot.period));
      }
    }
    return next;
  }, [availability.data?.slots, days, editable, todayKey, weekHasSaved]);
  const selected = draft ?? (suggested.size ? new Set([...serverSelected, ...suggested]) : serverSelected);
  const dirty = draft !== null || suggested.size > 0;
  const selectedCount = days.reduce(
    (total, day) => total + SHIFT_PERIODS.filter((period) => selected.has(cellKey(day, period.id))).length,
    0,
  );

  const toggle = (workDate: string, period: ShiftPeriod) => {
    if (!editable || workDate < todayKey) return;
    setDraft((prev) => {
      const next = new Set(prev ?? selected);
      const key = cellKey(workDate, period);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAvailability = (dayOfWeek: number, period: ShiftPeriod) => {
    setAvailabilityDraft((prev) => {
      const next = new Set(prev ?? selectedAvailability);
      const key = availabilityKey(dayOfWeek, period);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const onSaveAvailability = async () => {
    const slots: WeeklyAvailabilitySlot[] = [...selectedAvailability].map((key) => {
      const [dayOfWeek, period] = key.split(':');
      return { dayOfWeek: Number(dayOfWeek), period: period as ShiftPeriod };
    });

    try {
      await saveAvailability.mutateAsync(slots);
      setAvailabilityDraft(null);
      Toast.show({
        type: 'success',
        text1: slots.length ? `Đã lưu ${slots.length} khung giờ rảnh` : 'Đã xoá lịch rảnh',
        text2: slots.length
          ? 'Tổ chức có thể dùng lịch này để gửi lời mời chiến dịch phù hợp.'
          : 'Bạn vẫn có thể tự đăng ký ca chiến dịch thủ công.',
      });
    } catch (e: any) {
      Popup.show({
        type: 'error',
        text1: 'Không lưu được lịch rảnh',
        text2: e?.response?.data?.error?.message ?? 'Vui lòng thử lại.',
      });
    }
  };

  const onSave = async () => {
    const inRange = new Set(days);
    const slots: DeliveryShiftSlot[] = [...selected]
      .map((key) => {
        const [workDate, period] = key.split(':');
        return { workDate, period: period as ShiftPeriod };
      })
      .filter((slot) => inRange.has(slot.workDate) && slot.workDate >= todayKey);

    try {
      await save.mutateAsync({ slots, from: days[0], to: weekEnd });
      setDraft(null);
      Toast.show({
        type: 'success',
        text1: slots.length ? `Đã lưu ${slots.length} ca giao hàng` : 'Đã bỏ ca giao hàng tuần này',
        text2: 'Bạn chỉ tự nhận được đơn trong các ca đã đăng ký.',
      });
    } catch (e: any) {
      Popup.show({
        type: 'error',
        text1: 'Không lưu được ca giao hàng',
        text2: e?.response?.data?.error?.message ?? 'Vui lòng thử lại.',
      });
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title="Lịch làm việc" />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {shifts.isLoading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator color={COLORS.primary} />
            <Text style={styles.stateTitle}>Đang tải ca giao hàng...</Text>
          </View>
        ) : shifts.isError || !data ? (
          <View style={styles.stateCard}>
            <MaterialCommunityIcons name="calendar-alert-outline" size={34} color={COLORS.error} />
            <Text style={styles.stateTitle}>Không tải được lịch làm việc</Text>
            <Text style={styles.stateText}>Vui lòng kiểm tra kết nối rồi thử lại.</Text>
            <Button mode="outlined" icon="refresh" onPress={() => void shifts.refetch()}>
              Thử lại
            </Button>
          </View>
        ) : !data.isShipper ? (
          <View style={styles.stateCard}>
            <MaterialCommunityIcons name="truck-alert-outline" size={34} color={COLORS.warning} />
            <Text style={styles.stateTitle}>Chưa có quyền shipper</Text>
            <Text style={styles.stateText}>Tài khoản cần được xác minh chuyên môn shipper để đăng ký ca giao hàng.</Text>
          </View>
        ) : (
          <>
            <View style={styles.introCard}>
              <Text style={styles.introTitle}>Hai lịch, hai mục đích khác nhau</Text>
              <View style={styles.legendRow}>
                <View style={[styles.legendIcon, styles.availabilityIcon]}>
                  <MaterialCommunityIcons name="calendar-account-outline" size={20} color={COLORS.primary} />
                </View>
                <View style={styles.legendCopy}>
                  <Text style={styles.legendTitle}>Lịch rảnh cho chiến dịch</Text>
                  <Text style={styles.legendText}>Lặp hàng tuần để tổ chức biết lúc nào có thể mời bạn. Lịch này không tự xếp ca.</Text>
                </View>
              </View>
              <View style={styles.legendDivider} />
              <View style={styles.legendRow}>
                <View style={[styles.legendIcon, styles.deliveryIcon]}>
                  <MaterialCommunityIcons name="truck-check-outline" size={20} color={COLORS.teal} />
                </View>
                <View style={styles.legendCopy}>
                  <Text style={styles.legendTitle}>Ca giao hàng thường</Text>
                  <Text style={styles.legendText}>Cam kết theo ngày cụ thể. Chỉ ca đã lưu mới được tự nhận đơn giao của người nhận.</Text>
                </View>
              </View>
            </View>

            <View style={[styles.gridCard, styles.availabilityCard]}>
              <View style={styles.scheduleHeading}>
                <View style={[styles.scheduleIcon, styles.availabilityIcon]}>
                  <MaterialCommunityIcons name="calendar-account-outline" size={22} color={COLORS.primary} />
                </View>
                <View style={styles.scheduleCopy}>
                  <View style={styles.scheduleTitleRow}>
                    <Text style={styles.gridTitle}>Khung giờ tôi rảnh</Text>
                    <View style={styles.recurringBadge}><Text style={styles.recurringBadgeText}>Lặp hàng tuần</Text></View>
                  </View>
                  <Text style={styles.gridHint}>Dùng để nhận lời mời chiến dịch phù hợp. Bạn vẫn cần chấp nhận hoặc tự đăng ký từng ca.</Text>
                </View>
                <View style={styles.availabilityCountBadge}>
                  <Text style={styles.availabilityCountValue}>{availabilityCount}</Text>
                  <Text style={styles.countLabel}>khung</Text>
                </View>
              </View>

              {availability.isLoading ? (
                <View style={styles.inlineLoading}>
                  <ActivityIndicator color={COLORS.primary} size="small" />
                  <Text style={styles.gridHint}>Đang tải lịch rảnh...</Text>
                </View>
              ) : availability.isError ? (
                <View style={styles.inlineState}>
                  <MaterialCommunityIcons name="calendar-alert-outline" size={26} color={COLORS.error} />
                  <Text style={styles.inlineStateText}>Không tải được lịch rảnh. Dữ liệu hiện tại chưa bị thay đổi.</Text>
                  <Button mode="outlined" icon="refresh" onPress={() => void availability.refetch()}>
                    Thử lại
                  </Button>
                </View>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shiftGrid}>
                  {WEEK_DAYS.map((day) => (
                    <View key={day.id} style={styles.shiftDay}>
                      <Text style={styles.shiftDayLabel}>{day.label}</Text>
                      {SHIFT_PERIODS.map((period) => {
                        const key = availabilityKey(day.id, period.id);
                        const on = selectedAvailability.has(key);
                        return (
                          <Pressable
                            key={key}
                            onPress={() => toggleAvailability(day.id, period.id)}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: on }}
                            accessibilityLabel={`${day.label}, ${period.label}, ${period.time}`}
                            style={({ pressed }) => [
                              styles.shiftCell,
                              styles.availabilityCell,
                              on && styles.availabilityCellOn,
                              pressed && styles.cellPressed,
                            ]}
                          >
                            <Text style={[styles.shiftCellLabel, on && styles.shiftCellLabelOn]}>{period.label}</Text>
                            <Text style={[styles.shiftCellTime, on && styles.shiftCellLabelOn]}>{period.time}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ))}
                </ScrollView>
              )}

              <Button
                mode="contained"
                icon={availabilityDraft === null ? 'check' : 'content-save-outline'}
                onPress={onSaveAvailability}
                disabled={availability.isError || availabilityDraft === null || saveAvailability.isPending}
                loading={saveAvailability.isPending}
                buttonColor={COLORS.primary}
                style={styles.sectionButton}
                contentStyle={styles.sectionButtonContent}
              >
                {availabilityDraft === null ? 'Lịch rảnh đã lưu' : 'Lưu khung giờ rảnh'}
              </Button>
            </View>

            <View style={[styles.deliverySectionHeader, styles.deliveryCard]}>
              <View style={[styles.scheduleIcon, styles.deliveryIcon]}>
                <MaterialCommunityIcons name="truck-check-outline" size={22} color={COLORS.teal} />
              </View>
              <View style={styles.scheduleCopy}>
                <Text style={styles.gridTitle}>Ca giao hàng thường</Text>
                <Text style={styles.gridHint}>Dành cho đơn người nhận đặt từ tin thực phẩm, không phải ca vận chuyển của chiến dịch.</Text>
              </View>
              <View style={styles.deliveryCountBadge}>
                <Text style={styles.deliveryCountValue}>{selectedCount}</Text>
                <Text style={styles.countLabel}>ca</Text>
              </View>
            </View>

            <View style={[styles.windowCard, styles.deliveryCard]}>
              <View style={[styles.windowIcon, editable ? styles.windowIconOpen : styles.windowIconClosed]}>
                <MaterialCommunityIcons
                  name={editable ? 'lock-open-variant-outline' : 'lock-outline'}
                  size={21}
                  color={editable ? COLORS.teal : COLORS.warning}
                />
              </View>
              <View style={styles.windowCopy}>
                <Text style={styles.windowTitle}>
                  {editable ? 'Đang mở đăng ký' : 'Ngoài cửa sổ đăng ký'}
                </Text>
                <Text style={styles.windowText}>
                  {suggested.size > 0
                    ? 'Đã gợi ý ca từ khung giờ bạn rảnh. Bấm Lưu ca để đăng ký thật.'
                    : window_?.alwaysOpen
                      ? 'Bạn có thể cập nhật ca giao hàng bất cứ lúc nào.'
                      : editable
                        ? `Có thể sửa đến ${fmtVn(window_?.closesAt ?? null)}.`
                        : `Chỉ xem lịch. Mở lại ${fmtVn(window_?.nextOpensAt ?? null) || 'theo lịch hệ thống'}.`}
                </Text>
              </View>
            </View>

            <View style={[styles.gridCard, styles.deliveryCard]}>
              <View style={styles.gridHeader}>
                <View>
                  <Text style={styles.gridTitle}>Ca theo ngày cụ thể</Text>
                  <Text style={styles.gridHint}>
                    {suggested.size > 0
                      ? `${suggested.size} ca được điền sẵn từ lịch rảnh; chưa có hiệu lực cho tới khi bạn lưu.`
                      : 'Ngày/ca đã qua hoặc ngoài cửa sổ đăng ký sẽ bị khoá.'}
                  </Text>
                </View>
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shiftGrid}>
                {days.map((day) => (
                  <View key={day} style={styles.shiftDay}>
                    <Text style={styles.shiftDayLabel}>{dayLabel(day)}</Text>
                    {SHIFT_PERIODS.map((period) => {
                      const key = cellKey(day, period.id);
                      const on = selected.has(key);
                      const disabled = !editable || day < todayKey;
                      return (
                        <Pressable
                          key={key}
                          onPress={() => toggle(day, period.id)}
                          disabled={disabled}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: on, disabled }}
                          accessibilityLabel={`${dayLabel(day)}, ${period.label}, ${period.time}`}
                          style={({ pressed }) => [
                            styles.shiftCell,
                            styles.deliveryCell,
                            on && styles.deliveryCellOn,
                            disabled && styles.shiftCellDisabled,
                            pressed && !disabled && styles.cellPressed,
                          ]}
                        >
                          <Text style={[styles.shiftCellLabel, on && styles.shiftCellLabelOn]}>
                            {period.label}
                          </Text>
                          <Text style={[styles.shiftCellTime, on && styles.shiftCellLabelOn]}>
                            {period.time}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ))}
              </ScrollView>
            </View>
          </>
        )}
      </ScrollView>

      {data?.isShipper ? (
        <View style={styles.footer}>
          <Button
            mode="contained"
            icon="content-save-outline"
            onPress={onSave}
            disabled={!editable || !dirty || save.isPending}
            loading={save.isPending}
            buttonColor={COLORS.teal}
            style={styles.saveButton}
            contentStyle={styles.saveButtonContent}
            labelStyle={styles.saveButtonLabel}
          >
            {!dirty ? 'Ca giao hàng đã lưu' : 'Lưu ca giao hàng thường'}
          </Button>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { paddingHorizontal: spacing.lg, paddingBottom: 112, gap: spacing.md },
  stateCard: {
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.xl,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    ...elevation.card,
  },
  stateTitle: { color: COLORS.onSurface, fontSize: 16, fontWeight: '900', textAlign: 'center' },
  stateText: { color: COLORS.onSurfaceVariant, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  introCard: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.xl,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
  },
  introTitle: { color: COLORS.onSurface, fontSize: 15, fontWeight: '900' },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  legendIcon: { width: 38, height: 38, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  legendCopy: { flex: 1, minWidth: 0 },
  legendTitle: { color: COLORS.onSurface, fontSize: 13, fontWeight: '900' },
  legendText: { marginTop: 1, color: COLORS.onSurfaceVariant, fontSize: 11, lineHeight: 16 },
  legendDivider: { height: 1, marginLeft: 46, backgroundColor: COLORS.outlineVariant },
  availabilityIcon: { backgroundColor: COLORS.primaryContainer },
  deliveryIcon: { backgroundColor: COLORS.tealContainer },
  availabilityCard: { borderColor: COLORS.primary },
  deliveryCard: { borderColor: COLORS.teal },
  scheduleHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  scheduleIcon: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  scheduleCopy: { flex: 1, minWidth: 0 },
  scheduleTitleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.xs },
  recurringBadge: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: COLORS.primaryContainer },
  recurringBadgeText: { color: COLORS.primary, fontSize: 9, fontWeight: '900', textTransform: 'uppercase' },
  availabilityCountBadge: {
    minWidth: 50, alignItems: 'center', borderRadius: radius.lg,
    backgroundColor: COLORS.primaryContainer, paddingVertical: spacing.xs,
  },
  availabilityCountValue: { color: COLORS.primary, fontSize: 18, fontWeight: '900' },
  deliveryCountBadge: {
    minWidth: 50, alignItems: 'center', borderRadius: radius.lg,
    backgroundColor: COLORS.tealContainer, paddingVertical: spacing.xs,
  },
  deliveryCountValue: { color: COLORS.teal, fontSize: 18, fontWeight: '900' },
  inlineLoading: { minHeight: 80, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  inlineState: { minHeight: 132, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.md },
  inlineStateText: { color: COLORS.onSurfaceVariant, fontSize: 12, lineHeight: 17, textAlign: 'center' },
  sectionButton: { borderRadius: radius.lg, alignSelf: 'stretch' },
  sectionButtonContent: { minHeight: 44 },
  deliverySectionHeader: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
    padding: spacing.md, borderRadius: radius.xl, backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.outlineVariant,
  },
  windowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.xl,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    ...elevation.card,
  },
  windowIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  windowIconOpen: { backgroundColor: COLORS.tealContainer },
  windowIconClosed: { backgroundColor: COLORS.warningContainer },
  windowCopy: { flex: 1 },
  windowTitle: { color: COLORS.onSurface, fontSize: 15, fontWeight: '900' },
  windowText: { marginTop: 2, color: COLORS.onSurfaceVariant, fontSize: 12, lineHeight: 17 },
  countLabel: { color: COLORS.onSurfaceVariant, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  gridCard: {
    padding: spacing.md,
    borderRadius: radius.xl,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    gap: spacing.md,
    ...elevation.card,
  },
  gridHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  gridTitle: { color: COLORS.onSurface, fontSize: 16, fontWeight: '900' },
  gridHint: { marginTop: 2, color: COLORS.onSurfaceVariant, fontSize: 12, lineHeight: 17 },
  shiftGrid: { gap: spacing.sm, paddingVertical: 2 },
  shiftDay: { width: 122, gap: 7 },
  shiftDayLabel: { color: COLORS.onSurfaceVariant, fontSize: 11, fontWeight: '900', textAlign: 'center' },
  shiftCell: {
    minHeight: 58,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    backgroundColor: COLORS.surfaceVariant,
    padding: 9,
    justifyContent: 'center',
  },
  availabilityCell: { backgroundColor: COLORS.surface },
  availabilityCellOn: { borderColor: COLORS.primary, backgroundColor: COLORS.primary },
  deliveryCell: { backgroundColor: COLORS.surface },
  deliveryCellOn: { borderColor: COLORS.teal, backgroundColor: COLORS.teal },
  cellPressed: { opacity: 0.78 },
  shiftCellDisabled: { opacity: 0.55 },
  shiftCellLabel: { color: COLORS.onSurface, fontSize: 12, fontWeight: '900' },
  shiftCellTime: { marginTop: 2, color: COLORS.onSurfaceVariant, fontSize: 10, fontWeight: '800' },
  shiftCellLabelOn: { color: COLORS.onPrimary },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    backgroundColor: COLORS.background,
    borderTopWidth: 1,
    borderTopColor: COLORS.outlineVariant,
  },
  saveButton: { borderRadius: radius.lg },
  saveButtonContent: { height: 48 },
  saveButtonLabel: { fontSize: 14, fontWeight: '900' },
});
