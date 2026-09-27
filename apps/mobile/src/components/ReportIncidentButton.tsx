import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Dialog, Portal, Text, TextInput } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useReportCampaignIncident, type IncidentContext } from '@/hooks/useCampaigns';
import { getErrorMessage } from '@/hooks/useErrorHandler';
import { captureImage, type CapturedImage } from '@/services/faceCapture';
import { notifyError, notifySuccess } from '@/services/haptics';
import { Popup } from '@/components/ui/AppPopup';
import { AppImage } from '@/components/ui/AppImage';
import { mobileColors as COLORS, radius } from '@/theme/design';

/** Cùng bộ mã với BE (campaign-incidents.service.ts). 'other' = nhập tay, bắt buộc mô tả. */
const REASONS: Record<IncidentContext, { code: string; label: string; icon: string }[]> = {
  pickup: [
    { code: 'provider_closed', label: 'NCC đóng cửa / không liên lạc được', icon: 'store-off-outline' },
    { code: 'provider_shortage', label: 'NCC thiếu hàng, không đủ số lượng', icon: 'package-variant-remove' },
    { code: 'bad_quality', label: 'Nguyên liệu kém chất lượng / hư hỏng', icon: 'alert-decagram-outline' },
    { code: 'vehicle_broken', label: 'Xe hỏng giữa đường', icon: 'car-wrench' },
    { code: 'traffic_weather', label: 'Kẹt xe, mưa ngập — sẽ đến trễ', icon: 'weather-pouring' },
    { code: 'accident', label: 'Gặp tai nạn / va chạm', icon: 'car-emergency' },
    { code: 'other', label: 'Sự cố khác (nhập tay)', icon: 'pencil-outline' },
  ],
  distribution: [
    { code: 'food_damaged', label: 'Suất ăn bị đổ, hỏng trên đường', icon: 'food-off-outline' },
    { code: 'point_unavailable', label: 'Không vào được điểm phát / bị cấm tụ tập', icon: 'map-marker-off-outline' },
    { code: 'crowd_disorder', label: 'Quá đông người, mất trật tự', icon: 'account-group-outline' },
    { code: 'vehicle_broken', label: 'Xe hỏng giữa đường', icon: 'car-wrench' },
    { code: 'traffic_weather', label: 'Kẹt xe, mưa ngập — sẽ đến trễ', icon: 'weather-pouring' },
    { code: 'accident', label: 'Gặp tai nạn / va chạm', icon: 'car-emergency' },
    { code: 'other', label: 'Sự cố khác (nhập tay)', icon: 'pencil-outline' },
  ],
};

/**
 * Nút "Báo sự cố" cho shipper khi đi lấy nguyên liệu / đi phát suất ăn của CHIẾN DỊCH.
 * Không dùng cho luồng giao hàng đơn lẻ.
 */
