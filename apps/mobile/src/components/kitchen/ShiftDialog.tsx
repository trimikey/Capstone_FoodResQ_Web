import { useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Portal, Dialog, Button, TextInput, Text, Chip } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useCreateShift } from '@/hooks/useKitchenOps';
import type { AssignmentRole } from '@/hooks/useCampaigns';
import { ASSIGNMENT_ROLE_LABEL } from '@/utils/campaign';
import { getErrorMessage } from '@/hooks/useErrorHandler';
import { Popup } from '@/components/ui/AppPopup';

interface Props {
  visible: boolean;
  campaignId: string;
  onDismiss: () => void;
}

const COLORS = {
  primary: '#10b981',
  surface: '#ffffff',
  onSurface: '#121c2a',
  onSurfaceVariant: '#6b7280',
  outline: '#e5e7eb',
};

const ROLES: AssignmentRole[] = ['chef', 'waiter', 'shipper'];
const pad = (n: number) => String(n).padStart(2, '0');
const toTimeStr = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** Charity tạo ca làm việc cho chiến dịch. startTime/endTime dạng 'HH:mm'. */
export function ShiftDialog({ visible, campaignId, onDismiss }: Props) {
  const createMut = useCreateShift();
  const [label, setLabel] = useState('');
  const [role, setRole] = useState<AssignmentRole | undefined>(undefined);
  const [slots, setSlots] = useState('2');
  const [start, setStart] = useState<Date>(() => {
    const d = new Date();
    d.setHours(6, 0, 0, 0);
    return d;
  });
  const [end, setEnd] = useState<Date>(() => {
    const d = new Date();
    d.setHours(10, 0, 0, 0);
    return d;
  });

  const reset = () => {
    setLabel('');
    setRole(undefined);
    setSlots('2');
  };

  const handleDismiss = () => {
    if (createMut.isPending) return;
    reset();
    onDismiss();
  };

  const handleSubmit = async () => {
    if (label.trim().length < 2) {
      Popup.show({ type: 'warning', text1: 'Tên ca quá ngắn', text2: 'Tối thiểu 2 ký tự.' });
      return;
    }
    if (toTimeStr(end) <= toTimeStr(start)) {
      Popup.show({ type: 'warning', text1: 'Giờ không hợp lệ', text2: 'Giờ kết thúc phải sau giờ bắt đầu.' });
      return;
    }
    const n = parseInt(slots, 10);
    try {
      await createMut.mutateAsync({
        campaignId,
        label: label.trim(),
        ...(role ? { role } : {}),
        startTime: toTimeStr(start),
        endTime: toTimeStr(end),
        slotsNeeded: Number.isFinite(n) && n > 0 ? n : 0,
      });
      Popup.show({ type: 'success', text1: 'Đã tạo ca làm việc' });
      reset();
      onDismiss();
    } catch (err) {
      Popup.show({ type: 'error', text1: 'Tạo ca thất bại', text2: getErrorMessage(err) });
    }
  };

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={handleDismiss} style={styles.dialog}>
        <Dialog.Title style={styles.title}>Tạo ca làm việc</Dialog.Title>
        <Dialog.Content>
          <TextInput
            mode="outlined" label="Tên ca *" placeholder="VD: Ca sáng - Sơ chế & nấu"
            value={label} onChangeText={setLabel}
            outlineColor={COLORS.outline} activeOutlineColor={COLORS.primary}
            style={styles.input} disabled={createMut.isPending}
          />

          <Text style={styles.fieldLabel}>Dành cho vai trò (tuỳ chọn)</Text>
          <View style={styles.chips}>
            <Chip
              selected={!role} showSelectedCheck={false} onPress={() => setRole(undefined)}
              style={[styles.chip, !role && styles.chipActive]}
              textStyle={!role ? styles.chipTextActive : undefined}
            >
              Chung
            </Chip>
            {ROLES.map((r) => (
              <Chip
                key={r} selected={role === r} showSelectedCheck={false} onPress={() => setRole(r)}
                style={[styles.chip, role === r && styles.chipActive]}
                textStyle={role === r ? styles.chipTextActive : undefined}
              >
                {ASSIGNMENT_ROLE_LABEL[r]}
              </Chip>
            ))}
          </View>

          <View style={styles.timeRow}>
            <TimeBtn label="Bắt đầu" value={toTimeStr(start)} onPress={() =>
              DateTimePickerAndroid.open({ value: start, mode: 'time', is24Hour: true, onChange: (_e, d) => d && setStart(d) })
            } />
            <TimeBtn label="Kết thúc" value={toTimeStr(end)} onPress={() =>
              DateTimePickerAndroid.open({ value: end, mode: 'time', is24Hour: true, onChange: (_e, d) => d && setEnd(d) })
            } />
          </View>

          <TextInput
            mode="outlined" label="Số người cần" keyboardType="numeric"
            value={slots} onChangeText={setSlots}
            outlineColor={COLORS.outline} activeOutlineColor={COLORS.primary}
            style={styles.input} disabled={createMut.isPending}
          />
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={handleDismiss} textColor={COLORS.onSurfaceVariant} disabled={createMut.isPending}>
            Huỷ
          </Button>
          <Button mode="contained" buttonColor={COLORS.primary} onPress={handleSubmit}
            loading={createMut.isPending} disabled={createMut.isPending || !label.trim()}>
            Tạo ca
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

function TimeBtn({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Pressable onPress={onPress} style={styles.timeBtn}>
        <MaterialCommunityIcons name="clock-outline" size={18} color={COLORS.onSurfaceVariant} />
        <Text style={styles.timeText}>{value}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  dialog: { borderRadius: 20 },
  title: { fontSize: 18, fontWeight: '700', color: COLORS.onSurface },
  input: { backgroundColor: COLORS.surface, marginBottom: 12 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: COLORS.onSurfaceVariant, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  chip: { backgroundColor: COLORS.surface, borderColor: COLORS.outline },
  chipActive: { backgroundColor: COLORS.primary },
  chipTextActive: { color: '#fff', fontWeight: '700' },
  timeRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  timeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 12,
    backgroundColor: COLORS.surface, borderRadius: 8, borderWidth: 1, borderColor: COLORS.outline,
  },
  timeText: { fontSize: 15, color: COLORS.onSurface },
});
