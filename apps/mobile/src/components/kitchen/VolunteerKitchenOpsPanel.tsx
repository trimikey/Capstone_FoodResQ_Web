import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Chip, Dialog, Portal, Text, TextInput, ActivityIndicator } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafetyCheckResult, SafetyCheckType } from '@foodresq/types';
import {
  MealDistribution,
  useAddDistributionFeedback,
  useCreateDistribution,
  useCreateSafetyLog,
  useDistributionSummary,
  useDistributions,
  useSafetyLogs,
} from '@/hooks/useKitchenOps';
import { getErrorMessage } from '@/hooks/useErrorHandler';
import { Popup } from '@/components/ui/AppPopup';
import { AppImage } from '@/components/ui/AppImage';
import { captureImage, pickImageFromLibrary, type CapturedImage } from '@/services/faceCapture';
import { mobileColors as COLORS } from '@/theme/design';

const CHECK_TYPE_OPTIONS = [
  { value: SafetyCheckType.TEMPERATURE, label: 'Nhiệt độ' },
  { value: SafetyCheckType.HYGIENE, label: 'Vệ sinh' },
  { value: SafetyCheckType.STORAGE, label: 'Bảo quản' },
  { value: SafetyCheckType.CROSS_CONTAMINATION, label: 'Lây nhiễm chéo' },
  { value: SafetyCheckType.HANDWASHING, label: 'Rửa tay' },
  { value: SafetyCheckType.OTHER, label: 'Khác' },
];

