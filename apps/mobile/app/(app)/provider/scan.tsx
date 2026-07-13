import { useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Button, TextInput, ActivityIndicator, Divider } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useScanQr, useConfirmPickup, type ScanResult } from '@/hooks/useProviderScan';
import { getErrorMessage } from '@/hooks/useErrorHandler';
import { Popup } from '@/components/ui/AppPopup';
import { AppImage } from '@/components/ui/AppImage';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { notifyError, notifySuccess, selectionFeedback } from '@/services/haptics';
import { mobileColors as COLORS } from '@/theme/design';

export default function ScanQrScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const scan = useScanQr();
  const confirm = useConfirmPickup();

  const [result, setResult] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState(false); // khoá khi đang gọi API
  const [manualToken, setManualToken] = useState('');
  const [torch, setTorch] = useState(false); // đèn flash

  const handleScan = async (token: string) => {
    if (scanning || !token) return;
    try {
      setScanning(true);
      const data = await scan.mutateAsync(token);
      void notifySuccess();
      setResult(data);
    } catch (err) {
      void notifyError();
      Popup.show({ type: 'error', text1: 'Quét thất bại', text2: getErrorMessage(err) });
    } finally {
      setScanning(false);
    }
  };

  const handleConfirm = async () => {
    if (!result) return;
    try {
      setScanning(true);
      await confirm.mutateAsync(result.id);
      void notifySuccess();
      Popup.show({ type: 'success', text1: 'Đã xác nhận giao hàng', text2: 'Đơn chuyển sang hoàn tất.' });
      reset();
    } catch (err) {
      void notifyError();
      Popup.show({ type: 'error', text1: 'Xác nhận thất bại', text2: getErrorMessage(err) });
    } finally {
      setScanning(false);
    }
  };

  const reset = () => {
    setResult(null);
    setManualToken('');
  };

  // ---- Màn đối chiếu sau khi quét ----
  if (result) {
    const r = result.receiver;
    const photo = r.faceImageUrl ?? r.avatarUrl ?? r.idCardImageUrl;
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Header />
        <ScrollView contentContainerStyle={styles.matchContent}>
          <Text variant="titleMedium" style={styles.matchTitle}>Đối chiếu người nhận</Text>
          {photo ? (
            <AppImage source={{ uri: photo }} style={styles.facePhoto} />
          ) : (
            <View style={[styles.facePhoto, styles.faceEmpty]}>
              <MaterialCommunityIcons name="account" size={64} color={COLORS.onSurfaceVariant} />
            </View>
          )}
          <Text variant="headlineSmall" style={styles.receiverName}>{r.fullName}</Text>
          {r.phone ? <Text style={styles.meta}>{r.phone}</Text> : null}
          <View style={[styles.enrollBadge, { backgroundColor: r.enrolled ? '#dcfce7' : '#fef3c7' }]}>
            <Text style={{ color: r.enrolled ? '#15803d' : '#b45309', fontWeight: '700', fontSize: 12 }}>
              {r.enrolled ? 'Đã đăng ký khuôn mặt' : 'Chưa đăng ký khuôn mặt'}
            </Text>
          </View>

          <Divider style={{ marginVertical: 16, width: '100%' }} />
          <Row label="Món" value={result.listing.title} />
          <Row label="Số lượng" value={`${result.quantity} ${result.listing.quantityUnit}`} />
          {r.idCardNumber ? <Row label="CCCD" value={r.idCardNumber} /> : null}

          <Button mode="contained" icon="check-bold" onPress={handleConfirm} loading={scanning} disabled={scanning}
            buttonColor={COLORS.primary} style={styles.confirmBtn} labelStyle={{ fontSize: 16, fontWeight: 'bold' }}>
            Xác nhận đã giao
          </Button>
          <Button mode="text" onPress={reset} textColor={COLORS.onSurfaceVariant}>Quét đơn khác</Button>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ---- Màn quét ----
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header />
      <ScrollView contentContainerStyle={styles.scanContent} keyboardShouldPersistTaps="handled">
        <View style={styles.cameraBox}>
          {!permission ? (
            <ActivityIndicator color={COLORS.primary} />
          ) : !permission.granted ? (
            <View style={styles.permWrap}>
              <MaterialCommunityIcons name="camera-off" size={48} color={COLORS.onSurfaceVariant} />
              <Text style={styles.permText}>Cần quyền camera để quét mã QR</Text>
              <Button mode="contained" buttonColor={COLORS.primary} onPress={requestPermission}>
                Cấp quyền camera
              </Button>
            </View>
          ) : (
            <>
              <CameraView
                style={StyleSheet.absoluteFill}
                facing="back"
                enableTorch={torch}
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={scanning ? undefined : ({ data }) => handleScan(data)}
              />
              <Pressable
                style={styles.torchBtn}
                onPress={() => {
                  void selectionFeedback();
                  setTorch((t) => !t);
                }}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={torch ? 'Tắt đèn flash' : 'Bật đèn flash'}
              >
                <MaterialCommunityIcons
                  name={torch ? 'flash' : 'flash-off'}
                  size={24}
                  color="#fff"
                />
              </Pressable>
            </>
          )}
          {scanning ? (
            <View style={styles.scanningOverlay}>
              <ActivityIndicator color="#fff" />
              <Text style={{ color: '#fff', marginTop: 8 }}>Đang xử lý…</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.hint}>Hướng camera vào mã QR trên đơn của người nhận</Text>

        <Divider style={{ marginVertical: 20 }} />

        <Text style={styles.label}>Hoặc nhập mã thủ công</Text>
        <TextInput mode="outlined" placeholder="Dán mã QR (token)" value={manualToken} onChangeText={setManualToken}
          autoCapitalize="none" outlineColor={COLORS.outline} activeOutlineColor={COLORS.primary} style={styles.input} />
        <Button mode="contained-tonal" icon="magnify" onPress={() => handleScan(manualToken)}
          disabled={scanning || !manualToken.trim()} style={{ marginTop: 8 }}>
          Tra cứu mã
        </Button>
      </ScrollView>
    </SafeAreaView>
  );
}

