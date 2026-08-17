import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Text, TextInput } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import { AddressPicker, type AddressValue } from '@/components/AddressPicker';
import { AppImage } from '@/components/ui/AppImage';
import { Popup } from '@/components/ui/AppPopup';
import { StickyActionBar } from '@/components/ui/StickyActionBar';
import { useCreateCampaign, useUploadCampaignImage, type AssignmentRole } from '@/hooks/useCampaigns';
import { getErrorMessage } from '@/hooks/useErrorHandler';
import { useMyProfile } from '@/hooks/useProfile';
import { captureImage, pickImageFromLibrary, type CapturedImage } from '@/services/faceCapture';
import { getCurrentCoords, type Coords } from '@/services/geolocation';
import {
  type CampaignMenuDraft,
  type CampaignScheduleDraft,
  type CampaignShiftDraft,
  type CampaignSupplyDraft,
  useCampaignCreateDraftStore,
} from '@/stores/campaignCreateDraft';
import { mobileColors as COLORS } from '@/theme/design';
import {
  buildCampaignPayload,
  CAMPAIGN_CREATE_STEPS,
  CAMPAIGN_REVIEW_STEP,
  dateFromTime,
  fmtDate,
  getCampaignMenuSummary,
  getCampaignStepError,
  hasCampaignDraftData,
  normalizeCampaignMenuItems,
  normalizeCampaignScheduleItems,
  normalizeCampaignShifts,
  normalizeCampaignSupplyItems,
  SUPPLY_UNIT_OPTIONS,
  toInt,
  toTimeStr,
  toDateStr,
} from '@/utils/campaignCreateWizard';

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

const PERIOD_META = {
  midnight: { label: 'Ca khuya', time: '00:00-06:00' },
  morning: { label: 'Ca sáng', time: '06:00-12:00' },
  afternoon: { label: 'Ca chiều', time: '12:00-18:00' },
  evening: { label: 'Ca tối', time: '18:00-00:00 (+1 ngày)' },
} as const;

const OPERATION_PERIODS = [
  { key: 'midnight', label: 'Khuya', start: '00:00', end: '06:00' },
  { key: 'morning', label: 'Sáng', start: '06:00', end: '12:00' },
  { key: 'afternoon', label: 'Chiều', start: '12:00', end: '18:00' },
  { key: 'evening', label: 'Tối', start: '18:00', end: '23:59' },
] as const;

function fixedOperationWindow(startTime: string, endTime: string) {
  const [startHour = 0] = startTime.split(':').map(Number);
  const [endHour = 0, endMinute = 0] = endTime.split(':').map(Number);
  const roundedStart = Math.max(0, Math.min(18, Math.floor(startHour / 6) * 6));
  const rawEnd = Math.ceil((endHour + endMinute / 60) / 6) * 6;
  const roundedEnd = Math.max(roundedStart + 6, Math.min(24, rawEnd));
  return {
    startTime: dateFromTime(`${String(roundedStart).padStart(2, '0')}:00`),
    endTime: dateFromTime(roundedEnd === 24 ? '23:59' : `${String(roundedEnd).padStart(2, '0')}:00`),
  };
}

const MENU_TYPE_OPTIONS = [
  { value: 'breakfast', label: 'Bữa sáng' },
  { value: 'lunch', label: 'Bữa trưa' },
  { value: 'dinner', label: 'Bữa tối' },
];

const SHIFT_TEMPLATES: CampaignShiftDraft[] = [
  { label: 'Ca sáng - Sơ chế', role: 'chef', startTime: '06:00', endTime: '08:00', slotsNeeded: 4 },
  { label: 'Ca sáng - Nấu', role: 'chef', startTime: '07:00', endTime: '10:00', slotsNeeded: 3 },
  { label: 'Phục vụ bữa trưa', role: 'waiter', startTime: '11:00', endTime: '13:30', slotsNeeded: 5 },
  { label: 'Vận chuyển bữa trưa', role: 'shipper', startTime: '11:00', endTime: '13:30', slotsNeeded: 2 },
  { label: 'Phục vụ bữa tối', role: 'waiter', startTime: '17:30', endTime: '20:00', slotsNeeded: 4 },
];

const SCHEDULE_TEMPLATES: CampaignScheduleDraft[] = [
  { time: '06:00', label: 'Chuẩn bị bếp và phân công nhiệm vụ' },
  { time: '06:30', label: 'Nhận và kiểm tra vật phẩm hỗ trợ' },
  { time: '08:00', label: 'Sơ chế và nấu các món chính' },
  { time: '10:30', label: 'Kiểm tra chất lượng, đóng gói suất ăn' },
  { time: '12:00', label: 'Phát suất ăn và điều phối giao nhận' },
  { time: '13:30', label: 'Dọn dẹp khu vực, báo cáo số suất' },
];

type SupplyUnit = (typeof SUPPLY_UNIT_OPTIONS)[number];
type SupplyCategoryId = 'staple' | 'protein' | 'vegetable' | 'seasoning' | 'packaging' | 'operation';

type SupplyCatalogItem = CampaignSupplyDraft & {
  category: SupplyCategoryId;
  unit: SupplyUnit;
  quantity: number;
};

const SUPPLY_CATEGORY_LABELS: Record<SupplyCategoryId, string> = {
  staple: 'Nguyên liệu chính',
  protein: 'Đạm',
  vegetable: 'Rau củ',
  seasoning: 'Gia vị',
  packaging: 'Đóng gói',
  operation: 'Vận hành',
};

const SUPPLY_CATALOG: SupplyCatalogItem[] = [
  { category: 'staple', name: 'Gạo sạch', quantity: 12, unit: 'kg' },
  { category: 'staple', name: 'Mì/nui', quantity: 8, unit: 'kg' },
  { category: 'staple', name: 'Gạo nấu cháo', quantity: 6, unit: 'kg' },
  { category: 'staple', name: 'Bánh mì', quantity: 100, unit: 'cái' },
  { category: 'protein', name: 'Trứng gà', quantity: 100, unit: 'quả' },
  { category: 'protein', name: 'Thịt heo', quantity: 10, unit: 'kg' },
  { category: 'protein', name: 'Thịt gà', quantity: 10, unit: 'kg' },
  { category: 'protein', name: 'Cá', quantity: 10, unit: 'kg' },
  { category: 'protein', name: 'Đậu hũ', quantity: 15, unit: 'kg' },
  { category: 'vegetable', name: 'Rau xanh', quantity: 12, unit: 'kg' },
  { category: 'vegetable', name: 'Củ quả', quantity: 15, unit: 'kg' },
  { category: 'vegetable', name: 'Nấm', quantity: 5, unit: 'kg' },
  { category: 'seasoning', name: 'Dầu ăn', quantity: 2, unit: 'chai' },
  { category: 'seasoning', name: 'Nước mắm/nước tương', quantity: 2, unit: 'chai' },
  { category: 'seasoning', name: 'Muối/đường', quantity: 3, unit: 'kg' },
  { category: 'packaging', name: 'Hộp đựng suất ăn', quantity: 105, unit: 'hộp' },
  { category: 'packaging', name: 'Ly/hộp đựng cháo', quantity: 84, unit: 'cái' },
  { category: 'packaging', name: 'Muỗng/đũa dùng một lần', quantity: 105, unit: 'bộ' },
  { category: 'operation', name: 'Găng tay nilon', quantity: 2, unit: 'hộp' },
  { category: 'operation', name: 'Khẩu trang', quantity: 2, unit: 'hộp' },
  { category: 'operation', name: 'Thùng giữ nhiệt', quantity: 3, unit: 'thùng' },
  { category: 'operation', name: 'Túi rác', quantity: 2, unit: 'hộp' },
  { category: 'operation', name: 'Nước rửa tay', quantity: 2, unit: 'chai' },
];

const SUPPLY_TEMPLATES: CampaignSupplyDraft[] = [
  'Gạo sạch',
  'Trứng gà',
  'Rau xanh',
  'Củ quả',
  'Hộp đựng suất ăn',
  'Muỗng/đũa dùng một lần',
  'Găng tay nilon',
  'Thùng giữ nhiệt',
].map((name) => {
  const item = SUPPLY_CATALOG.find((candidate) => candidate.name === name)!;
  return { name: item.name, quantity: item.quantity, unit: item.unit };
});

const MENU_QUICK_TEMPLATES: CampaignMenuDraft[] = [
  { name: 'Cơm trưa 100 suất', type: 'lunch', plannedServings: 100 },
  { name: 'Cháo sáng dinh dưỡng', type: 'breakfast', plannedServings: 80 },
  { name: 'Suất ăn chay', type: 'lunch', plannedServings: 100 },
];

type CampaignScenarioPreset = {
  id: string;
  title: string;
  subtitle: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  campaignTitle: string;
  description: string;
  expectedServings: number;
  startTime: string;
  endTime: string;
  chefSlots: number;
  waiterSlots: number;
  shipperSlots: number;
  supplies: CampaignSupplyDraft[];
  menu: CampaignMenuDraft[];
  schedule: CampaignScheduleDraft[];
};

