import { useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator, Button, ProgressBar, Text, TextInput } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { BulkRun, BulkRunStop } from '@foodresq/types';
import {
  BULK_MIN_QTY,
  isActiveRun,
  useAddBulkStop,
  useCancelBulkRun,
  useCompleteBulkRun,
  useMyBulkRuns,
  usePickupBulkRun,
  useRequestBulkRun,
  useServeBulkStop,
} from '@/hooks/useBulkRuns';
import { useListings, type Listing } from '@/hooks/useListings';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Popup, Toast } from '@/components/ui/AppPopup';
import { ScreenState } from '@/components/ui/ScreenState';
import { captureImage } from '@/services/faceCapture';
import { DEFAULT_COORDS, getCurrentCoords } from '@/services/geolocation';
import { reverseGeocode } from '@/services/geocoding';
import { notifyError, notifySuccess, notifyWarning } from '@/services/haptics';
import { mobileColors as COLORS } from '@/theme/design';

const STATUS_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  requested: { label: 'Chờ duyệt', color: '#b45309', bg: '#fef3c7' },
  approved: { label: 'Đã duyệt', color: '#0369a1', bg: '#e0f2fe' },
  picked_up: { label: 'Đang phát', color: '#047857', bg: '#d1fae5' },
  completed: { label: 'Hoàn tất', color: '#ffffff', bg: '#059669' },
  rejected: { label: 'Bị từ chối', color: '#be123c', bg: '#ffe4e6' },
  cancelled: { label: 'Đã huỷ', color: '#4b5563', bg: '#e5e7eb' },
};

