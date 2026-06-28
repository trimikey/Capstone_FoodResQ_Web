import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { Portal, Dialog, Button, TextInput, Text } from 'react-native-paper';
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
  const [itemName, setItemName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const pledgeMut = usePledgeDonation();

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
    <Portal>
      <Dialog visible={visible} onDismiss={handleDismiss} style={styles.dialog}>
        <Dialog.Title style={styles.title}>Quyên góp nguyên liệu</Dialog.Title>
        <Dialog.Content>
          {campaignTitle ? (
            <Text style={styles.subtitle}>Cho chiến dịch: {campaignTitle}</Text>
          ) : null}
          <TextInput
            mode="outlined"
            label="Tên nguyên liệu *"
            placeholder="VD: Gạo, Trứng, Rau cải…"
            value={itemName}
            onChangeText={setItemName}
            outlineColor={COLORS.outline}
            activeOutlineColor={COLORS.primary}
            style={styles.input}
            disabled={pledgeMut.isPending}
          />
          <TextInput
            mode="outlined"
            label="Số lượng (tuỳ chọn)"
            placeholder="VD: 20 kg, 10 thùng…"
            value={quantity}
            onChangeText={setQuantity}
            outlineColor={COLORS.outline}
            activeOutlineColor={COLORS.primary}
            style={styles.input}
            disabled={pledgeMut.isPending}
          />
          <TextInput
            mode="outlined"
            label="Ghi chú (tuỳ chọn)"
            value={note}
            onChangeText={setNote}
            multiline
            numberOfLines={2}
            outlineColor={COLORS.outline}
            activeOutlineColor={COLORS.primary}
            style={styles.input}
            disabled={pledgeMut.isPending}
          />
        </Dialog.Content>
        <Dialog.Actions>
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
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  dialog: { borderRadius: 20 },
  title: { fontSize: 18, fontWeight: '700', color: COLORS.onSurface },
  subtitle: { fontSize: 13, color: COLORS.onSurfaceVariant, marginBottom: 12 },
  input: { backgroundColor: COLORS.surface, marginBottom: 12 },
});
