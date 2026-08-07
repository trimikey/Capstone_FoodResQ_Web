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
  getCampaignStepError,
  hasCampaignDraftData,
  normalizeCampaignMenuItems,
  normalizeCampaignScheduleItems,
  normalizeCampaignShifts,
  normalizeCampaignSupplyItems,
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
  { time: '06:00', label: 'Tập trung tại bếp, phân công nhiệm vụ' },
  { time: '06:30', label: 'Kiểm tra nguyên liệu, dụng cụ và thiết bị bếp' },
  { time: '08:00', label: 'Bắt đầu nấu các món chính' },
  { time: '10:30', label: 'Đóng gói suất, dán nhãn' },
  { time: '12:00', label: 'Bắt đầu phát suất cho người nhận' },
  { time: '13:30', label: 'Kết thúc phát suất, dọn dẹp khu vực' },
];

const SUPPLY_TEMPLATES: CampaignSupplyDraft[] = [
  { name: 'Gạo sạch', quantity: 10, unit: 'kg' },
  { name: 'Rau củ các loại', quantity: 5, unit: 'kg' },
  { name: 'Trứng gà', quantity: 30, unit: 'quả' },
  { name: 'Hộp đựng suất ăn', quantity: 100, unit: 'hộp' },
  { name: 'Găng tay nilon', quantity: 2, unit: 'hộp' },
  { name: 'Thùng giữ nhiệt', quantity: 3, unit: 'thùng' },
];

export default function CreateCampaignScreen() {
  const createCampaign = useCreateCampaign();
  const uploadCampaignImage = useUploadCampaignImage();
  const { data: profile } = useMyProfile();
  const [coords, setCoords] = useState<Coords | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
      if (currentStep === 0) {
        confirmLeave();
      } else {
        setStep(currentStep - 1);
      }
      return true;
    });

    return () => subscription.remove();
  }, [confirmLeave, currentStep, setStep]);

  const goBackStep = () => {
    if (currentStep === 0) {
      confirmLeave();
      return;
    }
    setStep(currentStep - 1);
  };

  const goNextStep = () => {
    if (stepError) {
      showValidationError(stepError);
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
        return <BasicStep draft={draft} patchDraft={patchDraft} />;
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
      case 3:
        return <GoalStep draft={draft} patchDraft={patchDraft} />;
      case 4:
        return <ShiftStep draft={draft} patchDraft={patchDraft} />;
      case 5:
        return <MenuStep draft={draft} patchDraft={patchDraft} />;
      case 6:
        return <ScheduleStep draft={draft} patchDraft={patchDraft} />;
      case 7:
        return <SupplyStep draft={draft} patchDraft={patchDraft} />;
      default:
        return <ReviewStep draft={draft} onEdit={setStep} />;
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
            {currentStep === 0 ? 'Hủy' : 'Quay lại'}
          </Button>
          <Button
            mode="contained"
            icon={isReviewStep ? 'send' : 'arrow-right'}
            onPress={isReviewStep ? submitCampaign : goNextStep}
            loading={submitting}
            disabled={submitting}
            buttonColor={COLORS.primary}
            style={styles.footerButton}
            contentStyle={styles.footerPrimaryContent}
          >
            {isReviewStep ? 'Gửi yêu cầu' : 'Tiếp tục'}
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
      return 'Đặt số suất và số người cần tuyển cho từng vai trò.';
    case 4:
      return 'Tạo các ca để TNV đăng ký đúng vai trò và khung giờ.';
    case 5:
      return 'Thêm món hoặc nhóm món dự kiến để bếp chuẩn bị trước.';
    case 6:
      return 'Ghi các mốc vận hành như nhận nguyên liệu, nấu, đóng gói, phát suất.';
    case 7:
      return 'Nhập rõ tên, số lượng và đơn vị để nhà cung cấp biết cần hỗ trợ gì.';
    default:
      return 'Rà lại toàn bộ thông tin trước khi gửi yêu cầu chờ admin duyệt.';
  }
}

