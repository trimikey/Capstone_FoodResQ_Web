import { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Portal, Dialog, Button, TextInput, Text, Chip } from 'react-native-paper';
import { Popup } from '@/components/ui/AppPopup';
import { useCreateReport, type ReportReason } from '@/hooks/useReports';

interface Props {
  visible: boolean;
  /** UUID của listing bị báo cáo. */
  listingId: string;
  onDismiss: () => void;
}

const COLORS = {
  primary: '#10b981',
  danger: '#ef4444',
  surface: '#ffffff',
  onSurface: '#121c2a',
  onSurfaceVariant: '#6b7280',
  outline: '#e5e7eb',
};

const REASONS: { value: ReportReason; label: string }[] = [
  { value: 'spoiled_food', label: 'Thực phẩm hỏng/ôi thiu' },
  { value: 'unsafe_food', label: 'Thực phẩm không an toàn' },
  { value: 'no_show_provider', label: 'Nhà cung cấp không có mặt' },
  { value: 'fraud', label: 'Gian lận / sai mô tả' },
  { value: 'other', label: 'Khác' },
];

/** Báo cáo vấn đề về một listing (gửi tới đội ngũ quản trị). */
export function ReportDialog({ visible, listingId, onDismiss }: Props) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [description, setDescription] = useState('');
  const reportMut = useCreateReport();

  const reset = () => {
    setReason(null);
    setDescription('');
  };

  const handleDismiss = () => {
    if (reportMut.isPending) return;
    reset();
    onDismiss();
  };

  const handleSubmit = async () => {
    if (!reason) return;
    try {
      await reportMut.mutateAsync({
        targetType: 'listing',
        targetId: listingId,
        reason,
        ...(description.trim() ? { description: description.trim() } : {}),
      });
      Popup.show({ type: 'success', text1: 'Đã gửi báo cáo', text2: 'Đội ngũ quản trị sẽ xem xét.' });
      reset();
      onDismiss();
    } catch (e: any) {
      Popup.show({
        type: 'error',
        text1: 'Gửi báo cáo thất bại',
        text2: e?.response?.data?.error?.message ?? 'Vui lòng thử lại.',
      });
    }
  };

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={handleDismiss} style={styles.dialog}>
        <Dialog.Title style={styles.title}>Báo cáo vấn đề</Dialog.Title>
        <Dialog.Content>
          <Text style={styles.label}>Lý do</Text>
          <View style={styles.chips}>
            {REASONS.map((r) => (
              <Chip
                key={r.value}
                selected={reason === r.value}
                showSelectedCheck
                onPress={() => setReason(r.value)}
                selectedColor={COLORS.danger}
                style={styles.chip}
              >
                {r.label}
              </Chip>
            ))}
          </View>
          <TextInput
            mode="outlined"
            placeholder="Mô tả chi tiết (tuỳ chọn)"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
            outlineColor={COLORS.outline}
            activeOutlineColor={COLORS.primary}
            style={styles.input}
            disabled={reportMut.isPending}
          />
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={handleDismiss} textColor={COLORS.onSurfaceVariant} disabled={reportMut.isPending}>
            Huỷ
          </Button>
          <Button
            mode="contained"
            onPress={handleSubmit}
            buttonColor={COLORS.danger}
            loading={reportMut.isPending}
            disabled={reportMut.isPending || !reason}
          >
            Gửi báo cáo
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  dialog: { borderRadius: 20 },
  title: { fontSize: 18, fontWeight: '700', color: COLORS.onSurface },
  label: { fontSize: 13, fontWeight: '600', color: COLORS.onSurfaceVariant, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  chip: { marginBottom: 4 },
  input: { backgroundColor: COLORS.surface },
});