export function ReportIncidentButton({
  campaignId,
  context,
  referenceId,
  subject,
}: {
  campaignId: string;
  context: IncidentContext;
  referenceId?: string;
  subject?: string;
}) {
  const report = useReportCampaignIncident();
  const [open, setOpen] = useState(false);
  const [reasonCode, setReasonCode] = useState('');
  const [detail, setDetail] = useState('');
  const [photo, setPhoto] = useState<CapturedImage | null>(null);
  // null = chưa chọn — bắt shipper nói rõ còn đi tiếp được không.
  const [canContinue, setCanContinue] = useState<boolean | null>(null);
  const [delayMinutes, setDelayMinutes] = useState(0);

  const reset = () => {
    setReasonCode('');
    setDetail('');
    setPhoto(null);
    setCanContinue(null);
    setDelayMinutes(0);
  };

  const close = () => {
    if (report.isPending) return;
    setOpen(false);
    reset();
  };

  const takePhoto = async () => {
    try {
      const p = await captureImage('id_card', 'proof');
      if (p) setPhoto(p);
    } catch (error) {
      Popup.show({ type: 'error', text1: 'Không chụp được ảnh', text2: getErrorMessage(error) });
    }
  };

  const submit = async () => {
    if (!reasonCode) {
      Popup.show({ type: 'warning', text1: 'Chọn loại sự cố' });
      return;
    }
    if (reasonCode === 'other' && !detail.trim()) {
      Popup.show({ type: 'warning', text1: 'Mô tả ngắn sự cố bạn đang gặp' });
      return;
    }
    if (canContinue === null) {
      Popup.show({ type: 'warning', text1: 'Cho biết bạn còn tiếp tục được không' });
      return;
    }
    try {
      await report.mutateAsync({
        campaignId,
        context,
        referenceId,
        reasonCode,
        detail,
        photo,
        canContinue,
        delayMinutes: canContinue ? delayMinutes : undefined,
      });
      void notifySuccess();
      Popup.show({
        type: 'success',
        text1: canContinue ? 'Đã báo sự cố' : 'Đã báo sự cố và trả việc',
        text2: canContinue ? 'Tổ chức đã nhận được thông báo.' : 'Tổ chức sẽ đổi người khác thay bạn.',
      });
      setOpen(false);
      reset();
    } catch (error) {
      void notifyError();
      Popup.show({ type: 'error', text1: 'Không gửi được báo cáo', text2: getErrorMessage(error) });
    }
  };

  return (
    <>
      <Button compact mode="outlined" icon="alert-octagon-outline" textColor={COLORS.error} style={styles.trigger} onPress={() => setOpen(true)}>
        Báo sự cố
      </Button>
      <Portal>
        <Dialog visible={open} onDismiss={close}>
          <Dialog.Title>Báo sự cố</Dialog.Title>
          <Dialog.ScrollArea style={styles.scrollArea}>
            <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
              {subject ? <Text style={styles.subject}>{subject}</Text> : null}
              <Text style={styles.label}>Chuyện gì đang xảy ra? *</Text>
              {REASONS[context].map((r) => {
                const active = reasonCode === r.code;
                return (
                  <Pressable
                    key={r.code}
                    onPress={() => setReasonCode(r.code)}
                    style={[styles.reason, active && styles.reasonActive]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                  >
                    <MaterialCommunityIcons name={r.icon as never} size={18} color={active ? COLORS.error : COLORS.onSurfaceVariant} />
                    <Text style={[styles.reasonText, active && styles.reasonTextActive]}>{r.label}</Text>
                  </Pressable>
                );
              })}
              <Text style={styles.label}>Bạn còn tiếp tục được không? *</Text>
              <View style={styles.choiceRow}>
                <Pressable
                  onPress={() => setCanContinue(true)}
                  style={[styles.choice, canContinue === true && styles.choiceGo]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: canContinue === true }}
                >
                  <Text style={[styles.choiceTitle, canContinue === true && styles.choiceTitleGo]}>Vẫn tiếp tục</Text>
                  <Text style={styles.choiceSub}>Chỉ báo, có thể trễ</Text>
                </Pressable>
                <Pressable
                  onPress={() => setCanContinue(false)}
                  style={[styles.choice, canContinue === false && styles.choiceStop]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: canContinue === false }}
                >
                  <Text style={[styles.choiceTitle, canContinue === false && styles.choiceTitleStop]}>Không thể tiếp tục</Text>
                  <Text style={styles.choiceSub}>Trả việc cho tổ chức</Text>
                </Pressable>
              </View>
              {canContinue === true ? (
                <View style={styles.delayRow}>
                  {[0, 15, 30, 60].map((m) => (
                    <Pressable
                      key={m}
                      onPress={() => setDelayMinutes(m)}
                      style={[styles.delay, delayMinutes === m && styles.delayActive]}
                    >
                      <Text style={[styles.delayText, delayMinutes === m && styles.delayTextActive]}>
                        {m === 0 ? 'Không trễ' : `Trễ ${m}'`}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              {canContinue === false ? (
                <Text style={styles.stopHint}>
                  Việc này được gỡ khỏi danh sách của bạn và trở về chờ tổ chức phân công người khác. Báo sự cố hợp lệ không bị trừ uy tín.
                </Text>
              ) : null}
              <TextInput
                mode="outlined"
                label={reasonCode === 'other' ? 'Mô tả sự cố *' : 'Mô tả thêm (tuỳ chọn)'}
                value={detail}
                onChangeText={setDetail}
                multiline
                numberOfLines={3}
                maxLength={500}
                style={styles.input}
              />
              <View style={styles.photoRow}>
                {photo ? <AppImage source={{ uri: photo.uri }} style={styles.photo} /> : null}
                <Button compact icon="camera" onPress={takePhoto} disabled={report.isPending}>
                  {photo ? 'Chụp lại' : 'Chụp ảnh hiện trường'}
                </Button>
              </View>
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={close} disabled={report.isPending}>Huỷ</Button>
            <Button mode="contained" buttonColor={COLORS.error} loading={report.isPending} disabled={report.isPending} onPress={submit}>
              Gửi báo cáo
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: { borderColor: COLORS.error },
  scrollArea: { paddingHorizontal: 0, maxHeight: 460 },
  body: { paddingHorizontal: 20, paddingVertical: 8, gap: 8 },
  subject: { fontSize: 13, fontWeight: '700', color: COLORS.onSurface },
  label: { fontSize: 12, fontWeight: '800', color: COLORS.onSurfaceVariant },
  reason: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: COLORS.outline,
  },
  reasonActive: { borderColor: COLORS.error, backgroundColor: '#FEF2F2' },
  reasonText: { flex: 1, fontSize: 13, color: COLORS.onSurface },
  reasonTextActive: { fontWeight: '700', color: COLORS.error },
  input: { marginTop: 4 },
  choiceRow: { flexDirection: 'row', gap: 8 },
  choice: { flex: 1, padding: 10, borderRadius: radius.md, borderWidth: 1, borderColor: COLORS.outline },
  choiceGo: { borderColor: COLORS.success, backgroundColor: '#ECFDF5' },
  choiceStop: { borderColor: COLORS.error, backgroundColor: '#FEF2F2' },
  choiceTitle: { fontSize: 13, fontWeight: '700', color: COLORS.onSurface },
  choiceTitleGo: { color: COLORS.success },
  choiceTitleStop: { color: COLORS.error },
  choiceSub: { marginTop: 2, fontSize: 11, color: COLORS.onSurfaceVariant },
  delayRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  delay: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: COLORS.outline },
  delayActive: { backgroundColor: COLORS.success, borderColor: COLORS.success },
  delayText: { fontSize: 12, fontWeight: '700', color: COLORS.onSurfaceVariant },
  delayTextActive: { color: '#FFFFFF' },
  stopHint: { fontSize: 12, lineHeight: 17, fontWeight: '600', color: COLORS.error },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  photo: { width: 56, height: 56, borderRadius: radius.sm },
});
