import { useEffect, useMemo, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Checkbox, Text, TextInput } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useUpdateListing, type ProviderListing } from '@/hooks/useProviderListings';
import { UNIT_LABELS } from '@/utils/listingFormat';
import { Popup } from '@/components/ui/AppPopup';
import { mobileColors as COLORS, radius, spacing } from '@/theme/design';

export type ExtendListingMode = 'extend_time' | 'add_quantity' | 'both';

interface Props {
  visible: boolean;
  listing: ProviderListing | null;
  defaultMode: ExtendListingMode;
  onClose: () => void;
}

function addHours(value: string, hours: number): Date {
  const d = new Date(value);
  d.setHours(d.getHours() + hours);
  return d;
}

function formatDateTime(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function openDateTimePicker(current: Date, onPick: (d: Date) => void) {
  if (Platform.OS !== 'android') return;
  DateTimePickerAndroid.open({
    value: current,
    mode: 'date',
    onChange: (_event, date) => {
      if (!date) return;
      DateTimePickerAndroid.open({
        value: date,
        mode: 'time',
        is24Hour: true,
        onChange: (_event2, dateTime) => {
          if (dateTime) onPick(dateTime);
        },
      });
    },
  });
}

function errorMessage(error: unknown, fallback: string): string {
  return (
    (error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ??
    fallback
  );
}

export function ExtendListingModal({ visible, listing, defaultMode, onClose }: Props) {
  const updateListing = useUpdateListing();
  const [mode, setMode] = useState<ExtendListingMode>(defaultMode);
  const [newStartTime, setNewStartTime] = useState(new Date());
  const [newEndTime, setNewEndTime] = useState(new Date());
  const [newExpiryTime, setNewExpiryTime] = useState(new Date());
  const [addQty, setAddQty] = useState(5);
  const [extendWhenAdding, setExtendWhenAdding] = useState(false);

  useEffect(() => {
    if (!visible || !listing) return;
    setMode(defaultMode);
    setNewStartTime(new Date(listing.pickupStartTime));
    setNewEndTime(new Date(listing.pickupEndTime));
    setNewExpiryTime(new Date(listing.expiryTime ?? listing.pickupEndTime));
    setAddQty(5);
    setExtendWhenAdding(false);
  }, [defaultMode, listing, visible]);

  const stats = useMemo(() => {
    if (!listing) return { remaining: 0, reserved: 0, total: 0, unit: 'phần' };
    const remaining = Number(listing.quantityRemaining);
    const total = Number(listing.quantityTotal ?? listing.quantityRemaining);
    return {
      remaining,
      total,
      reserved: Math.max(0, total - remaining),
      unit: UNIT_LABELS[listing.quantityUnit] ?? listing.quantityUnit ?? 'phần',
    };
  }, [listing]);

  if (!listing) return null;

  const showExtend = mode === 'extend_time' || mode === 'both';
  const showQuantity = mode === 'add_quantity' || mode === 'both';
  const submitting = updateListing.isPending;

  const setPresetHours = (hours: number) => {
    setNewEndTime(addHours(listing.pickupEndTime, hours));
    setNewExpiryTime(addHours(listing.expiryTime ?? listing.pickupEndTime, hours));
  };

  const startTimeChanged = newStartTime.getTime() !== new Date(listing.pickupStartTime).getTime();

  const submit = async () => {
    try {
      const input: Record<string, string | number> = {};
      if (showExtend) {
        if (startTimeChanged) {
          if (newStartTime <= new Date(listing.pickupStartTime)) {
            Popup.show({
              type: 'error',
              text1: 'Thời gian chưa hợp lệ',
              text2: 'Giờ bắt đầu mới phải sau giờ bắt đầu hiện tại (chỉ được dời về sau).',
            });
            return;
          }
          if (newStartTime >= newEndTime) {
            Popup.show({
              type: 'error',
              text1: 'Thời gian chưa hợp lệ',
              text2: 'Giờ bắt đầu nhận phải trước giờ kết thúc nhận.',
            });
            return;
          }
          input.pickupStartTime = newStartTime.toISOString();
        }
        if (newEndTime <= new Date(listing.pickupEndTime)) {
          Popup.show({
            type: 'error',
            text1: 'Thời gian chưa hợp lệ',
            text2: 'Giờ kết thúc nhận mới phải sau giờ hiện tại của tin.',
          });
          return;
        }
        input.pickupEndTime = newEndTime.toISOString();
        input.expiryTime = newExpiryTime.toISOString();
      }

      if (showQuantity) {
        if (addQty <= 0) {
          Popup.show({ type: 'error', text1: 'Số lượng chưa hợp lệ', text2: 'Số phần thêm phải lớn hơn 0.' });
          return;
        }
        input.quantityTotal = stats.total + addQty;
        if (!showExtend && extendWhenAdding) {
          input.pickupEndTime = addHours(listing.pickupEndTime, 2).toISOString();
          input.expiryTime = addHours(listing.expiryTime ?? listing.pickupEndTime, 2).toISOString();
        }
      }

      await updateListing.mutateAsync({ id: listing.id, input });
      Popup.show({
        type: 'success',
        text1: 'Đã cập nhật tin',
        text2:
          mode === 'extend_time'
            ? startTimeChanged
              ? 'Đã cập nhật giờ bắt đầu và gia hạn thời gian nhận.'
              : 'Đã gia hạn thời gian nhận.'
            : mode === 'add_quantity'
              ? 'Đã bổ sung số lượng phần ăn.'
              : 'Đã gia hạn và bổ sung số lượng.',
      });
      onClose();
    } catch (error) {
      Popup.show({ type: 'error', text1: 'Cập nhật thất bại', text2: errorMessage(error, 'Vui lòng thử lại.') });
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.dialog}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>Gia hạn & bổ sung</Text>
              <Text style={styles.subtitle} numberOfLines={1}>{listing.title}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={styles.closeButton}>
              <MaterialCommunityIcons name="close" size={26} color={COLORS.onSurfaceVariant} />
            </Pressable>
          </View>

          <View style={styles.tabs}>
            <ModeTab icon="clock-outline" label="Gia hạn giờ" active={mode === 'extend_time'} onPress={() => setMode('extend_time')} />
            <ModeTab icon="plus-circle-outline" label="Thêm số lượng" active={mode === 'add_quantity'} onPress={() => setMode('add_quantity')} />
            <ModeTab icon="lightning-bolt-outline" label="Cả hai" active={mode === 'both'} onPress={() => setMode('both')} />
          </View>

          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            <View style={styles.statsRow}>
              <Stat icon="archive-outline" label="Còn lại" value={String(stats.remaining)} unit={stats.unit} />
              <Stat icon="shopping-outline" label="Đã đặt" value={String(stats.reserved)} unit={stats.unit} />
              <Stat icon="clock-outline" label="Hết hạn" value={formatDateTime(listing.pickupEndTime)} compact />
            </View>

            {showExtend ? (
              <View style={styles.section}>
                <SectionTitle icon="clock-plus-outline" title="Gia hạn thời gian nhận" />
                <DateField
                  label="Giờ bắt đầu nhận mới (tuỳ chọn — chỉ dời về sau)"
                  value={newStartTime}
                  onPress={() => openDateTimePicker(newStartTime, setNewStartTime)}
                  changed={startTimeChanged}
                />
                <DateField label="Giờ kết thúc nhận mới" value={newEndTime} onPress={() => openDateTimePicker(newEndTime, setNewEndTime)} />
                <DateField label="Hạn sử dụng mới" value={newExpiryTime} onPress={() => openDateTimePicker(newExpiryTime, setNewExpiryTime)} />
                <View style={styles.quickRow}>
                  {[1, 2, 4, 24].map((hours) => (
                    <Pressable key={hours} onPress={() => setPresetHours(hours)} style={styles.quickButton}>
                      <Text style={styles.quickText}>+{hours === 24 ? '1 ngày' : `${hours} giờ`}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}

            {showQuantity ? (
              <View style={styles.section}>
                <SectionTitle icon="plus-circle-outline" title="Bổ sung phần ăn" />
                <Text style={styles.fieldLabel}>Thêm (đơn vị: {stats.unit})</Text>
                <View style={styles.stepperRow}>
                  <Pressable onPress={() => setAddQty((v) => Math.max(1, v - 1))} style={styles.stepButton}>
                    <MaterialCommunityIcons name="minus" size={24} color={COLORS.onSurface} />
                  </Pressable>
                  <TextInput
                    mode="outlined"
                    value={String(addQty)}
                    onChangeText={(text) => setAddQty(Math.max(1, Number(text.replace(/[^0-9]/g, '')) || 1))}
                    keyboardType="number-pad"
                    style={styles.qtyInput}
                    outlineColor={COLORS.outline}
                    activeOutlineColor={COLORS.primary}
                  />
                  <Pressable onPress={() => setAddQty((v) => v + 1)} style={styles.stepButton}>
                    <MaterialCommunityIcons name="plus" size={24} color={COLORS.onSurface} />
                  </Pressable>
                </View>
                <View style={styles.quickRow}>
                  {[5, 10, 20, 50].map((qty) => (
                    <Pressable
                      key={qty}
                      onPress={() => setAddQty(qty)}
                      style={[styles.qtyPreset, addQty === qty && styles.qtyPresetActive]}
                    >
                      <Text style={[styles.qtyPresetText, addQty === qty && styles.qtyPresetTextActive]}>+{qty}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.totalHint}>
                  Tổng sau khi thêm: <Text style={styles.totalStrong}>{stats.total + addQty}</Text> {stats.unit}
                </Text>
                {mode === 'add_quantity' ? (
                  <Pressable onPress={() => setExtendWhenAdding((v) => !v)} style={styles.checkRow}>
                    <Checkbox status={extendWhenAdding ? 'checked' : 'unchecked'} color={COLORS.primary} />
                    <Text style={styles.checkText}>Đồng thời gia hạn thêm 2 giờ</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </ScrollView>

          <View style={styles.footer}>
            <Button mode="outlined" onPress={onClose} disabled={submitting} style={styles.cancelButton}>
              Hủy
            </Button>
            <Button
              mode="contained"
              icon="check"
              onPress={submit}
              loading={submitting}
              disabled={submitting}
              buttonColor={COLORS.primary}
              textColor={COLORS.onPrimary}
              style={styles.submitButton}
            >
              {mode === 'extend_time' ? 'Xác nhận gia hạn' : mode === 'add_quantity' ? 'Xác nhận thêm' : 'Gia hạn & thêm'}
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ModeTab({ icon, label, active, onPress }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.tab, active && styles.tabActive]}>
      <MaterialCommunityIcons name={icon} size={20} color={active ? COLORS.primary : COLORS.onSurfaceVariant} />
      <Text style={[styles.tabText, active && styles.tabTextActive]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

function Stat({ icon, label, value, unit, compact }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; value: string; unit?: string; compact?: boolean }) {
  return (
    <View style={styles.stat}>
      <View style={styles.statLabelRow}>
        <MaterialCommunityIcons name={icon} size={18} color={COLORS.onSurfaceVariant} />
        <Text style={styles.statLabel}>{label}</Text>
      </View>
      <Text style={[styles.statValue, compact && styles.statValueCompact]} numberOfLines={1}>
        {value}{unit && !compact ? <Text style={styles.statUnit}> {unit}</Text> : null}
      </Text>
    </View>
  );
}

function SectionTitle({ icon, title }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; title: string }) {
  return (
    <View style={styles.sectionTitleRow}>
      <MaterialCommunityIcons name={icon} size={22} color={COLORS.primary} />
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

function DateField({ label, value, onPress, changed }: { label: string; value: Date; onPress: () => void; changed?: boolean }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Pressable onPress={onPress} style={[styles.dateInput, changed && styles.dateInputChanged]}>
        <Text style={[styles.dateText, changed && styles.dateTextChanged]}>{formatDateTime(value)}</Text>
        <MaterialCommunityIcons name="calendar-month-outline" size={22} color={changed ? COLORS.primary : COLORS.onSurface} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: 'rgba(18, 28, 42, 0.46)',
    padding: spacing.lg,
  },
  dialog: {
    maxHeight: '92%',
    overflow: 'hidden',
    borderRadius: radius.xl,
    backgroundColor: COLORS.surface,
  },
  header: {
    minHeight: 86,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.outlineVariant,
  },
  headerCopy: { flex: 1, minWidth: 0 },
  title: { fontSize: 22, fontWeight: '900', color: COLORS.onSurface },
  subtitle: { marginTop: 4, fontSize: 14, fontWeight: '700', color: COLORS.onSurfaceVariant },
  closeButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  tabs: {
    minHeight: 58,
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.outlineVariant,
    backgroundColor: COLORS.surfaceContainerLow,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: { backgroundColor: COLORS.surface, borderBottomColor: COLORS.primary },
  tabText: { fontSize: 12, fontWeight: '900', color: COLORS.onSurfaceVariant },
  tabTextActive: { color: COLORS.primary },
  body: { padding: spacing.xl, gap: spacing.xl },
  statsRow: { flexDirection: 'row', gap: spacing.sm },
  stat: {
    flex: 1,
    minHeight: 86,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    backgroundColor: COLORS.surfaceContainerLow,
  },
  statLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statLabel: { fontSize: 10, fontWeight: '900', textTransform: 'uppercase', color: COLORS.onSurfaceVariant },
  statValue: { marginTop: 8, fontSize: 18, fontWeight: '900', color: COLORS.onSurface },
  statValueCompact: { fontSize: 12 },
  statUnit: { fontSize: 12, fontWeight: '700', color: COLORS.onSurfaceVariant },
  section: { gap: spacing.md },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sectionTitle: { fontSize: 18, fontWeight: '900', color: COLORS.primary },
  field: { gap: 6 },
  fieldLabel: { fontSize: 13, fontWeight: '900', color: COLORS.onSurfaceVariant },
  dateInput: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: COLORS.outline,
    backgroundColor: COLORS.surface,
  },
  dateText: { flex: 1, fontSize: 16, fontWeight: '700', color: COLORS.onSurface },
  dateInputChanged: { borderColor: COLORS.primary, borderWidth: 2, backgroundColor: COLORS.primaryContainer },
  dateTextChanged: { color: COLORS.primary },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  quickButton: {
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: COLORS.primaryContainer,
  },
  quickText: { fontSize: 13, fontWeight: '900', color: COLORS.primary },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stepButton: {
    width: 52,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: COLORS.neutralContainer,
  },
  qtyInput: { flex: 1, height: 48, backgroundColor: COLORS.surface },
  qtyPreset: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: COLORS.outline,
    backgroundColor: COLORS.surface,
  },
  qtyPresetActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  qtyPresetText: { fontSize: 13, fontWeight: '900', color: COLORS.onSurface },
  qtyPresetTextActive: { color: COLORS.onPrimary },
  totalHint: { fontSize: 13, fontWeight: '700', color: COLORS.onSurfaceVariant },
  totalStrong: { fontWeight: '900', color: COLORS.onSurface },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  checkText: { flex: 1, fontSize: 15, fontWeight: '700', color: COLORS.onSurface },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.outlineVariant,
    backgroundColor: COLORS.surfaceContainerLow,
  },
  cancelButton: { borderRadius: radius.md },
  submitButton: { flex: 1, borderRadius: radius.md },
});
