import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Modal, Portal, Text, TextInput } from 'react-native-paper';
import { Popup } from '@/components/ui/AppPopup';
import { usePledgeDonation } from '@/hooks/useCampaigns';

interface Props {
  visible: boolean;
  /** UUID của chiến dịch nhận quyên góp. */
  campaignId: string;
  /** Tên chiến dịch (hiển thị nhắc người dùng). */
  campaignTitle?: string;
  /** Nguyên liệu đã chọn từ danh sách cần hỗ trợ; nếu có thì khóa tên món. */
  initialItem?: { name: string; unit?: string | null };
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
export function DonationDialog({ visible, campaignId, campaignTitle, initialItem, onDismiss }: Props) {
  const [itemName, setItemName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const pledgeMut = usePledgeDonation();
  const effectiveItemName = initialItem?.name ?? itemName;

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
    const name = effectiveItemName.trim();
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
    <Portal>
      <Modal
        visible={visible}
        onDismiss={handleDismiss}
        contentContainerStyle={styles.modal}
        dismissable={!pledgeMut.isPending}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={styles.title}>Quyên góp nguyên liệu</Text>
            {campaignTitle ? <Text style={styles.subtitle}>Cho chiến dịch: {campaignTitle}</Text> : null}

            <TextInput
              mode="outlined"
              label="Tên nguyên liệu"
              placeholder="VD: Gạo, Trứng, Rau cải..."
              value={effectiveItemName}
              onChangeText={setItemName}
              editable={!pledgeMut.isPending && !initialItem?.name}
              accessibilityLabel="Tên nguyên liệu bắt buộc"
              style={styles.input}
            />
            <TextInput
              mode="outlined"
              label="Số lượng"
              placeholder={initialItem?.unit ? `VD: 20 ${initialItem.unit}` : 'VD: 20 kg, 10 thùng...'}
              value={quantity}
              onChangeText={setQuantity}
              editable={!pledgeMut.isPending}
              accessibilityLabel="Số lượng quyên góp"
              style={styles.input}
            />
            <TextInput
              mode="outlined"
              label="Ghi chú"
              placeholder="Thông tin giao nhận, chất lượng, thời gian có thể giao..."
              value={note}
              onChangeText={setNote}
              multiline
              numberOfLines={3}
              editable={!pledgeMut.isPending}
              accessibilityLabel="Ghi chú quyên góp"
              style={styles.input}
            />

            <View style={styles.actions}>
              <Button onPress={handleDismiss} textColor={COLORS.onSurfaceVariant} disabled={pledgeMut.isPending}>
                Huỷ
              </Button>
              <Button
                mode="contained"
                onPress={handleSubmit}
                buttonColor={COLORS.primary}
                loading={pledgeMut.isPending}
                disabled={pledgeMut.isPending || !effectiveItemName.trim()}
              >
                Gửi quyên góp
              </Button>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  modal: {
    marginHorizontal: 18,
    maxHeight: '88%',
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    padding: 18,
  },
  title: { fontSize: 18, fontWeight: '700', color: COLORS.onSurface },
  subtitle: { fontSize: 13, color: COLORS.onSurfaceVariant, marginBottom: 12 },
  input: { marginBottom: 12, backgroundColor: COLORS.surface },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8 },
});