const CAMPAIGN_SCENARIO_PRESETS: CampaignScenarioPreset[] = [
  {
    id: 'lunch-rice-100',
    title: 'Bếp cơm trưa 100 suất',
    subtitle: 'Cơm phần, canh, đóng hộp và phát tại điểm cố định.',
    icon: 'food-turkey',
    campaignTitle: 'Bữa cơm trưa 0 đồng cho lao động khó khăn',
    description: 'Chuẩn bị và phát các suất cơm trưa đủ dinh dưỡng cho người lao động, sinh viên và người có hoàn cảnh khó khăn quanh khu vực bếp.',
    expectedServings: 100,
    startTime: '08:00',
    endTime: '13:00',
    chefSlots: 3,
    waiterSlots: 4,
    shipperSlots: 2,
    supplies: [
      { name: 'Gạo sạch', quantity: 12, unit: 'kg' },
      { name: 'Thịt heo', quantity: 10, unit: 'kg' },
      { name: 'Rau xanh', quantity: 8, unit: 'kg' },
      { name: 'Củ quả', quantity: 10, unit: 'kg' },
      { name: 'Hộp đựng suất ăn', quantity: 105, unit: 'hộp' },
      { name: 'Muỗng/đũa dùng một lần', quantity: 105, unit: 'bộ' },
      { name: 'Găng tay nilon', quantity: 2, unit: 'hộp' },
      { name: 'Thùng giữ nhiệt', quantity: 3, unit: 'thùng' },
    ],
    menu: [
      { name: 'Suất cơm thịt kho trứng', type: 'lunch', plannedServings: 100 },
      { name: 'Canh rau củ', type: 'lunch' },
      { name: 'Rau xào theo mùa', type: 'lunch' },
    ],
    schedule: [
      { time: '08:00', label: 'Nhận và kiểm tra vật phẩm tại bếp' },
      { time: '08:30', label: 'Sơ chế nguyên liệu, phân công TNV' },
      { time: '09:30', label: 'Nấu món chính và canh' },
      { time: '11:00', label: 'Kiểm tra chất lượng, đóng gói suất ăn' },
      { time: '11:30', label: 'Phát suất tại điểm cố định và điều phối giao nhận' },
      { time: '13:00', label: 'Dọn dẹp, ghi nhận số suất đã phát' },
    ],
  },
  {
    id: 'breakfast-porridge-80',
    title: 'Cháo sáng 80 suất',
    subtitle: 'Phù hợp bữa sáng nhẹ, dễ nấu số lượng lớn.',
    icon: 'pot-steam-outline',
    campaignTitle: 'Cháo sáng yêu thương cho người cần hỗ trợ',
    description: 'Nấu và phát cháo sáng nóng, dễ ăn cho người cao tuổi, người lao động sớm và các hoàn cảnh khó khăn.',
    expectedServings: 80,
    startTime: '05:30',
    endTime: '08:30',
    chefSlots: 2,
    waiterSlots: 3,
    shipperSlots: 1,
    supplies: [
      { name: 'Gạo nấu cháo', quantity: 6, unit: 'kg' },
      { name: 'Thịt heo', quantity: 6, unit: 'kg' },
      { name: 'Củ quả', quantity: 8, unit: 'kg' },
      { name: 'Ly/hộp đựng cháo', quantity: 84, unit: 'cái' },
      { name: 'Muỗng/đũa dùng một lần', quantity: 84, unit: 'bộ' },
      { name: 'Thùng giữ nhiệt', quantity: 2, unit: 'thùng' },
    ],
    menu: [
      { name: 'Cháo thịt bằm rau củ', type: 'breakfast', plannedServings: 80 },
      { name: 'Sữa đậu nành', type: 'breakfast' },
    ],
    schedule: [
      { time: '05:30', label: 'Tập trung tại bếp, kiểm tra nguyên liệu' },
      { time: '05:45', label: 'Sơ chế rau củ và chuẩn bị nồi cháo' },
      { time: '06:15', label: 'Nấu cháo, kiểm tra độ nóng và khẩu phần' },
      { time: '07:15', label: 'Đóng ly/hộp cháo, chuẩn bị phát' },
      { time: '07:30', label: 'Phát cháo sáng cho người nhận' },
      { time: '08:30', label: 'Dọn dẹp và báo cáo số suất đã phát' },
    ],
  },
  {
    id: 'vegetarian-100',
    title: 'Suất ăn chay 100 suất',
    subtitle: 'Cơm chay, đậu hũ, rau củ, ít rủi ro bảo quản.',
    icon: 'leaf',
    campaignTitle: 'Suất cơm chay nghĩa tình',
    description: 'Chuẩn bị các suất cơm chay thanh đạm, dễ bảo quản và phù hợp với nhiều nhóm người nhận.',
    expectedServings: 100,
    startTime: '08:00',
    endTime: '12:30',
    chefSlots: 3,
    waiterSlots: 4,
    shipperSlots: 1,
    supplies: [
      { name: 'Gạo sạch', quantity: 12, unit: 'kg' },
      { name: 'Đậu hũ', quantity: 15, unit: 'kg' },
      { name: 'Rau xanh', quantity: 12, unit: 'kg' },
      { name: 'Củ quả', quantity: 8, unit: 'kg' },
      { name: 'Nấm', quantity: 5, unit: 'kg' },
      { name: 'Hộp đựng suất ăn', quantity: 105, unit: 'hộp' },
      { name: 'Muỗng/đũa dùng một lần', quantity: 105, unit: 'bộ' },
      { name: 'Găng tay nilon', quantity: 2, unit: 'hộp' },
    ],
    menu: [
      { name: 'Suất cơm chay đậu hũ sốt cà', type: 'lunch', plannedServings: 100 },
      { name: 'Canh rau củ chay', type: 'lunch' },
      { name: 'Rau xào nấm', type: 'lunch' },
    ],
    schedule: [
      { time: '08:00', label: 'Nhận vật phẩm và kiểm tra dụng cụ bếp' },
      { time: '08:30', label: 'Sơ chế rau củ, đậu hũ và nấm' },
      { time: '09:30', label: 'Nấu món chay chính và canh' },
      { time: '10:45', label: 'Đóng gói suất ăn, kiểm tra khẩu phần' },
      { time: '11:30', label: 'Phát suất ăn tại điểm cố định' },
      { time: '12:30', label: 'Dọn dẹp, tổng kết số suất còn lại' },
    ],
  },
  {
    id: 'dinner-rice-100',
    title: 'Phát cơm tối 100 suất',
    subtitle: 'Chuẩn bị chiều, phát tối cho khu lưu trú hoặc bệnh viện.',
    icon: 'weather-night',
    campaignTitle: 'Cơm tối sẻ chia cho người khó khăn',
    description: 'Chuẩn bị và phát suất cơm tối cho người có hoàn cảnh khó khăn, thân nhân bệnh nhân hoặc người lao động về muộn.',
    expectedServings: 100,
    startTime: '15:00',
    endTime: '19:30',
    chefSlots: 3,
    waiterSlots: 4,
    shipperSlots: 2,
    supplies: [
      { name: 'Gạo sạch', quantity: 12, unit: 'kg' },
      { name: 'Trứng gà', quantity: 100, unit: 'quả' },
      { name: 'Rau xanh', quantity: 8, unit: 'kg' },
      { name: 'Củ quả', quantity: 8, unit: 'kg' },
      { name: 'Hộp đựng suất ăn', quantity: 105, unit: 'hộp' },
      { name: 'Muỗng/đũa dùng một lần', quantity: 105, unit: 'bộ' },
      { name: 'Thùng giữ nhiệt', quantity: 3, unit: 'thùng' },
    ],
    menu: [
      { name: 'Suất cơm trứng kho rau củ', type: 'dinner', plannedServings: 100 },
      { name: 'Canh rau củ', type: 'dinner' },
    ],
    schedule: [
      { time: '15:00', label: 'Tập trung tại bếp, kiểm tra vật phẩm' },
      { time: '15:30', label: 'Sơ chế nguyên liệu và chuẩn bị hộp' },
      { time: '16:30', label: 'Nấu món chính và canh' },
      { time: '18:00', label: 'Đóng gói, giữ nóng suất ăn' },
      { time: '18:30', label: 'Phát suất tối và điều phối giao nhận' },
      { time: '19:30', label: 'Dọn dẹp, ghi nhận kết quả phát suất' },
    ],
  },
];

function buildScenarioShifts(preset: CampaignScenarioPreset): CampaignShiftDraft[] {
  const shifts: CampaignShiftDraft[] = [];
  if (preset.chefSlots > 0) {
    shifts.push({ label: 'Ca bếp', role: 'chef', startTime: preset.startTime, endTime: preset.endTime, slotsNeeded: preset.chefSlots });
  }
  if (preset.waiterSlots > 0) {
    shifts.push({ label: 'Ca phục vụ', role: 'waiter', startTime: preset.startTime, endTime: preset.endTime, slotsNeeded: preset.waiterSlots });
  }
  if (preset.shipperSlots > 0) {
    shifts.push({ label: 'Ca giao nhận', role: 'shipper', startTime: preset.startTime, endTime: preset.endTime, slotsNeeded: preset.shipperSlots });
  }
  return shifts;
}

function inferMealType(startTime: Date): 'breakfast' | 'lunch' | 'dinner' {
  const hour = startTime.getHours();
  if (hour < 10) return 'breakfast';
  if (hour < 15) return 'lunch';
  return 'dinner';
}

function buildMenuSuggestionsFromSupplies(draft: ReturnType<typeof useCampaignCreateDraftStore.getState>['draft']): CampaignMenuDraft[] {
  const suppliesText = draft.supplyItems.map((item) => item.name.toLowerCase()).join(' ');
  const expected = toInt(draft.expectedServings) || 100;
  const mealType = inferMealType(draft.startTime);
  const suggestions: CampaignMenuDraft[] = [];

  if (suppliesText.includes('gạo')) {
    suggestions.push({ name: 'Cơm phần dinh dưỡng', type: mealType, plannedServings: expected });
  }
  if (suppliesText.includes('trứng')) {
    suggestions.push({ name: 'Cơm trứng rau củ', type: mealType, plannedServings: Math.min(expected, 100) });
  }
  if (suppliesText.includes('rau') || suppliesText.includes('củ')) {
    suggestions.push({ name: 'Canh rau củ', type: mealType, plannedServings: expected });
  }
  if (suppliesText.includes('thịt') || suppliesText.includes('gà') || suppliesText.includes('cá')) {
    suggestions.push({ name: 'Cơm mặn suất hỗ trợ', type: mealType, plannedServings: expected });
  }
  if (suppliesText.includes('cháo')) {
    suggestions.push({ name: 'Cháo sáng dinh dưỡng', type: 'breakfast', plannedServings: expected });
  }

  return suggestions.filter(
    (item, index, list) => list.findIndex((candidate) => candidate.name === item.name) === index,
  );
}

function findSupplyCatalogItem(name: string) {
  const normalizedName = name.trim().toLowerCase();
  return SUPPLY_CATALOG.find((item) => item.name.toLowerCase() === normalizedName);
}

function isAllowedSupplyUnit(unit?: string) {
  return Boolean(unit && SUPPLY_UNIT_OPTIONS.includes(unit as SupplyUnit));
}

type ScheduleStageId = 'prep' | 'receive' | 'cook' | 'pack' | 'serve' | 'report';

