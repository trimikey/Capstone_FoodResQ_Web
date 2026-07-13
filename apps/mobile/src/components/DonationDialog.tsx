import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetTextInput,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { Button, Text } from 'react-native-paper';
import { Popup } from '@/components/ui/AppPopup';
import { usePledgeDonation } from '@/hooks/useCampaigns';

interface Props {
  visible: boolean;
  /** UUID của chiến dịch nhận quyên góp. */
  campaignId: string;
  /** Tên chiến dịch (hiển thị nhắc người dùng). */
  campaignTitle?: string;
  onDismiss: () => void;
}

const COLORS = {
  primary: '#10b981',
  surface: '#ffffff',
  onSurface: '#121c2a',
  onSurfaceVariant: '#6b7280',
  outline: '#e5e7eb',
};

/**
 * Provider quyên góp nguyên liệu cho 1 chiến dịch bếp ăn.
 * itemName bắt buộc; quantity + note tuỳ chọn. POST /campaigns/:id/donations.
 */
export function DonationDialog({ visible, campaignId, campaignTitle, onDismiss }: Props) {
  const sheetRef = useRef<BottomSheetModal>(null);
  const snapPoints = useMemo(() => ['CONTENT_HEIGHT'], []);
  const [itemName, setItemName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const pledgeMut = usePledgeDonation();

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
    setItemName('');
    setQuantity('');
    setNote('');
  };

  const handleDismiss = () => {
    if (pledgeMut.isPending) return;
    reset();
    onDismiss();
  };

  const handleSubmit = async () => {
    const name = itemName.trim();
    if (!name) return;
    try {
      await pledgeMut.mutateAsync({
        campaignId,
        itemName: name,
        ...(quantity.trim() ? { quantity: quantity.trim() } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      Popup.show({
        type: 'success',
        text1: 'Đã gửi quyên góp',
        text2: 'Tổ chức sẽ xác nhận khi nhận được nguyên liệu.',
      });
      reset();
      onDismiss();
    } catch (e: any) {
      Popup.show({
        type: 'error',
        text1: 'Quyên góp thất bại',
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
      accessibilityLabel="Quyên góp nguyên liệu"
    >
      <BottomSheetView style={styles.sheet}>
        <Text style={styles.title}>Quyên góp nguyên liệu</Text>
        <View>
          {campaignTitle ? (
            <Text style={styles.subtitle}>Cho chiến dịch: {campaignTitle}</Text>
          ) : null}
          <BottomSheetTextInput
            placeholder="VD: Gạo, Trứng, Rau cải…"
            value={itemName}
            onChangeText={setItemName}
            style={styles.input}
            editable={!pledgeMut.isPending}
            accessibilityLabel="Tên nguyên liệu bắt buộc"
          />
          <BottomSheetTextInput
            placeholder="VD: 20 kg, 10 thùng…"
            value={quantity}
            onChangeText={setQuantity}
            style={styles.input}
            editable={!pledgeMut.isPending}
            accessibilityLabel="Số lượng quyên góp"
          />
          <BottomSheetTextInput
            placeholder="Ghi chú (tuỳ chọn)"
            value={note}
            onChangeText={setNote}
            multiline
            numberOfLines={2}
            style={styles.input}
            editable={!pledgeMut.isPending}
            accessibilityLabel="Ghi chú quyên góp"
          />
        </View>
        <View style={styles.actions}>
          <Button onPress={handleDismiss} textColor={COLORS.onSurfaceVariant} disabled={pledgeMut.isPending}>
            Huỷ
          </Button>
          <Button
            mode="contained"
            onPress={handleSubmit}
            buttonColor={COLORS.primary}
            loading={pledgeMut.isPending}
            disabled={pledgeMut.isPending || !itemName.trim()}
          >
            Gửi quyên góp
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
  subtitle: { fontSize: 13, color: COLORS.onSurfaceVariant, marginBottom: 12 },
  input: {
    minHeight: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.outline,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    color: COLORS.onSurface,
  },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8 },
});