function BasicStep({
  draft,
  patchDraft,
}: {
  draft: ReturnType<typeof useCampaignCreateDraftStore.getState>['draft'];
  patchDraft: ReturnType<typeof useCampaignCreateDraftStore.getState>['patchDraft'];
}) {
  return (
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

      <View style={styles.rowFields}>
        <View style={{ flex: 1 }}>
          <Field label="Giờ bắt đầu *">
            <PickerButton
              icon="clock-outline"
              text={toTimeStr(draft.startTime)}
              onPress={() =>
                DateTimePickerAndroid.open({
                  value: draft.startTime,
                  mode: 'time',
                  is24Hour: true,
                  onChange: (_event, date) => date && patchDraft({ startTime: date }),
                })
              }
            />
          </Field>
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Giờ kết thúc *">
            <PickerButton
              icon="clock-outline"
              text={toTimeStr(draft.endTime)}
              onPress={() =>
                DateTimePickerAndroid.open({
                  value: draft.endTime,
                  mode: 'time',
                  is24Hour: true,
                  onChange: (_event, date) => date && patchDraft({ endTime: date }),
                })
              }
            />
          </Field>
        </View>
      </View>
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
  return (
    <FormCard>
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
        onPress={() => patchDraft({ scheduleItems: [...draft.scheduleItems, { time: '06:00', label: '' }] })}
        compact
        style={styles.addBtn}
      >
        Thêm dòng mốc
      </Button>
    </FormCard>
  );
}

function SupplyStep({
  draft,
  patchDraft,
}: {
  draft: ReturnType<typeof useCampaignCreateDraftStore.getState>['draft'];
  patchDraft: ReturnType<typeof useCampaignCreateDraftStore.getState>['patchDraft'];
}) {
  const addTemplate = (template: CampaignSupplyDraft) => {
    if (draft.supplyItems.some((item) => item.name === template.name)) return;
    patchDraft({ supplyItems: [...draft.supplyItems, template] });
  };

  return (
    <FormCard>
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
        onPress={() => patchDraft({ supplyItems: [...draft.supplyItems, { name: '', quantity: undefined, unit: '' }] })}
        compact
        style={styles.addBtn}
      >
        Thêm dòng vật phẩm
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
  const shifts = normalizeCampaignShifts(draft.shifts);
  const menuItems = normalizeCampaignMenuItems(draft.menuItems);
  const scheduleItems = normalizeCampaignScheduleItems(draft.scheduleItems);
  const supplyItems = normalizeCampaignSupplyItems(draft.supplyItems);
  const slotWarnings = getSlotWarnings(draft, shifts);

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

      <ReviewListGroup title="Ca trực TNV" icon="calendar-account-outline" count={shifts.length} onEdit={() => onEdit(4)}>
        {shifts.map((item, index) => (
          <ReviewBullet
            key={`${item.label}-${index}`}
            title={item.label}
            meta={`${item.startTime}-${item.endTime} · ${item.role ? ROLE_LABEL[item.role] : 'Mọi vai trò'} · ${item.slotsNeeded} người`}
          />
        ))}
      </ReviewListGroup>

      <ReviewListGroup title="Thực đơn" icon="silverware-fork-knife" count={menuItems.length} onEdit={() => onEdit(5)}>
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

      <ReviewListGroup title="Vật phẩm cần hỗ trợ" icon="basket-outline" count={supplyItems.length} onEdit={() => onEdit(7)}>
        {supplyItems.map((item, index) => (
          <ReviewBullet
            key={`${item.name}-${index}`}
            title={item.name}
            meta={`${item.quantity} ${item.unit}`}
          />
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
      <View style={styles.rowFields}>
        <View style={{ flex: 1 }}>
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
        </View>
        <View style={{ flex: 2 }}>
          <Field label="Nội dung">
            <TextInput
              mode="outlined"
              dense
              placeholder="VD: Chuẩn bị nguyên liệu"
              value={item.label}
              onChangeText={(label) => onChange({ ...item, label })}
              outlineColor={COLORS.outline}
              activeOutlineColor={COLORS.primary}
              style={styles.input}
              maxLength={160}
            />
          </Field>
        </View>
      </View>
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
  return (
    <View style={styles.editRow}>
      <EditRowHeader icon="basket-outline" title="Vật phẩm" onRemove={onRemove} />
      <Field label="Tên vật phẩm">
        <TextInput
          mode="outlined"
          dense
          placeholder="VD: Gạo sạch"
          value={item.name}
          onChangeText={(name) => onChange({ ...item, name })}
          outlineColor={COLORS.outline}
          activeOutlineColor={COLORS.primary}
          style={styles.input}
          maxLength={80}
        />
      </Field>
      <View style={styles.rowFields}>
        <View style={{ flex: 1 }}>
          <Text style={styles.inlineQuantityLabel}>Số lượng</Text>
          <QuantityStepper value={String(item.quantity ?? 0)} onChange={(value) => onChange({ ...item, quantity: toInt(value) || undefined })} min={0} max={1000} />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Đơn vị">
            <TextInput
              mode="outlined"
              dense
              placeholder="kg"
              value={item.unit ?? ''}
              onChangeText={(unit) => onChange({ ...item, unit })}
              outlineColor={COLORS.outline}
              activeOutlineColor={COLORS.primary}
              style={styles.input}
              maxLength={20}
            />
          </Field>
        </View>
      </View>
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
}: {
  title: string;
  icon: any;
  count: number;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  const hasItems = count > 0;
  return (
    <ReviewGroup title={title} icon={icon} onEdit={onEdit}>
      {hasItems ? children : <ReviewLine label="Nội dung" value="Chưa thêm" />}
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
  note: { fontSize: 12, color: COLORS.onSurfaceVariant, textAlign: 'center', marginTop: 4, fontStyle: 'italic' },
});
