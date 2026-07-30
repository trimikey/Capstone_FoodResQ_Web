import { useEffect, useState } from 'react';
import {
  Animated,
  Easing,
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, TextInput, Button } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import {
  useCreateCampaign,
  useUploadCampaignImage,
  type AssignmentRole,
  type CreateCampaignInput,
} from '@/hooks/useCampaigns';
import { useMyProfile } from '@/hooks/useProfile';
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

interface MenuRow { name: string; type: string; plannedServings?: number }
interface ScheduleRow { time: string; label: string }
interface SupplyRow { name: string; quantity?: number; unit?: string }
interface ShiftRow {
  label: string;
  role?: AssignmentRole;
  startTime: string;
  endTime: string;
  slotsNeeded: number;
}

const ROLE_OPTIONS: { value?: AssignmentRole; label: string }[] = [
  { value: undefined, label: 'Mọi vai trò' },
  { value: 'chef', label: 'Đầu bếp' },
  { value: 'waiter', label: 'Phục vụ' },
  { value: 'shipper', label: 'Giao hàng' },
];

const ROLE_LABEL: Record<AssignmentRole, string> = {
  chef: 'Đầu bếp',
  waiter: 'Phục vụ',
  shipper: 'Giao hàng',
};

const MENU_TYPE_OPTIONS = [
  { value: 'breakfast', label: 'Bữa sáng' },
  { value: 'lunch', label: 'Bữa trưa' },
  { value: 'dinner', label: 'Bữa tối' },
];

const SHIFT_TEMPLATES: ShiftRow[] = [
  { label: 'Ca sáng - Sơ chế', role: 'chef', startTime: '06:00', endTime: '08:00', slotsNeeded: 4 },
  { label: 'Ca sáng - Nấu', role: 'chef', startTime: '07:00', endTime: '10:00', slotsNeeded: 3 },
  { label: 'Phục vụ bữa trưa', role: 'waiter', startTime: '11:00', endTime: '13:30', slotsNeeded: 5 },
  { label: 'Vận chuyển bữa trưa', role: 'shipper', startTime: '11:00', endTime: '13:30', slotsNeeded: 2 },
  { label: 'Phục vụ bữa tối', role: 'waiter', startTime: '17:30', endTime: '20:00', slotsNeeded: 4 },
];

const SCHEDULE_TEMPLATES: ScheduleRow[] = [
  { time: '06:00', label: 'Tập trung tại bếp, phân công nhiệm vụ' },
  { time: '06:30', label: 'Kiểm tra nguyên liệu, dụng cụ và thiết bị bếp' },
  { time: '08:00', label: 'Bắt đầu nấu các món chính' },
  { time: '10:30', label: 'Đóng gói suất, dán nhãn' },
  { time: '12:00', label: 'Bắt đầu phát suất cho người nhận' },
  { time: '13:30', label: 'Kết thúc phát suất, dọn dẹp khu vực' },
];

const SUPPLY_TEMPLATES: SupplyRow[] = [
  { name: 'Gạo sạch', quantity: 10, unit: 'kg' },
  { name: 'Rau củ các loại', quantity: 5, unit: 'kg' },
  { name: 'Trứng gà', quantity: 30, unit: 'quả' },
  { name: 'Hộp đựng suất ăn', quantity: 100, unit: 'hộp' },
  { name: 'Găng tay nilon', quantity: 2, unit: 'hộp' },
  { name: 'Thùng giữ nhiệt', quantity: 3, unit: 'thùng' },
];

function dateFromTime(value: string): Date {
  const [hh = '0', mm = '0'] = value.split(':');
  const d = new Date();
  d.setHours(Number(hh), Number(mm), 0, 0);
  return d;
}

/**
 * Charity-org tạo chiến dịch bếp ăn. Gửi đi với status 'draft' (chờ admin duyệt).
 * Địa chỉ + toạ độ qua AddressPicker; ngày/giờ qua DateTimePicker; menu/lịch
 * trình/vật phẩm là danh sách động (tuỳ chọn). POST /campaigns.
 */
