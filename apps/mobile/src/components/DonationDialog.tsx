import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Modal, Portal, Text, TextInput } from 'react-native-paper';
import { Popup } from '@/components/ui/AppPopup';
import { usePledgeDonation, type SupplyProgressItem } from '@/hooks/useCampaigns';

interface Props {
  visible: boolean;
  /** UUID của chiến dịch nhận quyên góp. */
  campaignId: string;
  /** Tên chiến dịch (hiển thị nhắc người dùng). */
  campaignTitle?: string;
  /** Nguyên liệu đã chọn từ danh sách cần hỗ trợ; nếu có thì khóa tên món. */
  initialItem?: { name: string; unit?: string | null };
  /** Tiến độ nguyên liệu do backend tính và validate. */
  supplyProgress?: SupplyProgressItem[];
  onDismiss: () => void;
}

const COLORS = {
  primary: '#10b981',
  surface: '#ffffff',
  onSurface: '#121c2a',
  onSurfaceVariant: '#6b7280',
  outline: '#e5e7eb',
  successContainer: '#ecfdf5',
  warningContainer: '#fffbeb',
  danger: '#ef4444',
};

/**
 * Provider quyên góp nguyên liệu cho 1 chiến dịch bếp ăn.
 * itemName bắt buộc; quantity + note tuỳ chọn. POST /campaigns/:id/donations.
 */
export function DonationDialog({ visible, campaignId, campaignTitle, initialItem, supplyProgress = [], onDismiss }: Props) {
  const availableItems = useMemo(
    () => supplyProgress.filter((item) => item.remainingQuantity > 0),
    [supplyProgress],
  );
  const [selectedName, setSelectedName] = useState(initialItem?.name ?? availableItems[0]?.name ?? '');
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const pledgeMut = usePledgeDonation();
  const selectedItem = supplyProgress.find((item) => item.name === selectedName) ?? availableItems[0];
  const numericQuantity = Number(quantity.replace(',', '.'));
  const quantityValid =
    Number.isFinite(numericQuantity) &&
    numericQuantity > 0 &&
    !!selectedItem &&
    numericQuantity <= selectedItem.remainingQuantity;
  const quantityError =
    quantity.trim() && selectedItem && Number.isFinite(numericQuantity) && numericQuantity > selectedItem.remainingQuantity
      ? `Chỉ còn cần ${formatQuantity(selectedItem.remainingQuantity)} ${selectedItem.unit}`
      : quantity.trim() && (!Number.isFinite(numericQuantity) || numericQuantity <= 0)
        ? 'Nhập số lớn hơn 0'
        : '';

  const reset = () => {
    setSelectedName(initialItem?.name ?? availableItems[0]?.name ?? '');
    setQuantity('');
    setNote('');
  };

  const handleDismiss = () => {
    if (pledgeMut.isPending) return;
    reset();
    onDismiss();
  };

  const handleSubmit = async () => {
    if (!selectedItem || !quantityValid) return;
    try {
      await pledgeMut.mutateAsync({
        campaignId,
        itemName: selectedItem.name,
        quantity: Math.round(numericQuantity * 1000) / 1000,
        unit: selectedItem.unit,
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

            {supplyProgress.length === 0 ? (
              <View style={styles.noticeBox}>
                <Text style={styles.noticeTitle}>Chưa có mục tiêu nguyên liệu định lượng</Text>
                <Text style={styles.noticeText}>
                  Tổ chức cần khai báo nguyên liệu, số lượng và đơn vị trước khi provider đóng góp.
                </Text>
              </View>
            ) : availableItems.length === 0 ? (
              <View style={[styles.noticeBox, styles.successBox]}>
                <Text style={styles.noticeTitle}>Đã đủ chỉ tiêu nguyên liệu</Text>
                <Text style={styles.noticeText}>Tất cả vật phẩm đã có đủ cam kết đóng góp.</Text>
              </View>
            ) : (
              <View style={styles.itemList}>
                {availableItems.map((item) => {
                  const selected = item.name === selectedItem?.name;
                  return (
                    <Pressable
                      key={item.name}
                      style={[styles.itemOption, selected && styles.itemOptionSelected]}
                      onPress={() => setSelectedName(item.name)}
                      disabled={pledgeMut.isPending || !!initialItem?.name}
                      accessibilityRole="button"
                    >
                      <View style={{ flex: 1 }}>
                        <View style={styles.itemHeader}>
                          <Text style={styles.itemName}>{item.name}</Text>
                          <Text style={styles.itemRemaining}>
                            Còn {formatQuantity(item.remainingQuantity)} {item.unit}
                          </Text>
                        </View>
                        <View style={styles.progressTrack}>
                          <View style={[styles.progressFill, { width: `${item.progressPercent}%` }]} />
                        </View>
                        <Text style={styles.itemMeta}>
                          Mục tiêu {formatQuantity(item.targetQuantity)} {item.unit} · Đã cam kết{' '}
                          {formatQuantity(item.pledgedQuantity)} · Đã nhận {formatQuantity(item.receivedQuantity)}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}

            <TextInput
              mode="outlined"
              label={selectedItem ? `Số lượng (${selectedItem.unit})` : 'Số lượng'}
              placeholder={selectedItem ? `Tối đa ${formatQuantity(selectedItem.remainingQuantity)} ${selectedItem.unit}` : 'Chọn nguyên liệu trước'}
              value={quantity}
              onChangeText={setQuantity}
              keyboardType="decimal-pad"
              editable={!pledgeMut.isPending && !!selectedItem}
              accessibilityLabel="Số lượng quyên góp"
              error={!!quantityError}
              style={styles.input}
            />
            {quantityError ? <Text style={styles.errorText}>{quantityError}</Text> : null}
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
                disabled={pledgeMut.isPending || !quantityValid}
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

function formatQuantity(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toLocaleString('vi-VN', { maximumFractionDigits: 3 });
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
  errorText: { marginTop: -8, marginBottom: 12, color: COLORS.danger, fontSize: 12, fontWeight: '600' },
  noticeBox: {
    borderWidth: 1,
    borderColor: COLORS.outline,
    borderRadius: 12,
    backgroundColor: COLORS.warningContainer,
    padding: 12,
    marginBottom: 12,
  },
  successBox: { backgroundColor: COLORS.successContainer },
  noticeTitle: { fontSize: 14, fontWeight: '800', color: COLORS.onSurface },
  noticeText: { marginTop: 4, fontSize: 12, lineHeight: 17, color: COLORS.onSurfaceVariant },
  itemList: { gap: 10, marginBottom: 12 },
  itemOption: {
    borderWidth: 1,
    borderColor: COLORS.outline,
    borderRadius: 14,
    padding: 12,
    backgroundColor: COLORS.surface,
  },
  itemOptionSelected: { borderColor: COLORS.primary, backgroundColor: COLORS.successContainer },
  itemHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemName: { flex: 1, color: COLORS.onSurface, fontSize: 14, fontWeight: '800' },
  itemRemaining: { color: COLORS.primary, fontSize: 12, fontWeight: '800' },
  progressTrack: {
    marginTop: 8,
    height: 7,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: COLORS.outline,
  },
  progressFill: { height: '100%', borderRadius: 999, backgroundColor: COLORS.primary },
  itemMeta: { marginTop: 6, color: COLORS.onSurfaceVariant, fontSize: 11, fontWeight: '600' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8 },
});
