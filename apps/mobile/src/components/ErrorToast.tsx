import { Snackbar } from 'react-native-paper';
import { StyleSheet } from 'react-native';

interface ErrorToastProps {
  visible: boolean;
  message: string;
  onDismiss: () => void;
  duration?: number;
  actionLabel?: string;
  onAction?: () => void;
}

/**
 * Toast lỗi dạng Material Design (Snackbar) hiển thị ở đáy màn hình.
 * Tự ẩn sau `duration`, có nút đóng và nút hành động tùy chọn (Retry...).
 */
export default function ErrorToast({
  visible,
  message,
  onDismiss,
  duration = 3000,
  actionLabel,
  onAction,
}: ErrorToastProps) {
  return (
    <Snackbar
      visible={visible}
      onDismiss={onDismiss}
      duration={duration}
      style={styles.snackbar}
      action={
        actionLabel
          ? { label: actionLabel, onPress: onAction ?? onDismiss }
          : { label: 'Đóng', onPress: onDismiss }
      }
    >
      {message}
    </Snackbar>
  );
}

const styles = StyleSheet.create({
  snackbar: {
    backgroundColor: '#D32F2F',
  },
});
