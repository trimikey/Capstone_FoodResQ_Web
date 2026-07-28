import { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, TextInput, Button } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import {
  useCreateCampaign,
  useUploadCampaignImage,
  type CreateCampaignInput,
} from '@/hooks/useCampaigns';
import { getCurrentCoords, type Coords } from '@/services/geolocation';
import { captureImage, pickImageFromLibrary, type CapturedImage } from '@/services/faceCapture';
import { getErrorMessage } from '@/hooks/useErrorHandler';
import { Popup } from '@/components/ui/AppPopup';
import { AddressPicker, type AddressValue } from '@/components/AddressPicker';
import { AppImage } from '@/components/ui/AppImage';
import { mobileColors as COLORS } from '@/theme/design';

const pad = (n: number) => String(n).padStart(2, '0');
const toDateStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toTimeStr = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const fmtDate = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;

/** Chuyển chuỗi số nhập tay → số nguyên không âm (rỗng/không hợp lệ = 0). */
function toInt(s: string): number {
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function isInvalidCount(s: string, allowEmpty = false): boolean {
  if (allowEmpty && !s.trim()) return false;
  const n = Number(s);
  return !Number.isFinite(n) || n < 0;
}

interface MenuRow { name: string; type: string }
interface ScheduleRow { time: string; label: string }
interface SupplyRow { name: string; quantity?: number; unit?: string }

/**
 * Charity-org tạo chiến dịch bếp ăn. Gửi đi với status 'draft' (chờ admin duyệt).
 * Địa chỉ + toạ độ qua AddressPicker; ngày/giờ qua DateTimePicker; menu/lịch
 * trình/vật phẩm là danh sách động (tuỳ chọn). POST /campaigns.
 */
export default function CreateCampaignScreen() {
  const createCampaign = useCreateCampaign();
  const uploadCampaignImage = useUploadCampaignImage();
  const [coords, setCoords] = useState<Coords | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const now = new Date();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState<AddressValue | null>(null);
  const [scheduledDate, setScheduledDate] = useState<Date>(new Date(now.getTime() + 24 * 3600_000));
  const [startTime, setStartTime] = useState<Date>(() => {
    const d = new Date(now.getTime() + 24 * 3600_000);
    d.setHours(8, 0, 0, 0);
    return d;
  });
  const [endTime, setEndTime] = useState<Date>(() => {
    const d = new Date(now.getTime() + 24 * 3600_000);
    d.setHours(12, 0, 0, 0);
    return d;
  });
  const [chefSlots, setChefSlots] = useState('2');
  const [waiterSlots, setWaiterSlots] = useState('3');
  const [shipperSlots, setShipperSlots] = useState('2');
  const [expectedServings, setExpectedServings] = useState('100');

  const [menuItems, setMenuItems] = useState<MenuRow[]>([]);
  const [menuName, setMenuName] = useState('');
  const [menuType, setMenuType] = useState('');

  const [scheduleItems, setScheduleItems] = useState<ScheduleRow[]>([]);
  const [scheduleTime, setScheduleTime] = useState('');
  const [scheduleLabel, setScheduleLabel] = useState('');

  const [supplyItems, setSupplyItems] = useState<SupplyRow[]>([]);
  const [supplyText, setSupplyText] = useState('');
  const [supplyQuantity, setSupplyQuantity] = useState('');
  const [supplyUnit, setSupplyUnit] = useState('');

  useEffect(() => {
    getCurrentCoords().then(({ coords }) => setCoords(coords));
  }, []);

  const addMenu = () => {
    const name = menuName.trim();
    if (!name) return;
    setMenuItems((prev) => [...prev, { name, type: menuType.trim() }]);
    setMenuName('');
    setMenuType('');
  };
  const addSchedule = () => {
    const label = scheduleLabel.trim();
    if (!label) return;
    setScheduleItems((prev) => [...prev, { time: scheduleTime.trim(), label }]);
    setScheduleTime('');
    setScheduleLabel('');
  };
  const addSupply = () => {
    const s = supplyText.trim();
    if (!s) return;
    const quantity = parseInt(supplyQuantity, 10);
    if (supplyQuantity.trim() && (!Number.isFinite(quantity) || quantity <= 0)) {
      Popup.show({ type: 'warning', text1: 'Số lượng vật phẩm không hợp lệ' });
      return;
    }
    setSupplyItems((prev) => [
      ...prev,
      {
        name: s,
        ...(Number.isFinite(quantity) && quantity > 0 ? { quantity } : {}),
        ...(supplyUnit.trim() ? { unit: supplyUnit.trim() } : {}),
      },
    ]);
    setSupplyText('');
    setSupplyQuantity('');
    setSupplyUnit('');
  };

  const uploadImage = async (photo: CapturedImage | null) => {
    if (!photo) return;
    try {
      const res = await uploadCampaignImage.mutateAsync(photo);
      setImageUrl(res.url);
      Popup.show({ type: 'success', text1: 'Đã tải ảnh chiến dịch' });
    } catch (err) {
      Popup.show({ type: 'error', text1: 'Tải ảnh thất bại', text2: getErrorMessage(err) });
    }
  };

  const pickCampaignImage = async () => {
    try {
      await uploadImage(await pickImageFromLibrary('listing'));
    } catch (err) {
      Popup.show({ type: 'error', text1: 'Không chọn được ảnh', text2: getErrorMessage(err) });
    }
  };

  const captureCampaignImage = async () => {
    try {
      await uploadImage(await captureImage('id_card', 'listing'));
    } catch (err) {
      Popup.show({ type: 'error', text1: 'Không chụp được ảnh', text2: getErrorMessage(err) });
    }
  };

  const onSubmit = async () => {
    if (title.trim().length < 5) {
      Popup.show({ type: 'warning', text1: 'Tiêu đề quá ngắn', text2: 'Tiêu đề cần tối thiểu 5 ký tự.' });
      return;
    }
    if (!address?.address.trim()) {
      Popup.show({ type: 'warning', text1: 'Thiếu địa chỉ bếp', text2: 'Vui lòng chọn địa chỉ tổ chức bếp ăn.' });
      return;
    }
    if (toTimeStr(endTime) <= toTimeStr(startTime)) {
      Popup.show({ type: 'warning', text1: 'Giờ không hợp lệ', text2: 'Giờ kết thúc phải sau giờ bắt đầu.' });
      return;
    }
    if ([chefSlots, waiterSlots, shipperSlots].some((value) => isInvalidCount(value))) {
      Popup.show({ type: 'warning', text1: 'Số lượng TNV không hợp lệ', text2: 'Vui lòng nhập số không âm.' });
      return;
    }
    if (isInvalidCount(expectedServings, true) || (expectedServings.trim() && toInt(expectedServings) === 0)) {
      Popup.show({ type: 'warning', text1: 'Số suất không hợp lệ', text2: 'Số suất dự kiến phải lớn hơn 0.' });
      return;
    }

    const payload: CreateCampaignInput = {
      title: title.trim(),
      kitchenAddress: address.address.trim(),
      lat: address.lat,
      lng: address.lng,
      scheduledDate: toDateStr(scheduledDate),
      startTime: toTimeStr(startTime),
      endTime: toTimeStr(endTime),
      chefSlotsNeeded: toInt(chefSlots),
      waiterSlotsNeeded: toInt(waiterSlots),
      shipperSlotsNeeded: toInt(shipperSlots),
      ...(description.trim() ? { description: description.trim() } : {}),
      ...(toInt(expectedServings) ? { expectedServings: toInt(expectedServings) } : {}),
      ...(imageUrl ? { imageUrls: [imageUrl] } : {}),
      ...(menuItems.length ? { menuItems } : {}),
      ...(scheduleItems.length ? { scheduleItems } : {}),
      ...(supplyItems.length ? { supplyItems } : {}),
    };

    try {
      setSubmitting(true);
      await createCampaign.mutateAsync(payload);
      Popup.show({
        type: 'success',
        text1: 'Đã gửi yêu cầu chiến dịch',
        text2: 'Chiến dịch đang chờ quản trị viên duyệt.',
      });
      router.replace('/(app)/charity/campaigns');
    } catch (err) {
      Popup.show({ type: 'error', text1: 'Tạo chiến dịch thất bại', text2: getErrorMessage(err) });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={COLORS.onSurface} />
        </Pressable>
        <Text variant="titleMedium" style={styles.headerTitle}>Tạo chiến dịch bếp ăn</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <CreateIntro />

          <FormSection
            icon="clipboard-text-outline"
            title="Thông tin cơ bản"
            helper="Tên ngắn, rõ mục tiêu để TNV và nhà cung cấp hiểu nhanh."
          >
          <Field label="Tên chiến dịch *">
            <TextInput
              mode="outlined" placeholder="VD: Bếp ăn 0 đồng cuối tuần" value={title} onChangeText={setTitle}
              outlineColor={COLORS.outline} activeOutlineColor={COLORS.primary} style={styles.input}
            />
          </Field>

          <Field label="Mô tả (tuỳ chọn)">
            <TextInput
              mode="outlined" multiline numberOfLines={3} value={description} onChangeText={setDescription}
              outlineColor={COLORS.outline} activeOutlineColor={COLORS.primary} style={styles.input}
            />
          </Field>
          </FormSection>

          <FormSection
            icon="image-outline"
            title="Ảnh chiến dịch"
            helper="Ảnh giúp chiến dịch đáng tin hơn. Có thể bổ sung sau nếu chưa sẵn sàng."
          >
          <Field label="Ảnh chiến dịch (tuỳ chọn)">
            {imageUrl ? (
              <View style={styles.imagePreview}>
                <AppImage source={{ uri: imageUrl }} style={styles.image} />
                <Pressable
                  onPress={() => setImageUrl(null)}
                  style={styles.removeImageBtn}
                  hitSlop={8}
                  disabled={uploadCampaignImage.isPending}
                >
                  <MaterialCommunityIcons name="close" size={18} color="#fff" />
                </Pressable>
              </View>
            ) : (
              <View style={styles.imageActions}>
                <Button
                  mode="outlined"
                  icon="image-plus"
                  onPress={pickCampaignImage}
                  loading={uploadCampaignImage.isPending}
                  disabled={uploadCampaignImage.isPending}
                  textColor={COLORS.primary}
                  style={styles.imageActionBtn}
                >
                  Chọn ảnh
                </Button>
                <Button
                  mode="outlined"
                  icon="camera"
                  onPress={captureCampaignImage}
                  loading={uploadCampaignImage.isPending}
                  disabled={uploadCampaignImage.isPending}
                  textColor={COLORS.primary}
                  style={styles.imageActionBtn}
                >
                  Chụp ảnh
                </Button>
              </View>
            )}
          </Field>
          </FormSection>

          <FormSection
            icon="map-clock-outline"
            title="Thời gian & địa điểm"
            helper="Địa điểm và khung giờ cần chính xác để phối hợp giao nhận."
          >
          <Field label="Địa chỉ bếp *">
            <AddressPicker
              initialCoords={coords}
              value={address}
              onChange={setAddress}
            />
          </Field>

          <Field label="Ngày tổ chức *">
            <PickerButton
              icon="calendar"
              text={fmtDate(scheduledDate)}
              onPress={() =>
                DateTimePickerAndroid.open({
                  value: scheduledDate,
                  mode: 'date',
                  minimumDate: new Date(),
                  onChange: (_e, d) => d && setScheduledDate(d),
                })
              }
            />
          </Field>

          <View style={styles.rowFields}>
            <View style={{ flex: 1 }}>
              <Field label="Giờ bắt đầu *">
                <PickerButton
                  icon="clock-outline"
                  text={toTimeStr(startTime)}
                  onPress={() =>
                    DateTimePickerAndroid.open({
                      value: startTime, mode: 'time', is24Hour: true,
                      onChange: (_e, d) => d && setStartTime(d),
                    })
                  }
                />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Giờ kết thúc *">
                <PickerButton
                  icon="clock-outline"
                  text={toTimeStr(endTime)}
                  onPress={() =>
                    DateTimePickerAndroid.open({
                      value: endTime, mode: 'time', is24Hour: true,
                      onChange: (_e, d) => d && setEndTime(d),
                    })
                  }
                />
              </Field>
            </View>
          </View>
          </FormSection>

          <FormSection
            icon="account-group-outline"
            title="Mục tiêu phục vụ"
            helper="Đặt số suất và số người hỗ trợ cần tuyển cho từng vai trò."
          >
          <Text style={styles.sectionLabel}>Nhân sự tình nguyện</Text>
          <View style={styles.rowFields}>
            <SlotInput label="Đầu bếp" value={chefSlots} onChange={setChefSlots} />
            <SlotInput label="Phục vụ" value={waiterSlots} onChange={setWaiterSlots} />
            <SlotInput label="Giao hàng" value={shipperSlots} onChange={setShipperSlots} />
          </View>

          <Field label="Số suất dự kiến (tuỳ chọn)">
            <TextInput
              mode="outlined" keyboardType="numeric" value={expectedServings} onChangeText={setExpectedServings}
              outlineColor={COLORS.outline} activeOutlineColor={COLORS.primary} style={styles.input}
            />
          </Field>
          </FormSection>

          {/* Thực đơn (tuỳ chọn) */}
          <FormSection
            icon="silverware-fork-knife"
            title="Thực đơn"
            helper="Thêm món chính hoặc nhóm món để bếp và TNV chuẩn bị trước."
          >
          {menuItems.map((m, i) => (
            <ListRow
              key={i}
              text={`${m.name}${m.type ? ` (${m.type})` : ''}`}
              onRemove={() => setMenuItems((prev) => prev.filter((_, idx) => idx !== i))}
            />
          ))}
          <View style={styles.rowFields}>
            <TextInput
              mode="outlined" dense placeholder="Tên món" value={menuName} onChangeText={setMenuName}
              outlineColor={COLORS.outline} activeOutlineColor={COLORS.primary} style={[styles.input, { flex: 2 }]}
            />
            <TextInput
              mode="outlined" dense placeholder="Loại" value={menuType} onChangeText={setMenuType}
              outlineColor={COLORS.outline} activeOutlineColor={COLORS.primary} style={[styles.input, { flex: 1 }]}
            />
          </View>
          <Button mode="text" icon="plus" textColor={COLORS.primary} onPress={addMenu} compact style={styles.addBtn}>
            Thêm món
          </Button>
          </FormSection>

          {/* Lịch trình (tuỳ chọn) */}
          <FormSection
            icon="timeline-clock-outline"
            title="Lịch trình"
            helper="Các mốc như nhận nguyên liệu, nấu, chia suất, phát cơm."
          >
          {scheduleItems.map((s, i) => (
            <ListRow
              key={i}
              text={`${s.time ? `${s.time} - ` : ''}${s.label}`}
              onRemove={() => setScheduleItems((prev) => prev.filter((_, idx) => idx !== i))}
            />
          ))}
          <View style={styles.rowFields}>
            <TextInput
              mode="outlined" dense placeholder="06:00 - 08:00" value={scheduleTime} onChangeText={setScheduleTime}
              outlineColor={COLORS.outline} activeOutlineColor={COLORS.primary} style={[styles.input, { flex: 1 }]}
            />
            <TextInput
              mode="outlined" dense placeholder="Việc cần làm" value={scheduleLabel} onChangeText={setScheduleLabel}
              outlineColor={COLORS.outline} activeOutlineColor={COLORS.primary} style={[styles.input, { flex: 2 }]}
            />
          </View>
          <Button mode="text" icon="plus" textColor={COLORS.primary} onPress={addSchedule} compact style={styles.addBtn}>
            Thêm mốc
          </Button>
          </FormSection>

          {/* Vật phẩm cần hỗ trợ (tuỳ chọn) */}
          <FormSection
            icon="basket-outline"
            title="Vật phẩm cần hỗ trợ"
            helper="Nhập rõ tên, số lượng và đơn vị để nhà cung cấp biết cần hỗ trợ gì."
          >
          {supplyItems.map((s, i) => (
            <ListRow
              key={i}
              text={`${s.name}${s.quantity ? ` - ${s.quantity}${s.unit ? ` ${s.unit}` : ''}` : ''}`}
              onRemove={() => setSupplyItems((prev) => prev.filter((_, idx) => idx !== i))}
            />
          ))}
          <View style={styles.rowFields}>
            <TextInput
              mode="outlined" dense placeholder="Tên vật phẩm" value={supplyText} onChangeText={setSupplyText}
              outlineColor={COLORS.outline} activeOutlineColor={COLORS.primary} style={[styles.input, { flex: 2 }]}
            />
            <TextInput
              mode="outlined" dense placeholder="SL" value={supplyQuantity} onChangeText={setSupplyQuantity}
              keyboardType="numeric"
              outlineColor={COLORS.outline} activeOutlineColor={COLORS.primary} style={[styles.input, { flex: 1 }]}
            />
            <TextInput
              mode="outlined" dense placeholder="Đơn vị" value={supplyUnit} onChangeText={setSupplyUnit}
              outlineColor={COLORS.outline} activeOutlineColor={COLORS.primary} style={[styles.input, { flex: 1 }]}
              onSubmitEditing={addSupply}
            />
          </View>
          <Button mode="text" icon="plus" textColor={COLORS.primary} onPress={addSupply} compact style={styles.addBtn}>
            Thêm vật phẩm
          </Button>
          </FormSection>

          <Button
            mode="contained" onPress={onSubmit} loading={submitting} disabled={submitting}
            buttonColor={COLORS.primary} style={styles.submitBtn} labelStyle={{ fontSize: 16, fontWeight: 'bold' }}
          >
            Gửi yêu cầu chiến dịch
          </Button>
          <Text style={styles.note}>Chiến dịch sẽ ở trạng thái “Chờ duyệt” cho đến khi quản trị viên phê duyệt.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

function CreateIntro() {
  return (
    <View style={styles.intro}>
      <View style={styles.introIcon}>
        <MaterialCommunityIcons name="pot-steam-outline" size={24} color={COLORS.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.introTitle}>Điều phối một bếp ăn cộng đồng</Text>
        <Text style={styles.introText}>
          Tạo bản nháp đầy đủ để admin duyệt, sau đó tổ chức có thể tuyển TNV và nhận hỗ trợ nguyên liệu.
        </Text>
      </View>
    </View>
  );
}

function FormSection({
  icon,
  title,
  helper,
  children,
}: {
  icon: any;
  title: string;
  helper: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.formSection}>
      <View style={styles.formSectionHead}>
        <View style={styles.formSectionIcon}>
          <MaterialCommunityIcons name={icon} size={19} color={COLORS.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.formSectionTitle}>{title}</Text>
          <Text style={styles.formSectionHelper}>{helper}</Text>
        </View>
      </View>
      {children}
    </View>
  );
}

function PickerButton({ icon, text, onPress }: { icon: any; text: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.pickerBtn}>
      <MaterialCommunityIcons name={icon} size={20} color={COLORS.onSurfaceVariant} />
      <Text style={styles.pickerText}>{text}</Text>
    </Pressable>
  );
}

function SlotInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.slotLabel}>{label}</Text>
      <TextInput
        mode="outlined" keyboardType="numeric" value={value} onChangeText={onChange}
        outlineColor={COLORS.outline} activeOutlineColor={COLORS.primary} style={styles.input}
      />
    </View>
  );
}