const RESULT_OPTIONS = [
  { value: SafetyCheckResult.PASS, label: 'Đạt', color: COLORS.success },
  { value: SafetyCheckResult.WARNING, label: 'Cảnh báo', color: COLORS.warning },
  { value: SafetyCheckResult.FAIL, label: 'Không đạt', color: COLORS.error },
];

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function parseNonNegativeInt(value: string) {
  const n = Number.parseInt(value.trim(), 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function pickLabel<T extends string>(items: { value: T; label: string }[], value: T) {
  return items.find((item) => item.value === value)?.label ?? value;
}

interface Props {
  campaignId: string;
  isChef: boolean;
  isWaiter: boolean;
}

export function VolunteerKitchenOpsPanel({ campaignId, isChef, isWaiter }: Props) {
  const [safetyOpen, setSafetyOpen] = useState(false);
  const [distOpen, setDistOpen] = useState(false);
  const [feedbackTarget, setFeedbackTarget] = useState<MealDistribution | null>(null);
  const [checkType, setCheckType] = useState<SafetyCheckType>(SafetyCheckType.TEMPERATURE);
  const [result, setResult] = useState<SafetyCheckResult>(SafetyCheckResult.PASS);
  const [measuredValue, setMeasuredValue] = useState('');
  const [safetyNote, setSafetyNote] = useState('');
  const [safetyPhoto, setSafetyPhoto] = useState<CapturedImage | null>(null);
  const [roundLabel, setRoundLabel] = useState('');
  const [servingsServed, setServingsServed] = useState('');
  const [peopleServed, setPeopleServed] = useState('');
  const [leftoverServings, setLeftoverServings] = useState('');
  const [distributionNote, setDistributionNote] = useState('');
  const [distributionPhoto, setDistributionPhoto] = useState<CapturedImage | null>(null);
  const [satisfaction, setSatisfaction] = useState(5);
  const [feedbackComment, setFeedbackComment] = useState('');

  const safetyLogs = useSafetyLogs(campaignId, isChef);
  const distributions = useDistributions(campaignId, isWaiter);
  const summary = useDistributionSummary(campaignId, isWaiter);
  const createSafetyLog = useCreateSafetyLog();
  const createDistribution = useCreateDistribution();
  const addFeedback = useAddDistributionFeedback();

  if (!isChef && !isWaiter) return null;

  const resetSafetyForm = () => {
    setCheckType(SafetyCheckType.TEMPERATURE);
    setResult(SafetyCheckResult.PASS);
    setMeasuredValue('');
    setSafetyNote('');
    setSafetyPhoto(null);
  };

  const resetDistributionForm = () => {
    setRoundLabel('');
    setServingsServed('');
    setPeopleServed('');
    setLeftoverServings('');
    setDistributionNote('');
    setDistributionPhoto(null);
  };

  const handlePickPhoto = async (target: 'safety' | 'distribution', camera: boolean) => {
    try {
      const photo = camera ? await captureImage('id_card', 'proof') : await pickImageFromLibrary('proof');
      if (!photo) return;
      if (target === 'safety') setSafetyPhoto(photo);
      else setDistributionPhoto(photo);
    } catch (err) {
      Popup.show({ type: 'error', text1: 'Không lấy được ảnh', text2: getErrorMessage(err) });
    }
  };

  const submitSafetyLog = async () => {
    if (!safetyPhoto) {
      Popup.show({ type: 'warning', text1: 'Cần ảnh ATTP', text2: 'Chụp hoặc chọn ảnh minh chứng trước khi gửi.' });
      return;
    }
    try {
      await createSafetyLog.mutateAsync({
        campaignId,
        checkType,
        result,
        measuredValue: measuredValue.trim() || undefined,
        note: safetyNote.trim() || undefined,
        photo: safetyPhoto,
      });
      Popup.show({ type: 'success', text1: 'Đã ghi nhật ký ATTP' });
      resetSafetyForm();
      setSafetyOpen(false);
    } catch (err) {
      Popup.show({ type: 'error', text1: 'Gửi nhật ký thất bại', text2: getErrorMessage(err) });
    }
  };

  const submitDistribution = async () => {
    const servings = parseNonNegativeInt(servingsServed);
    const people = parseNonNegativeInt(peopleServed);
    const leftover = leftoverServings.trim() ? parseNonNegativeInt(leftoverServings) : undefined;
    if (servings == null || people == null || leftover === null) {
      Popup.show({ type: 'warning', text1: 'Số liệu không hợp lệ', text2: 'Nhập số nguyên không âm cho các trường số.' });
      return;
    }
    if (!distributionPhoto) {
      Popup.show({ type: 'warning', text1: 'Cần ảnh phân phát', text2: 'Chụp hoặc chọn ảnh minh chứng trước khi gửi.' });
      return;
    }
    try {
      await createDistribution.mutateAsync({
        campaignId,
        roundLabel: roundLabel.trim() || undefined,
        servingsServed: servings,
        peopleServed: people,
        leftoverServings: leftover,
        note: distributionNote.trim() || undefined,
        photo: distributionPhoto,
      });
      Popup.show({ type: 'success', text1: 'Đã ghi đợt phân phát' });
      resetDistributionForm();
      setDistOpen(false);
    } catch (err) {
      Popup.show({ type: 'error', text1: 'Ghi phân phát thất bại', text2: getErrorMessage(err) });
    }
  };

  const submitFeedback = async () => {
    if (!feedbackTarget) return;
    try {
      await addFeedback.mutateAsync({
        campaignId,
        distId: feedbackTarget.id,
        satisfaction,
        comment: feedbackComment.trim() || undefined,
      });
      Popup.show({ type: 'success', text1: 'Đã gửi phản hồi' });
      setFeedbackTarget(null);
      setSatisfaction(5);
      setFeedbackComment('');
    } catch (err) {
      Popup.show({ type: 'error', text1: 'Gửi phản hồi thất bại', text2: getErrorMessage(err) });
    }
  };

  const summaryData = summary.data;
  const distItems = distributions.data ?? [];
  const safetyItems = safetyLogs.data ?? [];

  return (
    <View style={styles.wrap}>
      {isChef ? (
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <View>
              <Text style={styles.sectionTitle}>Nhật ký ATTP</Text>
              <Text style={styles.muted}>Chef ghi kiểm tra kèm ảnh</Text>
            </View>
            <Button mode="contained" compact icon="camera-plus" buttonColor={COLORS.primary} onPress={() => setSafetyOpen(true)}>
              Ghi
            </Button>
          </View>
          {safetyLogs.isLoading ? <ActivityIndicator color={COLORS.primary} /> : null}
          {safetyItems.length === 0 && !safetyLogs.isLoading ? <Text style={styles.empty}>Chưa có nhật ký.</Text> : null}
          {safetyItems.slice(0, 4).map((item) => (
            <View key={item.id} style={styles.row}>
              {item.photoUrl ? <AppImage source={{ uri: item.photoUrl }} style={styles.thumb} /> : <View style={styles.thumbFallback} />}
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle}>
                  {pickLabel(CHECK_TYPE_OPTIONS, item.checkType)} - {pickLabel(RESULT_OPTIONS, item.result)}
                </Text>
                <Text style={styles.muted}>
                  {item.measuredValue ? `${item.measuredValue} - ` : ''}{formatDateTime(item.checkedAt)}
                </Text>
                {item.note ? <Text style={styles.note} numberOfLines={2}>{item.note}</Text> : null}
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {isWaiter ? (
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <View>
              <Text style={styles.sectionTitle}>Phân phát suất ăn</Text>
              <Text style={styles.muted}>Waiter ghi đợt phát và phản hồi</Text>
            </View>
            <Button mode="contained" compact icon="silverware-fork-knife" buttonColor={COLORS.primary} onPress={() => setDistOpen(true)}>
              Ghi
            </Button>
          </View>
          <View style={styles.summaryRow}>
            <Metric label="Đợt" value={summaryData?.rounds ?? 0} />
            <Metric label="Suất" value={summaryData?.totalServings ?? 0} />
            <Metric label="Người" value={summaryData?.totalPeople ?? 0} />
            <Metric label="Dư" value={summaryData?.totalLeftover ?? 0} />
          </View>
          {distributions.isLoading || summary.isLoading ? <ActivityIndicator color={COLORS.primary} /> : null}
          {distItems.length === 0 && !distributions.isLoading ? <Text style={styles.empty}>Chưa có đợt phân phát.</Text> : null}
          {distItems.map((item) => (
            <View key={item.id} style={styles.row}>
              {item.photoUrl ? <AppImage source={{ uri: item.photoUrl }} style={styles.thumb} /> : <View style={styles.thumbFallback} />}
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle}>{item.roundLabel ?? 'Đợt phân phát'}</Text>
                <Text style={styles.muted}>
                  {item.servingsServed} suất - {item.peopleServed} người - dư {item.leftoverServings}
                </Text>
                <Text style={styles.muted}>{formatDateTime(item.distributedAt)} - {item.feedbackCount} phản hồi</Text>
              </View>
              <Pressable style={styles.iconButton} onPress={() => setFeedbackTarget(item)} hitSlop={8}>
                <MaterialCommunityIcons name="message-text-outline" size={20} color={COLORS.primary} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      <Portal>
        <Dialog visible={safetyOpen} onDismiss={() => setSafetyOpen(false)}>
          <Dialog.Title>Ghi nhật ký ATTP</Dialog.Title>
          <Dialog.ScrollArea>
            <ScrollView contentContainerStyle={styles.dialogBody}>
              <Text style={styles.fieldLabel}>Loại kiểm tra</Text>
              <View style={styles.chipRow}>
                {CHECK_TYPE_OPTIONS.map((item) => (
                  <Chip key={item.value} selected={checkType === item.value} onPress={() => setCheckType(item.value)}>
                    {item.label}
                  </Chip>
                ))}
              </View>
              <Text style={styles.fieldLabel}>Kết quả</Text>
              <View style={styles.chipRow}>
                {RESULT_OPTIONS.map((item) => (
                  <Chip key={item.value} selected={result === item.value} onPress={() => setResult(item.value)} textStyle={{ color: result === item.value ? item.color : COLORS.onSurface }}>
                    {item.label}
                  </Chip>
                ))}
              </View>
              <TextInput mode="outlined" label="Giá trị đo" value={measuredValue} onChangeText={setMeasuredValue} dense />
              <TextInput mode="outlined" label="Ghi chú" value={safetyNote} onChangeText={setSafetyNote} multiline numberOfLines={3} />
              <PhotoPicker photo={safetyPhoto} onCamera={() => handlePickPhoto('safety', true)} onLibrary={() => handlePickPhoto('safety', false)} />
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setSafetyOpen(false)}>Đóng</Button>
            <Button loading={createSafetyLog.isPending} disabled={createSafetyLog.isPending} onPress={submitSafetyLog}>Gửi</Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog visible={distOpen} onDismiss={() => setDistOpen(false)}>
          <Dialog.Title>Ghi phân phát</Dialog.Title>
          <Dialog.ScrollArea>
            <ScrollView contentContainerStyle={styles.dialogBody}>
              <TextInput mode="outlined" label="Tên đợt" value={roundLabel} onChangeText={setRoundLabel} dense />
              <View style={styles.inputGrid}>
                <TextInput mode="outlined" label="Suất phát" value={servingsServed} onChangeText={setServingsServed} keyboardType="number-pad" dense style={styles.inputHalf} />
                <TextInput mode="outlined" label="Người nhận" value={peopleServed} onChangeText={setPeopleServed} keyboardType="number-pad" dense style={styles.inputHalf} />
              </View>
              <TextInput mode="outlined" label="Suất dư" value={leftoverServings} onChangeText={setLeftoverServings} keyboardType="number-pad" dense />
              <TextInput mode="outlined" label="Ghi chú" value={distributionNote} onChangeText={setDistributionNote} multiline numberOfLines={3} />
              <PhotoPicker photo={distributionPhoto} onCamera={() => handlePickPhoto('distribution', true)} onLibrary={() => handlePickPhoto('distribution', false)} />
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setDistOpen(false)}>Đóng</Button>
            <Button loading={createDistribution.isPending} disabled={createDistribution.isPending} onPress={submitDistribution}>Gửi</Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog visible={!!feedbackTarget} onDismiss={() => setFeedbackTarget(null)}>
          <Dialog.Title>Phản hồi người thụ hưởng</Dialog.Title>
          <Dialog.Content style={styles.dialogBody}>
            <Text style={styles.fieldLabel}>Mức hài lòng</Text>
            <View style={styles.chipRow}>
              {[1, 2, 3, 4, 5].map((value) => (
                <Chip key={value} selected={satisfaction === value} onPress={() => setSatisfaction(value)}>
                  {value}
                </Chip>
              ))}
            </View>
            <TextInput mode="outlined" label="Nhận xét" value={feedbackComment} onChangeText={setFeedbackComment} multiline numberOfLines={3} />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setFeedbackTarget(null)}>Đóng</Button>
            <Button loading={addFeedback.isPending} disabled={addFeedback.isPending} onPress={submitFeedback}>Gửi</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function PhotoPicker({ photo, onCamera, onLibrary }: { photo: CapturedImage | null; onCamera: () => void; onLibrary: () => void }) {
  return (
    <View style={styles.photoBox}>
      {photo ? (
        <AppImage source={{ uri: photo.uri }} style={styles.photoPreview} />
      ) : (
        <View style={styles.photoEmpty}>
          <MaterialCommunityIcons name="image-plus" size={22} color={COLORS.onSurfaceVariant} />
          <Text style={styles.muted}>Cần ảnh minh chứng</Text>
        </View>
      )}
      <View style={styles.photoActions}>
        <Button mode="outlined" compact icon="camera" onPress={onCamera}>Chụp</Button>
        <Button mode="outlined" compact icon="image" onPress={onLibrary}>Thư viện</Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 20, gap: 18 },
  section: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.outline,
    padding: 14,
    gap: 10,
  },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: COLORS.onSurface },
  muted: { fontSize: 12, color: COLORS.onSurfaceVariant, lineHeight: 17 },
  empty: { fontSize: 13, color: COLORS.onSurfaceVariant, fontStyle: 'italic' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.outline,
  },
  thumb: { width: 52, height: 52, borderRadius: 10, backgroundColor: COLORS.surfaceVariant },
  thumbFallback: {
    width: 52,
    height: 52,
    borderRadius: 10,
    backgroundColor: COLORS.surfaceVariant,
    borderWidth: 1,
    borderColor: COLORS.outline,
  },
  rowBody: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 13, fontWeight: '700', color: COLORS.onSurface, marginBottom: 2 },
  note: { fontSize: 12, color: COLORS.onSurface, lineHeight: 17, marginTop: 2 },
  summaryRow: { flexDirection: 'row', gap: 8 },
  metric: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.outline,
    backgroundColor: COLORS.surfaceContainerLow,
    paddingVertical: 8,
    alignItems: 'center',
  },
  metricValue: { fontSize: 16, fontWeight: '800', color: COLORS.primary },
  metricLabel: { fontSize: 11, color: COLORS.onSurfaceVariant, marginTop: 1 },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primaryContainer,
  },
  dialogBody: { gap: 12 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: COLORS.onSurface },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  inputGrid: { flexDirection: 'row', gap: 10 },
  inputHalf: { flex: 1 },
  photoBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.outline,
    padding: 10,
    gap: 10,
    backgroundColor: COLORS.surfaceContainerLow,
  },
  photoEmpty: { height: 90, alignItems: 'center', justifyContent: 'center', gap: 6 },
  photoPreview: { height: 120, borderRadius: 10 },
  photoActions: { flexDirection: 'row', gap: 10 },
});