const SCHEDULE_STAGE_META: Record<ScheduleStageId, { label: string; description: string; color: string; bg: string }> = {
  prep: { label: 'Chuẩn bị', description: 'Sắp bếp, phân công đầu việc', color: '#2563eb', bg: '#dbeafe' },
  receive: { label: 'Nhận/kiểm tra', description: 'Nhận vật phẩm và kiểm số lượng', color: '#b45309', bg: '#fef3c7' },
  cook: { label: 'Sơ chế/nấu', description: 'Sơ chế và nấu món chính', color: '#15803d', bg: '#dcfce7' },
  pack: { label: 'Đóng gói/QC', description: 'Kiểm tra chất lượng, đóng gói', color: '#7c3aed', bg: '#ede9fe' },
  serve: { label: 'Phát/giao', description: 'Phát suất và điều phối giao nhận', color: COLORS.primary, bg: COLORS.primaryContainer },
  report: { label: 'Dọn dẹp/báo cáo', description: 'Dọn khu vực, ghi nhận kết quả', color: '#64748b', bg: '#e2e8f0' },
};

function classifyScheduleStage(label: string): ScheduleStageId {
  const normalized = label.toLowerCase();
  if (normalized.includes('nhận') || normalized.includes('kiểm tra')) return 'receive';
  if (normalized.includes('sơ chế') || normalized.includes('nấu')) return 'cook';
  if (normalized.includes('đóng gói') || normalized.includes('chất lượng') || normalized.includes('qc')) return 'pack';
  if (normalized.includes('phát') || normalized.includes('giao')) return 'serve';
  if (normalized.includes('dọn') || normalized.includes('báo cáo') || normalized.includes('tổng kết')) return 'report';
  return 'prep';
}

