import { View, StyleSheet } from 'react-native';
import { Portal, Dialog, Button, Text, ActivityIndicator } from 'react-native-paper';
import { Popup } from '@/components/ui/AppPopup';
import { useFaceEnrollment, useEnrollFace } from '@/hooks/useFaceEnrollment';
import { useSubmitPickupProof } from '@/hooks/useReservations';
import { captureImage, pickImageFromLibrary, type CapturedImage } from '@/services/faceCapture';

interface Props {
  visible: boolean;
  reservationId: string;
  onDismiss: () => void;
  /** Gọi khi xác minh thành công (đơn chuyển completed). */
  onCompleted: () => void;
}

const COLORS = {
  primary: '#10b981',
  onSurface: '#121c2a',
  onSurfaceVariant: '#6b7280',
};

function errMsg(e: any): string {
  return e?.response?.data?.error?.message ?? e?.message ?? 'Vui lòng thử lại.';
}

/**
 * Xác minh nhận hàng phía receiver. Nếu chưa đăng ký khuôn mặt → bước đăng ký
 * (selfie/CCCD). Đã đăng ký → bước xác minh: chụp ảnh gửi backend so khớp.
 */
export function PickupProofDialog({ visible, reservationId, onDismiss, onCompleted }: Props) {
  const enrollment = useFaceEnrollment();
  const enrollMut = useEnrollFace();
  const proofMut = useSubmitPickupProof();

  const enrolled = enrollment.data?.enrolled ?? false;
  const loading = enrollment.isLoading;
  const busy = enrollMut.isPending || proofMut.isPending;

  const getImage = (mode: 'camera' | 'library', type: 'face' | 'id_card') =>
    mode === 'camera' ? captureImage(type) : pickImageFromLibrary();

  const doEnroll = async (type: 'face' | 'id_card', mode: 'camera' | 'library') => {
    try {
      const img = await getImage(mode, type);
      if (!img) return;
      await enrollMut.mutateAsync(type === 'face' ? { selfie: img } : { idCard: img });
      Popup.show({ type: 'success', text1: 'Đã đăng ký khuôn mặt' });
    } catch (e) {
      Popup.show({ type: 'error', text1: 'Đăng ký thất bại', text2: errMsg(e) });
    }
  };

  const doVerify = async (type: 'face' | 'id_card', mode: 'camera' | 'library') => {
    try {
      const img: CapturedImage | null = await getImage(mode, type);
      if (!img) return;
      await proofMut.mutateAsync({ id: reservationId, verificationType: type, photo: img });
      Popup.show({ type: 'success', text1: 'Xác minh thành công — đã nhận hàng!' });
      onCompleted();
    } catch (e) {
      Popup.show({ type: 'error', text1: 'Xác minh thất bại', text2: errMsg(e) });
    }
  };

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={busy ? undefined : onDismiss} style={styles.dialog}>
        <Dialog.Title style={styles.title}>
          {enrolled ? 'Xác minh nhận hàng' : 'Đăng ký khuôn mặt'}
        </Dialog.Title>
        <Dialog.Content>
          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={COLORS.primary} />
            </View>
          ) : !enrolled ? (
            <>
              <Text style={styles.desc}>
                Bạn cần đăng ký khuôn mặt một lần để xác minh khi nhận hàng. Chụp ảnh selfie rõ mặt,
                đủ sáng.
              </Text>
              <Button
                mode="contained"
                icon="camera"
                buttonColor={COLORS.primary}
                onPress={() => doEnroll('face', 'camera')}
                loading={enrollMut.isPending}
                disabled={busy}
                style={styles.btn}
              >
                Chụp selfie đăng ký
              </Button>
              <Button
                mode="text"
                icon="card-account-details-outline"
                textColor={COLORS.primary}
                onPress={() => doEnroll('id_card', 'camera')}
                disabled={busy}
              >
                Hoặc chụp CCCD
              </Button>
              <Button
                mode="text"
                icon="image-outline"
                textColor={COLORS.onSurfaceVariant}
                onPress={() => doEnroll('face', 'library')}
                disabled={busy}
              >
                Chọn ảnh từ thư viện
              </Button>
            </>
          ) : (
            <>
              <Text style={styles.desc}>
                Chụp ảnh để xác minh danh tính và hoàn tất nhận hàng.
              </Text>
              <Button
                mode="contained"
                icon="face-recognition"
                buttonColor={COLORS.primary}
                onPress={() => doVerify('face', 'camera')}
                loading={proofMut.isPending}
                disabled={busy}
                style={styles.btn}
              >
                Chụp khuôn mặt
              </Button>
              <Button
                mode="text"
                icon="card-account-details-outline"
                textColor={COLORS.primary}
                onPress={() => doVerify('id_card', 'camera')}
                disabled={busy}
              >
                Chụp CCCD
              </Button>
              <Button
                mode="text"
                icon="image-outline"
                textColor={COLORS.onSurfaceVariant}
                onPress={() => doVerify('face', 'library')}
                disabled={busy}
              >
                Chọn ảnh từ thư viện
              </Button>
            </>
          )}
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onDismiss} textColor={COLORS.onSurfaceVariant} disabled={busy}>
            Đóng
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  dialog: { borderRadius: 20 },
  title: { fontSize: 18, fontWeight: '700', color: COLORS.onSurface },
  center: { paddingVertical: 24, alignItems: 'center' },
  desc: { fontSize: 14, color: COLORS.onSurfaceVariant, marginBottom: 16, lineHeight: 20 },
  btn: { borderRadius: 12, marginBottom: 4 },
});
