import { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator, Button, ProgressBar, Text, TextInput } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
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
import { StatusBadge } from '@/components/ui/StatusBadge';
import { captureImage } from '@/services/faceCapture';
import { getCurrentCoords, type Coords } from '@/services/geolocation';
import { reverseGeocode } from '@/services/geocoding';
import { notifyError, notifySuccess, notifyWarning } from '@/services/haptics';
import { mobileColors as COLORS, elevation, radius, spacing } from '@/theme/design';

function errorMessage(e: unknown, fallback: string): string {
  return (
    (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ??
    (e as Error)?.message ??
    fallback
  );
}

function formatQty(value: number, unit = 'phần'): string {
  return `${value} ${unit}`;
}

function statusMeta(status: string): { label: string; tone: 'neutral' | 'success' | 'warning' | 'danger' | 'info' } {
  if (status === 'completed' || status === 'picked_up') return { label: status === 'completed' ? 'Hoàn tất' : 'Đang phát', tone: 'success' };
  if (status === 'requested') return { label: 'Chờ duyệt', tone: 'warning' };
  if (status === 'rejected') return { label: 'Bị từ chối', tone: 'danger' };
  if (status === 'approved') return { label: 'Đã duyệt', tone: 'info' };
  return { label: status, tone: 'neutral' };
}

function mapsUrl(address?: string | null, coords?: { lat: number; lng: number } | null): string | null {
  const target = coords ? `${coords.lat},${coords.lng}` : address?.trim();
  return target ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(target)}` : null;
}

// ─── Listing picker card ────────────────────────────────────────────────────

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
      <View style={styles.listingRow}>
        <View style={styles.listingInfo}>
          <Text style={[styles.listingTitle, selected && styles.listingTitleSelected]} numberOfLines={1}>
            {listing.title}
          </Text>
          <Text style={styles.listingSub} numberOfLines={1}>
            {listing.pickupAddress}
          </Text>
        </View>
        <View style={[styles.listingQtyBadge, selected && styles.listingQtyBadgeSelected]}>
          <Text style={[styles.listingQtyText, selected && styles.listingQtyTextSelected]}>
            Còn {listing.quantityRemaining}
          </Text>
          <Text style={[styles.listingUnit, selected && styles.listingQtyTextSelected]}>
            {listing.quantityUnit}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

// ─── Single stop row ────────────────────────────────────────────────────────

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
          {served ? (
            <MaterialCommunityIcons name="check" size={14} color={COLORS.onPrimary} />
          ) : (
            <Text style={styles.stopIndexText}>{index + 1}</Text>
          )}
        </View>
        <View style={styles.stopInfo}>
          <Text style={styles.stopTitle} numberOfLines={1}>{stop.label}</Text>
          <Text style={styles.stopSub} numberOfLines={1}>
            {stop.address ?? 'Chưa có địa chỉ'}
            {stop.createdBy === 'provider' ? ' · NCC gợi ý' : ''}
            {stop.plannedQty ? ` · dự kiến ${formatQty(stop.plannedQty)}` : ''}
          </Text>
        </View>
        {served ? (
          <View style={styles.stopDoneBadge}>
            <Text style={styles.stopDoneText}>+{formatQty(stop.servedQty)}</Text>
          </View>
        ) : canServe ? (
          <Button compact mode="contained-tonal" onPress={() => setOpen((v) => !v)}
            buttonColor={open ? COLORS.surfaceVariant : COLORS.primaryContainer}
            textColor={open ? COLORS.onSurfaceVariant : COLORS.primary}
          >
            {open ? 'Đóng' : 'Phát'}
          </Button>
        ) : null}
      </View>

      {open && canServe ? (
        <View style={styles.stopForm}>
          <TextInput
            mode="outlined"
            value={qty}
            onChangeText={(text) => setQty(text.replace(/\D/g, ''))}
            label={`Số phần phát · còn ${remaining} tổng`}
            keyboardType="number-pad"
            dense
          />
          <TextInput
            mode="outlined"
            value={note}
            onChangeText={setNote}
            label="Ghi chú (tuỳ chọn)"
            dense
          />
          <View style={styles.row}>
            <Button mode="outlined" onPress={() => submit(false)} disabled={busy} style={styles.flexBtn}>
              Ghi nhận
            </Button>
            <Button mode="contained" onPress={() => submit(true)} disabled={busy} style={styles.flexBtn}
              icon="camera-outline"
            >
              Kèm ảnh
            </Button>
          </View>
        </View>
      ) : null}
    </View>
  );
}

// ─── Add-stop form (collapsible) ────────────────────────────────────────────

function AddStopForm({
  busy,
  onAdd,
}: {
  busy: boolean;
  onAdd: (label: string, address: string, plannedQty: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [address, setAddress] = useState('');
  const [plannedQty, setPlannedQty] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleAdd = async () => {
    if (!label.trim()) {
      Popup.show({ type: 'warning', text1: 'Nhập tên điểm phát' });
      return;
    }
    setSubmitting(true);
    try {
      await onAdd(label.trim(), address.trim(), plannedQty);
      setLabel('');
      setAddress('');
      setPlannedQty('');
      setOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.addStopWrap}>
      <Button
        mode="contained-tonal"
        icon={open ? 'chevron-up' : 'map-marker-plus-outline'}
        onPress={() => setOpen((v) => !v)}
        buttonColor={open ? COLORS.surfaceVariant : COLORS.secondaryContainer}
        textColor={open ? COLORS.onSurfaceVariant : COLORS.secondary}
        style={styles.addStopToggle}
      >
        {open ? 'Đóng form' : 'Thêm điểm phát'}
      </Button>
      {open ? (
        <View style={styles.addStopForm}>
          <TextInput mode="outlined" label="Tên điểm phát *" value={label} onChangeText={setLabel} dense />
          <TextInput mode="outlined" label="Địa chỉ (tuỳ chọn)" value={address} onChangeText={setAddress} dense />
          <TextInput
            mode="outlined"
            label="Số phần dự kiến (tuỳ chọn)"
            value={plannedQty}
            onChangeText={(t) => setPlannedQty(t.replace(/\D/g, ''))}
            keyboardType="number-pad"
            dense
          />
          <Button
            mode="contained"
            icon="crosshairs-gps"
            disabled={busy || submitting}
            loading={submitting}
            onPress={handleAdd}
          >
            Ghim bằng vị trí hiện tại
          </Button>
        </View>
      ) : null}
    </View>
  );
}

// ─── Main screen ────────────────────────────────────────────────────────────

export default function VolunteerBulkRunScreen() {
  const { data: runs, isLoading, isError, refetch, isRefetching } = useMyBulkRuns();
  const [currentCoords, setCurrentCoords] = useState<Coords | null>(null);
  const listings = useListings({ coords: currentCoords, radiusKm: 15, limit: 20 });
  const requestRun = useRequestBulkRun();
  const pickupRun = usePickupBulkRun();
  const addStop = useAddBulkStop();
  const serveStop = useServeBulkStop();
  const completeRun = useCompleteBulkRun();
  const cancelRun = useCancelBulkRun();

  const [selectedListingId, setSelectedListingId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    let active = true;
    getCurrentCoords().then(({ coords }) => {
      if (active && coords) setCurrentCoords(coords);
    });
    return () => { active = false; };
  }, []);

  const activeRun = useMemo(() => (runs ?? []).find(isActiveRun) ?? null, [runs]);
  const history = useMemo(() => (runs ?? []).filter((r) => !isActiveRun(r)).slice(0, 5), [runs]);
  const eligible = useMemo(
    () => (listings.data?.items ?? []).filter((item) => item.quantityRemaining >= BULK_MIN_QTY),
    [listings.data?.items],
  );

  const busy =
    requestRun.isPending || pickupRun.isPending || addStop.isPending ||
    serveStop.isPending || completeRun.isPending || cancelRun.isPending;

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
      Popup.show({ type: 'warning', text1: `Tối thiểu ${BULK_MIN_QTY} phần` });
      return;
    }
    void act(async () => {
      await requestRun.mutateAsync({ listingId: selectedListingId, quantity: q, note: note.trim() || undefined });
      setSelectedListingId(null);
      setQuantity('');
      setNote('');
    }, 'Đã gửi yêu cầu — chờ nhà cung cấp duyệt.');
  };

  const handlePickup = (run: BulkRun, withPhoto: boolean) => {
    void act(async () => {
      const photo = withPhoto ? await captureImage('id_card') : null;
      if (withPhoto && !photo) return;
      await pickupRun.mutateAsync({ runId: run.id, photo: photo ?? undefined });
    }, 'Đã xác nhận lấy hàng.');
  };

  const handleAddStop = async (run: BulkRun, label: string, addressText: string, plannedQtyText: string) => {
    const pos = await getCurrentCoords();
    if (!pos.coords) {
      Popup.show({ type: 'warning', text1: 'Chưa lấy được vị trí', text2: 'Hãy bật GPS và thử lại.' });
      return;
    }
    const address = addressText || (await reverseGeocode(pos.coords.lat, pos.coords.lng)) || undefined;
    await addStop.mutateAsync({
      runId: run.id,
      label,
      address,
      lng: pos.coords.lng,
      lat: pos.coords.lat,
      plannedQty: plannedQtyText ? Number(plannedQtyText) : undefined,
    });
    void notifySuccess();
    Toast.show({ type: 'success', text1: 'Đã ghim điểm phát.' });
  };

  const handleServe = (run: BulkRun, stop: BulkRunStop, servedQty: number, noteText?: string, withPhoto = false) => {
    void act(async () => {
      const photo = withPhoto ? await captureImage('id_card') : null;
      if (withPhoto && !photo) return;
      await serveStop.mutateAsync({ runId: run.id, stopId: stop.id, servedQty, note: noteText, photo: photo ?? undefined });
    }, 'Đã ghi nhận phát hàng.');
  };

  const openPickupMap = async (run: BulkRun) => {
    const url = mapsUrl(run.listing.pickupAddress, run.pickupCoords ?? null);
    if (!url) { Popup.show({ type: 'warning', text1: 'Thiếu địa chỉ lấy hàng' }); return; }
    await Linking.openURL(url);
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScreenHeader title="Giao sỉ" />
        <View style={styles.center}><ActivityIndicator color={COLORS.primary} /></View>
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

  const remaining = activeRun ? activeRun.quantity - activeRun.quantityDistributed : 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title="Giao sỉ" />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => { void refetch(); void listings.refetch(); }}
            tintColor={COLORS.primary}
          />
        }
      >

        {/* ── No active run: listing picker + request form ── */}
        {!activeRun ? (
          <>
            <View style={styles.heroBulk}>
              <View style={styles.heroIcon}>
                <MaterialCommunityIcons name="package-variant-closed" size={26} color={COLORS.amber} />
              </View>
              <View style={styles.heroText}>
                <Text style={styles.heroTitle}>Nhận sỉ, phát nhiều điểm</Text>
                <Text style={styles.heroSub}>
                  Tối thiểu {BULK_MIN_QTY} phần. Phần chưa phát sẽ hoàn về tin khi kết thúc.
                </Text>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>1. Chọn tin thực phẩm</Text>
              {listings.isLoading ? (
                <ActivityIndicator color={COLORS.primary} />
              ) : eligible.length === 0 ? (
                <View style={styles.emptyBox}>
                  <MaterialCommunityIcons name="package-variant-closed-remove" size={32} color={COLORS.onSurfaceVariant} />
                  <Text style={styles.emptyHint}>
                    Chưa có tin nào còn đủ {BULK_MIN_QTY} phần trong bán kính 15 km.
                  </Text>
                </View>
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
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>2. Số phần & ghi chú</Text>
              <TextInput
                mode="outlined"
                label={`Số phần muốn nhận (tối thiểu ${BULK_MIN_QTY})`}
                value={quantity}
                onChangeText={(text) => setQuantity(text.replace(/\D/g, ''))}
                keyboardType="number-pad"
                left={<TextInput.Icon icon="basket-outline" />}
              />
              <TextInput
                mode="outlined"
                label="Ghi chú tuyến phát (tuỳ chọn)"
                value={note}
                onChangeText={setNote}
                multiline
                numberOfLines={3}
              />
              <Button
                mode="contained"
                icon="send-outline"
                disabled={busy || !selectedListingId || !quantity}
                loading={requestRun.isPending}
                onPress={handleRequest}
                style={styles.primaryBtn}
                contentStyle={styles.primaryBtnContent}
                labelStyle={styles.primaryBtnLabel}
              >
                Gửi yêu cầu giao sỉ
              </Button>
            </View>
          </>
        ) : (
          /* ── Has active run ── */
          <>
            {/* Run header */}
            <View style={styles.runHeader}>
              <View style={styles.runHeaderTop}>
                <View style={styles.runHeaderIcon}>
                  <MaterialCommunityIcons name="truck-delivery-outline" size={24} color={COLORS.amber} />
                </View>
                <View style={styles.runHeaderInfo}>
                  <Text style={styles.runTitle} numberOfLines={2}>{activeRun.listing.title}</Text>
                  <Text style={styles.runAddress} numberOfLines={1}>
                    Lấy tại: {activeRun.listing.pickupAddress}
                  </Text>
                </View>
                <StatusBadge label={statusMeta(activeRun.status).label} tone={statusMeta(activeRun.status).tone} />
              </View>

              {/* Progress */}
              <View style={styles.progressBlock}>
                <View style={styles.rowBetween}>
                  <Text style={styles.progressLabel}>Đã phát</Text>
                  <Text style={styles.progressValue}>
                    {activeRun.quantityDistributed} / {activeRun.quantity} phần
                  </Text>
                </View>
                <ProgressBar
                  progress={activeRun.quantity > 0 ? activeRun.quantityDistributed / activeRun.quantity : 0}
                  color={COLORS.amber}
                  style={styles.progressBar}
                />
                {remaining > 0 ? (
                  <Text style={styles.progressRemaining}>Còn {remaining} phần chưa phát</Text>
                ) : (
                  <Text style={[styles.progressRemaining, { color: COLORS.teal }]}>Đã phát hết</Text>
                )}
              </View>
            </View>

            {/* Phase: requested — chờ duyệt */}
            {activeRun.status === 'requested' ? (
              <View style={styles.phaseCard}>
                <View style={styles.phaseIconWrap}>
                  <MaterialCommunityIcons name="clock-outline" size={28} color={COLORS.warning} />
                </View>
                <Text style={styles.phaseTitle}>Chờ nhà cung cấp duyệt</Text>
                <Text style={styles.phaseDesc}>
                  Yêu cầu {formatQty(activeRun.quantity)} của bạn đang chờ được xem xét. Thường trong vòng 24 giờ.
                </Text>
                <Button
                  mode="outlined"
                  textColor={COLORS.danger}
                  icon="close-circle-outline"
                  disabled={busy}
                  onPress={() => void act(() => cancelRun.mutateAsync(activeRun.id), 'Đã huỷ yêu cầu.')}
                  style={styles.cancelBtn}
                >
                  Huỷ yêu cầu
                </Button>
              </View>
            ) : null}

            {/* Phase: approved — đi lấy hàng */}
            {activeRun.status === 'approved' ? (
              <View style={styles.phaseCard}>
                <View style={[styles.phaseIconWrap, { backgroundColor: COLORS.infoContainer }]}>
                  <MaterialCommunityIcons name="store-check-outline" size={28} color={COLORS.blue} />
                </View>
                <Text style={styles.phaseTitle}>Đã duyệt — hãy đi lấy hàng</Text>
                <Text style={styles.phaseDesc}>
                  Đến địa chỉ bên dưới để lấy {formatQty(activeRun.quantity)}, sau đó xác nhận để bắt đầu phát.
                </Text>

                <Pressable style={styles.addressRow} onPress={() => void openPickupMap(activeRun)}>
                  <MaterialCommunityIcons name="map-marker-outline" size={18} color={COLORS.blue} />
                  <Text style={styles.addressText} numberOfLines={2}>{activeRun.listing.pickupAddress}</Text>
                  <MaterialCommunityIcons name="open-in-new" size={16} color={COLORS.blue} />
                </Pressable>

                <Button
                  mode="contained"
                  icon="camera-outline"
                  disabled={busy}
                  loading={pickupRun.isPending}
                  onPress={() => handlePickup(activeRun, true)}
                  style={styles.primaryBtn}
                  contentStyle={styles.primaryBtnContent}
                  labelStyle={styles.primaryBtnLabel}
                >
                  Chụp ảnh QC & Xác nhận lấy hàng
                </Button>
                <Button
                  mode="text"
                  textColor={COLORS.onSurfaceVariant}
                  disabled={busy}
                  onPress={() => handlePickup(activeRun, false)}
                >
                  Xác nhận không cần ảnh
                </Button>
                <Button
                  mode="text"
                  textColor={COLORS.danger}
                  icon="close-circle-outline"
                  disabled={busy}
                  onPress={() => void act(
                    () => cancelRun.mutateAsync(activeRun.id),
                    'Đã huỷ chuyến, kho được hoàn lại.'
                  )}
                >
                  Huỷ chuyến
                </Button>
              </View>
            ) : null}

            {/* Phase: approved | picked_up — quản lý điểm phát */}
            {['approved', 'picked_up'].includes(activeRun.status) ? (
              <View style={styles.card}>
                <View style={styles.rowBetween}>
                  <Text style={styles.sectionTitle}>
                    Điểm phát ({activeRun.stops.length})
                  </Text>
                  {activeRun.stops.filter((s) => s.servedQty > 0).length > 0 ? (
                    <Text style={styles.stopsServedLabel}>
                      {activeRun.stops.filter((s) => s.servedQty > 0).length} đã phát
                    </Text>
                  ) : null}
                </View>

                {activeRun.stops.length === 0 ? (
                  <Text style={styles.emptyHint}>Chưa có điểm phát. Thêm bên dưới hoặc chờ nhà cung cấp ghim.</Text>
                ) : (
                  <View style={styles.stopList}>
                    {activeRun.stops.map((stop, index) => (
                      <StopItem
                        key={stop.id}
                        stop={stop}
                        index={index}
                        remaining={remaining}
                        canServe={activeRun.status === 'picked_up'}
                        busy={busy}
                        onServe={(servedQty, noteText, withPhoto) =>
                          handleServe(activeRun, stop, servedQty, noteText, withPhoto)
                        }
                      />
                    ))}
                  </View>
                )}

                <AddStopForm
                  busy={busy}
                  onAdd={(label, address, plannedQtyText) =>
                    handleAddStop(activeRun, label, address, plannedQtyText)
                  }
                />
              </View>
            ) : null}

            {/* Phase: picked_up — hoàn tất */}
            {activeRun.status === 'picked_up' ? (
              <Button
                mode="contained"
                icon="flag-checkered"
                disabled={busy}
                loading={completeRun.isPending}
                onPress={() => void act(
                  () => completeRun.mutateAsync(activeRun.id),
                  remaining > 0
                    ? `Đã kết thúc — ${remaining} phần dư hoàn về kho.`
                    : 'Chuyến giao sỉ hoàn tất!'
                )}
                style={styles.primaryBtn}
                contentStyle={styles.primaryBtnContent}
                labelStyle={styles.primaryBtnLabel}
                buttonColor={COLORS.teal}
              >
                {remaining > 0 ? `Kết thúc chuyến · ${remaining} phần dư hoàn kho` : 'Hoàn tất chuyến'}
              </Button>
            ) : null}
          </>
        )}

        {/* ── History ── */}
        {history.length > 0 ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Chuyến gần đây</Text>
            {history.map((run) => {
              const meta = statusMeta(run.status);
              return (
                <View key={run.id} style={styles.historyRow}>
                  <View style={[styles.historyIcon, run.status === 'completed' && styles.historyIconDone]}>
                    <MaterialCommunityIcons
                      name={run.status === 'completed' ? 'check-circle-outline' : 'close-circle-outline'}
                      size={18}
                      color={run.status === 'completed' ? COLORS.teal : COLORS.onSurfaceVariant}
                    />
                  </View>
                  <View style={styles.historyText}>
                    <Text style={styles.historyTitle} numberOfLines={1}>{run.listing.title}</Text>
                    <Text style={styles.historySub}>
                      {run.quantityDistributed}/{run.quantity} phần · {run.stops.filter((s) => s.servedQty > 0).length} điểm
                    </Text>
                  </View>
                  <StatusBadge label={meta.label} tone={meta.tone} />
                </View>
              );
            })}
          </View>
        ) : null}

      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: spacing.lg, paddingBottom: 120, gap: spacing.md },

  heroBulk: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: 28,
    backgroundColor: COLORS.heroBulk,
    ...elevation.card,
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  heroText: { flex: 1 },
  heroTitle: { fontWeight: '900', color: COLORS.onPrimary, fontSize: 20, lineHeight: 26 },
  heroSub: { color: COLORS.amberContainer, marginTop: 4, fontSize: 12, lineHeight: 17, fontWeight: '600' },

  card: {
    gap: 12,
    padding: spacing.lg,
    borderRadius: 24,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    ...elevation.card,
  },
  sectionTitle: { fontWeight: '800', color: COLORS.onSurface, fontSize: 15 },

  // Run header
  runHeader: {
    gap: 12,
    padding: spacing.lg,
    borderRadius: 24,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    ...elevation.card,
  },
  runHeaderTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  runHeaderIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.amberContainer,
  },
  runHeaderInfo: { flex: 1 },
  runTitle: { fontWeight: '900', color: COLORS.onSurface, fontSize: 18, lineHeight: 24 },
  runAddress: { color: COLORS.onSurfaceVariant, fontSize: 12, marginTop: 2 },
  progressBlock: { gap: 6, padding: 12, borderRadius: 16, backgroundColor: COLORS.surfaceContainerLow },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressLabel: { color: COLORS.onSurfaceVariant, fontSize: 12, fontWeight: '700' },
  progressValue: { color: COLORS.onSurface, fontSize: 13, fontWeight: '800' },
  progressBar: { borderRadius: 6, height: 8 },
  progressRemaining: { color: COLORS.onSurfaceVariant, fontSize: 12, fontWeight: '600', textAlign: 'right' },

  // Phase cards
  phaseCard: {
    gap: 10,
    padding: spacing.lg,
    borderRadius: 24,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    alignItems: 'center',
    ...elevation.card,
  },
  phaseIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.warningContainer,
  },
  phaseTitle: { fontWeight: '900', fontSize: 18, color: COLORS.onSurface, textAlign: 'center' },
  phaseDesc: { fontSize: 13, lineHeight: 19, color: COLORS.onSurfaceVariant, textAlign: 'center' },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 14,
    backgroundColor: COLORS.blueContainer,
    width: '100%',
  },
  addressText: { flex: 1, fontSize: 13, fontWeight: '700', color: COLORS.blue },
  cancelBtn: { width: '100%', borderColor: COLORS.errorContainer },

  // Primary action
  primaryBtn: { borderRadius: 16, marginTop: 4, width: '100%' },
  primaryBtnContent: { height: 52 },
  primaryBtnLabel: { fontSize: 15, fontWeight: '800' },

  // Stops
  stopsServedLabel: { fontSize: 12, fontWeight: '700', color: COLORS.teal },
  stopList: { gap: 8 },
  stopCard: {
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    borderRadius: 16,
    padding: 12,
    gap: 10,
    backgroundColor: COLORS.surface,
  },
  stopCardDone: { borderColor: COLORS.tealContainer, backgroundColor: COLORS.tealContainer },
  stopTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stopIndex: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.warning,
  },
  stopIndexDone: { backgroundColor: COLORS.teal },
  stopIndexText: { color: COLORS.onPrimary, fontWeight: '800', fontSize: 12 },
  stopInfo: { flex: 1 },
  stopTitle: { color: COLORS.onSurface, fontWeight: '800', fontSize: 13 },
  stopSub: { color: COLORS.onSurfaceVariant, fontSize: 11, marginTop: 2 },
  stopDoneBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: COLORS.surface,
  },
  stopDoneText: { color: COLORS.teal, fontWeight: '800', fontSize: 12 },
  stopForm: { gap: 8 },
  row: { flexDirection: 'row', gap: 8 },
  flexBtn: { flex: 1 },

  // Add stop
  addStopWrap: { gap: 10 },
  addStopToggle: { borderRadius: 14 },
  addStopForm: {
    gap: 10,
    padding: 12,
    borderRadius: 16,
    backgroundColor: COLORS.surfaceContainerLow,
  },

  // Listing picker
  listingList: { gap: 8 },
  listingCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    padding: 12,
    backgroundColor: COLORS.surface,
  },
  listingCardSelected: { backgroundColor: COLORS.primaryContainer, borderColor: COLORS.primary },
  listingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  listingInfo: { flex: 1 },
  listingTitle: { color: COLORS.onSurface, fontWeight: '800', fontSize: 13 },
  listingTitleSelected: { color: COLORS.primary },
  listingSub: { color: COLORS.onSurfaceVariant, fontSize: 11, marginTop: 2 },
  listingQtyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: COLORS.surfaceVariant,
    alignItems: 'center',
  },
  listingQtyBadgeSelected: { backgroundColor: COLORS.primary },
  listingQtyText: { color: COLORS.blue, fontWeight: '800', fontSize: 12 },
  listingUnit: { color: COLORS.onSurfaceVariant, fontSize: 10, fontWeight: '600' },
  listingQtyTextSelected: { color: COLORS.onPrimary },

  // Empty state
  emptyBox: { alignItems: 'center', gap: 8, paddingVertical: 16 },
  emptyHint: { color: COLORS.onSurfaceVariant, fontSize: 12, lineHeight: 18, textAlign: 'center' },

  // History
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.outlineVariant,
  },
  historyIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surfaceVariant,
  },
  historyIconDone: { backgroundColor: COLORS.tealContainer },
  historyText: { flex: 1 },
  historyTitle: { color: COLORS.onSurface, fontWeight: '800', fontSize: 13 },
  historySub: { color: COLORS.onSurfaceVariant, fontSize: 11, marginTop: 2 },
});
