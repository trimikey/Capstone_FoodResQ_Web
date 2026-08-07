import { useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Button, TextInput, ActivityIndicator } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Redirect } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { useScanQr, useConfirmPickup, type ScanResult } from '@/hooks/useProviderScan';
import { getErrorMessage } from '@/hooks/useErrorHandler';
import { Popup } from '@/components/ui/AppPopup';
import { AppImage } from '@/components/ui/AppImage';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { SurfaceCard } from '@/components/ui/SurfaceCard';
import { notifyError, notifySuccess, selectionFeedback } from '@/services/haptics';
import { mobileColors as COLORS, radius, spacing } from '@/theme/design';

export default function ScanQrScreen() {
  const { user } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const scan = useScanQr();
  const confirm = useConfirmPickup();

  const [result, setResult] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState(false); // khoá khi đang gọi API
  const [manualToken, setManualToken] = useState('');
  const [torch, setTorch] = useState(false); // đèn flash
  const [verificationImageLoaded, setVerificationImageLoaded] = useState(false);
  const [verificationImageFailed, setVerificationImageFailed] = useState(false);

  if (user && user.role !== 'provider') {
    return <Redirect href="/(app)/home" />;
  }

  const handleScan = async (token: string) => {
    if (scanning || !token) return;
    try {
      setScanning(true);
      const data = await scan.mutateAsync(token);
      void notifySuccess();
      setVerificationImageLoaded(false);
      setVerificationImageFailed(false);
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
    if (!result.receiver.verificationImageAvailable || !verificationImageLoaded) {
      Popup.show({
        type: 'error',
        text1: 'Ảnh xác minh không khả dụng',
        text2: 'Yêu cầu người nhận cập nhật lại selfie trước khi giao.',
      });
      return;
    }
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
    setVerificationImageLoaded(false);
    setVerificationImageFailed(false);
  };

  // ---- Màn đối chiếu sau khi quét ----
  if (result) {
    const r = result.receiver;
    const photo = r.faceImageUrl ?? r.idCardImageUrl;
    const photoAvailable = r.verificationImageAvailable && !verificationImageFailed;
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Header />
        <ScrollView contentContainerStyle={styles.matchContent}>
          <View style={styles.matchHero}>
            <Text style={styles.matchKicker}>Đối chiếu QR</Text>
            <Text variant="titleMedium" style={styles.matchTitle}>Xác nhận đúng người nhận</Text>
          </View>
          {photo && photoAvailable ? (
            <AppImage
              source={{ uri: photo }}
              style={styles.facePhoto}
              onLoad={() => setVerificationImageLoaded(true)}
              onError={() => {
                setVerificationImageLoaded(false);
                setVerificationImageFailed(true);
              }}
            />
          ) : (
            <View style={[styles.facePhoto, styles.faceEmpty]}>
              <MaterialCommunityIcons name="image-off-outline" size={56} color={COLORS.onSurfaceVariant} />
            </View>
          )}
          <Text variant="headlineSmall" style={styles.receiverName}>{r.fullName}</Text>
          {r.phone ? <Text style={styles.meta}>{r.phone}</Text> : null}
          <StatusBadge
            label={
              r.enrolled && photoAvailable
                ? 'Đã đăng ký khuôn mặt'
                : r.enrolled
                  ? 'Ảnh đăng ký không khả dụng'
                  : 'Chưa đăng ký khuôn mặt'
            }
            tone={r.enrolled && photoAvailable ? 'success' : 'warning'}
          />

          {!photoAvailable ? (
            <View style={styles.photoWarning}>
              <MaterialCommunityIcons name="alert-circle-outline" size={20} color={COLORS.error} />
              <Text style={styles.photoWarningText}>
                Không thể đối chiếu danh tính. Yêu cầu người nhận vào Tài khoản → Xác minh khuôn mặt để cập nhật selfie.
              </Text>
            </View>
          ) : null}

          <SurfaceCard style={styles.matchInfo}>
            <Row label="Món" value={result.listing.title} />
            <Row label="Số lượng" value={`${result.quantity} ${result.listing.quantityUnit}`} />
            {r.idCardNumber ? <Row label="CCCD" value={r.idCardNumber} /> : null}
          </SurfaceCard>

          <Button mode="contained" icon="check-bold" onPress={handleConfirm} loading={scanning}
            disabled={scanning || !photoAvailable || !verificationImageLoaded}
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
        <View style={styles.scanHero}>
          <Text style={styles.scanKicker}>Pickup verification</Text>
          <Text style={styles.scanTitle}>Quét QR của receiver để giao món</Text>
        </View>
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
                  color={COLORS.onPrimary}
                />
              </Pressable>
            </>
          )}
          {scanning ? (
            <View style={styles.scanningOverlay}>
              <ActivityIndicator color={COLORS.onPrimary} />
              <Text style={styles.scanningText}>Đang xử lý...</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.hint}>Hướng camera vào mã QR trên đơn của người nhận</Text>

        <SurfaceCard style={styles.manualCard}>
          <Text style={styles.label}>Hoặc nhập mã thủ công</Text>
          <TextInput mode="outlined" placeholder="Dán mã QR (token)" value={manualToken} onChangeText={setManualToken}
            autoCapitalize="none" outlineColor={COLORS.outline} activeOutlineColor={COLORS.primary} style={styles.input} />
          <Button mode="contained-tonal" icon="magnify" onPress={() => handleScan(manualToken)}
            disabled={scanning || !manualToken.trim()} style={{ marginTop: 8 }}>
            Tra cứu mã
          </Button>
        </SurfaceCard>
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
  scanContent: { padding: spacing.xl, gap: spacing.md },
  scanHero: {
    borderRadius: 28,
    padding: spacing.lg,
    backgroundColor: COLORS.primaryStrong,
  },
  scanKicker: { color: COLORS.secondaryContainer, fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  scanTitle: { marginTop: 4, color: COLORS.onPrimary, fontSize: 22, lineHeight: 28, fontWeight: '900' },
  cameraBox: {
    width: '100%', aspectRatio: 1, borderRadius: 28, overflow: 'hidden',
    backgroundColor: '#000', alignItems: 'center', justifyContent: 'center',
  },
  permWrap: { alignItems: 'center', gap: 12, padding: 20 },
  permText: { color: COLORS.onSurfaceVariant, textAlign: 'center' },
  scanningOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)' },
  torchBtn: { position: 'absolute', top: 12, right: 12, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  scanningText: { color: COLORS.onPrimary, marginTop: 8, fontWeight: '800' },
  hint: { textAlign: 'center', color: COLORS.onSurfaceVariant, marginTop: 12 },
  label: { fontSize: 14, fontWeight: '600', color: COLORS.onSurfaceVariant, marginBottom: 8 },
  input: { backgroundColor: COLORS.surface },
  manualCard: { padding: spacing.lg },
  matchContent: { padding: spacing.xl, alignItems: 'center', gap: spacing.md },
  matchHero: { alignSelf: 'stretch', borderRadius: 28, padding: spacing.lg, backgroundColor: COLORS.primaryStrong },
  matchKicker: { color: COLORS.secondaryContainer, fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  matchTitle: { fontWeight: '900', color: COLORS.onPrimary },
  facePhoto: { width: 160, height: 160, borderRadius: 80, backgroundColor: COLORS.outline },
  faceEmpty: { alignItems: 'center', justifyContent: 'center' },
  photoWarning: { alignSelf: 'stretch', flexDirection: 'row', gap: 10, padding: 12, borderRadius: radius.md, backgroundColor: COLORS.errorContainer },
  photoWarningText: { flex: 1, color: COLORS.onErrorContainer, fontSize: 13, lineHeight: 18 },
  receiverName: { fontWeight: '800', color: COLORS.onSurface, marginTop: 14 },
  meta: { color: COLORS.onSurfaceVariant, marginTop: 2 },
  matchInfo: { alignSelf: 'stretch', padding: spacing.lg },
  row: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', paddingVertical: 6 },
  rowLabel: { color: COLORS.onSurfaceVariant },
  rowValue: { color: COLORS.onSurface, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  confirmBtn: { marginTop: spacing.sm, borderRadius: radius.md, paddingVertical: 4, alignSelf: 'stretch' },
});
