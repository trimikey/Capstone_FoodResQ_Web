import { useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable, Linking, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Button } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { AppImage } from '@/components/ui/AppImage';
import { QRDisplay } from '@/components/QRDisplay';
import { RatingDialog } from '@/components/RatingDialog';
import { PickupProofDialog } from '@/components/PickupProofDialog';
import { ReportDialog } from '@/components/ReportDialog';
import { DeliveryTrackingCard } from '@/components/DeliveryTrackingCard';
import { Popup } from '@/components/ui/AppPopup';
import {
  reservationStatusDisplay,
  useCountdown,
} from '@/components/ProviderReservationCard';
import {
  useReservationDetail,
  useCancelReservation,
  useRateReservation,
} from '@/hooks/useReservations';
import { formatPickupWindow } from '@/utils/listingFormat';
import { ScreenState } from '@/components/ui/ScreenState';
import { mobileColors as COLORS } from '@/theme/design';

function fmtDateTime(iso?: string): string {
  if (!iso) return '-';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * Chi tiết đơn đặt (Receiver) — trình QR cho provider quét khi đến lấy.
 * confirmed: hiển thị QR + đếm ngược + nút huỷ. Trạng thái khác: chỉ thông tin.
 */
export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: order, isLoading, isError, refetch } = useReservationDetail(id);
  const cancelMut = useCancelReservation();
  const rateMut = useRateReservation();

  const sd = reservationStatusDisplay(order?.status);
  const countdown = useCountdown(
    order?.status === 'confirmed' ? order.qrExpiresAt : null
  );
  const [cancelling, setCancelling] = useState(false);
  const [ratingVisible, setRatingVisible] = useState(false);
  const [justRatedScore, setJustRatedScore] = useState<number | null>(null);
  const [proofVisible, setProofVisible] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);

  const onSubmitRating = (score: number, comment?: string) => {
    if (!id) return;
    rateMut.mutate(
      { id, score, comment },
      {
        onSuccess: () => {
          setJustRatedScore(score);
          setRatingVisible(false);
          Popup.show({ type: 'success', text1: 'Cảm ơn đánh giá của bạn' });
        },
        onError: (e: any) => {
          Popup.show({
            type: 'error',
            text1: 'Gửi đánh giá thất bại',
            text2: e?.response?.data?.error?.message ?? 'Vui lòng thử lại.',
          });
        },
      }
    );
  };

  const onShareToken = async () => {
    if (!order?.qrToken) return;
    try {
      await Share.share({ message: order.qrToken });
    } catch {
      // người dùng đóng share sheet — bỏ qua
    }
  };

  const onCancel = () => {
    if (!id) return;
    setCancelling(true);
    cancelMut.mutate(
      { id },
      {
        onSuccess: () => {
          Popup.show({ type: 'success', text1: 'Đã huỷ đơn', text2: 'Đơn đặt của bạn đã được huỷ.' });
          router.back();
        },
        onError: (e: any) => {
          setCancelling(false);
          Popup.show({
            type: 'error',
            text1: 'Huỷ không thành công',
            text2: e?.response?.data?.error?.message ?? 'Vui lòng thử lại.',
          });
        },
      }
    );
  };

  const Header = (
    <View style={styles.header}>
      <Pressable onPress={() => router.back()} hitSlop={8}>
        <MaterialCommunityIcons name="arrow-left" size={24} color={COLORS.onSurface} />
      </Pressable>
      <Text variant="titleMedium" style={styles.headerTitle}>Chi tiết đơn</Text>
      <View style={{ width: 24 }} />
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {Header}
        <ScreenState kind="loading" title="Đang tải đơn đặt" />
      </SafeAreaView>
    );
  }

  if (isError || !order) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {Header}
        <ScreenState kind="error" title="Không tải được đơn đặt" actionLabel="Thử lại" onAction={() => refetch()} />
      </SafeAreaView>
    );
  }

  const provider = order.listing.provider;
  const showQr = order.status === 'confirmed' && !!order.qrToken;
  const ratedScore = justRatedScore ?? order.ratedScore ?? null;
  const completed = order.status === 'completed';
  const alreadyRated = ratedScore != null;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {Header}

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.badgeRow}>
          <View style={[styles.badge, { backgroundColor: sd.bg }]}>
            <Text style={[styles.badgeText, { color: sd.fg }]}>{sd.label}</Text>
          </View>
        </View>

        {/* QR pickup */}
        {showQr ? (
          <View style={styles.qrCard}>
            <Text style={styles.qrHint}>Trình mã này cho nhà cung cấp khi đến lấy</Text>
            <View style={styles.qrBox}>
              <QRDisplay value={order.qrToken!} size={220} />
            </View>
            {countdown ? (
              <View style={styles.countdownRow}>
                <MaterialCommunityIcons name="clock-outline" size={16} color="#1d4ed8" />
                <Text style={styles.countdown}>Hết hạn sau {countdown}</Text>
              </View>
            ) : (
              <Text style={[styles.countdown, { color: COLORS.danger }]}>Mã QR đã hết hạn</Text>
            )}

            {/* Mã token dạng text — để test/nhập thủ công ở màn Quét QR của provider */}
            <View style={styles.tokenWrap}>
              <Text style={styles.tokenLabel}>Mã đặt chỗ (nhập thủ công khi test)</Text>
              <Text selectable style={styles.tokenText}>{order.qrToken}</Text>
            </View>
            <Button
              mode="text"
              icon="share-variant"
              textColor={COLORS.primary}
              onPress={onShareToken}
              compact
            >
              Chia sẻ / sao chép mã
            </Button>
          </View>
        ) : null}

        {/* Món + đơn */}
        <Text style={styles.sectionLabel}>Món đã đặt</Text>
        <View style={styles.itemRow}>
          <AppImage source={{ uri: order.listing.imageUrls?.[0] }} style={styles.itemImage} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.itemTitle} numberOfLines={2}>{order.listing.title}</Text>
            <Text style={styles.meta}>
              Số lượng: {order.quantity} {order.listing.quantityUnit}
            </Text>
          </View>
        </View>

        <Row
          icon="clock-outline"
          text={formatPickupWindow(order.listing.pickupStartTime, order.listing.pickupEndTime)}
        />
        <Row icon="map-marker-outline" text={order.listing.pickupAddress} />
        {order.receiverNotes ? (
          <Row icon="note-text-outline" text={order.receiverNotes} />
        ) : null}
        <Row icon="calendar-outline" text={`Đặt lúc ${fmtDateTime(order.createdAt)}`} />

        {/* Nhà cung cấp */}
        <Text style={styles.sectionLabel}>Nhà cung cấp</Text>
        <View style={styles.providerRow}>
          <View style={[styles.avatar, styles.avatarEmpty]}>
            <MaterialCommunityIcons name="store" size={26} color={COLORS.onSurfaceVariant} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.providerName}>{provider.businessName}</Text>
            {provider.address ? (
              <Text style={styles.meta} numberOfLines={1}>{provider.address}</Text>
            ) : null}
          </View>
          {provider.contactPhone ? (
            <Pressable
              onPress={() => Linking.openURL(`tel:${provider.contactPhone}`)}
              hitSlop={8}
              style={styles.callBtn}
            >
              <MaterialCommunityIcons name="phone" size={20} color={COLORS.primary} />
            </Pressable>
          ) : null}
        </View>

        {/* Theo dõi giao hàng (đơn giao tận nơi) */}
        {order.delivery ? <DeliveryTrackingCard reservationId={order.id} /> : null}

        {/* Đánh giá đã gửi */}
        {completed && alreadyRated ? (
          <>
            <Text style={styles.sectionLabel}>Đánh giá của bạn</Text>
            <View style={styles.ratedRow}>
              {[1, 2, 3, 4, 5].map((n) => (
                <MaterialCommunityIcons
                  key={n}
                  name={n <= ratedScore ? 'star' : 'star-outline'}
                  size={26}
                  color={n <= ratedScore ? '#f59e0b' : COLORS.outline}
                />
              ))}
            </View>
          </>
        ) : null}

        {/* Báo cáo vấn đề */}
        <Button
          mode="text"
          icon="flag-outline"
          textColor={COLORS.onSurfaceVariant}
          onPress={() => setReportVisible(true)}
          style={styles.reportBtn}
        >
          Báo cáo vấn đề
        </Button>
      </ScrollView>

      {order.status === 'confirmed' ? (
        <View style={styles.footer}>
          <Button
            mode="outlined"
            icon="close-circle-outline"
            textColor={COLORS.danger}
            onPress={onCancel}
            loading={cancelling}
            disabled={cancelling}
            style={[styles.actionBtn, { borderColor: COLORS.danger }]}
            labelStyle={{ fontSize: 15, fontWeight: '700' }}
          >
            Huỷ đơn
          </Button>
        </View>
      ) : order.status === 'picked_up' ? (
        <View style={styles.footer}>
          <Button
            mode="contained"
            icon="face-recognition"
            buttonColor={COLORS.primary}
            onPress={() => setProofVisible(true)}
            style={styles.actionBtn}
            labelStyle={{ fontSize: 15, fontWeight: '700' }}
          >
            Xác minh nhận hàng
          </Button>
        </View>
      ) : completed && !alreadyRated ? (
        <View style={styles.footer}>
          <Button
            mode="contained"
            icon="star"
            buttonColor={COLORS.primary}
            onPress={() => setRatingVisible(true)}
            style={styles.actionBtn}
            labelStyle={{ fontSize: 15, fontWeight: '700' }}
          >
            Đánh giá nhà cung cấp
          </Button>
        </View>
      ) : null}

      <RatingDialog
        visible={ratingVisible}
        providerName={provider.businessName}
        submitting={rateMut.isPending}
        onDismiss={() => setRatingVisible(false)}
        onSubmit={onSubmitRating}
      />

      <PickupProofDialog
        visible={proofVisible}
        reservationId={id!}
        onDismiss={() => setProofVisible(false)}
        onCompleted={() => {
          setProofVisible(false);
          refetch();
        }}
      />

      <ReportDialog
        visible={reportVisible}
        listingId={order.listingId}
        onDismiss={() => setReportVisible(false)}
      />
    </SafeAreaView>
  );
}