export default function CreateCampaignScreen() {
  const createCampaign = useCreateCampaign();
  const uploadCampaignImage = useUploadCampaignImage();
  const { data: profile } = useMyProfile();
  const [coords, setCoords] = useState<Coords | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [returnToStep, setReturnToStep] = useState<number | null>(null);

  const currentStep = useCampaignCreateDraftStore((state) => state.currentStep);
  const draft = useCampaignCreateDraftStore((state) => state.draft);
  const setStep = useCampaignCreateDraftStore((state) => state.setStep);
  const patchDraft = useCampaignCreateDraftStore((state) => state.patchDraft);
  const resetDraft = useCampaignCreateDraftStore((state) => state.reset);

  useEffect(() => {
    getCurrentCoords().then(({ coords: nextCoords }) => setCoords(nextCoords));
  }, []);

  const profileAddress = profile?.receiver?.address?.trim() ?? '';
  const profileLat = profile?.receiver?.lat ?? null;
  const profileLng = profile?.receiver?.lng ?? null;
  const hasProfileAddress = profileAddress.length >= 5;
  const step = CAMPAIGN_CREATE_STEPS[currentStep];
  const isReviewStep = currentStep === CAMPAIGN_REVIEW_STEP;

  const stepError = useMemo(() => getCampaignStepError(currentStep, draft), [currentStep, draft]);

  const showValidationError = (message: string) => {
    Popup.show({ type: 'warning', text1: 'Cần kiểm tra lại', text2: message });
  };

  const confirmLeave = useCallback(() => {
    if (!hasCampaignDraftData(draft)) {
      resetDraft();
      router.back();
      return;
    }

    Alert.alert('Hủy tạo chiến dịch?', 'Bản nháp hiện tại sẽ bị xóa khỏi phiên làm việc.', [
      { text: 'Tiếp tục nhập', style: 'cancel' },
      {
        text: 'Xóa bản nháp',
        style: 'destructive',
        onPress: () => {
          resetDraft();
          router.back();
        },
      },
    ]);
  }, [draft, resetDraft]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (returnToStep !== null) {
        setReturnToStep(null);
        setStep(returnToStep);
        return true;
      }
      if (currentStep === 0) {
        confirmLeave();
      } else {
        setStep(currentStep - 1);
      }
      return true;
    });

    return () => subscription.remove();
  }, [confirmLeave, currentStep, returnToStep, setStep]);

  const handleEditFromReview = (step: number) => {
    setReturnToStep(CAMPAIGN_REVIEW_STEP);
    setStep(step);
  };

  const goBackStep = () => {
    if (returnToStep !== null) {
      setReturnToStep(null);
      setStep(returnToStep);
      return;
    }
    if (currentStep === 0) {
      confirmLeave();
      return;
    }
    setStep(currentStep - 1);
  };

  const goNextStep = () => {
    if (stepError) return;
    if (returnToStep !== null) {
      const target = returnToStep;
      setReturnToStep(null);
      setStep(target);
      return;
    }
    setStep(Math.min(currentStep + 1, CAMPAIGN_REVIEW_STEP));
  };

  const applyProfileAddress = () => {
    if (!hasProfileAddress) {
      Popup.show({ type: 'warning', text1: 'Hồ sơ chưa có địa chỉ mặc định' });
      return;
    }
    const lat = profileLat ?? coords?.lat;
    const lng = profileLng ?? coords?.lng;
    if (lat == null || lng == null) {
      Popup.show({
        type: 'warning',
        text1: 'Chưa lấy được GPS thật',
        text2: 'Hãy bật định vị trên thiết bị rồi thử lại.',
      });
      return;
    }
    patchDraft({
      addressMode: 'profile',
      address: {
        address: profileAddress,
        lat,
        lng,
      },
    });
  };

  const uploadImage = async (photo: CapturedImage | null) => {
    if (!photo) return;
    try {
      const res = await uploadCampaignImage.mutateAsync(photo);
      patchDraft({ imageUrl: res.url });
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

  const applyScenarioPreset = (preset: CampaignScenarioPreset) => {
    const fixedWindow = fixedOperationWindow(preset.startTime, preset.endTime);
    patchDraft({
      title: preset.campaignTitle,
      description: preset.description,
      startTime: fixedWindow.startTime,
      endTime: fixedWindow.endTime,
      expectedServings: String(preset.expectedServings),
      chefSlots: String(preset.chefSlots),
      waiterSlots: String(preset.waiterSlots),
      shipperSlots: String(preset.shipperSlots),
      shifts: buildScenarioShifts(preset),
      supplyItems: preset.supplies.map((item) => ({ ...item })),
      menuItems: preset.menu.map((item) => ({ ...item })),
      scheduleItems: preset.schedule.map((item) => ({ ...item })),
    });
    Alert.alert(
      'Đã áp dụng mẫu chiến dịch',
      'Mẫu đã điền sẵn mục tiêu, ca trực, vật phẩm, thực đơn và lịch trình. Bạn muốn tiếp tục chỉnh từng bước hay xem lại và gửi ngay?',
      [
        { text: 'Chỉnh từng bước', style: 'cancel' },
        {
          text: 'Xem lại ngay',
          onPress: () => setStep(CAMPAIGN_REVIEW_STEP),
        },
      ],
    );
  };

  const submitCampaign = async () => {
    const reviewError = getCampaignStepError(CAMPAIGN_REVIEW_STEP, draft);
    if (reviewError) {
      showValidationError(reviewError);
      return;
    }

    try {
      setSubmitting(true);
      await createCampaign.mutateAsync(buildCampaignPayload(draft));
      resetDraft();
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

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return <BasicStep draft={draft} patchDraft={patchDraft} onApplyScenario={applyScenarioPreset} />;
      case 1:
        return (
          <ImageStep
            imageUrl={draft.imageUrl}
            uploading={uploadCampaignImage.isPending}
            onPick={pickCampaignImage}
            onCapture={captureCampaignImage}
            onRemove={() => patchDraft({ imageUrl: null })}
          />
        );
      case 2:
        return (
          <TimeLocationStep
            coords={coords}
            draft={draft}
            hasProfileAddress={hasProfileAddress}
            profileAddress={profileAddress}
            patchDraft={patchDraft}
            applyProfileAddress={applyProfileAddress}
          />
        );
      case 3: {
        const shiftsForWarning = normalizeCampaignShifts(draft.shifts, draft);
        const slotWarnings = getSlotWarnings(draft, shiftsForWarning);
        return (
          <View style={styles.stepStack}>
            <GoalStep draft={draft} patchDraft={patchDraft} />
            {slotWarnings.length > 0 && (
              <View style={styles.reviewWarning}>
                <MaterialCommunityIcons name="alert-circle-outline" size={18} color={COLORS.warning} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.reviewWarningTitle}>Cần cân nhắc phân bổ ca</Text>
                  {slotWarnings.map((w) => (
                    <Text key={w} style={styles.reviewWarningText}>{w}</Text>
                  ))}
                </View>
              </View>
            )}
            <ShiftStep draft={draft} patchDraft={patchDraft} />
          </View>
        );
      }
      case 4:
        return <SupplyStep draft={draft} patchDraft={patchDraft} />;
      case 5:
        return <MenuStep draft={draft} patchDraft={patchDraft} />;
      case 6:
        return <ScheduleStep draft={draft} patchDraft={patchDraft} />;
      default:
        return <ReviewStep draft={draft} onEdit={handleEditFromReview} />;
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={confirmLeave} hitSlop={8}>
          <MaterialCommunityIcons name="close" size={24} color={COLORS.onSurface} />
        </Pressable>
        <Text variant="titleMedium" style={styles.headerTitle}>Tạo chiến dịch bếp ăn</Text>
        <Text style={styles.headerCounter}>{currentStep + 1}/{CAMPAIGN_CREATE_STEPS.length}</Text>
      </View>

      <WizardProgress step={currentStep} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.stepHero}>
            <View style={styles.stepIcon}>
              <MaterialCommunityIcons name={step.icon} size={23} color={COLORS.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.stepKicker}>Bước {currentStep + 1}</Text>
              <Text style={styles.stepTitle}>{step.title}</Text>
              <Text style={styles.stepHelper}>{getStepHelper(currentStep)}</Text>
            </View>
          </View>

          {renderStep()}
          {!isReviewStep && stepError ? (
            <View style={styles.stepErrorBanner}>
              <MaterialCommunityIcons name="alert-circle" size={18} color={COLORS.error} />
              <Text style={styles.stepErrorText}>{stepError}</Text>
            </View>
          ) : null}
        </ScrollView>

        <StickyActionBar style={styles.footer}>
          <Button
            mode="outlined"
            icon="arrow-left"
            onPress={goBackStep}
            textColor={COLORS.onSurfaceVariant}
            style={styles.footerButton}
            disabled={submitting}
          >
            {returnToStep !== null ? 'Về tổng quan' : currentStep === 0 ? 'Hủy' : 'Quay lại'}
          </Button>
          <Button
            mode="contained"
            icon={isReviewStep ? 'send' : returnToStep !== null ? 'check' : 'arrow-right'}
            onPress={isReviewStep ? submitCampaign : goNextStep}
            loading={submitting}
            disabled={submitting || (!isReviewStep && !!stepError)}
            buttonColor={COLORS.primary}
            style={styles.footerButton}
            contentStyle={styles.footerPrimaryContent}
          >
            {isReviewStep ? 'Gửi yêu cầu' : returnToStep !== null ? 'Lưu & Xem lại' : 'Tiếp tục'}
          </Button>
        </StickyActionBar>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function getStepHelper(step: number) {
  switch (step) {
    case 0:
      return 'Tên và mô tả giúp admin, tình nguyện viên và nhà cung cấp hiểu mục tiêu.';
    case 1:
      return 'Ảnh là tùy chọn, có thể thêm để chiến dịch đáng tin hơn.';
    case 2:
      return 'Địa chỉ, ngày và giờ cần chính xác để phối hợp bếp, TNV và giao nhận.';
    case 3:
      return 'Đặt số suất, nhân sự cần tuyển và tạo các ca để TNV đăng ký đúng vai trò và khung giờ.';
    case 4:
      return 'Nhập rõ tên, số lượng và đơn vị để nhà cung cấp biết cần hỗ trợ gì.';
    case 5:
      return 'Thêm món dự kiến hoặc dùng gợi ý dựa trên vật phẩm cần chuẩn bị.';
    case 6:
      return 'Ghi các mốc vận hành như nhận nguyên liệu, nấu, đóng gói, phát suất.';
    default:
      return 'Rà lại toàn bộ thông tin trước khi gửi yêu cầu chờ admin duyệt.';
  }
}

function BasicStep({
  draft,
  patchDraft,
  onApplyScenario,
}: {
  draft: ReturnType<typeof useCampaignCreateDraftStore.getState>['draft'];
  patchDraft: ReturnType<typeof useCampaignCreateDraftStore.getState>['patchDraft'];
  onApplyScenario: (preset: CampaignScenarioPreset) => void;
}) {
  return (
    <View style={styles.stepStack}>
      <FormCard>
        <View style={styles.scenarioHeader}>
          <View style={styles.scenarioHeaderIcon}>
            <MaterialCommunityIcons name="auto-fix" size={20} color={COLORS.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionLabel}>Mẫu chiến dịch nhanh</Text>
            <Text style={styles.scenarioHint}>
              Chọn một kịch bản để tự điền mục tiêu, ca trực, vật phẩm, thực đơn và lịch trình.
            </Text>
          </View>
        </View>
        <View style={styles.scenarioGrid}>
          {CAMPAIGN_SCENARIO_PRESETS.map((preset) => (
            <ScenarioPresetCard key={preset.id} preset={preset} onPress={() => onApplyScenario(preset)} />
          ))}
        </View>
      </FormCard>

      <FormCard>
        <Field label="Tên chiến dịch *">
          <TextInput
            mode="outlined"
            value={draft.title}
            onChangeText={(title) => patchDraft({ title })}
            outlineColor={COLORS.outline}
            activeOutlineColor={COLORS.primary}
            style={styles.input}
            maxLength={255}
          />
        </Field>
        <Field label="Mô tả">
          <TextInput
            mode="outlined"
            multiline
            numberOfLines={4}
            value={draft.description}
            onChangeText={(description) => patchDraft({ description })}
            outlineColor={COLORS.outline}
            activeOutlineColor={COLORS.primary}
            style={styles.input}
            maxLength={5000}
          />
        </Field>
      </FormCard>
    </View>
  );
}

function ScenarioPresetCard({
  preset,
  onPress,
}: {
  preset: CampaignScenarioPreset;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.scenarioCard}>
      <View style={styles.scenarioIcon}>
        <MaterialCommunityIcons name={preset.icon} size={20} color={COLORS.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.scenarioTitle}>{preset.title}</Text>
        <Text style={styles.scenarioSubtitle}>{preset.subtitle}</Text>
        <Text style={styles.scenarioMeta}>
          {preset.expectedServings} suất · {preset.chefSlots + preset.waiterSlots + preset.shipperSlots} TNV · {preset.startTime}-{preset.endTime}
        </Text>
      </View>
    </Pressable>
  );
}

function ImageStep({
  imageUrl,
  uploading,
  onPick,
  onCapture,
  onRemove,
}: {
  imageUrl: string | null;
  uploading: boolean;
  onPick: () => void;
  onCapture: () => void;
  onRemove: () => void;
}) {
  return (
    <FormCard>
      {imageUrl ? (
        <View style={styles.imagePreview}>
          <AppImage source={{ uri: imageUrl }} style={styles.image} />
          <Pressable onPress={onRemove} style={styles.removeImageBtn} hitSlop={8} disabled={uploading}>
            <MaterialCommunityIcons name="close" size={18} color="#fff" />
          </Pressable>
        </View>
      ) : (
        <View style={styles.imageActions}>
          <Button
            mode="outlined"
            icon="image-plus"
            onPress={onPick}
            loading={uploading}
            disabled={uploading}
            textColor={COLORS.primary}
            style={styles.imageActionBtn}
          >
            Chọn ảnh
          </Button>
          <Button
            mode="outlined"
            icon="camera"
            onPress={onCapture}
            loading={uploading}
            disabled={uploading}
            textColor={COLORS.primary}
            style={styles.imageActionBtn}
          >
            Chụp ảnh
          </Button>
        </View>
      )}
    </FormCard>
  );
}

function TimeLocationStep({
  coords,
  draft,
  hasProfileAddress,
  profileAddress,
  patchDraft,
  applyProfileAddress,
}: {
  coords: Coords | null;
  draft: ReturnType<typeof useCampaignCreateDraftStore.getState>['draft'];
  hasProfileAddress: boolean;
  profileAddress: string;
  patchDraft: ReturnType<typeof useCampaignCreateDraftStore.getState>['patchDraft'];
  applyProfileAddress: () => void;
}) {
  const start = toTimeStr(draft.startTime);
  const end = toTimeStr(draft.endTime);
  const activeIndexes = OPERATION_PERIODS
    .map((period, index) => ({ index, active: period.end > start && period.start < end }))
    .filter((item) => item.active)
    .map((item) => item.index);
  const togglePeriod = (index: number) => {
    let indexes = [...activeIndexes];
    if (indexes.includes(index)) {
      if (indexes.length === 1) return;
      if (index === indexes[0]) indexes = indexes.slice(1);
      else if (index === indexes[indexes.length - 1]) indexes = indexes.slice(0, -1);
      else return;
    } else {
      const min = Math.min(index, ...(indexes.length ? indexes : [index]));
      const max = Math.max(index, ...(indexes.length ? indexes : [index]));
      indexes = Array.from({ length: max - min + 1 }, (_, offset) => min + offset);
    }
    const first = OPERATION_PERIODS[indexes[0]];
    const last = OPERATION_PERIODS[indexes[indexes.length - 1]];
    patchDraft({ startTime: dateFromTime(first.start), endTime: dateFromTime(last.end) });
  };

  return (
    <FormCard>
      <Field label="Địa chỉ bếp *">
        <View style={styles.addressModeRow}>
          <AddressModeButton
            icon="home-map-marker"
            title="Dùng địa chỉ mặc định"
            subtitle={hasProfileAddress ? profileAddress : 'Chưa cập nhật trong hồ sơ'}
            active={draft.addressMode === 'profile'}
            disabled={!hasProfileAddress}
            onPress={applyProfileAddress}
          />
          <AddressModeButton
            icon="map-search-outline"
            title="Chọn địa chỉ khác"
            subtitle="Search hoặc chỉnh trên bản đồ"
            active={draft.addressMode === 'custom'}
            onPress={() => patchDraft({ addressMode: 'custom' })}
          />
        </View>
        <AddressPicker
          initialCoords={coords}
          value={draft.address}
          placeholder=""
          onChange={(address: AddressValue | null) => patchDraft({ addressMode: 'custom', address })}
        />
      </Field>

      <Field label="Ngày tổ chức *">
        <PickerButton
          icon="calendar"
          text={fmtDate(draft.scheduledDate)}
          onPress={() =>
            DateTimePickerAndroid.open({
              value: draft.scheduledDate,
              mode: 'date',
              minimumDate: new Date(),
              onChange: (_event, date) => {
                if (!date) return;
                patchDraft({
                  scheduledDate: date,
                  endDate: draft.endDate && toDateStr(draft.endDate) < toDateStr(date) ? null : draft.endDate,
                });
              },
            })
          }
        />
      </Field>

      <Field label="Ngày kết thúc">
        <View style={styles.endDateRow}>
          <View style={{ flex: 1 }}>
            <PickerButton
              icon="calendar-end"
              text={draft.endDate ? fmtDate(draft.endDate) : 'Một ngày'}
              onPress={() =>
                DateTimePickerAndroid.open({
                  value: draft.endDate ?? draft.scheduledDate,
                  mode: 'date',
                  minimumDate: draft.scheduledDate,
                  onChange: (_event, date) => date && patchDraft({ endDate: date }),
                })
              }
            />
          </View>
          {draft.endDate ? (
            <Pressable onPress={() => patchDraft({ endDate: null })} style={styles.clearDateBtn} hitSlop={8}>
              <MaterialCommunityIcons name="close" size={18} color={COLORS.onSurfaceVariant} />
            </Pressable>
          ) : null}
        </View>
      </Field>

      <Field label="Ca vận hành liên tiếp *">
        <View style={styles.rowFields}>
          {OPERATION_PERIODS.map((period, index) => {
            const active = activeIndexes.includes(index);
            return (
              <Button
                key={period.key}
                compact
                mode={active ? 'contained' : 'outlined'}
                onPress={() => togglePeriod(index)}
                style={{ flex: 1 }}
              >
                {period.label}
              </Button>
            );
          })}
        </View>
        <Text style={styles.infoBannerText}>
          Khung cố định: 00–06, 06–12, 12–18, 18–24. Chọn cách quãng sẽ tự điền các ca ở giữa.
        </Text>
      </Field>
    </FormCard>
  );
}

function GoalStep({
  draft,
  patchDraft,
}: {
  draft: ReturnType<typeof useCampaignCreateDraftStore.getState>['draft'];
  patchDraft: ReturnType<typeof useCampaignCreateDraftStore.getState>['patchDraft'];
}) {
  return (
    <FormCard>
      <Text style={styles.sectionLabel}>Nhân sự tình nguyện</Text>
      <View style={styles.slotStack}>
        <SlotInput label="Đầu bếp" value={draft.chefSlots} onChange={(chefSlots) => patchDraft({ chefSlots })} />
        <SlotInput label="Phục vụ" value={draft.waiterSlots} onChange={(waiterSlots) => patchDraft({ waiterSlots })} />
        <SlotInput label="Giao hàng" value={draft.shipperSlots} onChange={(shipperSlots) => patchDraft({ shipperSlots })} />
      </View>
      <Field label="Số suất dự kiến *">
        <QuantityStepper
          value={draft.expectedServings}
          onChange={(expectedServings) => patchDraft({ expectedServings })}
          min={0}
          max={100000}
          step={10}
        />
      </Field>
    </FormCard>
  );
}

function ShiftStep({
  draft,
  patchDraft,
}: {
  draft: ReturnType<typeof useCampaignCreateDraftStore.getState>['draft'];
  patchDraft: ReturnType<typeof useCampaignCreateDraftStore.getState>['patchDraft'];
}) {
  const addTemplate = (template: CampaignShiftDraft) => {
    if (draft.shifts.some((item) => item.label === template.label && item.startTime === template.startTime && item.endTime === template.endTime)) return;
    patchDraft({ shifts: [...draft.shifts, template] });
  };

  return (
    <FormCard>
      <TemplateChips
        items={SHIFT_TEMPLATES}
        getLabel={(item) => item.label}
        onPick={addTemplate}
        onPickAll={() => SHIFT_TEMPLATES.forEach(addTemplate)}
      />
      {draft.shifts.map((shift, index) => (
        <EditableShiftRow
          key={`${shift.label}-${shift.startTime}-${index}`}
          shift={shift}
          index={index}
          onChange={(next) => patchDraft({ shifts: draft.shifts.map((item, itemIndex) => (itemIndex === index ? next : item)) })}
          onRemove={() => patchDraft({ shifts: draft.shifts.filter((_, itemIndex) => itemIndex !== index) })}
        />
      ))}
      <Button
        mode="outlined"
        icon="plus"
        textColor={COLORS.primary}
        onPress={() => patchDraft({ shifts: [...draft.shifts, { label: '', role: undefined, startTime: '08:00', endTime: '12:00', slotsNeeded: 2 }] })}
        compact
        style={styles.addBtn}
      >
        Thêm dòng ca trực
      </Button>
    </FormCard>
  );
}

function MenuStep({
  draft,
  patchDraft,
}: {
  draft: ReturnType<typeof useCampaignCreateDraftStore.getState>['draft'];
  patchDraft: ReturnType<typeof useCampaignCreateDraftStore.getState>['patchDraft'];
}) {
  const summary = getCampaignMenuSummary(draft);
  const supplySuggestions = buildMenuSuggestionsFromSupplies(draft);
  const addTemplate = (template: CampaignMenuDraft) => {
    if (draft.menuItems.some((item) => item.name.trim().toLowerCase() === template.name.toLowerCase())) return;
    patchDraft({ menuItems: [...draft.menuItems, template] });
  };

  return (
    <FormCard>
      <View style={styles.infoBanner}>
        <MaterialCommunityIcons name="information-outline" size={18} color={COLORS.primary} />
        <Text style={styles.infoBannerText}>
          Cần chốt ít nhất một món trước khi gửi duyệt để hệ thống tính nhu cầu chuẩn bị và nhân sự.
        </Text>
      </View>
      <MenuSummaryCard summary={summary} />
      <Text style={styles.sectionLabel}>Mẫu nhanh</Text>
      <TemplateChips
        items={MENU_QUICK_TEMPLATES}
        getLabel={(item) => item.name}
        onPick={addTemplate}
        onPickAll={() => MENU_QUICK_TEMPLATES.forEach(addTemplate)}
      />
      {supplySuggestions.length > 0 ? (
        <>
          <Text style={styles.sectionLabel}>Gợi ý theo vật phẩm dự kiến</Text>
          <TemplateChips
            items={supplySuggestions}
            getLabel={(item) => item.name}
            onPick={addTemplate}
            onPickAll={() => supplySuggestions.forEach(addTemplate)}
          />
        </>
      ) : (
        <View style={styles.emptyHint}>
          <MaterialCommunityIcons name="basket-outline" size={17} color={COLORS.onSurfaceVariant} />
          <Text style={styles.emptyHintText}>
            Bạn vẫn có thể nhập thực đơn thủ công hoặc quay lại bước vật phẩm để nhận gợi ý món ăn phù hợp.
          </Text>
        </View>
      )}
      {draft.menuItems.map((item, index) => (
        <EditableMenuRow
          key={index}
          item={item}
          onChange={(next) => patchDraft({ menuItems: draft.menuItems.map((menu, itemIndex) => (itemIndex === index ? next : menu)) })}
          onRemove={() => patchDraft({ menuItems: draft.menuItems.filter((_, itemIndex) => itemIndex !== index) })}
        />
      ))}
      <Button
        mode="outlined"
        icon="plus"
        textColor={COLORS.primary}
        onPress={() => patchDraft({ menuItems: [...draft.menuItems, { name: '', type: 'lunch' }] })}
        compact
        style={styles.addBtn}
      >
        Thêm dòng món
      </Button>
    </FormCard>
  );
}

function MenuSummaryCard({
  summary,
}: {
  summary: ReturnType<typeof getCampaignMenuSummary>;
}) {
  const summaryText = summary.validCount
    ? `Thực đơn: ${summary.validCount} món / ${summary.plannedServings || 0} suất dự kiến`
    : 'Thực đơn: Chưa nhập, có thể bổ sung sau';

  return (
    <View style={[styles.menuSummaryCard, summary.isUnderExpected && styles.menuSummaryWarning]}>
      <View style={styles.menuSummaryHeader}>
        <MaterialCommunityIcons
          name={summary.isUnderExpected ? 'alert-circle-outline' : 'silverware-fork-knife'}
          size={18}
          color={summary.isUnderExpected ? COLORS.warning : COLORS.primary}
        />
        <Text style={styles.menuSummaryTitle}>{summaryText}</Text>
      </View>
      {summary.isUnderExpected ? (
        <Text style={styles.menuSummaryText}>
          Tổng suất món ăn đang thấp hơn mục tiêu {summary.expectedServings} suất của chiến dịch.
        </Text>
      ) : null}
    </View>
  );
}

function ScheduleStep({
  draft,
  patchDraft,
}: {
  draft: ReturnType<typeof useCampaignCreateDraftStore.getState>['draft'];
  patchDraft: ReturnType<typeof useCampaignCreateDraftStore.getState>['patchDraft'];
}) {
  const addTemplate = (template: CampaignScheduleDraft) => {
    if (draft.scheduleItems.some((item) => item.label === template.label && item.time === template.time)) return;
    patchDraft({ scheduleItems: [...draft.scheduleItems, template] });
  };

  return (
    <FormCard>
      <ScheduleTimelineOverview items={draft.scheduleItems} />
      <TemplateChips
        items={SCHEDULE_TEMPLATES}
        getLabel={(item) => `${item.time} ${item.label}`}
        onPick={addTemplate}
        onPickAll={() => SCHEDULE_TEMPLATES.forEach(addTemplate)}
      />
      {draft.scheduleItems.map((item, index) => (
        <EditableScheduleRow
          key={index}
          item={item}
          onChange={(next) => patchDraft({ scheduleItems: draft.scheduleItems.map((schedule, itemIndex) => (itemIndex === index ? next : schedule)) })}
          onRemove={() => patchDraft({ scheduleItems: draft.scheduleItems.filter((_, itemIndex) => itemIndex !== index) })}
        />
      ))}
      <Button
        mode="outlined"
        icon="plus"
        textColor={COLORS.primary}
        onPress={() => patchDraft({ scheduleItems: [...draft.scheduleItems, { time: toTimeStr(draft.startTime), label: '' }] })}
        compact
        style={styles.addBtn}
      >
        Thêm dòng mốc
      </Button>
    </FormCard>
  );
}

function ScheduleTimelineOverview({ items }: { items: CampaignScheduleDraft[] }) {
  const timelineItems = normalizeCampaignScheduleItems(items);

  return (
    <View style={styles.timelineCard}>
      <View style={styles.timelineHeader}>
        <MaterialCommunityIcons name="timeline-clock-outline" size={18} color={COLORS.primary} />
        <Text style={styles.timelineTitle}>Tổng quan lịch trình</Text>
      </View>
      {timelineItems.length ? (
        <View style={styles.timelineList}>
          {timelineItems.map((item, index) => {
            const stage = SCHEDULE_STAGE_META[classifyScheduleStage(item.label)];
            return (
              <View key={`${item.time}-${item.label}-${index}`} style={styles.timelineItem}>
                <View style={styles.timelineRail}>
                  <View style={[styles.timelineDot, { backgroundColor: stage.color }]} />
                  {index < timelineItems.length - 1 ? <View style={[styles.timelineLine, { backgroundColor: stage.bg }]} /> : null}
                </View>
                <View style={styles.timelineBody}>
                  <View style={styles.timelineItemHeader}>
                    <Text style={styles.timelineTime}>{item.time}</Text>
                    <View style={[styles.timelineStageBadge, { backgroundColor: stage.bg }]}>
                      <Text style={[styles.timelineStageText, { color: stage.color }]}>{stage.label}</Text>
                    </View>
                  </View>
                  <Text style={styles.timelineItemTitle}>{item.label}</Text>
                  <Text style={styles.timelineItemDesc}>{stage.description}</Text>
                </View>
              </View>
            );
          })}
        </View>
      ) : (
        <View style={styles.emptyHint}>
          <MaterialCommunityIcons name="timeline-plus-outline" size={17} color={COLORS.onSurfaceVariant} />
          <Text style={styles.emptyHintText}>Thêm mốc hoặc dùng mẫu để xem tổng quan vận hành.</Text>
        </View>
      )}
      <View style={styles.timelineLegend}>
        {(Object.keys(SCHEDULE_STAGE_META) as ScheduleStageId[]).map((stageId) => {
          const stage = SCHEDULE_STAGE_META[stageId];
          return (
            <View key={stageId} style={styles.timelineLegendItem}>
              <View style={[styles.timelineLegendDot, { backgroundColor: stage.color }]} />
              <Text style={styles.timelineLegendText}>{stage.label}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function SupplyStep({
  draft,
  patchDraft,
}: {
  draft: ReturnType<typeof useCampaignCreateDraftStore.getState>['draft'];
  patchDraft: ReturnType<typeof useCampaignCreateDraftStore.getState>['patchDraft'];
}) {
  const [selectedCategory, setSelectedCategory] = useState<SupplyCategoryId>('staple');
  const catalogItems = SUPPLY_CATALOG.filter((item) => item.category === selectedCategory);
  const addTemplate = (template: CampaignSupplyDraft) => {
    if (draft.supplyItems.some((item) => item.name.trim().toLowerCase() === template.name.trim().toLowerCase())) return;
    patchDraft({ supplyItems: [...draft.supplyItems, template] });
  };

  return (
    <FormCard>
      <View style={styles.infoBanner}>
        <MaterialCommunityIcons name="basket-check-outline" size={18} color={COLORS.primary} />
        <Text style={styles.infoBannerText}>
          Ưu tiên chọn vật phẩm từ danh mục chuẩn để nhà cung cấp hiểu đúng loại hỗ trợ. Vật phẩm khác vẫn phải chọn đơn vị chuẩn.
        </Text>
      </View>
      <Text style={styles.sectionLabel}>Nhóm vật phẩm</Text>
      <View style={styles.supplyCategoryWrap}>
        {(Object.keys(SUPPLY_CATEGORY_LABELS) as SupplyCategoryId[]).map((category) => {
          const active = selectedCategory === category;
          return (
            <Pressable
              key={category}
              onPress={() => setSelectedCategory(category)}
              style={[styles.supplyCategoryChip, active && styles.supplyCategoryChipActive]}
            >
              <Text style={[styles.supplyCategoryText, active && { color: COLORS.primary }]}>
                {SUPPLY_CATEGORY_LABELS[category]}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.supplyCatalogGrid}>
        {catalogItems.map((item) => {
          const selected = draft.supplyItems.some((supply) => supply.name.trim().toLowerCase() === item.name.toLowerCase());
          return (
            <Pressable
              key={item.name}
              disabled={selected}
              onPress={() => addTemplate({ name: item.name, quantity: item.quantity, unit: item.unit })}
              style={[styles.supplyCatalogCard, selected && styles.supplyCatalogCardSelected]}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.supplyCatalogTitle}>{item.name}</Text>
                <Text style={styles.supplyCatalogMeta}>{item.quantity} {item.unit} gợi ý</Text>
              </View>
              <MaterialCommunityIcons
                name={selected ? 'check-circle' : 'plus-circle-outline'}
                size={20}
                color={selected ? COLORS.primary : COLORS.onSurfaceVariant}
              />
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.sectionLabel}>Mẫu phổ biến</Text>
      <TemplateChips
        items={SUPPLY_TEMPLATES}
        getLabel={(item) => item.name}
        onPick={addTemplate}
        onPickAll={() => SUPPLY_TEMPLATES.forEach(addTemplate)}
      />
      {draft.supplyItems.map((item, index) => (
        <EditableSupplyRow
          key={index}
          item={item}
          onChange={(next) => patchDraft({ supplyItems: draft.supplyItems.map((supply, itemIndex) => (itemIndex === index ? next : supply)) })}
          onRemove={() => patchDraft({ supplyItems: draft.supplyItems.filter((_, itemIndex) => itemIndex !== index) })}
        />
      ))}
      <Button
        mode="outlined"
        icon="plus"
        textColor={COLORS.primary}
        onPress={() => patchDraft({ supplyItems: [...draft.supplyItems, { name: '', quantity: undefined, unit: 'kg' }] })}
        compact
        style={styles.addBtn}
      >
        Thêm vật phẩm khác
      </Button>
    </FormCard>
  );
}

function ReviewStep({
  draft,
  onEdit,
}: {
  draft: ReturnType<typeof useCampaignCreateDraftStore.getState>['draft'];
  onEdit: (step: number) => void;
}) {
  const dateText = `${fmtDate(draft.scheduledDate)}${draft.endDate ? ` - ${fmtDate(draft.endDate)}` : ''}`;
  const timeText = `${toTimeStr(draft.startTime)} - ${toTimeStr(draft.endTime)}`;
  const shifts = normalizeCampaignShifts(draft.shifts, draft);
  const menuItems = normalizeCampaignMenuItems(draft.menuItems);
  const scheduleItems = normalizeCampaignScheduleItems(draft.scheduleItems);
  const supplyItems = normalizeCampaignSupplyItems(draft.supplyItems);
  const slotWarnings = getSlotWarnings(draft, shifts);
  const menuSummary = getCampaignMenuSummary(draft);

  return (
    <View style={styles.reviewStack}>
      <ReviewGroup title="Tóm tắt chiến dịch" icon="clipboard-text-outline" onEdit={() => onEdit(0)}>
        <ReviewLine label="Tên" value={draft.title || 'Chưa nhập'} />
        <ReviewLine label="Mô tả" value={draft.description || 'Không có'} />
      </ReviewGroup>

      <ReviewGroup title="Ảnh chiến dịch" icon="image-outline" onEdit={() => onEdit(1)}>
        {draft.imageUrl ? (
          <View style={styles.reviewImageWrap}>
            <AppImage source={{ uri: draft.imageUrl }} style={styles.reviewImage} />
          </View>
        ) : (
          <ReviewLine label="Ảnh" value="Không có" />
        )}
      </ReviewGroup>

      <ReviewGroup title="Thời gian & địa điểm" icon="map-clock-outline" onEdit={() => onEdit(2)}>
        <ReviewLine label="Địa chỉ" value={draft.address?.address || 'Chưa chọn'} />
        <ReviewLine label="Ngày" value={dateText} />
        <ReviewLine label="Giờ" value={timeText} />
      </ReviewGroup>

      <ReviewGroup title="Mục tiêu phục vụ" icon="account-group-outline" onEdit={() => onEdit(3)}>
        <ReviewLine label="Suất dự kiến" value={`${toInt(draft.expectedServings)} suất`} />
        <ReviewLine label="Đầu bếp" value={`${toInt(draft.chefSlots)} người`} />
        <ReviewLine label="Phục vụ" value={`${toInt(draft.waiterSlots)} người`} />
        <ReviewLine label="Giao hàng" value={`${toInt(draft.shipperSlots)} người`} />
      </ReviewGroup>

      {slotWarnings.length > 0 ? (
        <View style={styles.reviewWarning}>
          <MaterialCommunityIcons name="alert-circle-outline" size={18} color={COLORS.warning} />
          <View style={{ flex: 1 }}>
            <Text style={styles.reviewWarningTitle}>Cần cân nhắc lại phân bổ ca</Text>
            {slotWarnings.map((warning) => (
              <Text key={warning} style={styles.reviewWarningText}>{warning}</Text>
            ))}
          </View>
        </View>
      ) : null}

      <ReviewListGroup title="Ca trực TNV" icon="calendar-account-outline" count={shifts.length} onEdit={() => onEdit(3)}>
        {shifts.map((item, index) => (
          <ReviewBullet
            key={`${item.label}-${index}`}
            title={item.label}
            meta={`${PERIOD_META[item.period].time} · ${ROLE_LABEL[item.role]} · ${item.slotsNeeded} người`}
          />
        ))}
      </ReviewListGroup>

      <ReviewListGroup title="Vật phẩm cần hỗ trợ" icon="basket-outline" count={supplyItems.length} onEdit={() => onEdit(4)}>
        {supplyItems.map((item, index) => (
          <ReviewBullet
            key={`${item.name}-${index}`}
            title={item.name}
            meta={`${item.quantity} ${item.unit}`}
          />
        ))}
      </ReviewListGroup>

      <ReviewListGroup
        title="Thực đơn dự kiến"
        icon="silverware-fork-knife"
        count={menuItems.length}
        onEdit={() => onEdit(5)}
        emptyText="Chưa nhập, có thể bổ sung sau"
      >
        <ReviewLine
          label="Tổng suất món"
          value={`${menuSummary.validCount} món / ${menuSummary.plannedServings || 0} suất dự kiến`}
        />
        {menuSummary.isUnderExpected ? (
          <View style={styles.reviewWarningInline}>
            <MaterialCommunityIcons name="alert-circle-outline" size={16} color={COLORS.warning} />
            <Text style={styles.reviewWarningText}>
              Tổng suất món ăn thấp hơn mục tiêu {menuSummary.expectedServings} suất.
            </Text>
          </View>
        ) : null}
        {menuItems.map((item, index) => (
          <ReviewBullet
            key={`${item.name}-${index}`}
            title={item.name}
            meta={`${MENU_TYPE_OPTIONS.find((option) => option.value === item.type)?.label ?? item.type}${item.plannedServings ? ` · ${item.plannedServings} suất` : ''}`}
          />
        ))}
      </ReviewListGroup>

      <ReviewListGroup title="Lịch trình" icon="timeline-clock-outline" count={scheduleItems.length} onEdit={() => onEdit(6)}>
        {scheduleItems.map((item, index) => (
          <ReviewBullet key={`${item.label}-${index}`} title={item.label} meta={item.time} />
        ))}
      </ReviewListGroup>

      <Text style={styles.note}>Sau khi gửi, chiến dịch sẽ ở trạng thái chờ duyệt cho đến khi quản trị viên phê duyệt.</Text>
    </View>
  );
}

function getSlotWarnings(
  draft: ReturnType<typeof useCampaignCreateDraftStore.getState>['draft'],
  shifts: ReturnType<typeof normalizeCampaignShifts>,
): string[] {
  if (shifts.length === 0) return [];

  const totals: Record<AssignmentRole, number> = { chef: 0, waiter: 0, shipper: 0 };
  let sharedSlots = 0;
  shifts.forEach((shift) => {
    if (shift.role) {
      totals[shift.role] += shift.slotsNeeded;
    } else {
      sharedSlots += shift.slotsNeeded;
    }
  });

  const targets: Record<AssignmentRole, number> = {
    chef: toInt(draft.chefSlots),
    waiter: toInt(draft.waiterSlots),
    shipper: toInt(draft.shipperSlots),
  };
  const warnings: string[] = [];
  (Object.keys(targets) as AssignmentRole[]).forEach((role) => {
    if (totals[role] !== targets[role]) {
      warnings.push(`${ROLE_LABEL[role]}: mục tiêu ${targets[role]} người, các ca riêng đang cần ${totals[role]} người.`);
    }
  });
  if (sharedSlots > 0) {
    warnings.push(`Ca chung chưa gắn vai trò đang cần ${sharedSlots} người, chưa được cộng vào từng vai trò.`);
  }
  return warnings;
}

function WizardProgress({ step }: { step: number }) {
  return (
    <View style={styles.progressWrap}>
      {CAMPAIGN_CREATE_STEPS.map((item, index) => (
        <View key={item.title} style={[styles.progressDot, index <= step && styles.progressDotActive]} />
      ))}
    </View>
  );
}

function FormCard({ children }: { children: React.ReactNode }) {
  return <View style={styles.formCard}>{children}</View>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

function PickerButton({ icon, text, onPress }: { icon: any; text: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.pickerBtn}>
      <MaterialCommunityIcons name={icon} size={20} color={COLORS.onSurfaceVariant} />
      <Text style={styles.pickerText} numberOfLines={1}>{text}</Text>
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

function EditableShiftRow({
  shift,
  index,
  onChange,
  onRemove,
}: {
  shift: CampaignShiftDraft;
  index: number;
  onChange: (shift: CampaignShiftDraft) => void;
  onRemove: () => void;
}) {
  return (
    <View style={styles.editRow}>
      <EditRowHeader icon="calendar-clock" title={`Ca trực ${index + 1}`} onRemove={onRemove} />
      <Field label="Tên ca">
        <TextInput
          mode="outlined"
          dense
          placeholder="VD: Ca sáng - Sơ chế"
          value={shift.label}
          onChangeText={(label) => onChange({ ...shift, label })}
          outlineColor={COLORS.outline}
          activeOutlineColor={COLORS.primary}
          style={styles.input}
          maxLength={100}
        />
      </Field>
      <Text style={styles.roleSelectorLabel}>Vai trò ca</Text>
      <View style={styles.roleSelector}>
        {ROLE_OPTIONS.map((option) => {
          const active = shift.role === option.value;
          return (
            <Pressable
              key={option.label}
              onPress={() => onChange({ ...shift, role: option.value })}
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
              text={shift.startTime}
              onPress={() =>
                DateTimePickerAndroid.open({
                  value: dateFromTime(shift.startTime),
                  mode: 'time',
                  is24Hour: true,
                  onChange: (_event, date) => date && onChange({ ...shift, startTime: toTimeStr(date) }),
                })
              }
            />
          </Field>
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Kết thúc">
            <PickerButton
              icon="clock-end"
              text={shift.endTime}
              onPress={() =>
                DateTimePickerAndroid.open({
                  value: dateFromTime(shift.endTime),
                  mode: 'time',
                  is24Hour: true,
                  onChange: (_event, date) => date && onChange({ ...shift, endTime: toTimeStr(date) }),
                })
              }
            />
          </Field>
        </View>
      </View>
      <Text style={styles.inlineQuantityLabel}>Số người cần</Text>
      <QuantityStepper value={String(shift.slotsNeeded)} onChange={(value) => onChange({ ...shift, slotsNeeded: toInt(value) })} min={0} max={100} />
    </View>
  );
}

function EditableMenuRow({
  item,
  onChange,
  onRemove,
}: {
  item: CampaignMenuDraft;
  onChange: (item: CampaignMenuDraft) => void;
  onRemove: () => void;
}) {
  return (
    <View style={styles.editRow}>
      <EditRowHeader icon="silverware-fork-knife" title="Món ăn" onRemove={onRemove} />
      <Field label="Tên món">
        <TextInput
          mode="outlined"
          dense
          placeholder="VD: Cơm thịt kho"
          value={item.name}
          onChangeText={(name) => onChange({ ...item, name })}
          outlineColor={COLORS.outline}
          activeOutlineColor={COLORS.primary}
          style={styles.input}
          maxLength={100}
        />
      </Field>
      <Text style={styles.roleSelectorLabel}>Bữa ăn</Text>
      <View style={styles.roleSelector}>
        {MENU_TYPE_OPTIONS.map((option) => {
          const active = item.type === option.value;
          return (
            <Pressable key={option.value} onPress={() => onChange({ ...item, type: option.value })} style={[styles.roleOption, active && styles.roleOptionActive]}>
              <Text style={[styles.roleOptionText, active && { color: COLORS.primary }]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.inlineQuantityLabel}>Số suất món</Text>
      <QuantityStepper value={String(item.plannedServings ?? 0)} onChange={(value) => onChange({ ...item, plannedServings: toInt(value) || undefined })} min={0} max={10000} step={10} />
    </View>
  );
}

function EditableScheduleRow({
  item,
  onChange,
  onRemove,
}: {
  item: CampaignScheduleDraft;
  onChange: (item: CampaignScheduleDraft) => void;
  onRemove: () => void;
}) {
  return (
    <View style={styles.editRow}>
      <EditRowHeader icon="timeline-clock-outline" title={item.time || 'Mốc mới'} onRemove={onRemove} />
      <Field label="Giờ">
        <PickerButton
          icon="clock-outline"
          text={item.time || 'Chọn giờ'}
          onPress={() =>
            DateTimePickerAndroid.open({
              value: dateFromTime(item.time || '06:00'),
              mode: 'time',
              is24Hour: true,
              onChange: (_event, date) => date && onChange({ ...item, time: toTimeStr(date) }),
            })
          }
        />
      </Field>
      <Field label="Nội dung">
        <TextInput
          mode="outlined"
          dense
          placeholder="VD: Nhận vật phẩm và kiểm tra số lượng"
          value={item.label}
          onChangeText={(label) => onChange({ ...item, label })}
          outlineColor={COLORS.outline}
          activeOutlineColor={COLORS.primary}
          style={styles.input}
          maxLength={160}
        />
      </Field>
    </View>
  );
}

function EditableSupplyRow({
  item,
  onChange,
  onRemove,
}: {
  item: CampaignSupplyDraft;
  onChange: (item: CampaignSupplyDraft) => void;
  onRemove: () => void;
}) {
  const catalogItem = findSupplyCatalogItem(item.name);

  return (
    <View style={styles.editRow}>
      <EditRowHeader icon="basket-outline" title={catalogItem ? catalogItem.name : 'Vật phẩm khác'} onRemove={onRemove} />
      {catalogItem ? (
        <View style={styles.supplyLockedName}>
          <View style={{ flex: 1 }}>
            <Text style={styles.supplyLockedLabel}>{SUPPLY_CATEGORY_LABELS[catalogItem.category]}</Text>
            <Text style={styles.supplyLockedTitle}>{catalogItem.name}</Text>
          </View>
          <MaterialCommunityIcons name="lock-check-outline" size={19} color={COLORS.primary} />
        </View>
      ) : (
        <Field label="Tên vật phẩm khác">
          <TextInput
            mode="outlined"
            dense
            placeholder="VD: Khăn giấy, nước uống..."
            value={item.name}
            onChangeText={(name) => onChange({ ...item, name })}
            outlineColor={COLORS.outline}
            activeOutlineColor={COLORS.primary}
            style={styles.input}
            maxLength={80}
          />
        </Field>
      )}
      <View style={styles.rowFields}>
        <View style={{ flex: 1 }}>
          <Text style={styles.inlineQuantityLabel}>Số lượng</Text>
          <QuantityStepper value={String(item.quantity ?? 0)} onChange={(value) => onChange({ ...item, quantity: toInt(value) || undefined })} min={0} max={1000} />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Đơn vị">
            <SupplyUnitPicker
              value={isAllowedSupplyUnit(item.unit) ? (item.unit as SupplyUnit) : 'kg'}
              onChange={(unit) => onChange({ ...item, unit })}
            />
          </Field>
        </View>
      </View>
    </View>
  );
}

function SupplyUnitPicker({ value, onChange }: { value: SupplyUnit; onChange: (unit: SupplyUnit) => void }) {
  return (
    <View style={styles.unitPicker}>
      {SUPPLY_UNIT_OPTIONS.map((unit) => {
        const active = value === unit;
        return (
          <Pressable key={unit} onPress={() => onChange(unit)} style={[styles.unitOption, active && styles.unitOptionActive]}>
            <Text style={[styles.unitOptionText, active && { color: COLORS.primary }]}>{unit}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function EditRowHeader({ icon, title, onRemove }: { icon: any; title: string; onRemove: () => void }) {
  return (
    <View style={styles.editRowHeader}>
      <View style={styles.editRowTitleWrap}>
        <MaterialCommunityIcons name={icon} size={18} color={COLORS.primary} />
        <Text style={styles.editRowTitle}>{title}</Text>
      </View>
      <Pressable onPress={onRemove} hitSlop={8} style={styles.removeRowBtn}>
        <MaterialCommunityIcons name="close" size={18} color={COLORS.error} />
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
      <Pressable onPress={() => setNext(current - step)} disabled={decreaseDisabled} style={[styles.quantityStepBtn, decreaseDisabled && styles.quantityStepBtnDisabled]} hitSlop={6}>
        <MaterialCommunityIcons name="minus" size={28} color={decreaseDisabled ? COLORS.outline : COLORS.onSurfaceVariant} />
      </Pressable>
      <Text style={styles.quantityStepValue}>{current}</Text>
      <Pressable onPress={() => setNext(current + step)} disabled={increaseDisabled} style={[styles.quantityStepBtn, increaseDisabled && styles.quantityStepBtnDisabled]} hitSlop={6}>
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

function ReviewGroup({
  title,
  icon,
  onEdit,
  children,
}: {
  title: string;
  icon: any;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.reviewGroup}>
      <View style={styles.reviewHeader}>
        <View style={styles.reviewTitleWrap}>
          <MaterialCommunityIcons name={icon} size={19} color={COLORS.primary} />
          <Text style={styles.reviewTitle}>{title}</Text>
        </View>
        <Button mode="text" compact icon="pencil" onPress={onEdit} textColor={COLORS.primary}>Sửa</Button>
      </View>
      {children}
    </View>
  );
}

function ReviewListGroup({
  title,
  icon,
  count,
  onEdit,
  children,
  emptyText = 'Chưa thêm',
}: {
  title: string;
  icon: any;
  count: number;
  onEdit: () => void;
  children: React.ReactNode;
  emptyText?: string;
}) {
  const hasItems = count > 0;
  return (
    <ReviewGroup title={title} icon={icon} onEdit={onEdit}>
      {hasItems ? children : <ReviewLine label="Nội dung" value={emptyText} />}
    </ReviewGroup>
  );
}

function ReviewLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.reviewLine}>
      <Text style={styles.reviewLabel}>{label}</Text>
      <Text style={styles.reviewValue}>{value}</Text>
    </View>
  );
}

function ReviewBullet({ title, meta }: { title: string; meta: string }) {
  return (
    <View style={styles.reviewBullet}>
      <MaterialCommunityIcons name="circle-small" size={20} color={COLORS.onSurfaceVariant} />
      <View style={{ flex: 1 }}>
        <Text style={styles.reviewBulletTitle}>{title}</Text>
        <Text style={styles.reviewBulletMeta}>{meta}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    height: 56,
    paddingHorizontal: 16,
    backgroundColor: COLORS.background,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: { flex: 1, textAlign: 'center', fontWeight: '900', color: COLORS.onSurface },
  headerCounter: { width: 36, textAlign: 'right', fontSize: 12, fontWeight: '900', color: COLORS.onSurfaceVariant },
  progressWrap: {
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: COLORS.background,
  },
  progressDot: {
    flex: 1,
    height: 4,
    borderRadius: 999,
    backgroundColor: COLORS.outline,
  },
  progressDotActive: { backgroundColor: COLORS.primary },
  content: { padding: 16, paddingTop: 8, paddingBottom: 28 },
  stepStack: { gap: 12 },
  stepHero: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: COLORS.primaryContainer,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.primary,
    padding: 16,
    marginBottom: 14,
  },
  stepIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepKicker: { fontSize: 11, fontWeight: '900', color: COLORS.primary, textTransform: 'uppercase' },
  stepTitle: { marginTop: 1, fontSize: 19, fontWeight: '900', color: COLORS.onSurface },
  stepHelper: { marginTop: 4, fontSize: 13, lineHeight: 19, color: COLORS.onSurface },
  formCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.outline,
    padding: 14,
  },
  scenarioHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 12,
  },
  scenarioHeaderIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: COLORS.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scenarioHint: { marginTop: -4, fontSize: 12, lineHeight: 18, color: COLORS.onSurfaceVariant },
  scenarioGrid: { gap: 9 },
  scenarioCard: {
    minHeight: 96,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: 1,
    borderColor: COLORS.outline,
    borderRadius: 14,
    backgroundColor: COLORS.background,
    padding: 12,
  },
  scenarioIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scenarioTitle: { fontSize: 14, fontWeight: '900', color: COLORS.onSurface },
  scenarioSubtitle: { marginTop: 3, fontSize: 12, lineHeight: 17, color: COLORS.onSurfaceVariant },
  scenarioMeta: { marginTop: 7, fontSize: 12, fontWeight: '800', color: COLORS.primary },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryContainer,
    padding: 12,
    marginBottom: 12,
  },
  infoBannerText: { flex: 1, fontSize: 12, lineHeight: 18, color: COLORS.onSurface },
  field: { marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '800', color: COLORS.onSurfaceVariant, marginBottom: 8 },
  sectionLabel: { fontSize: 15, fontWeight: '800', color: COLORS.onSurface, marginBottom: 10 },
  input: { backgroundColor: COLORS.surface },
  rowFields: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  pickerBtn: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 13,
    paddingHorizontal: 14,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.outline,
  },
  pickerText: { flex: 1, fontSize: 15, color: COLORS.onSurface },
  footer: { flexDirection: 'row', gap: 10 },
  footerButton: { flex: 1, borderRadius: 14 },
  footerPrimaryContent: { flexDirection: 'row-reverse' },
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
  imagePreview: {
    height: 190,
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
  slotLabel: { flex: 1, fontSize: 15, fontWeight: '800', color: COLORS.onSurfaceVariant },
  slotStepper: { width: 176, flexShrink: 0 },
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
  emptyHint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderRadius: 12,
    backgroundColor: COLORS.background,
    padding: 10,
    marginBottom: 12,
  },
  emptyHintText: { flex: 1, fontSize: 12, lineHeight: 18, color: COLORS.onSurfaceVariant },
  timelineCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.outline,
    backgroundColor: COLORS.surfaceVariant,
    padding: 12,
    marginBottom: 12,
  },
  timelineHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  timelineTitle: { flex: 1, fontSize: 14, fontWeight: '900', color: COLORS.onSurface },
  timelineList: { gap: 2 },
  timelineItem: { flexDirection: 'row', alignItems: 'stretch', gap: 10 },
  timelineRail: { width: 18, alignItems: 'center' },
  timelineDot: { width: 13, height: 13, borderRadius: 7, marginTop: 5 },
  timelineLine: { width: 3, flex: 1, minHeight: 44, marginTop: 4, borderRadius: 999 },
  timelineBody: {
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.outlineVariant,
    paddingBottom: 10,
    marginBottom: 6,
  },
  timelineItemHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  timelineTime: { fontSize: 13, fontWeight: '900', color: COLORS.onSurface },
  timelineStageBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  timelineStageText: { fontSize: 10, fontWeight: '900' },
  timelineItemTitle: { fontSize: 13, fontWeight: '800', lineHeight: 18, color: COLORS.onSurface },
  timelineItemDesc: { marginTop: 2, fontSize: 12, lineHeight: 16, color: COLORS.onSurfaceVariant },
  timelineLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  timelineLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  timelineLegendDot: { width: 8, height: 8, borderRadius: 4 },
  timelineLegendText: { fontSize: 10, fontWeight: '800', color: COLORS.onSurfaceVariant },
  supplyCategoryWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  supplyCategoryChip: {
    borderWidth: 1,
    borderColor: COLORS.outline,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: COLORS.background,
  },
  supplyCategoryChipActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryContainer },
  supplyCategoryText: { fontSize: 12, fontWeight: '800', color: COLORS.onSurfaceVariant },
  supplyCatalogGrid: { gap: 8, marginBottom: 12 },
  supplyCatalogCard: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: COLORS.outline,
    borderRadius: 14,
    backgroundColor: COLORS.background,
    padding: 11,
  },
  supplyCatalogCardSelected: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryContainer, opacity: 0.82 },
  supplyCatalogTitle: { fontSize: 14, fontWeight: '900', color: COLORS.onSurface },
  supplyCatalogMeta: { marginTop: 3, fontSize: 12, color: COLORS.onSurfaceVariant },
  supplyLockedName: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: COLORS.outline,
    borderRadius: 14,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 12,
  },
  supplyLockedLabel: { fontSize: 11, fontWeight: '800', color: COLORS.onSurfaceVariant },
  supplyLockedTitle: { marginTop: 2, fontSize: 14, fontWeight: '900', color: COLORS.onSurface },
  unitPicker: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  unitOption: {
    minWidth: 44,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.outline,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: COLORS.surface,
  },
  unitOptionActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryContainer },
  unitOptionText: { fontSize: 12, fontWeight: '900', color: COLORS.onSurfaceVariant },
  menuSummaryCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.outline,
    backgroundColor: COLORS.surfaceVariant,
    padding: 12,
    marginBottom: 12,
  },
  menuSummaryWarning: {
    borderColor: COLORS.warning,
    backgroundColor: COLORS.warningContainer,
  },
  menuSummaryHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  menuSummaryTitle: { flex: 1, fontSize: 13, fontWeight: '900', color: COLORS.onSurface },
  menuSummaryText: { marginTop: 6, fontSize: 12, lineHeight: 18, color: COLORS.onSurfaceVariant },
  editRow: {
    borderWidth: 1,
    borderColor: COLORS.outline,
    borderRadius: 14,
    backgroundColor: COLORS.background,
    padding: 12,
    marginBottom: 10,
  },
  editRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 10,
  },
  editRowTitleWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7 },
  editRowTitle: { fontSize: 14, fontWeight: '900', color: COLORS.onSurface },
  removeRowBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.errorContainer,
  },
  roleSelectorLabel: { fontSize: 13, fontWeight: '800', color: COLORS.onSurfaceVariant, marginBottom: 7 },
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
  inlineQuantityLabel: { fontSize: 13, fontWeight: '800', color: COLORS.onSurfaceVariant, marginBottom: 7 },
  addBtn: { alignSelf: 'stretch', marginTop: 4, borderColor: COLORS.outline, borderRadius: 12 },
  reviewStack: { gap: 12 },
  reviewGroup: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.outline,
    padding: 14,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 8,
  },
  reviewTitleWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  reviewTitle: { fontSize: 15, fontWeight: '900', color: COLORS.onSurface },
  reviewLine: {
    paddingVertical: 7,
    borderTopWidth: 1,
    borderTopColor: COLORS.outlineVariant,
  },
  reviewLabel: { fontSize: 12, fontWeight: '800', color: COLORS.onSurfaceVariant, marginBottom: 2 },
  reviewValue: { fontSize: 14, lineHeight: 20, color: COLORS.onSurface },
  reviewImageWrap: {
    height: 148,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.outline,
  },
  reviewImage: { width: '100%', height: '100%' },
  reviewBullet: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.outlineVariant,
  },
  reviewBulletTitle: { fontSize: 14, fontWeight: '800', color: COLORS.onSurface },
  reviewBulletMeta: { marginTop: 2, fontSize: 12, color: COLORS.onSurfaceVariant },
  reviewWarning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.warning,
    backgroundColor: COLORS.warningContainer,
  },
  reviewWarningTitle: { fontSize: 13, fontWeight: '900', color: COLORS.onSurface, marginBottom: 3 },
  reviewWarningText: { fontSize: 12, lineHeight: 18, color: COLORS.onSurfaceVariant },
  reviewWarningInline: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    borderRadius: 12,
    backgroundColor: COLORS.warningContainer,
    padding: 10,
    marginBottom: 8,
  },
  note: { fontSize: 12, color: COLORS.onSurfaceVariant, textAlign: 'center', marginTop: 4, fontStyle: 'italic' },
  stepErrorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 12,
    marginHorizontal: 4,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.error,
    backgroundColor: COLORS.errorContainer,
  },
  stepErrorText: { flex: 1, fontSize: 13, lineHeight: 19, color: COLORS.error, fontWeight: '600' },
});