export default function CreateCampaignScreen() {
  const createCampaign = useCreateCampaign();
  const uploadCampaignImage = useUploadCampaignImage();
  const { data: profile } = useMyProfile();
  const [coords, setCoords] = useState<Coords | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const now = new Date();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState<AddressValue | null>(null);
  const [addressMode, setAddressMode] = useState<'profile' | 'custom'>('custom');
  const [scheduledDate, setScheduledDate] = useState<Date>(new Date(now.getTime() + 24 * 3600_000));
  const [endDate, setEndDate] = useState<Date | null>(null);
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
  const [chefSlots, setChefSlots] = useState('0');
  const [waiterSlots, setWaiterSlots] = useState('0');
  const [shipperSlots, setShipperSlots] = useState('0');
  const [expectedServings, setExpectedServings] = useState('0');

  const [menuItems, setMenuItems] = useState<MenuRow[]>([]);
  const [menuName, setMenuName] = useState('');
  const [menuType, setMenuType] = useState('lunch');
  const [menuServings, setMenuServings] = useState('0');

  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [shiftLabel, setShiftLabel] = useState('');
  const [shiftRole, setShiftRole] = useState<AssignmentRole | undefined>(undefined);
  const [shiftSlots, setShiftSlots] = useState('0');
  const [shiftStartTime, setShiftStartTime] = useState('08:00');
  const [shiftEndTime, setShiftEndTime] = useState('12:00');

  const [scheduleItems, setScheduleItems] = useState<ScheduleRow[]>([]);
  const [scheduleTime, setScheduleTime] = useState('06:00');
  const [scheduleLabel, setScheduleLabel] = useState('');

  const [supplyItems, setSupplyItems] = useState<SupplyRow[]>([]);
  const [supplyText, setSupplyText] = useState('');
  const [supplyQuantity, setSupplyQuantity] = useState('0');
  const [supplyUnit, setSupplyUnit] = useState('');

  useEffect(() => {
    getCurrentCoords().then(({ coords }) => setCoords(coords));
  }, []);

  const profileAddress = profile?.receiver?.address?.trim() ?? '';
  const profileLat = profile?.receiver?.lat ?? null;
  const profileLng = profile?.receiver?.lng ?? null;
  const hasProfileAddress = profileAddress.length >= 5;

  const applyProfileAddress = () => {
    if (!hasProfileAddress) {
      Popup.show({ type: 'warning', text1: 'Hồ sơ chưa có địa chỉ mặc định' });
      return;
    }
    setAddressMode('profile');
    setAddress({
      address: profileAddress,
      lat: profileLat ?? coords?.lat ?? 10.8231,
      lng: profileLng ?? coords?.lng ?? 106.6297,
    });
  };

  const selectCustomAddress = () => {
    setAddressMode('custom');
  };

  const addMenu = () => {
    const name = menuName.trim();
    if (!name) return;
    const plannedServings = menuServings.trim() ? parseInt(menuServings, 10) : 0;
    if (!Number.isFinite(plannedServings) || plannedServings < 0 || plannedServings > 10000) {
      Popup.show({ type: 'warning', text1: 'Số suất món không hợp lệ', text2: 'Vui lòng nhập từ 0 đến 10.000 suất.' });
      return;
    }
    setMenuItems((prev) => [...prev, { name, type: menuType, ...(plannedServings > 0 ? { plannedServings } : {}) }]);
    setMenuName('');
    setMenuType('lunch');
    setMenuServings('0');
  };
  const addSchedule = () => {
    const label = scheduleLabel.trim();
    if (!label) return;
    setScheduleItems((prev) => [...prev, { time: scheduleTime.trim(), label }]);
    setScheduleTime('06:00');
    setScheduleLabel('');
  };
  const addShift = () => {
    const label = shiftLabel.trim();
    if (label.length < 2) {
      Popup.show({ type: 'warning', text1: 'Tên ca quá ngắn' });
      return;
    }
    const slots = toInt(shiftSlots);
    if (!slots || slots > 100) {
      Popup.show({ type: 'warning', text1: 'Số người trong ca không hợp lệ', text2: 'Vui lòng nhập từ 1 đến 100 người.' });
      return;
    }
    if (shiftEndTime <= shiftStartTime) {
      Popup.show({ type: 'warning', text1: 'Giờ ca không hợp lệ', text2: 'Giờ kết thúc ca phải sau giờ bắt đầu.' });
      return;
    }
    setShifts((prev) => [
      ...prev,
      { label, role: shiftRole, startTime: shiftStartTime, endTime: shiftEndTime, slotsNeeded: slots },
    ]);
    setShiftLabel('');
    setShiftRole(undefined);
    setShiftSlots('0');
    setShiftStartTime('08:00');
    setShiftEndTime('12:00');
  };
  const addSupply = () => {
    const s = supplyText.trim();
    if (!s) return;
    const quantity = parseInt(supplyQuantity, 10);
    if (supplyQuantity.trim() && (!Number.isFinite(quantity) || quantity < 0)) {
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
    setSupplyQuantity('0');
    setSupplyUnit('');
  };

  const addShiftTemplate = (template: ShiftRow) => {
    setShifts((prev) => {
      if (prev.some((s) => s.label === template.label && s.startTime === template.startTime && s.endTime === template.endTime)) return prev;
      return [...prev, template];
    });
  };

  const addScheduleTemplate = (template: ScheduleRow) => {
    setScheduleItems((prev) => {
      if (prev.some((s) => s.label === template.label && s.time === template.time)) return prev;
      return [...prev, template];
    });
  };

  const addSupplyTemplate = (template: SupplyRow) => {
    setSupplyItems((prev) => {
      if (prev.some((s) => s.name === template.name)) return prev;
      return [...prev, template];
    });
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
    if (endDate && toDateStr(endDate) < toDateStr(scheduledDate)) {
      Popup.show({ type: 'warning', text1: 'Ngày kết thúc không hợp lệ', text2: 'Ngày kết thúc phải bằng hoặc sau ngày tổ chức.' });
      return;
    }
    if ([chefSlots, waiterSlots, shipperSlots].some((value) => isInvalidCount(value))) {
      Popup.show({ type: 'warning', text1: 'Số lượng TNV không hợp lệ', text2: 'Vui lòng nhập số không âm.' });
      return;
    }
    if (isInvalidCount(expectedServings, true)) {
      Popup.show({ type: 'warning', text1: 'Số suất không hợp lệ', text2: 'Số suất dự kiến không được âm.' });
      return;
    }
    const invalidMenu = menuItems.find((m) => m.name.trim().length > 100 || (m.plannedServings != null && (m.plannedServings < 0 || m.plannedServings > 10000)));
    if (invalidMenu) {
      Popup.show({ type: 'warning', text1: 'Thực đơn chưa hợp lệ', text2: 'Tên món tối đa 100 ký tự, số suất món tối đa 10.000.' });
      return;
    }
    const invalidShift = shifts.find((s) => s.label.trim().length < 2 || s.endTime <= s.startTime || s.slotsNeeded < 0 || s.slotsNeeded > 100);
    if (invalidShift) {
      Popup.show({ type: 'warning', text1: 'Ca trực chưa hợp lệ', text2: 'Kiểm tra tên ca, giờ và số người cần.' });
      return;
    }

    const payload: CreateCampaignInput = {
      title: title.trim(),
      kitchenAddress: address.address.trim(),
      lat: address.lat,
      lng: address.lng,
      scheduledDate: toDateStr(scheduledDate),
      ...(endDate ? { endDate: toDateStr(endDate) } : {}),
      startTime: toTimeStr(startTime),
      endTime: toTimeStr(endTime),
      chefSlotsNeeded: toInt(chefSlots),
      waiterSlotsNeeded: toInt(waiterSlots),
      shipperSlotsNeeded: toInt(shipperSlots),
      ...(description.trim() ? { description: description.trim() } : {}),
      ...(toInt(expectedServings) ? { expectedServings: toInt(expectedServings) } : {}),
      ...(imageUrl ? { imageUrls: [imageUrl] } : {}),
      ...(menuItems.length ? { menuItems } : {}),
      ...(shifts.length ? { shifts } : {}),
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
            delay={0}
            icon="clipboard-text-outline"
            title="Thông tin cơ bản"
            helper="Tên ngắn, rõ mục tiêu để TNV và nhà cung cấp hiểu nhanh."
          >
          <Field label="Tên chiến dịch *">
            <TextInput
              mode="outlined" placeholder="" value={title} onChangeText={setTitle}
              outlineColor={COLORS.outline} activeOutlineColor={COLORS.primary} style={styles.input}
            />
          </Field>

          <Field label="Mô tả (tuỳ chọn)">
            <TextInput
              mode="outlined" multiline numberOfLines={3} value={description} onChangeText={setDescription}
              placeholder=""
              outlineColor={COLORS.outline} activeOutlineColor={COLORS.primary} style={styles.input}
            />
          </Field>
          </FormSection>

          <FormSection
            delay={70}
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
            delay={140}
            icon="map-clock-outline"
            title="Thời gian & địa điểm"
            helper="Địa điểm và khung giờ cần chính xác để phối hợp giao nhận."
          >
          <Field label="Địa chỉ bếp *">
            <View style={styles.addressModeRow}>
              <AddressModeButton
                icon="home-map-marker"
                title="Dùng địa chỉ mặc định"
                subtitle={hasProfileAddress ? profileAddress : 'Chưa cập nhật trong hồ sơ'}
                active={addressMode === 'profile'}
                disabled={!hasProfileAddress}
                onPress={applyProfileAddress}
              />
              <AddressModeButton
                icon="map-search-outline"
                title="Chọn địa chỉ khác"
                subtitle="Search hoặc chỉnh trên bản đồ"
                active={addressMode === 'custom'}
                onPress={selectCustomAddress}
              />
            </View>
            <AddressPicker
              initialCoords={coords}
              value={address}
              placeholder=""
              onChange={(next) => {
                setAddressMode('custom');
                setAddress(next);
              }}
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
                  onChange: (_e, d) => {
                    if (!d) return;
                    setScheduledDate(d);
                    setEndDate((prev) => (prev && toDateStr(prev) < toDateStr(d) ? null : prev));
                  },
                })
              }
            />
          </Field>

          <Field label="Ngày kết thúc (tuỳ chọn)">
            <View style={styles.endDateRow}>
              <View style={{ flex: 1 }}>
                <PickerButton
                  icon="calendar-end"
                  text={endDate ? fmtDate(endDate) : 'Một ngày'}
                  onPress={() =>
                    DateTimePickerAndroid.open({
                      value: endDate ?? scheduledDate,
                      mode: 'date',
                      minimumDate: scheduledDate,
                      onChange: (_e, d) => d && setEndDate(d),
                    })
                  }
                />
              </View>
              {endDate ? (
                <Pressable onPress={() => setEndDate(null)} style={styles.clearDateBtn} hitSlop={8}>
                  <MaterialCommunityIcons name="close" size={18} color={COLORS.onSurfaceVariant} />
                </Pressable>
              ) : null}
            </View>
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
            delay={210}
            icon="account-group-outline"
            title="Mục tiêu phục vụ"
            helper="Đặt số suất và số người hỗ trợ cần tuyển cho từng vai trò."
          >
          <Text style={styles.sectionLabel}>Nhân sự tình nguyện</Text>
          <View style={styles.slotStack}>
            <SlotInput label="Đầu bếp" value={chefSlots} onChange={setChefSlots} />
            <SlotInput label="Phục vụ" value={waiterSlots} onChange={setWaiterSlots} />
            <SlotInput label="Giao hàng" value={shipperSlots} onChange={setShipperSlots} />
          </View>

          <Field label="Số suất dự kiến (tuỳ chọn)">
            <QuantityStepper
              value={expectedServings}
              onChange={setExpectedServings}
              min={0}
              max={100000}
              step={10}
            />
          </Field>
          </FormSection>

          <FormSection
            delay={280}
            icon="calendar-account-outline"
            title="Ca trực cho tình nguyện viên"
            helper="Tạo sẵn các ca để TNV đăng ký đúng vai trò, khung giờ và số lượng cần hỗ trợ."
          >
          <TemplateChips
            items={SHIFT_TEMPLATES}
            getLabel={(item) => item.label}
            onPick={addShiftTemplate}
            onPickAll={() => SHIFT_TEMPLATES.forEach(addShiftTemplate)}
          />
          {shifts.map((s, i) => (
            <ShiftListRow
              key={`${s.label}-${s.startTime}-${i}`}
              shift={s}
              onRemove={() => setShifts((prev) => prev.filter((_, idx) => idx !== i))}
            />
          ))}
          <Field label="Tên ca">
            <TextInput
              mode="outlined"
              dense
              placeholder=""
              value={shiftLabel}
              onChangeText={setShiftLabel}
              outlineColor={COLORS.outline}
              activeOutlineColor={COLORS.primary}
              style={styles.input}
            />
          </Field>
          <Text style={styles.roleSelectorLabel}>Vai trò ca</Text>
          <View style={styles.roleSelector}>
            {ROLE_OPTIONS.map((option) => {
              const active = shiftRole === option.value;
              return (
                <Pressable
                  key={option.label}
                  onPress={() => setShiftRole(option.value)}
                  style={[styles.roleOption, active && styles.roleOptionActive]}
                >
                  <Text style={[styles.roleOptionText, active && { color: COLORS.primary }]}>{option.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.rowFields}>
            <View style={{ flex: 1 }}>
              <Field label="Bắt đầu">
                <PickerButton
                  icon="clock-start"
                  text={shiftStartTime}
                  onPress={() =>
                    DateTimePickerAndroid.open({
                      value: dateFromTime(shiftStartTime),
                      mode: 'time',
                      is24Hour: true,
                      onChange: (_e, d) => d && setShiftStartTime(toTimeStr(d)),
                    })
                  }
                />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Kết thúc">
                <PickerButton
                  icon="clock-end"
                  text={shiftEndTime}
                  onPress={() =>
                    DateTimePickerAndroid.open({
                      value: dateFromTime(shiftEndTime),
                      mode: 'time',
                      is24Hour: true,
                      onChange: (_e, d) => d && setShiftEndTime(toTimeStr(d)),
                    })
                  }
                />
              </Field>
            </View>
          </View>
          <View style={styles.rowFields}>
            <View style={{ flex: 1 }}>
              <Text style={styles.inlineQuantityLabel}>Số người cần</Text>
              <QuantityStepper value={shiftSlots} onChange={setShiftSlots} min={0} max={100} />
            </View>
          </View>
          <Button mode="outlined" icon="plus" textColor={COLORS.primary} onPress={addShift} compact style={styles.addBtn}>
            Thêm ca trực
          </Button>
          </FormSection>

          {/* Thực đơn (tuỳ chọn) */}
          <FormSection
            delay={350}
            icon="silverware-fork-knife"
            title="Thực đơn"
            helper="Thêm món chính hoặc nhóm món để bếp và TNV chuẩn bị trước."
          >
          {menuItems.map((m, i) => (
            <MenuListRow
              key={i}
              item={m}
              onRemove={() => setMenuItems((prev) => prev.filter((_, idx) => idx !== i))}
            />
          ))}
          <Field label="Tên món">
            <TextInput
              mode="outlined"
              dense
              placeholder=""
              value={menuName}
              onChangeText={setMenuName}
              outlineColor={COLORS.outline}
              activeOutlineColor={COLORS.primary}
              style={styles.input}
            />
          </Field>
          <Text style={styles.roleSelectorLabel}>Bữa ăn</Text>
          <View style={styles.roleSelector}>
            {MENU_TYPE_OPTIONS.map((option) => {
              const active = menuType === option.value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => setMenuType(option.value)}
                  style={[styles.roleOption, active && styles.roleOptionActive]}
                >
                  <Text style={[styles.roleOptionText, active && { color: COLORS.primary }]}>{option.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.rowFields}>
            <View style={{ flex: 1 }}>
              <Text style={styles.inlineQuantityLabel}>Số suất món</Text>
              <QuantityStepper value={menuServings} onChange={setMenuServings} min={0} max={10000} step={10} />
            </View>
          </View>
          <Button mode="outlined" icon="plus" textColor={COLORS.primary} onPress={addMenu} compact style={styles.addBtn}>
            Thêm món
          </Button>
          </FormSection>

          {/* Lịch trình (tuỳ chọn) */}
          <FormSection
            delay={420}
            icon="timeline-clock-outline"
            title="Lịch trình"
            helper="Các mốc như nhận nguyên liệu, nấu, chia suất, phát cơm."
          >
          <TemplateChips
            items={SCHEDULE_TEMPLATES}
            getLabel={(item) => `${item.time} ${item.label}`}
            onPick={addScheduleTemplate}
            onPickAll={() => SCHEDULE_TEMPLATES.forEach(addScheduleTemplate)}
          />
          {scheduleItems.map((s, i) => (
            <ListRow
              key={i}
              text={`${s.time ? `${s.time} - ` : ''}${s.label}`}
              onRemove={() => setScheduleItems((prev) => prev.filter((_, idx) => idx !== i))}
            />
          ))}
          <View style={styles.rowFields}>
            <View style={{ flex: 1 }}>
              <PickerButton
                icon="clock-outline"
                text={scheduleTime}
                onPress={() =>
                  DateTimePickerAndroid.open({
                    value: dateFromTime(scheduleTime),
                    mode: 'time',
                    is24Hour: true,
                    onChange: (_e, d) => d && setScheduleTime(toTimeStr(d)),
                  })
                }
              />
            </View>
            <TextInput
              mode="outlined" dense placeholder="" value={scheduleLabel} onChangeText={setScheduleLabel}
              outlineColor={COLORS.outline} activeOutlineColor={COLORS.primary} style={[styles.input, { flex: 2 }]}
            />
          </View>
          <Button mode="outlined" icon="plus" textColor={COLORS.primary} onPress={addSchedule} compact style={styles.addBtn}>
            Thêm mốc
          </Button>
          </FormSection>

          {/* Vật phẩm cần hỗ trợ (tuỳ chọn) */}
          <FormSection
            delay={490}
            icon="basket-outline"
            title="Vật phẩm cần thiết"
            helper="Nhập rõ tên, số lượng và đơn vị để nhà cung cấp biết cần hỗ trợ gì."
          >
          <TemplateChips
            items={SUPPLY_TEMPLATES}
            getLabel={(item) => item.name}
            onPick={addSupplyTemplate}
            onPickAll={() => SUPPLY_TEMPLATES.forEach(addSupplyTemplate)}
          />
          {supplyItems.map((s, i) => (
            <ListRow
              key={i}
              text={`${s.name}${s.quantity ? ` - ${s.quantity}${s.unit ? ` ${s.unit}` : ''}` : ''}`}
              onRemove={() => setSupplyItems((prev) => prev.filter((_, idx) => idx !== i))}
            />
          ))}
          <Field label="Tên vật phẩm">
            <TextInput
              mode="outlined" dense placeholder="" value={supplyText} onChangeText={setSupplyText}
              outlineColor={COLORS.outline} activeOutlineColor={COLORS.primary} style={styles.input}
            />
          </Field>
          <View style={styles.rowFields}>
            <View style={{ flex: 1 }}>
              <Text style={styles.inlineQuantityLabel}>Số lượng</Text>
              <QuantityStepper value={supplyQuantity} onChange={setSupplyQuantity} min={0} max={1000} />
            </View>
            <TextInput
              mode="outlined" dense placeholder="" value={supplyUnit} onChangeText={setSupplyUnit}
              outlineColor={COLORS.outline} activeOutlineColor={COLORS.primary} style={[styles.input, { flex: 1 }]}
              onSubmitEditing={addSupply}
            />
          </View>
          <Button mode="outlined" icon="plus" textColor={COLORS.primary} onPress={addSupply} compact style={styles.addBtn}>
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
    <View style={styles.field}>
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
  delay = 0,
  icon,
  title,
  helper,
  children,
}: {
  delay?: number;
  icon: any;
  title: string;
  helper: string;
  children: React.ReactNode;
}) {
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: 320,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [delay, progress]);

  return (
    <Animated.View
      style={[
        styles.formSection,
        {
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [18, 0],
              }),
            },
          ],
        },
      ]}
    >
      <View style={styles.formSectionHead}>
        <View style={styles.formSectionIcon}>
          <MaterialCommunityIcons name={icon} size={19} color={COLORS.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.formSectionTitle}>{title}</Text>
          <Text style={styles.formSectionHelper}>{helper}</Text>
        </View>
      </View>
      <View style={styles.formSectionBody}>{children}</View>
    </Animated.View>
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

function AddressModeButton({
  icon,
  title,
  subtitle,
  active,
  disabled,
  onPress,
}: {
  icon: any;
  title: string;
  subtitle: string;
  active: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.addressModeBtn, active && styles.addressModeBtnActive, disabled && styles.addressModeBtnDisabled]}
    >
      <MaterialCommunityIcons name={icon} size={19} color={active ? COLORS.primary : COLORS.onSurfaceVariant} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.addressModeTitle, active && { color: COLORS.primary }]}>{title}</Text>
        <Text style={styles.addressModeSubtitle} numberOfLines={2}>{subtitle}</Text>
      </View>
    </Pressable>
  );
}

