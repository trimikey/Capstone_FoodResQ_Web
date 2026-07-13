import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetTextInput,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { Button, Text, Chip } from 'react-native-paper';
import { Popup } from '@/components/ui/AppPopup';
import { useCreateReport, type ReportReason, type ReportTargetType } from '@/hooks/useReports';

interface Props {
  visible: boolean;
  onDismiss: () => void;
  /** Loại mục tiêu báo cáo (listing/delivery/...). Mặc định 'listing'. */
  targetType?: ReportTargetType;
  /** UUID mục tiêu báo cáo. Ưu tiên dùng cùng targetType. */
  targetId?: string;
  /** @deprecated Dùng targetType='listing' + targetId. Giữ để tương thích call site cũ. */
  listingId?: string;
  /** Tiêu đề tuỳ chỉnh (mặc định "Báo cáo vấn đề"). */
  title?: string;
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

/** Báo cáo vấn đề (listing/delivery/...) — gửi tới đội ngũ quản trị. */
export function ReportDialog({
  visible,
  onDismiss,
  targetType = 'listing',
  targetId,
  listingId,
  title = 'Báo cáo vấn đề',
}: Props) {
  const sheetRef = useRef<BottomSheetModal>(null);
  const snapPoints = useMemo(() => ['CONTENT_HEIGHT'], []);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [description, setDescription] = useState('');
  const reportMut = useCreateReport();
  const effectiveTargetId = targetId ?? listingId;

  useEffect(() => {
    if (visible) sheetRef.current?.present();
    else sheetRef.current?.dismiss();
  }, [visible]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} pressBehavior="close" />
    ),
    []
  );

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
    if (!reason || !effectiveTargetId) return;
    try {
      await reportMut.mutateAsync({
        targetType,
        targetId: effectiveTargetId,
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
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={snapPoints}
      enableDynamicSizing
      backdropComponent={renderBackdrop}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      onDismiss={handleDismiss}
      handleIndicatorStyle={styles.handle}
      accessibilityLabel={title}
    >
      <BottomSheetView style={styles.sheet}>
        <Text style={styles.title}>{title}</Text>
        <View>
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
                accessibilityLabel={`Lý do báo cáo: ${r.label}`}
              >
                {r.label}
              </Chip>
            ))}
          </View>
          <BottomSheetTextInput
            placeholder="Mô tả chi tiết (tuỳ chọn)"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
            style={styles.input}
            editable={!reportMut.isPending}
            accessibilityLabel="Mô tả chi tiết báo cáo"
          />
        </View>
        <View style={styles.actions}>
          <Button onPress={handleDismiss} textColor={COLORS.onSurfaceVariant} disabled={reportMut.isPending}>
            Huỷ
          </Button>
          <Button
            mode="contained"
            onPress={handleSubmit}
            buttonColor={COLORS.danger}
            loading={reportMut.isPending}
            disabled={reportMut.isPending || !reason || !effectiveTargetId}
          >
            Gửi báo cáo
          </Button>
        </View>
      </BottomSheetView>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  sheet: { paddingHorizontal: 20, paddingBottom: 28 },
  handle: { backgroundColor: COLORS.outline },
  title: { fontSize: 18, fontWeight: '700', color: COLORS.onSurface },
  label: { fontSize: 13, fontWeight: '600', color: COLORS.onSurfaceVariant, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  chip: { marginBottom: 4 },
  input: {
    minHeight: 88,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.outline,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COLORS.onSurface,
    textAlignVertical: 'top',
  },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 12 },
});
