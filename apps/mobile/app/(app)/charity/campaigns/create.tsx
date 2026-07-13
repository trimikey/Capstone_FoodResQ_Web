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
import { useCreateCampaign, type CreateCampaignInput } from '@/hooks/useCampaigns';
import { getCurrentCoords, type Coords } from '@/services/geolocation';
import { getErrorMessage } from '@/hooks/useErrorHandler';
import { Popup } from '@/components/ui/AppPopup';
import { AddressPicker, type AddressValue } from '@/components/AddressPicker';
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

interface MenuRow { name: string; type: string }
interface ScheduleRow { time: string; label: string }

/**
 * Charity-org tạo chiến dịch bếp ăn. Gửi đi với status 'draft' (chờ admin duyệt).
 * Địa chỉ + toạ độ qua AddressPicker; ngày/giờ qua DateTimePicker; menu/lịch
 * trình/vật phẩm là danh sách động (tuỳ chọn). POST /campaigns.
 */
export default function CreateCampaignScreen() {
  const createCampaign = useCreateCampaign();
  const [coords, setCoords] = useState<Coords | null>(null);
  const [submitting, setSubmitting] = useState(false);

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

  const [supplyItems, setSupplyItems] = useState<string[]>([]);
  const [supplyText, setSupplyText] = useState('');

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
    setSupplyItems((prev) => [...prev, s]);
    setSupplyText('');
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

          <Text style={styles.sectionLabel}>Số lượng tình nguyện viên cần</Text>
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

          {/* Thực đơn (tuỳ chọn) */}
          <Text style={styles.sectionLabel}>Thực đơn (tuỳ chọn)</Text>
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

          {/* Lịch trình (tuỳ chọn) */}
          <Text style={styles.sectionLabel}>Lịch trình (tuỳ chọn)</Text>
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

          {/* Vật phẩm cần hỗ trợ (tuỳ chọn) */}
          <Text style={styles.sectionLabel}>Vật phẩm cần hỗ trợ (tuỳ chọn)</Text>
          {supplyItems.map((s, i) => (
            <ListRow
              key={i}
              text={s}
              onRemove={() => setSupplyItems((prev) => prev.filter((_, idx) => idx !== i))}
            />
          ))}
          <View style={styles.rowFields}>
            <TextInput
              mode="outlined" dense placeholder="VD: Gạo, dầu ăn" value={supplyText} onChangeText={setSupplyText}
              outlineColor={COLORS.outline} activeOutlineColor={COLORS.primary} style={[styles.input, { flex: 1 }]}
              onSubmitEditing={addSupply}
            />
          </View>
          <Button mode="text" icon="plus" textColor={COLORS.primary} onPress={addSupply} compact style={styles.addBtn}>
            Thêm vật phẩm
          </Button>

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
  submitBtn: { marginTop: 16, borderRadius: 12, paddingVertical: 4 },
  note: { fontSize: 12, color: COLORS.onSurfaceVariant, textAlign: 'center', marginTop: 12, fontStyle: 'italic' },
});
