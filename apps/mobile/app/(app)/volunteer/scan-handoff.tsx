import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator, Button, Text, TextInput } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Redirect, type Href, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { useScanHandoff, type HandoffScanResult } from '@/hooks/useKitchenOps';
import { getErrorMessage } from '@/hooks/useErrorHandler';
import { Popup } from '@/components/ui/AppPopup';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { SurfaceCard } from '@/components/ui/SurfaceCard';
import { notifyError, notifySuccess, selectionFeedback } from '@/services/haptics';
import { mobileColors as COLORS, radius, spacing } from '@/theme/design';

export default function ScanHandoffScreen() {
  const { user } = useAuth();
  const { campaignId, distributionId, roundLabel } = useLocalSearchParams<{
    campaignId: string;
    distributionId: string;
    roundLabel?: string;
  }>();
  const [permission, requestPermission] = useCameraPermissions();
  const scanHandoff = useScanHandoff();
  const [result, setResult] = useState<HandoffScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [manualToken, setManualToken] = useState('');
  const [torch, setTorch] = useState(false);

  if (user && user.role !== 'volunteer') {
    return <Redirect href="/(app)/home" />;
  }

  if (!campaignId || !distributionId) {
    return <Redirect href={'/(app)/volunteer/campaigns' as Href} />;
  }

  const handleScan = async (token: string) => {
    const qrToken = token.trim();
    if (scanning || !qrToken) return;
    try {
      setScanning(true);
      const data = await scanHandoff.mutateAsync({ campaignId, distributionId, qrToken });
      setResult(data);
      void notifySuccess();
      Popup.show({
        type: 'success',
        text1: data.alreadyRecorded ? 'Đã ghi nhận trước đó' : 'Đã ghi nhận suất ăn',
        text2: data.alreadyRecorded
          ? 'Người nhận này đã có biên nhận tại đợt phát này.'
          : 'Người nhận có thể gửi một phản hồi cho suất ăn này.',
      });
    } catch (err) {
      void notifyError();
      Popup.show({ type: 'error', text1: 'Không thể ghi nhận', text2: getErrorMessage(err) });
    } finally {
      setScanning(false);
    }
  };

  const reset = () => {
    setResult(null);
    setManualToken('');
  };

  if (result) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScreenHeader title="Quét mã nhận suất ăn" />
        <ScrollView contentContainerStyle={styles.confirmContent}>
          <View style={styles.confirmIcon}>
            <MaterialCommunityIcons name="check-bold" size={38} color={COLORS.onPrimary} />
          </View>
          <Text style={styles.confirmTitle}>
            {result.alreadyRecorded ? 'Suất ăn đã được ghi nhận' : 'Đã ghi nhận suất ăn'}
          </Text>
          <Text style={styles.confirmHint}>
            {result.alreadyRecorded
              ? 'Không tạo thêm biên nhận cho cùng người nhận trong một đợt phát.'
              : 'Biên nhận đã được lưu. Người nhận có thể phản hồi một lần trên tài khoản của họ.'}
          </Text>
          <StatusBadge label={roundLabel ?? 'Đợt phân phát'} tone="success" />
          <Button mode="contained" icon="qrcode-scan" buttonColor={COLORS.primary} onPress={reset} style={styles.confirmButton}>
            Quét người nhận tiếp theo
          </Button>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title="Quét mã nhận suất ăn" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <Text style={styles.heroKicker}>Meal handoff</Text>
          <Text style={styles.heroTitle}>Quét mã QR của người nhận</Text>
          <Text style={styles.heroHint}>{roundLabel ?? 'Đợt phân phát đã chọn'}</Text>
        </View>
        <View style={styles.cameraBox}>
          {!permission ? (
            <ActivityIndicator color={COLORS.primary} />
          ) : !permission.granted ? (
            <View style={styles.permissionWrap}>
              <MaterialCommunityIcons name="camera-off" size={48} color={COLORS.onSurfaceVariant} />
              <Text style={styles.permissionText}>Cần quyền camera để quét mã QR</Text>
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
                style={styles.torchButton}
                onPress={() => {
                  void selectionFeedback();
                  setTorch((current) => !current);
                }}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={torch ? 'Tắt đèn flash' : 'Bật đèn flash'}
              >
                <MaterialCommunityIcons name={torch ? 'flash' : 'flash-off'} size={24} color={COLORS.onPrimary} />
              </Pressable>
            </>
          )}
          {scanning ? (
            <View style={styles.scanningOverlay}>
              <ActivityIndicator color={COLORS.onPrimary} />
              <Text style={styles.scanningText}>Đang ghi nhận...</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.hint}>Mã QR chỉ dùng cho một biên nhận và tự hết hạn sau vài phút.</Text>
        <SurfaceCard style={styles.manualCard}>
          <Text style={styles.manualLabel}>Hoặc nhập mã thủ công</Text>
          <TextInput
            mode="outlined"
            placeholder="Dán mã QR (token)"
            value={manualToken}
            onChangeText={setManualToken}
            autoCapitalize="none"
            outlineColor={COLORS.outline}
            activeOutlineColor={COLORS.primary}
            style={styles.input}
          />
          <Button
            mode="contained-tonal"
            icon="magnify"
            onPress={() => handleScan(manualToken)}
            disabled={scanning || !manualToken.trim()}
            style={styles.manualButton}
          >
            Ghi nhận mã
          </Button>
        </SurfaceCard>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: spacing.xl, gap: spacing.md },
  hero: { padding: spacing.lg, borderRadius: 28, backgroundColor: COLORS.heroCampaign },
  heroKicker: { color: COLORS.purpleContainer, fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  heroTitle: { marginTop: 4, color: COLORS.onPrimary, fontSize: 22, lineHeight: 28, fontWeight: '900' },
  heroHint: { marginTop: 6, color: COLORS.secondaryContainer, fontSize: 13 },
  cameraBox: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionWrap: { alignItems: 'center', gap: 12, padding: 20 },
  permissionText: { color: COLORS.onSurfaceVariant, textAlign: 'center' },
  torchButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanningOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  scanningText: { marginTop: 8, color: COLORS.onPrimary, fontWeight: '800' },
  hint: { color: COLORS.onSurfaceVariant, lineHeight: 18, textAlign: 'center' },
  manualCard: { padding: spacing.lg },
  manualLabel: { marginBottom: 8, fontSize: 14, fontWeight: '600', color: COLORS.onSurfaceVariant },
  input: { backgroundColor: COLORS.surface },
  manualButton: { marginTop: 8 },
  confirmContent: { padding: spacing.xl, alignItems: 'center', gap: spacing.md },
  confirmIcon: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
  },
  confirmTitle: { fontSize: 22, fontWeight: '900', color: COLORS.onSurface, textAlign: 'center' },
  confirmHint: { color: COLORS.onSurfaceVariant, lineHeight: 19, textAlign: 'center' },
  confirmButton: { marginTop: spacing.md, borderRadius: radius.md, alignSelf: 'stretch' },
});
