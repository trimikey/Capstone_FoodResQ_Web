import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator, Button, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  useMyDeliveryShifts,
  useMyWeeklyAvailability,
  useSetMyDeliveryShifts,
  type DeliveryShiftSlot,
  type ShiftPeriod,
} from '@/hooks/useDeliveries';
import { BackButton } from '@/components/ui/BackButton';
import { Popup, Toast } from '@/components/ui/AppPopup';
import { mobileColors as COLORS, elevation, radius, spacing } from '@/theme/design';

const SHIFT_PERIODS: { id: ShiftPeriod; label: string; time: string }[] = [
  { id: 'midnight', label: 'Ca khuya', time: '00:00-06:00' },
  { id: 'morning', label: 'Ca sáng', time: '06:00-12:00' },
  { id: 'afternoon', label: 'Ca chiều', time: '12:00-18:00' },
  { id: 'evening', label: 'Ca tối', time: '18:00-24:00' },
];

function cellKey(workDate: string, period: string): string {
  return `${workDate}:${period}`;
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
  const [draft, setDraft] = useState<Set<string> | null>(null);

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
      <View style={styles.header}>
        <BackButton />
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Ca giao hàng</Text>
          <Text style={styles.subtitle}>Đăng ký ca để tự nhận đơn gần bạn trong khung giờ phù hợp.</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {shifts.isLoading || !data ? (
          <View style={styles.stateCard}>
            <ActivityIndicator color={COLORS.primary} />
            <Text style={styles.stateTitle}>Đang tải ca giao hàng...</Text>
          </View>
        ) : !data.isShipper ? (
          <View style={styles.stateCard}>
            <MaterialCommunityIcons name="truck-alert-outline" size={34} color={COLORS.warning} />
            <Text style={styles.stateTitle}>Chưa có quyền shipper</Text>
            <Text style={styles.stateText}>Tài khoản cần được xác minh chuyên môn shipper để đăng ký ca giao hàng.</Text>
          </View>
        ) : (
          <>
            <View style={styles.windowCard}>
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
              <View style={styles.countBadge}>
                <Text style={styles.countValue}>{selectedCount}</Text>
                <Text style={styles.countLabel}>ca</Text>
              </View>
            </View>

            <View style={styles.gridCard}>
              <View style={styles.gridHeader}>
                <View>
                  <Text style={styles.gridTitle}>Lịch 7 ngày</Text>
                  <Text style={styles.gridHint}>
                    {suggested.size > 0
                      ? `${suggested.size} ca đang được gợi ý từ “Khung giờ tôi rảnh”.`
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
                          style={[
                            styles.shiftCell,
                            on && styles.shiftCellOn,
                            disabled && styles.shiftCellDisabled,
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
            buttonColor={COLORS.primary}
            style={styles.saveButton}
            contentStyle={styles.saveButtonContent}
            labelStyle={styles.saveButtonLabel}
          >
            Lưu ca
          </Button>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    backgroundColor: COLORS.background,
  },
  headerCopy: { flex: 1 },
  title: { color: COLORS.onSurface, fontSize: 22, fontWeight: '900' },
  subtitle: { marginTop: 2, color: COLORS.onSurfaceVariant, fontSize: 12, lineHeight: 17 },
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
  countBadge: {
    minWidth: 54,
    alignItems: 'center',
    borderRadius: radius.lg,
    backgroundColor: COLORS.surfaceVariant,
    paddingVertical: spacing.xs,
  },
  countValue: { color: COLORS.primary, fontSize: 18, fontWeight: '900' },
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
  shiftCellOn: { borderColor: COLORS.teal, backgroundColor: COLORS.teal },
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