function Header() {
  return <ScreenHeader title="Quét QR nhận hàng" />;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { height: 56, paddingHorizontal: 20, justifyContent: 'center' },
  headerTitle: { fontWeight: '700', color: COLORS.onSurface },
  scanContent: { padding: 20 },
  cameraBox: {
    width: '100%', aspectRatio: 1, borderRadius: 20, overflow: 'hidden',
    backgroundColor: '#000', alignItems: 'center', justifyContent: 'center',
  },
  permWrap: { alignItems: 'center', gap: 12, padding: 20 },
  permText: { color: COLORS.onSurfaceVariant, textAlign: 'center' },
  scanningOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)' },
  torchBtn: { position: 'absolute', top: 12, right: 12, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  hint: { textAlign: 'center', color: COLORS.onSurfaceVariant, marginTop: 12 },
  label: { fontSize: 14, fontWeight: '600', color: COLORS.onSurfaceVariant, marginBottom: 8 },
  input: { backgroundColor: COLORS.surface },
  matchContent: { padding: 20, alignItems: 'center' },
  matchTitle: { fontWeight: '700', color: COLORS.onSurface, marginBottom: 16 },
  facePhoto: { width: 160, height: 160, borderRadius: 80, backgroundColor: COLORS.outline },
  faceEmpty: { alignItems: 'center', justifyContent: 'center' },
  receiverName: { fontWeight: '800', color: COLORS.onSurface, marginTop: 14 },
  meta: { color: COLORS.onSurfaceVariant, marginTop: 2 },
  enrollBadge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, marginTop: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', paddingVertical: 6 },
  rowLabel: { color: COLORS.onSurfaceVariant },
  rowValue: { color: COLORS.onSurface, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  confirmBtn: { marginTop: 24, borderRadius: 12, paddingVertical: 4, alignSelf: 'stretch' },
});