function Row({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.row}>
      <MaterialCommunityIcons
        name={icon as keyof typeof MaterialCommunityIcons.glyphMap}
        size={20}
        color={COLORS.primary}
      />
      <Text style={styles.rowText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    height: 56, paddingHorizontal: 16, backgroundColor: COLORS.surface,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 1, borderBottomColor: COLORS.outline,
  },
  headerTitle: { fontWeight: '700', color: COLORS.onSurface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  content: { padding: 20, paddingBottom: 24 },
  badgeRow: { flexDirection: 'row', alignItems: 'center' },
  badge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  qrCard: {
    marginTop: 16, padding: 20, borderRadius: 16, backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.outline, alignItems: 'center', gap: 12,
  },
  qrHint: { fontSize: 13, color: COLORS.onSurfaceVariant, textAlign: 'center' },
  qrBox: { padding: 12, backgroundColor: '#fff', borderRadius: 12 },
  countdownRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  countdown: { fontSize: 14, fontWeight: '700', color: '#1d4ed8' },
  tokenWrap: {
    width: '100%', marginTop: 4, padding: 10, borderRadius: 10,
    backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: COLORS.outline,
  },
  tokenLabel: { fontSize: 11, color: COLORS.onSurfaceVariant, marginBottom: 4 },
  tokenText: { fontSize: 12, color: COLORS.onSurface, fontFamily: 'monospace' },
  sectionLabel: {
    fontSize: 13, fontWeight: '700', color: COLORS.onSurfaceVariant,
    marginTop: 22, marginBottom: 8, textTransform: 'uppercase',
  },
  itemRow: { flexDirection: 'row', gap: 12 },
  itemImage: { width: 72, height: 72, borderRadius: 12, backgroundColor: COLORS.outline },
  itemTitle: { fontSize: 15, fontWeight: '700', color: COLORS.onSurface },
  meta: { fontSize: 14, color: COLORS.onSurfaceVariant },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  rowText: { flex: 1, fontSize: 15, color: COLORS.onSurface },
  providerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.outline },
  avatarEmpty: { alignItems: 'center', justifyContent: 'center' },
  providerName: { fontSize: 16, fontWeight: '700', color: COLORS.onSurface },
  ratedRow: { flexDirection: 'row', gap: 4 },
  reportBtn: { alignSelf: 'center', marginTop: 24 },
  callBtn: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#ecfdf5',
  },
  footer: {
    padding: 16, borderTopWidth: 1, borderTopColor: COLORS.outline, backgroundColor: COLORS.surface,
  },
  actionBtn: { borderRadius: 12, paddingVertical: 4 },
});
