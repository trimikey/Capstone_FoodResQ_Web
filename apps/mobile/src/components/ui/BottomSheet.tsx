import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { IconButton, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { mobileColors as COLORS, elevation, spacing } from '@/theme/design';

type Tone = 'primary' | 'danger';

const TONE: Record<Tone, { bg: string; fg: string }> = {
  primary: { bg: COLORS.primaryContainer, fg: COLORS.primary },
  danger: { bg: COLORS.errorContainer, fg: COLORS.error },
};

/**
 * Bottom sheet chuẩn cho các form thao tác của TNV (chốt đợt phát, xác nhận lấy
 * nguyên liệu, báo sự cố…). Thay cho `Dialog` mặc định của Paper — dialog đó nền hồng
 * nhạt, tiêu đề mảnh, nút chữ trơn và bị bàn phím che, nhìn không ra sản phẩm.
 *
 * Bố cục: tay nắm → header (icon, tiêu đề, phụ đề, nút đóng) → nội dung cuộn →
 * footer cố định (nút hành động luôn thấy được, kể cả khi form dài).
 */
export function BottomSheet({
  visible,
  onClose,
  busy = false,
  icon,
  tone = 'primary',
  title,
  subtitle,
  footer,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  /** Đang gửi — chặn đóng sheet giữa chừng. */
  busy?: boolean;
  icon: string;
  tone?: Tone;
  title: string;
  subtitle?: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const close = () => {
    if (!busy) onClose();
  };
  const t = TONE[tone];

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={close}>
      <View style={styles.root} pointerEvents="box-none">
        <Pressable style={styles.backdrop} onPress={close} accessibilityLabel="Đóng" />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.avoider}
          pointerEvents="box-none"
        >
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <View style={styles.header}>
              <View style={[styles.headerIcon, { backgroundColor: t.bg }]}>
                <MaterialCommunityIcons name={icon as never} size={22} color={t.fg} />
              </View>
              <View style={styles.headerText}>
                <Text style={styles.title}>{title}</Text>
                {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
              </View>
              <IconButton
                icon="close"
                size={20}
                onPress={close}
                disabled={busy}
                style={styles.closeBtn}
                accessibilityLabel="Đóng"
              />
            </View>

            <ScrollView
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {children}
            </ScrollView>

            {footer ? (
              <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
                {footer}
              </View>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(18, 28, 42, 0.45)' },
  avoider: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '92%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: COLORS.surface,
    overflow: 'hidden',
    ...elevation.card,
  },
  handle: {
    alignSelf: 'center',
    width: 42,
    height: 5,
    borderRadius: 999,
    marginTop: 10,
    marginBottom: 6,
    backgroundColor: COLORS.outlineVariant,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: spacing.lg,
    paddingRight: spacing.xs,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.outlineVariant,
  },
  headerIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1 },
  title: { color: COLORS.onSurface, fontSize: 18, lineHeight: 23, fontWeight: '900' },
  subtitle: { marginTop: 2, color: COLORS.onSurfaceVariant, fontSize: 12, lineHeight: 17 },
  closeBtn: { margin: 0 },
  content: { padding: spacing.lg, gap: 14 },
  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.outlineVariant,
    backgroundColor: COLORS.surface,
  },
});
