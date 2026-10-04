import { Image, StyleSheet, View } from 'react-native';
import { Button, Dialog, Portal, Text } from 'react-native-paper';
import type { CapturedImage } from '@/services/faceCapture';
import { mobileColors as COLORS, radius, spacing } from '@/theme/design';

/**
 * Xem lại ảnh vừa chụp TRƯỚC khi gửi — chụp nhầm / ảnh mờ thì bấm "Chụp lại" thay vì
 * gửi luôn rồi không sửa được. Trước đây chụp xong là gửi ngay lên server.
 */
export function PhotoReviewDialog({
  photo,
  title,
  busy = false,
  confirmLabel = 'Gửi ảnh này',
  onRetake,
  onConfirm,
  onCancel,
}: {
  /** null = đóng dialog. */
  photo: CapturedImage | null;
  title: string;
  busy?: boolean;
  confirmLabel?: string;
  onRetake: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Portal>
      <Dialog visible={photo != null} onDismiss={busy ? undefined : onCancel} style={styles.dialog}>
        <Dialog.Title style={styles.title}>{title}</Dialog.Title>
        <Dialog.Content>
          {photo ? <Image source={{ uri: photo.uri }} style={styles.image} resizeMode="cover" /> : null}
          <Text style={styles.hint}>Ảnh rõ món hàng / điểm phát chưa? Nếu chưa, bấm “Chụp lại”.</Text>
        </Dialog.Content>
        <Dialog.Actions style={styles.actions}>
          <Button onPress={onCancel} disabled={busy} textColor={COLORS.onSurfaceVariant}>
            Huỷ
          </Button>
          <View style={styles.right}>
            <Button mode="outlined" icon="camera-retake-outline" onPress={onRetake} disabled={busy}>
              Chụp lại
            </Button>
            <Button mode="contained" buttonColor={COLORS.primary} onPress={onConfirm} loading={busy} disabled={busy}>
              {confirmLabel}
            </Button>
          </View>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  dialog: { borderRadius: radius.lg },
  title: { fontSize: 18, fontWeight: '800' },
  image: { width: '100%', aspectRatio: 4 / 3, borderRadius: radius.md, backgroundColor: COLORS.surfaceContainerLow },
  hint: { marginTop: spacing.sm, fontSize: 12, color: COLORS.onSurfaceVariant },
  actions: { justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.sm },
  right: { flexDirection: 'row', gap: spacing.sm },
});
