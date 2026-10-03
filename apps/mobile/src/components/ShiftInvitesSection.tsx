import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Popup } from '@/components/ui/AppPopup';
import {
  useAcceptShiftInvite,
  useDismissShiftInvite,
  useMyShiftInvites,
  type ShiftInvite,
} from '@/hooks/useCampaigns';
import { getErrorMessage } from '@/hooks/useErrorHandler';
import { notifyError, notifySuccess } from '@/services/haptics';
import { mobileColors as COLORS, radius, spacing } from '@/theme/design';

const PERIOD_VN: Record<string, string> = {
  midnight: 'Ca khuya',
  morning: 'Ca sáng',
  afternoon: 'Ca chiều',
  evening: 'Ca tối',
};

/** '2026-09-21' → '21/09/2026' */
function formatWorkDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

/**
 * Lời mời nhận ca tổ chức gửi đích danh — hiện NGAY trên màn Chiến dịch để TNV thấy
 * và trả lời tại chỗ, không phải mở chuông thông báo mới biết mình được mời.
 * Không có lời mời nào thì không hiện gì.
 */
export function ShiftInvitesSection() {
  const { data: invites = [] } = useMyShiftInvites();
  const accept = useAcceptShiftInvite();
  const dismiss = useDismissShiftInvite();
  const [pendingId, setPendingId] = useState<string | null>(null);

  if (invites.length === 0) return null;

  const onAccept = async (invite: ShiftInvite) => {
    setPendingId(invite.notificationId);
    try {
      const res = await accept.mutateAsync({
        campaignId: invite.campaignId,
        notificationId: invite.notificationId,
      });
      void notifySuccess();
      Popup.show({
        type: 'success',
        text1: 'Đã nhận ca',
        text2: `${res.shiftLabel} · ${formatWorkDate(res.workDate)} — xem ở tab "Việc của tôi".`,
      });
    } catch (error) {
      void notifyError();
      Popup.show({ type: 'error', text1: 'Không nhận được ca', text2: getErrorMessage(error) });
    } finally {
      setPendingId(null);
    }
  };

  const onDismiss = async (invite: ShiftInvite) => {
    setPendingId(invite.notificationId);
    try {
      await dismiss.mutateAsync(invite.notificationId);
    } catch (error) {
      void notifyError();
      Popup.show({ type: 'error', text1: 'Không bỏ qua được', text2: getErrorMessage(error) });
    } finally {
      setPendingId(null);
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <MaterialCommunityIcons name="email-heart-outline" size={20} color={COLORS.purple} />
        <Text style={styles.headText}>Lời mời tham gia ca ({invites.length})</Text>
      </View>
      {invites.map((invite) => {
        const busy = pendingId === invite.notificationId;
        return (
          <View key={invite.notificationId} style={styles.card}>
            <Text style={styles.title} numberOfLines={2}>{invite.campaignTitle}</Text>
            <View style={styles.line}>
              <MaterialCommunityIcons name="calendar-clock" size={16} color={COLORS.purple} />
              <Text style={styles.shift}>
                {invite.period ? PERIOD_VN[invite.period] ?? invite.period : 'Ca trực'}
                {' · '}
                {formatWorkDate(invite.workDate)}
              </Text>
            </View>
            <View style={styles.line}>
              <MaterialCommunityIcons name="map-marker-outline" size={16} color={COLORS.onSurfaceVariant} />
              <Text style={styles.address} numberOfLines={1}>{invite.kitchenAddress}</Text>
            </View>
            <Text style={styles.hint}>
              Tổ chức mời đích danh — bấm nhận là vào thẳng ca, không chờ duyệt lại.
            </Text>
            <View style={styles.actions}>
              <Button
                mode="contained"
                buttonColor={COLORS.purple}
                loading={busy && accept.isPending}
                disabled={pendingId != null}
                onPress={() => onAccept(invite)}
                style={styles.btn}
              >
                Nhận ca
              </Button>
              <Button
                mode="outlined"
                textColor={COLORS.onSurfaceVariant}
                loading={busy && dismiss.isPending}
                disabled={pendingId != null}
                onPress={() => onDismiss(invite)}
                style={styles.btn}
              >
                Bỏ qua
              </Button>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.md, gap: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headText: { fontSize: 14, fontWeight: '900', color: COLORS.purple },
  card: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: COLORS.purple,
    backgroundColor: COLORS.purpleContainer,
    gap: 6,
  },
  title: { fontSize: 16, fontWeight: '900', color: COLORS.onSurface },
  line: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  shift: { fontSize: 13, fontWeight: '800', color: COLORS.purple },
  address: { flex: 1, fontSize: 12, color: COLORS.onSurfaceVariant },
  hint: { fontSize: 12, lineHeight: 17, color: COLORS.onSurfaceVariant },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: 4 },
  btn: { flex: 1, borderRadius: radius.md },
});
