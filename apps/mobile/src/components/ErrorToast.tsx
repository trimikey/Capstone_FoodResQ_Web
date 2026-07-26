import { View, StyleSheet } from 'react-native';
import { Portal, Dialog, Button, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { mobileColors as COLORS, radius } from '@/theme/design';

interface ErrorToastProps {
  visible: boolean;
  message: string;
  onDismiss: () => void;
  duration?: number;
  actionLabel?: string;
  onAction?: () => void;
}

/**
 * Popup lỗi ở GIỮA màn hình (thay cho Snackbar đáy trước đây). Controlled qua
 * `visible`; việc tự ẩn do useErrorHandler quản lý (set isVisible=false sau duration).
 * Giữ nguyên props để các màn đang dùng không phải sửa.
 */
export default function ErrorToast({
  visible,
  message,
  onDismiss,
  actionLabel,
  onAction,
}: ErrorToastProps) {
  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss} style={styles.dialog}>
        <View style={styles.iconWrap}>
          <MaterialCommunityIcons name="alert-circle" size={56} color={COLORS.error} />
        </View>
        <Dialog.Content style={styles.content}>
          <Text variant="bodyMedium" style={styles.message}>
            {message}
          </Text>
        </Dialog.Content>
        <Dialog.Actions>
          <Button
            onPress={onAction ?? onDismiss}
            textColor={COLORS.error}
            labelStyle={styles.actionLabel}
          >
            {actionLabel ?? 'Đóng'}
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  dialog: { borderRadius: radius.xl, backgroundColor: COLORS.surface },
  iconWrap: { alignItems: 'center', paddingTop: 24 },
  content: { alignItems: 'center', paddingTop: 12 },
  message: { textAlign: 'center', color: COLORS.onSurface },
  actionLabel: { fontWeight: '700' },
});
