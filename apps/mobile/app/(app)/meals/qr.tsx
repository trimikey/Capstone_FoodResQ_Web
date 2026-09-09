import { useCallback, useEffect, useRef, useState } from 'react';
import { InteractionManager, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator, Button, Chip, Dialog, Portal, Text, TextInput } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '@/hooks/useAuth';
import { useMyProfile } from '@/hooks/useProfile';
import {
  useIssueHandoffQr,
  useMyHandoffs,
  useSubmitBeneficiaryFeedback,
  type BeneficiaryHandoff,
  type HandoffQr,
} from '@/hooks/useKitchenOps';
import { getErrorMessage } from '@/hooks/useErrorHandler';
import { QRDisplay } from '@/components/QRDisplay';
import { Popup } from '@/components/ui/AppPopup';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { SurfaceCard } from '@/components/ui/SurfaceCard';
import { DeferredRedirect } from '@/components/navigation/DeferredRedirect';
import { mobileColors as COLORS, radius, spacing } from '@/theme/design';

/** Làm mới trước khi hết hạn để waiter không quét phải mã vừa chết. */
const REFRESH_LEAD_MS = 20_000;

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatCountdown(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const mm = String(Math.floor(total / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

export default function BeneficiaryQrScreen() {
  const { user } = useAuth();
  const { data: profile } = useMyProfile();
  const issueQr = useIssueHandoffQr();
  const handoffs = useMyHandoffs(user?.role === 'receiver');
  const submitFeedback = useSubmitBeneficiaryFeedback();

  const [qr, setQr] = useState<HandoffQr | null>(null);
  const [remainingMs, setRemainingMs] = useState(0);
  const [feedbackTarget, setFeedbackTarget] = useState<BeneficiaryHandoff | null>(null);
  const [satisfaction, setSatisfaction] = useState(5);
  const [comment, setComment] = useState('');
  const issuingRef = useRef(false);

  const isCharityOrg = !!(profile?.receiver ?? user?.receiver)?.isCharityOrg;

  const refreshQr = useCallback(async () => {
    if (issuingRef.current) return;
    issuingRef.current = true;
    try {
      const next = await issueQr.mutateAsync();
      setQr(next);
    } catch (err) {
      Popup.show({ type: 'error', text1: 'Không lấy được mã QR', text2: getErrorMessage(err) });
    } finally {
      issuingRef.current = false;
    }
  }, [issueQr]);

  useEffect(() => {
    if (user?.role !== 'receiver' || isCharityOrg) return;
    const task = InteractionManager.runAfterInteractions(() => {
      void refreshQr();
    });
    return () => task.cancel?.();
    // Chỉ cấp mã lần đầu khi vào màn; các lần sau do countdown kích hoạt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role, isCharityOrg]);

  useEffect(() => {
    if (!qr) return;
    const expiry = new Date(qr.expiresAt).getTime();
    const tick = () => {
      const left = expiry - Date.now();
      setRemainingMs(left);
      if (left <= REFRESH_LEAD_MS) void refreshQr();
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [qr, refreshQr]);

  if (user && user.role !== 'receiver') {
    return <DeferredRedirect href="/(app)/home" />;
  }

  if (isCharityOrg) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScreenHeader title="Mã nhận suất ăn" />
        <View style={styles.blocked}>
          <MaterialCommunityIcons name="office-building-outline" size={48} color={COLORS.onSurfaceVariant} />
          <Text style={styles.blockedText}>
            Tài khoản tổ chức không nhận suất ăn với vai trò người thụ hưởng. Mã QR này dành cho người nhận cá nhân.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const submit = async () => {
    if (!feedbackTarget) return;
    try {
      await submitFeedback.mutateAsync({
        handoffId: feedbackTarget.id,
        satisfaction,
        comment: comment.trim() || undefined,
      });
      Popup.show({ type: 'success', text1: 'Đã gửi phản hồi', text2: 'Mỗi suất ăn chỉ gửi được một lần.' });
      setFeedbackTarget(null);
      setSatisfaction(5);
      setComment('');
    } catch (err) {
      Popup.show({ type: 'error', text1: 'Gửi phản hồi thất bại', text2: getErrorMessage(err) });
    }
  };

  const items = handoffs.data ?? [];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title="Mã nhận suất ăn" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.heroKicker}>Beneficiary QR</Text>
          <Text style={styles.heroTitle}>Đưa mã này cho tình nguyện viên phục vụ</Text>
        </View>

        <SurfaceCard style={styles.qrCard}>
          {qr ? (
            <>
              <View style={styles.qrFrame}>
                <QRDisplay value={qr.qrToken} size={220} />
              </View>
              <Text style={styles.countdown}>{formatCountdown(remainingMs)}</Text>
              <Text style={styles.qrHint}>
                Mã tự làm mới trước khi hết hạn. Chỉ tình nguyện viên phục vụ tại điểm phát mới quét được.
              </Text>
            </>
          ) : (
            <View style={styles.qrLoading}>
              <ActivityIndicator color={COLORS.primary} />
              <Text style={styles.qrHint}>Đang cấp mã...</Text>
            </View>
          )}
          <Button
            mode="outlined"
            icon="refresh"
            onPress={refreshQr}
            loading={issueQr.isPending}
            disabled={issueQr.isPending}
            textColor={COLORS.primary}
            style={styles.refreshBtn}
          >
            Làm mới mã
          </Button>
        </SurfaceCard>

        <Text style={styles.sectionTitle}>Suất ăn đã nhận</Text>
        {handoffs.isLoading ? <ActivityIndicator color={COLORS.primary} /> : null}
        {items.length === 0 && !handoffs.isLoading ? (
          <Text style={styles.empty}>
            Chưa có suất ăn nào được ghi nhận. Sau khi tình nguyện viên quét mã, suất ăn sẽ xuất hiện ở đây.
          </Text>
        ) : null}
        {items.map((item) => (
          <SurfaceCard key={item.id} style={styles.handoffCard}>
            <Text style={styles.handoffTitle}>{item.campaign.title}</Text>
            <Text style={styles.muted}>{item.roundLabel ?? 'Đợt phân phát'} · {formatDateTime(item.servedAt)}</Text>
            {item.campaign.kitchenAddress ? (
              <Text style={styles.muted}>{item.campaign.kitchenAddress}</Text>
            ) : null}
            {item.hasSubmitted && item.myFeedback ? (
              <View style={styles.submitted}>
                <StatusBadge label={`Đã phản hồi · ${item.myFeedback.satisfaction}/5`} tone="success" />
                {item.myFeedback.comment ? (
                  <Text style={styles.note}>{item.myFeedback.comment}</Text>
                ) : null}
              </View>
            ) : (
              <Button
                mode="contained"
                icon="message-star-outline"
                buttonColor={COLORS.primary}
                onPress={() => setFeedbackTarget(item)}
                style={styles.feedbackBtn}
              >
                Gửi phản hồi
              </Button>
            )}
          </SurfaceCard>
        ))}
      </ScrollView>

      <Portal>
        <Dialog visible={!!feedbackTarget} onDismiss={() => setFeedbackTarget(null)}>
          <Dialog.Title>Phản hồi suất ăn</Dialog.Title>
          <Dialog.Content style={styles.dialogBody}>
            <Text style={styles.fieldLabel}>Mức hài lòng</Text>
            <View style={styles.chipRow}>
              {[1, 2, 3, 4, 5].map((value) => (
                <Chip key={value} selected={satisfaction === value} onPress={() => setSatisfaction(value)}>
                  {value}
                </Chip>
              ))}
            </View>
            <TextInput
              mode="outlined"
              label="Nhận xét"
              value={comment}
              onChangeText={setComment}
              multiline
              numberOfLines={3}
            />
            <Text style={styles.muted}>Mỗi suất ăn chỉ gửi được một phản hồi.</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setFeedbackTarget(null)}>Đóng</Button>
            <Button loading={submitFeedback.isPending} disabled={submitFeedback.isPending} onPress={submit}>
              Gửi
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.section },
  hero: { borderRadius: 28, padding: spacing.lg, backgroundColor: COLORS.primaryStrong },
  heroKicker: { color: COLORS.secondaryContainer, fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  heroTitle: { marginTop: 4, color: COLORS.onPrimary, fontSize: 21, lineHeight: 27, fontWeight: '900' },
  qrCard: { padding: spacing.lg, alignItems: 'center', gap: spacing.sm },
  qrFrame: { padding: spacing.md, borderRadius: radius.lg, backgroundColor: '#fff' },
  qrLoading: { height: 220, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  countdown: { fontSize: 26, fontWeight: '900', color: COLORS.primary },
  qrHint: { fontSize: 12, lineHeight: 17, color: COLORS.onSurfaceVariant, textAlign: 'center' },
  refreshBtn: { borderRadius: radius.md, borderColor: COLORS.primary, alignSelf: 'stretch' },
  sectionTitle: { marginTop: spacing.md, fontSize: 17, fontWeight: '900', color: COLORS.onSurface },
  empty: { fontSize: 13, color: COLORS.onSurfaceVariant, fontStyle: 'italic', lineHeight: 18 },
  handoffCard: { padding: spacing.lg, gap: 4 },
  handoffTitle: { fontSize: 15, fontWeight: '900', color: COLORS.onSurface },
  muted: { fontSize: 12, color: COLORS.onSurfaceVariant, lineHeight: 17 },
  note: { fontSize: 13, color: COLORS.onSurface, lineHeight: 18 },
  submitted: { marginTop: spacing.sm, gap: 6, alignItems: 'flex-start' },
  feedbackBtn: { marginTop: spacing.sm, borderRadius: radius.md },
  blocked: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  blockedText: { textAlign: 'center', color: COLORS.onSurfaceVariant, lineHeight: 19 },
  dialogBody: { gap: spacing.md },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: COLORS.onSurface },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