function TemplateChips<T>({
  items,
  getLabel,
  onPick,
  onPickAll,
}: {
  items: T[];
  getLabel: (item: T) => string;
  onPick: (item: T) => void;
  onPickAll: () => void;
}) {
  return (
    <View style={styles.templateWrap}>
      <Button mode="text" icon="lightbulb-outline" textColor={COLORS.primary} compact onPress={onPickAll} style={styles.templateAllBtn}>
        Thêm tất cả mẫu
      </Button>
      <View style={styles.templateChips}>
        {items.map((item, index) => (
          <Pressable key={`${getLabel(item)}-${index}`} style={styles.templateChip} onPress={() => onPick(item)}>
            <MaterialCommunityIcons name="plus" size={14} color={COLORS.primary} />
            <Text style={styles.templateChipText} numberOfLines={1}>{getLabel(item)}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function ShiftListRow({ shift, onRemove }: { shift: ShiftRow; onRemove: () => void }) {
  return (
    <View style={styles.shiftListRow}>
      <MaterialCommunityIcons name="calendar-clock" size={18} color={COLORS.primary} />
      <View style={{ flex: 1 }}>
        <Text style={styles.shiftListTitle}>{shift.label}</Text>
        <Text style={styles.shiftListMeta}>
          {shift.startTime}-{shift.endTime} · {shift.role ? ROLE_LABEL[shift.role] : 'Mọi vai trò'} · {shift.slotsNeeded} người
        </Text>
      </View>
      <Pressable onPress={onRemove} hitSlop={8}>
        <MaterialCommunityIcons name="close-circle" size={20} color={COLORS.error} />
      </Pressable>
    </View>
  );
}

function MenuListRow({ item, onRemove }: { item: MenuRow; onRemove: () => void }) {
  const typeLabel = MENU_TYPE_OPTIONS.find((option) => option.value === item.type)?.label ?? item.type;
  return (
    <View style={styles.menuListRow}>
      <MaterialCommunityIcons name="silverware-fork-knife" size={18} color={COLORS.primary} />
      <View style={{ flex: 1 }}>
        <Text style={styles.shiftListTitle}>{item.name}</Text>
        <Text style={styles.shiftListMeta}>
          {typeLabel}{item.plannedServings != null ? ` · ${item.plannedServings} suất dự kiến` : ''}
        </Text>
      </View>
      <Pressable onPress={onRemove} hitSlop={8}>
        <MaterialCommunityIcons name="close-circle" size={20} color={COLORS.error} />
      </Pressable>
    </View>
  );
}

function QuantityStepper({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  style,
}: {
  value: string;
  onChange: (value: string) => void;
  min?: number;
  max?: number;
  step?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const current = Number.isFinite(Number(value)) ? Number(value) : min;
  const decreaseDisabled = current <= min;
  const increaseDisabled = current >= max;
  const setNext = (next: number) => onChange(String(Math.max(min, Math.min(max, next))));

  return (
    <View style={[styles.quantityStepper, style]}>
      <Pressable
        onPress={() => setNext(current - step)}
        disabled={decreaseDisabled}
        style={[styles.quantityStepBtn, decreaseDisabled && styles.quantityStepBtnDisabled]}
        hitSlop={6}
      >
        <MaterialCommunityIcons name="minus" size={28} color={decreaseDisabled ? COLORS.outline : COLORS.onSurfaceVariant} />
      </Pressable>
      <Text style={styles.quantityStepValue}>{current}</Text>
      <Pressable
        onPress={() => setNext(current + step)}
        disabled={increaseDisabled}
        style={[styles.quantityStepBtn, increaseDisabled && styles.quantityStepBtnDisabled]}
        hitSlop={6}
      >
        <MaterialCommunityIcons name="plus" size={28} color={increaseDisabled ? COLORS.outline : COLORS.onSurfaceVariant} />
      </Pressable>
    </View>
  );
}

function SlotInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <View style={styles.slotRow}>
      <Text style={styles.slotLabel}>{label}</Text>
      <QuantityStepper value={value} onChange={onChange} min={0} max={50} style={styles.slotStepper} />
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
    height: 56, paddingHorizontal: 16, backgroundColor: COLORS.background,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  headerTitle: { fontWeight: '900', color: COLORS.onSurface },
  content: { padding: 16, paddingTop: 8, paddingBottom: 56 },
  intro: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: COLORS.primaryContainer,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.primary,
    padding: 16,
    marginBottom: 16,
  },
  introIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  introTitle: { fontSize: 18, fontWeight: '900', color: COLORS.onSurface },
  introText: { marginTop: 4, fontSize: 13, lineHeight: 19, color: COLORS.onSurface },
  formSection: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.outline,
    padding: 0,
    marginBottom: 12,
    overflow: 'hidden',
  },
  formSectionHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: COLORS.surfaceContainerLow,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.outline,
  },
  formSectionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: COLORS.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formSectionTitle: { fontSize: 16, fontWeight: '900', color: COLORS.onSurface },
  formSectionHelper: { marginTop: 2, fontSize: 12, lineHeight: 17, color: COLORS.onSurfaceVariant },
  formSectionBody: { padding: 14, paddingTop: 12 },
  field: { marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '800', color: COLORS.onSurfaceVariant, marginBottom: 8 },
  sectionLabel: { fontSize: 15, fontWeight: '700', color: COLORS.onSurface, marginTop: 8, marginBottom: 10 },
  input: { backgroundColor: COLORS.surface },
  quantityStepper: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: COLORS.outline,
    borderRadius: 14,
    backgroundColor: COLORS.surface,
    overflow: 'hidden',
  },
  quantityStepBtn: {
    width: 48,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.outline,
    borderRadius: 13,
    backgroundColor: COLORS.background,
    margin: 4,
  },
  quantityStepBtnDisabled: { opacity: 0.45 },
  quantityStepValue: { flex: 1, textAlign: 'center', fontSize: 21, fontWeight: '900', color: COLORS.onSurface },
  rowFields: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  addressModeRow: { gap: 8, marginBottom: 10 },
  addressModeBtn: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    borderWidth: 1,
    borderColor: COLORS.outline,
    borderRadius: 14,
    padding: 11,
    backgroundColor: COLORS.surface,
  },
  addressModeBtnActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryContainer },
  addressModeBtnDisabled: { opacity: 0.55 },
  addressModeTitle: { fontSize: 13, fontWeight: '800', color: COLORS.onSurface },
  addressModeSubtitle: { marginTop: 2, fontSize: 12, color: COLORS.onSurfaceVariant, lineHeight: 16 },
  templateWrap: { marginBottom: 12 },
  templateAllBtn: { alignSelf: 'flex-start', marginBottom: 6 },
  templateChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  templateChip: {
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: COLORS.outline,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: COLORS.background,
  },
  templateChipText: { maxWidth: 220, fontSize: 12, fontWeight: '700', color: COLORS.onSurfaceVariant },
  shiftListRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: COLORS.outline,
    borderRadius: 12,
    backgroundColor: COLORS.background,
    marginBottom: 8,
  },
  menuListRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: COLORS.outline,
    borderRadius: 12,
    backgroundColor: COLORS.background,
    marginBottom: 8,
  },
  shiftListTitle: { fontSize: 14, fontWeight: '800', color: COLORS.onSurface },
  shiftListMeta: { marginTop: 2, fontSize: 12, color: COLORS.onSurfaceVariant },
  roleSelectorLabel: { fontSize: 13, fontWeight: '700', color: COLORS.onSurfaceVariant, marginBottom: 7 },
  roleSelector: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  roleOption: {
    borderWidth: 1,
    borderColor: COLORS.outline,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 7,
    backgroundColor: COLORS.surface,
  },
  roleOptionActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryContainer },
  roleOptionText: { fontSize: 12, fontWeight: '800', color: COLORS.onSurfaceVariant },
  inlineQuantityLabel: { fontSize: 13, fontWeight: '700', color: COLORS.onSurfaceVariant, marginBottom: 7 },
  slotStack: { gap: 8, marginBottom: 12 },
  slotRow: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderWidth: 1,
    borderColor: COLORS.outline,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: COLORS.background,
  },
  slotLabel: { flex: 1, fontSize: 15, fontWeight: '700', color: COLORS.onSurfaceVariant },
  slotStepper: { width: 176, flexShrink: 0 },
  pickerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 14, paddingHorizontal: 14,
    backgroundColor: COLORS.surface, borderRadius: 14, borderWidth: 1, borderColor: COLORS.outline,
  },
  pickerText: { fontSize: 15, color: COLORS.onSurface },
  endDateRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  clearDateBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.outline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtn: { alignSelf: 'stretch', marginTop: 4, marginBottom: 8, borderColor: COLORS.outline, borderRadius: 12 },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: COLORS.outline,
    borderRadius: 12,
    backgroundColor: COLORS.background,
    marginBottom: 8,
  },
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
  imageActionBtn: { flex: 1, borderColor: COLORS.outline, borderRadius: 12 },
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
  submitBtn: { marginTop: 16, borderRadius: 14, paddingVertical: 6 },
  note: { fontSize: 12, color: COLORS.onSurfaceVariant, textAlign: 'center', marginTop: 12, fontStyle: 'italic' },
});