function errorMessage(e: unknown, fallback: string): string {
  return (
    (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ??
    (e as Error)?.message ??
    fallback
  );
}

function formatQty(value: number): string {
  return `${value} phần`;
}

function statusMeta(status: string) {
  return STATUS_LABEL[status] ?? { label: status, color: COLORS.onSurfaceVariant, bg: '#f3f4f6' };
}

function mapsUrl(address?: string | null, coords?: { lat: number; lng: number } | null): string | null {
  const target = coords ? `${coords.lat},${coords.lng}` : address?.trim();
  return target ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(target)}` : null;
}

function ListingPickCard({
  listing,
  selected,
  onPress,
}: {
  listing: Listing;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.listingCard, selected && styles.listingCardSelected]}
    >
      <Text style={styles.listingTitle} numberOfLines={1}>
        {listing.title}
      </Text>
      <Text style={styles.listingSub} numberOfLines={1}>
        {listing.pickupAddress}
      </Text>
      <Text style={styles.listingQty}>
        Còn {listing.quantityRemaining} {listing.quantityUnit}
      </Text>
    </Pressable>
  );
}

function StopItem({
  stop,
  index,
  remaining,
  canServe,
  busy,
  onServe,
}: {
  stop: BulkRunStop;
  index: number;
  remaining: number;
  canServe: boolean;
  busy: boolean;
  onServe: (servedQty: number, note?: string, withPhoto?: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const served = stop.servedQty > 0;

  const submit = (withPhoto = false) => {
    const n = Number(qty);
    if (!n || n < 1) {
      Popup.show({ type: 'warning', text1: 'Nhập số phần đã phát' });
      void notifyWarning();
      return;
    }
    if (n > remaining) {
      Popup.show({ type: 'warning', text1: `Chỉ còn ${remaining} phần chưa phát` });
      void notifyWarning();
      return;
    }
    onServe(n, note.trim() || undefined, withPhoto);
    setOpen(false);
    setQty('');
    setNote('');
  };

  return (
    <View style={[styles.stopCard, served && styles.stopCardDone]}>
      <View style={styles.stopTop}>
        <View style={[styles.stopIndex, served && styles.stopIndexDone]}>
          <Text style={styles.stopIndexText}>{index + 1}</Text>
        </View>
        <View style={styles.stopInfo}>
          <Text style={styles.stopTitle} numberOfLines={1}>
            {stop.label}
          </Text>
          <Text style={styles.stopSub} numberOfLines={2}>
            {stop.address ?? 'Chưa có địa chỉ'} · {stop.createdBy === 'provider' ? 'NCC gợi ý' : 'Bạn ghim'}
            {stop.plannedQty ? ` · dự kiến ${formatQty(stop.plannedQty)}` : ''}
          </Text>
        </View>
        {served ? (
          <Text style={styles.stopDoneText}>{formatQty(stop.servedQty)}</Text>
        ) : canServe ? (
          <Button compact mode="text" onPress={() => setOpen((v) => !v)} textColor={COLORS.primary}>
            Phát
          </Button>
        ) : null}
      </View>

      {open && canServe ? (
        <View style={styles.stopForm}>
          <TextInput
            mode="outlined"
            value={qty}
            onChangeText={(text) => setQty(text.replace(/\D/g, ''))}
            label={`Số phần, còn ${remaining}`}
            keyboardType="number-pad"
            dense
          />
          <TextInput
            mode="outlined"
            value={note}
            onChangeText={setNote}
            label="Ghi chú optional"
            dense
          />
          <View style={styles.row}>
            <Button mode="outlined" onPress={() => submit(false)} disabled={busy} style={styles.flexBtn}>
              Ghi nhận
            </Button>
            <Button mode="contained" onPress={() => submit(true)} disabled={busy} style={styles.flexBtn}>
              Kèm ảnh
            </Button>
          </View>
        </View>
      ) : null}
    </View>
  );
}

export default function VolunteerBulkRunScreen() {
  const { data: runs, isLoading, isError, refetch, isRefetching } = useMyBulkRuns();
  const listings = useListings({ coords: DEFAULT_COORDS, radiusKm: 15, limit: 20 });
  const requestRun = useRequestBulkRun();
  const pickupRun = usePickupBulkRun();
  const addStop = useAddBulkStop();
  const serveStop = useServeBulkStop();
  const completeRun = useCompleteBulkRun();
  const cancelRun = useCancelBulkRun();

  const [selectedListingId, setSelectedListingId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const [stopLabel, setStopLabel] = useState('');
  const [stopAddress, setStopAddress] = useState('');
  const [plannedQty, setPlannedQty] = useState('');

  const active = useMemo(() => (runs ?? []).find(isActiveRun) ?? null, [runs]);
  const history = useMemo(() => (runs ?? []).filter((r) => !isActiveRun(r)).slice(0, 5), [runs]);
  const eligible = useMemo(
    () => (listings.data?.items ?? []).filter((item) => item.quantityRemaining >= BULK_MIN_QTY),
    [listings.data?.items],
  );

  const busy =
    requestRun.isPending ||
    pickupRun.isPending ||
    addStop.isPending ||
    serveStop.isPending ||
    completeRun.isPending ||
    cancelRun.isPending;

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      void notifySuccess();
      Toast.show({ type: 'success', text1: ok });
    } catch (e) {
      void notifyError();
      Popup.show({ type: 'error', text1: 'Thao tác thất bại', text2: errorMessage(e, 'Vui lòng thử lại.') });
    }
  };

  const handleRequest = () => {
    const q = Number(quantity);
    if (!selectedListingId) {
      Popup.show({ type: 'warning', text1: 'Chọn một tin thực phẩm' });
      return;
    }
    if (!q || q < BULK_MIN_QTY) {
      Popup.show({ type: 'warning', text1: `Giao sỉ tối thiểu ${BULK_MIN_QTY} phần` });
      return;
    }
    void act(async () => {
      await requestRun.mutateAsync({ listingId: selectedListingId, quantity: q, note: note.trim() || undefined });
      setSelectedListingId(null);
      setQuantity('');
      setNote('');
    }, 'Đã gửi yêu cầu, chờ NCC duyệt.');
  };

  const handlePickup = (run: BulkRun, withPhoto: boolean) => {
    void act(async () => {
      const photo = withPhoto ? await captureImage('id_card') : null;
      if (withPhoto && !photo) return;
      await pickupRun.mutateAsync({ runId: run.id, photo: photo ?? undefined });
    }, 'Đã xác nhận lấy hàng.');
  };

  const handleAddStop = (run: BulkRun) => {
    if (!stopLabel.trim()) {
      Popup.show({ type: 'warning', text1: 'Nhập tên điểm phát' });
      return;
    }
    void act(async () => {
      const pos = await getCurrentCoords();
      const address = stopAddress.trim() || (await reverseGeocode(pos.coords.lat, pos.coords.lng)) || undefined;
      await addStop.mutateAsync({
        runId: run.id,
        label: stopLabel.trim(),
        address,
        lng: pos.coords.lng,
        lat: pos.coords.lat,
        plannedQty: plannedQty ? Number(plannedQty) : undefined,
      });
      setStopLabel('');
      setStopAddress('');
      setPlannedQty('');
    }, 'Đã ghim điểm phát.');
  };

  const handleServe = (run: BulkRun, stop: BulkRunStop, servedQty: number, noteText?: string, withPhoto = false) => {
    void act(async () => {
      const photo = withPhoto ? await captureImage('id_card') : null;
      if (withPhoto && !photo) return;
      await serveStop.mutateAsync({
        runId: run.id,
        stopId: stop.id,
        servedQty,
        note: noteText,
        photo: photo ?? undefined,
      });
    }, 'Đã ghi nhận phát hàng.');
  };

  const openPickupMap = async (run: BulkRun) => {
    const url = mapsUrl(run.listing.pickupAddress, run.pickupCoords ? { lat: run.pickupCoords.lat, lng: run.pickupCoords.lng } : null);
    if (!url) {
      Popup.show({ type: 'warning', text1: 'Thiếu địa chỉ lấy hàng' });
      return;
    }
    await Linking.openURL(url);
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScreenHeader title="Giao sỉ" />
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScreenHeader title="Giao sỉ" />
        <ScreenState kind="error" title="Không tải được chuyến giao sỉ" onAction={() => refetch()} />
      </SafeAreaView>
    );
  }

  const remaining = active ? active.quantity - active.quantityDistributed : 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader
        title="Giao sỉ"
        right={
          <Button compact mode="text" onPress={() => router.back()} textColor={COLORS.primary}>
            Đóng
          </Button>
        }
      />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={undefined}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <MaterialCommunityIcons name="truck-delivery-outline" size={26} color={COLORS.primary} />
          </View>
          <View style={styles.heroText}>
            <Text style={styles.heroTitle}>Nhận nhiều phần, phát nhiều điểm</Text>
            <Text style={styles.heroSub}>Tối thiểu {BULK_MIN_QTY} phần. Phần dư chưa phát sẽ hoàn về tin khi kết thúc.</Text>
          </View>
        </View>

        {active ? (
          <View style={styles.card}>
            <View style={styles.runHead}>
              <View style={styles.runTitleWrap}>
                <Text style={styles.runTitle} numberOfLines={2}>
                  {active.listing.title}
                </Text>
                <Text style={styles.muted} numberOfLines={2}>
                  Lấy tại: {active.listing.pickupAddress}
                </Text>
              </View>
              <View style={[styles.badge, { backgroundColor: statusMeta(active.status).bg }]}>
                <Text style={[styles.badgeText, { color: statusMeta(active.status).color }]}>
                  {statusMeta(active.status).label}
                </Text>
              </View>
            </View>

            <View style={styles.progressBlock}>
              <View style={styles.rowBetween}>
                <Text style={styles.progressText}>
                  Đã phát {active.quantityDistributed}/{active.quantity}
                </Text>
                <Text style={styles.progressText}>{remaining} còn lại</Text>
              </View>
              <ProgressBar progress={active.quantity > 0 ? active.quantityDistributed / active.quantity : 0} color={COLORS.primary} />
            </View>

            {active.status === 'requested' ? (
              <View style={styles.notice}>
                <MaterialCommunityIcons name="clock-outline" size={20} color="#b45309" />
                <Text style={styles.noticeText}>Đang chờ nhà cung cấp duyệt {formatQty(active.quantity)}.</Text>
                <Button mode="text" textColor={COLORS.danger} disabled={busy} onPress={() => void act(() => cancelRun.mutateAsync(active.id), 'Đã huỷ yêu cầu.')}>
                  Huỷ
                </Button>
              </View>
            ) : null}

            {active.status === 'approved' ? (
              <View style={styles.actions}>
                <Button mode="outlined" icon="map-marker-path" onPress={() => void openPickupMap(active)}>
                  Chỉ đường lấy hàng
                </Button>
                <Button mode="contained" icon="camera" disabled={busy} onPress={() => handlePickup(active, true)}>
                  Chụp ảnh & xác nhận
                </Button>
                <Button mode="text" textColor={COLORS.primary} disabled={busy} onPress={() => handlePickup(active, false)}>
                  Xác nhận không ảnh
                </Button>
                <Button mode="text" textColor={COLORS.danger} disabled={busy} onPress={() => void act(() => cancelRun.mutateAsync(active.id), 'Đã huỷ chuyến, kho được hoàn lại.')}>
                  Huỷ chuyến
                </Button>
              </View>
            ) : null}

            {['approved', 'picked_up'].includes(active.status) ? (
              <View style={styles.stopAddBox}>
                <Text style={styles.sectionTitle}>Ghim điểm phát</Text>
                <TextInput
                  mode="outlined"
                  label="Tên điểm phát"
                  value={stopLabel}
                  onChangeText={setStopLabel}
                  dense
                />
                <TextInput
                  mode="outlined"
                  label="Địa chỉ optional"
                  value={stopAddress}
                  onChangeText={setStopAddress}
                  dense
                />
                <TextInput
                  mode="outlined"
                  label="Số phần dự kiến optional"
                  value={plannedQty}
                  onChangeText={(text) => setPlannedQty(text.replace(/\D/g, ''))}
                  keyboardType="number-pad"
                  dense
                />
                <Button mode="contained-tonal" icon="crosshairs-gps" disabled={busy} onPress={() => handleAddStop(active)}>
                  Ghim bằng vị trí hiện tại
                </Button>
              </View>
            ) : null}

            {active.stops.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Điểm phát ({active.stops.length})</Text>
                {active.stops.map((stop, index) => (
                  <StopItem
                    key={stop.id}
                    stop={stop}
                    index={index}
                    remaining={remaining}
                    canServe={active.status === 'picked_up'}
                    busy={busy}
                    onServe={(servedQty, noteText, withPhoto) => handleServe(active, stop, servedQty, noteText, withPhoto)}
                  />
                ))}
              </View>
            ) : (
              <Text style={styles.emptyHint}>Chưa có điểm phát. Bạn hoặc nhà cung cấp có thể ghim điểm trước.</Text>
            )}

            {active.status === 'picked_up' ? (
              <Button
                mode="outlined"
                icon="flag-checkered"
                disabled={busy}
                onPress={() =>
                  void act(
                    () => completeRun.mutateAsync(active.id),
                    remaining > 0 ? `Đã kết thúc, ${remaining} phần dư hoàn kho.` : 'Chuyến hoàn tất.',
                  )
                }
              >
                {remaining > 0 ? `Kết thúc, còn dư ${remaining} phần` : 'Hoàn tất chuyến'}
              </Button>
            ) : null}
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Tạo yêu cầu giao sỉ</Text>
            {listings.isLoading ? (
              <ActivityIndicator color={COLORS.primary} />
            ) : eligible.length === 0 ? (
              <Text style={styles.emptyHint}>Chưa có tin nào còn đủ {BULK_MIN_QTY} phần quanh khu vực test.</Text>
            ) : (
              <View style={styles.listingList}>
                {eligible.map((listing) => (
                  <ListingPickCard
                    key={listing.id}
                    listing={listing}
                    selected={selectedListingId === listing.id}
                    onPress={() => setSelectedListingId(listing.id)}
                  />
                ))}
              </View>
            )}
            <TextInput
              mode="outlined"
              label={`Số phần muốn nhận, tối thiểu ${BULK_MIN_QTY}`}
              value={quantity}
              onChangeText={(text) => setQuantity(text.replace(/\D/g, ''))}
              keyboardType="number-pad"
            />
            <TextInput
              mode="outlined"
              label="Ghi chú tuyến phát optional"
              value={note}
              onChangeText={setNote}
              multiline
            />
            <Button mode="contained" icon="send" disabled={busy} onPress={handleRequest}>
              Gửi yêu cầu
            </Button>
          </View>
        )}

        {history.length > 0 ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Chuyến gần đây</Text>
            {history.map((run) => (
              <View key={run.id} style={styles.historyRow}>
                <View style={styles.historyIcon}>
                  <MaterialCommunityIcons name="history" size={18} color={COLORS.primary} />
                </View>
                <View style={styles.historyText}>
                  <Text style={styles.historyTitle} numberOfLines={1}>
                    {run.listing.title}
                  </Text>
                  <Text style={styles.muted}>
                    {run.quantityDistributed}/{run.quantity} phần · {run.stops.filter((s) => s.servedQty > 0).length} điểm
                  </Text>
                </View>
                <Text style={styles.historyStatus}>{statusMeta(run.status).label}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {isRefetching ? <Text style={styles.refreshText}>Đang làm mới...</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 40, gap: 14 },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 18,
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  heroText: { flex: 1 },
  heroTitle: { fontWeight: '800', color: COLORS.onSurface, fontSize: 16 },
  heroSub: { color: COLORS.onSurfaceVariant, marginTop: 3, fontSize: 12 },
  card: {
    gap: 14,
    padding: 16,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  runHead: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  runTitleWrap: { flex: 1 },
  runTitle: { fontWeight: '800', color: COLORS.onSurface, fontSize: 18 },
  muted: { color: COLORS.onSurfaceVariant, fontSize: 12 },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  badgeText: { fontWeight: '800', fontSize: 11 },
  progressBlock: { gap: 6 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between' },
  progressText: { color: COLORS.onSurfaceVariant, fontWeight: '700', fontSize: 12 },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 14,
    padding: 10,
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  noticeText: { flex: 1, color: '#92400e', fontWeight: '700', fontSize: 12 },
  actions: { gap: 8 },
  stopAddBox: { gap: 10, padding: 12, borderRadius: 16, backgroundColor: '#f9fafb' },
  section: { gap: 8 },
  sectionTitle: { fontWeight: '800', color: COLORS.onSurface, fontSize: 15 },
  emptyHint: { color: COLORS.onSurfaceVariant, fontSize: 12, lineHeight: 18 },
  stopCard: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 16, padding: 12, gap: 10 },
  stopCardDone: { borderColor: '#a7f3d0', backgroundColor: '#ecfdf5' },
  stopTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stopIndex: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f59e0b',
  },
  stopIndexDone: { backgroundColor: COLORS.primary },
  stopIndexText: { color: '#ffffff', fontWeight: '800', fontSize: 12 },
  stopInfo: { flex: 1 },
  stopTitle: { color: COLORS.onSurface, fontWeight: '800', fontSize: 13 },
  stopSub: { color: COLORS.onSurfaceVariant, fontSize: 11, marginTop: 2 },
  stopDoneText: { color: COLORS.primary, fontWeight: '800', fontSize: 12 },
  stopForm: { gap: 8 },
  row: { flexDirection: 'row', gap: 8 },
  flexBtn: { flex: 1 },
  listingList: { gap: 8, maxHeight: 320 },
  listingCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 12,
    backgroundColor: '#ffffff',
  },
  listingCardSelected: { backgroundColor: '#ecfdf5', borderColor: COLORS.primary },
  listingTitle: { color: COLORS.onSurface, fontWeight: '800', fontSize: 13 },
  listingSub: { color: COLORS.onSurfaceVariant, fontSize: 11 },
  listingQty: { color: COLORS.primary, fontWeight: '800', fontSize: 11, marginTop: 2 },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  historyIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ecfdf5',
  },
  historyText: { flex: 1 },
  historyTitle: { color: COLORS.onSurface, fontWeight: '800', fontSize: 13 },
  historyStatus: { color: COLORS.onSurfaceVariant, fontWeight: '800', fontSize: 11 },
  refreshText: { textAlign: 'center', color: COLORS.onSurfaceVariant, fontSize: 12 },
});
