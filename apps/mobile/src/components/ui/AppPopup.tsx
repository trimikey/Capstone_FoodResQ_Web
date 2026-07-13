import { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Portal, Dialog, Button, Text, Snackbar } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { create } from 'zustand';

export type PopupType = 'success' | 'error' | 'info' | 'warning';

export interface PopupOptions {
  type?: PopupType;
  /** Tiêu đề (tương thích Toast: text1) */
  text1?: string;
  /** Nội dung mô tả (tương thích Toast: text2) */
  text2?: string;
  /** ms tự đóng; 0/undefined → không tự đóng (chỉ đóng khi bấm OK). Mặc định 2800. */
  duration?: number;
  primaryAction?: {
    label: string;
    onPress: () => void | Promise<void>;
  };
  secondaryAction?: {
    label: string;
    onPress: () => void | Promise<void>;
  };
}

interface PopupState extends Required<Omit<PopupOptions, 'text2' | 'primaryAction' | 'secondaryAction'>> {
  visible: boolean;
  text2?: string;
  primaryAction?: PopupOptions['primaryAction'];
  secondaryAction?: PopupOptions['secondaryAction'];
  show: (o: PopupOptions) => void;
  hide: () => void;
}

const usePopupStore = create<PopupState>((set) => ({
  visible: false,
  type: 'info',
  text1: '',
  text2: undefined,
  duration: 2800,
  show: (o) =>
    set({
      visible: true,
      type: o.type ?? 'info',
      text1: o.text1 ?? '',
      text2: o.text2,
      duration: o.duration ?? 2800,
      primaryAction: o.primaryAction,
      secondaryAction: o.secondaryAction,
    }),
  hide: () => set({ visible: false, primaryAction: undefined, secondaryAction: undefined }),
}));

interface ToastState extends Required<Pick<PopupOptions, 'type' | 'text1' | 'duration'>> {
  visible: boolean;
  text2?: string;
  show: (o: PopupOptions) => void;
  hide: () => void;
}

const useToastStore = create<ToastState>((set) => ({
  visible: false,
  type: 'info',
  text1: '',
  text2: undefined,
  duration: 2600,
  show: (o) =>
    set({
      visible: true,
      type: o.type ?? 'info',
      text1: o.text1 ?? '',
      text2: o.text2,
      duration: o.duration ?? 2600,
    }),
  hide: () => set({ visible: false }),
}));

/**
 * API mệnh lệnh tương thích chữ ký của react-native-toast-message
 * (`Popup.show({ type, text1, text2 })`) nhưng hiển thị popup ở GIỮA màn hình.
 */
export const Popup = {
  show: (o: PopupOptions) => usePopupStore.getState().show(o),
  hide: () => usePopupStore.getState().hide(),
};

/** Toast nhẹ cho feedback ngắn, không chặn thao tác chính. */
export const Toast = {
  show: (o: PopupOptions) => useToastStore.getState().show(o),
  hide: () => useToastStore.getState().hide(),
};

const META: Record<PopupType, { icon: string; color: string }> = {
  success: { icon: 'check-circle', color: '#10b981' },
  error: { icon: 'alert-circle', color: '#ef4444' },
  warning: { icon: 'alert', color: '#f59e0b' },
  info: { icon: 'information', color: '#3b82f6' },
};

/**
 * Host hiển thị popup — đặt 1 lần ở root (trong PaperProvider). Tự đóng sau
 * `duration` ms; người dùng cũng có thể bấm OK để đóng ngay.
 */
export function AppPopupHost() {
  const { visible, type, text1, text2, duration, primaryAction, secondaryAction, hide } = usePopupStore();

  useEffect(() => {
    if (!visible || !duration) return;
    const t = setTimeout(hide, duration);
    return () => clearTimeout(t);
  }, [visible, duration, hide]);

  const meta = META[type] ?? META.info;
  const runAction = (action?: PopupOptions['primaryAction']) => {
    if (!action) {
      hide();
      return;
    }
    void Promise.resolve(action.onPress()).catch(() => undefined);
  };

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={hide} style={styles.dialog}>
        <View style={styles.iconWrap}>
          <MaterialCommunityIcons
            name={meta.icon as keyof typeof MaterialCommunityIcons.glyphMap}
            size={56}
            color={meta.color}
          />
        </View>
        <Dialog.Content style={styles.content}>
          {text1 ? (
            <Text variant="titleMedium" style={styles.title}>
              {text1}
            </Text>
          ) : null}
          {text2 ? (
            <Text variant="bodyMedium" style={styles.message}>
              {text2}
            </Text>
          ) : null}
        </Dialog.Content>
        <Dialog.Actions>
          {secondaryAction ? (
            <Button onPress={() => runAction(secondaryAction)} textColor="#6b7280" labelStyle={styles.okLabel}>
              {secondaryAction.label}
            </Button>
          ) : null}
          <Button onPress={() => runAction(primaryAction)} textColor={meta.color} labelStyle={styles.okLabel}>
            {primaryAction?.label ?? 'OK'}
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

export function AppToastHost() {
  const { visible, type, text1, text2, duration, hide } = useToastStore();
  const meta = META[type] ?? META.info;

  return (
    <Snackbar
      visible={visible}
      onDismiss={hide}
      duration={duration}
      icon={({ size }) => (
        <MaterialCommunityIcons
          name={meta.icon as keyof typeof MaterialCommunityIcons.glyphMap}
          size={size}
          color="#ffffff"
        />
      )}
      style={[styles.toast, { backgroundColor: meta.color }]}
      wrapperStyle={styles.toastWrap}
      accessibilityLabel={[text1, text2].filter(Boolean).join('. ')}
    >
      <Text style={styles.toastText} numberOfLines={2}>
        {text2 ? `${text1} - ${text2}` : text1}
      </Text>
    </Snackbar>
  );
}

const styles = StyleSheet.create({
  dialog: { borderRadius: 20 },
  iconWrap: { alignItems: 'center', paddingTop: 24 },
  content: { alignItems: 'center', paddingTop: 12 },
  title: { textAlign: 'center', fontWeight: '700', color: '#121c2a' },
  message: { textAlign: 'center', color: '#6b7280', marginTop: 6 },
  okLabel: { fontWeight: '700' },
  toastWrap: { bottom: 78 },
  toast: { borderRadius: 12 },
  toastText: { color: '#ffffff', fontWeight: '700' },
});