function ListRow({ text, onRemove }: { text: string; onRemove: () => void }) {
  return (
    <View style={styles.listRow}>
      <MaterialCommunityIcons name="circle-small" size={20} color={COLORS.onSurfaceVariant} />
      <Text style={styles.listText}>{text}</Text>
      <Pressable onPress={onRemove} hitSlop={8}>
        <MaterialCommunityIcons name="close-circle" size={20} color={COLORS.error} />
      </Pressable>
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
  content: { padding: 20, paddingBottom: 48 },
  intro: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.outline,
    padding: 16,
    marginBottom: 14,
  },
  introIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: COLORS.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  introTitle: { fontSize: 17, fontWeight: '900', color: COLORS.onSurface },
  introText: { marginTop: 3, fontSize: 13, lineHeight: 19, color: COLORS.onSurfaceVariant },
  formSection: {
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.outline,
    padding: 14,
    marginBottom: 14,
  },
  formSectionHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 12 },
  formSectionIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: COLORS.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formSectionTitle: { fontSize: 16, fontWeight: '900', color: COLORS.onSurface },
  formSectionHelper: { marginTop: 2, fontSize: 12, lineHeight: 17, color: COLORS.onSurfaceVariant },
  label: { fontSize: 14, fontWeight: '600', color: COLORS.onSurfaceVariant, marginBottom: 8 },
  sectionLabel: { fontSize: 15, fontWeight: '700', color: COLORS.onSurface, marginTop: 8, marginBottom: 10 },
  input: { backgroundColor: COLORS.surface },
  rowFields: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  slotLabel: { fontSize: 13, color: COLORS.onSurfaceVariant, marginBottom: 6, textAlign: 'center' },
  pickerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 14, paddingHorizontal: 14,
    backgroundColor: COLORS.surface, borderRadius: 8, borderWidth: 1, borderColor: COLORS.outline,
  },
  pickerText: { fontSize: 15, color: COLORS.onSurface },
  addBtn: { alignSelf: 'flex-start', marginTop: 4, marginBottom: 8 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  listText: { flex: 1, fontSize: 14, color: COLORS.onSurface },
  imagePreview: {
    height: 176,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.outline,
    backgroundColor: COLORS.surface,
  },
  image: { width: '100%', height: '100%' },
  imageActions: { flexDirection: 'row', gap: 10 },
  imageActionBtn: { flex: 1, borderColor: COLORS.outline },
  removeImageBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtn: { marginTop: 16, borderRadius: 12, paddingVertical: 4 },
  note: { fontSize: 12, color: COLORS.onSurfaceVariant, textAlign: 'center', marginTop: 12, fontStyle: 'italic' },
});
