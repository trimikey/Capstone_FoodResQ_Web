import { useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Button, TextInput } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import {
  usePublicCampaignDetail,
  useMyTasks,
  useApplyCampaign,
  useAddExperience,
  useUploadExperienceImage,
  type AssignmentRole,
} from '@/hooks/useCampaigns';
import { useShifts, useMenuItems, useApplyShift, type CampaignShift } from '@/hooks/useKitchenOps';
import { useMyProfile } from '@/hooks/useProfile';
import { captureImage, pickImageFromLibrary, type CapturedImage } from '@/services/faceCapture';
import { VolunteerKitchenOpsPanel } from '@/components/kitchen/VolunteerKitchenOpsPanel';
import { AppImage } from '@/components/ui/AppImage';
import {
  statusMeta,
  formatDate,
  formatTime,
  slotProgress,
  canApplyCampaign,
  ASSIGNMENT_ROLE_LABEL,
} from '@/utils/campaign';
import { formatMenuItem, formatSupplyItem } from '@/utils/campaignFormat';
import { getErrorMessage } from '@/hooks/useErrorHandler';
import { Popup } from '@/components/ui/AppPopup';
import { ScreenState } from '@/components/ui/ScreenState';
import { mobileColors as COLORS } from '@/theme/design';

const ASSIGNMENT_ROLES: AssignmentRole[] = ['chef', 'waiter', 'shipper'];

function InfoRow({ icon, children }: { icon: any; children: React.ReactNode }) {
  return (
    <View style={styles.infoRow}>
      <MaterialCommunityIcons name={icon} size={18} color={COLORS.primary} />
      <Text style={styles.infoText}>{children}</Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

/**
 * Chi tiết chiến dịch (Volunteer) — xem thông tin + đăng ký vai trò.
 * Mỗi vai trò chỉ đăng ký được khi: chiến dịch đang tuyển/diễn ra, TNV có đúng
 * chuyên môn, slot chưa đầy và chưa đăng ký vai trò đó.
 */
export default function VolunteerCampaignDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: c, isLoading, isError, refetch } = usePublicCampaignDetail(id);
  const { data: profile } = useMyProfile(true);
  const { data: myTasks } = useMyTasks(true);
  const { data: shifts = [] } = useShifts(id);
  const { data: kitchenMenu = [] } = useMenuItems(id);
  const applyMut = useApplyCampaign();
  const applyShiftMut = useApplyShift();
  const addExperienceMut = useAddExperience();
  const uploadExperienceImageMut = useUploadExperienceImage();
  const [experienceText, setExperienceText] = useState('');
  const [rating, setRating] = useState('5');
  const [experienceImageUrls, setExperienceImageUrls] = useState<string[]>([]);

  const Header = (
    <View style={styles.header}>
      <Pressable onPress={() => router.back()} hitSlop={8}>
        <MaterialCommunityIcons name="arrow-left" size={24} color={COLORS.onSurface} />
      </Pressable>
      <Text variant="titleMedium" style={styles.headerTitle}>Chi tiết chiến dịch</Text>
      <View style={{ width: 24 }} />
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {Header}
        <ScreenState kind="loading" title="Đang tải chiến dịch" />
      </SafeAreaView>
    );
  }

  if (isError || !c) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {Header}
        <ScreenState kind="error" title="Không tải được chiến dịch" actionLabel="Thử lại" onAction={() => refetch()} />
      </SafeAreaView>
    );
  }

  const sm = statusMeta(c.status);
  const slots = slotProgress(c);
  const open = canApplyCampaign(c.status);
  const completed = c.status === 'completed';
  // Chuyên môn TNV đang đăng nhập (chef/waiter/shipper).
  const mySpecs = new Set((profile?.volunteer?.specializations ?? []).map((s) => s.specialization));
  const verifiedSpecs = new Set(
    (profile?.volunteer?.specializations ?? []).filter((s) => s.isVerified).map((s) => s.specialization)
  );
  // Vai trò TNV đã đăng ký ở chính chiến dịch này.
  const appliedRoles = new Set((myTasks ?? []).filter((t) => t.campaign.id === c.id).map((t) => t.role));

  const pickShiftRole = (shift: CampaignShift): AssignmentRole | undefined => {
    if (shift.role) return shift.role;
    return ASSIGNMENT_ROLES.find((role) => mySpecs.has(role) && !appliedRoles.has(role));
  };

  const handleApply = async (role: AssignmentRole) => {
    try {
      await applyMut.mutateAsync({ campaignId: c.id, role });
      Popup.show({ type: 'success', text1: `Đã đăng ký ${ASSIGNMENT_ROLE_LABEL[role]}`, text2: 'Xem ở "Việc của tôi".' });
    } catch (err) {
      Popup.show({ type: 'error', text1: 'Đăng ký thất bại', text2: getErrorMessage(err) });
    }
  };

  const handleApplyShift = async (shift: CampaignShift) => {
    const roleToSend = pickShiftRole(shift);
    if (!roleToSend) {
      Popup.show({ type: 'warning', text1: 'Chưa có vai trò phù hợp', text2: 'Cập nhật chuyên môn hoặc chọn ca theo vai trò khác.' });
      return;
    }
    try {
      await applyShiftMut.mutateAsync({ campaignId: c.id, shiftId: shift.id, role: roleToSend });
      Popup.show({ type: 'success', text1: 'Đã đăng ký ca', text2: shift.label });
    } catch (err) {
      Popup.show({ type: 'error', text1: 'Đăng ký ca thất bại', text2: getErrorMessage(err) });
    }
  };

  const handleAddExperience = async () => {
    const content = experienceText.trim();
    const ratingValue = parseInt(rating, 10);
    if (content.length < 10) {
      Popup.show({ type: 'warning', text1: 'Cảm nhận quá ngắn', text2: 'Vui lòng nhập ít nhất 10 ký tự.' });
      return;
    }
    try {
      await addExperienceMut.mutateAsync({
        id: c.id,
        content,
        rating: Number.isFinite(ratingValue) ? Math.min(Math.max(ratingValue, 1), 5) : undefined,
        imageUrls: experienceImageUrls,
      });
      setExperienceText('');
      setExperienceImageUrls([]);
      Popup.show({ type: 'success', text1: 'Đã gửi cảm nhận' });
    } catch (err) {
      Popup.show({ type: 'error', text1: 'Gửi cảm nhận thất bại', text2: getErrorMessage(err) });
    }
  };

  const uploadExperiencePhoto = async (photo: CapturedImage | null) => {
    if (!photo) return;
    try {
      const res = await uploadExperienceImageMut.mutateAsync(photo);
      setExperienceImageUrls((prev) => [...prev, res.url].slice(0, 5));
      Popup.show({ type: 'success', text1: 'Đã tải ảnh cảm nhận' });
    } catch (err) {
      Popup.show({ type: 'error', text1: 'Tải ảnh thất bại', text2: getErrorMessage(err) });
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {Header}
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{c.title}</Text>
          <View style={[styles.badge, { backgroundColor: sm.bg }]}>
            <Text style={[styles.badgeText, { color: sm.color }]}>{sm.label}</Text>
          </View>
        </View>

        {c.description ? <Text style={styles.description}>{c.description}</Text> : null}

        <View style={styles.card}>
          <InfoRow icon="account-group-outline">{c.organizationName ?? 'Tổ chức từ thiện'}</InfoRow>
          <InfoRow icon="calendar-clock">
            {formatDate(c.scheduledDate)} - {formatTime(c.startTime)}-{formatTime(c.endTime)}
          </InfoRow>
          <InfoRow icon="map-marker-outline">{c.kitchenAddress}</InfoRow>
          {c.expectedServings ? (
            <InfoRow icon="food-outline">Dự kiến phục vụ {c.expectedServings} suất</InfoRow>
          ) : null}
          {completed ? (
            <>
              <InfoRow icon="silverware-fork-knife">Đã nấu {c.actualServings ?? c.distributionSummary.servingsServed} suất</InfoRow>
              <InfoRow icon="account-heart-outline">Đã phục vụ {c.distributionSummary.peopleServed} người</InfoRow>
            </>
          ) : null}
        </View>

        {/* Đăng ký vai trò */}
        {!completed && slots.length > 0 ? (
          <Section title="Đăng ký vai trò tình nguyện">
            {!open ? (
              <Text style={styles.muted}>Chiến dịch hiện không nhận đăng ký.</Text>
            ) : null}
            {slots.map((s) => {
              const full = s.filled >= s.needed;
              const hasSpec = mySpecs.has(s.role);
              const applied = appliedRoles.has(s.role);
              const disabled = !open || full || !hasSpec || applied || applyMut.isPending;
              // Lý do không đăng ký được (ưu tiên rõ ràng cho TNV).
              const reason = applied
                ? 'Đã đăng ký'
                : !hasSpec
                  ? 'Chưa có chuyên môn này'
                  : full
                    ? 'Đã đủ người'
                    : null;
              return (
                <View key={s.role} style={styles.roleRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.roleLabel}>{s.label}</Text>
                    <Text style={[styles.roleCount, full && { color: COLORS.primary }]}>
                      {s.filled}/{s.needed} {full ? '- Đủ' : 'đã đăng ký'}
                    </Text>
                  </View>
                  {applied ? (
                    <View style={styles.appliedPill}>
                      <MaterialCommunityIcons name="check-circle" size={16} color={COLORS.primary} />
                      <Text style={styles.appliedPillText}>Đã đăng ký</Text>
                    </View>
                  ) : (
                    <Button
                      mode="contained"
                      compact
                      buttonColor={COLORS.primary}
                      disabled={disabled}
                      loading={applyMut.isPending && applyMut.variables?.role === s.role}
                      onPress={() => handleApply(s.role)}
                    >
                      {reason ?? 'Đăng ký'}
                    </Button>
                  )}
                </View>
              );
            })}
            {open && slots.some((s) => mySpecs.has(s.role)) ? null : open ? (
              <Text style={styles.hint}>
                Bạn chưa có chuyên môn phù hợp với chiến dịch này. Cập nhật chuyên môn ở mục Hồ sơ.
              </Text>
            ) : null}
          </Section>
        ) : !completed ? (
          <Section title="Đăng ký vai trò tình nguyện">
            <Text style={styles.muted}>Chiến dịch này không cần tuyển tình nguyện viên.</Text>
          </Section>
        ) : null}

        {/* Ca làm việc (kitchen-ops) — đăng ký theo ca */}
        {shifts.length > 0 ? (
          <Section title="Ca làm việc">
            {shifts.map((s) => {
              const full = s.slotsFilled >= s.slotsNeeded;
              const roleToSend = pickShiftRole(s);
              const alreadyApplied = s.role ? appliedRoles.has(s.role) : !roleToSend && mySpecs.size > 0;
              const eligible = !!roleToSend && (!s.role || mySpecs.has(s.role));
              const disabled = !open || full || !eligible || applyShiftMut.isPending;
              const reason = full ? 'Đã đủ' : alreadyApplied ? 'Đã đăng ký' : !eligible ? 'Không hợp chuyên môn' : null;
              return (
                <View key={s.id} style={styles.shiftRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.shiftLabel}>{s.label}</Text>
                    <Text style={styles.shiftMeta}>
                      {s.startTime}-{s.endTime}
                      {s.role ? ` - ${ASSIGNMENT_ROLE_LABEL[s.role] ?? s.role}` : ' - Chung'} - {s.slotsFilled}/{s.slotsNeeded}
                    </Text>
                  </View>
                  <Button
                    mode="contained" compact buttonColor={COLORS.primary} disabled={disabled}
                    loading={applyShiftMut.isPending && applyShiftMut.variables?.shiftId === s.id}
                    onPress={() => handleApplyShift(s)}
                  >
                    {reason ?? 'Đăng ký'}
                  </Button>
                </View>
              );
            })}
          </Section>
        ) : null}

        {kitchenMenu.length > 0 ? (
          <Section title="Thực đơn cập nhật">
            {kitchenMenu.map((m) => (
              <View key={m.id} style={styles.bulletRow}>
                <MaterialCommunityIcons name="silverware-fork-knife" size={15} color={COLORS.onSurfaceVariant} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.bulletText}>{m.recipe?.name ?? m.customName ?? 'Món'}</Text>
                  {m.plannedServings ? <Text style={styles.muted}>Dự kiến {m.plannedServings} suất</Text> : null}
                </View>
              </View>
            ))}
          </Section>
        ) : null}

        {c.menuItems && c.menuItems.length > 0 ? (
          <Section title={kitchenMenu.length > 0 ? 'Thực đơn dự kiến (lúc tạo)' : 'Thực đơn'}>
            {c.menuItems.map((m, i) => (
              <View key={i} style={styles.bulletRow}>
                <MaterialCommunityIcons name="silverware-fork-knife" size={15} color={COLORS.onSurfaceVariant} />
                <Text style={styles.bulletText}>{formatMenuItem(m)}</Text>
              </View>
            ))}
          </Section>
        ) : null}

        {c.scheduleItems && c.scheduleItems.length > 0 ? (
          <Section title="Lịch trình">
            {c.scheduleItems.map((s, i) => (
              <View key={i} style={styles.bulletRow}>
                <Text style={styles.scheduleTime}>{formatTime(s.time)}</Text>
                <Text style={styles.bulletText}>{s.label}</Text>
              </View>
            ))}
          </Section>
        ) : null}

        {c.supplyItems && c.supplyItems.length > 0 ? (
          <Section title="Vật phẩm cần hỗ trợ">
            <View style={styles.tagRow}>
              {c.supplyItems.map((s, i) => (
                <View key={i} style={styles.tag}><Text style={styles.tagText}>{formatSupplyItem(s)}</Text></View>
              ))}
            </View>
          </Section>
        ) : null}

        {c.participants.length > 0 ? (
          <Section title={`Người đã chung tay (${c.participants.length})`}>
            {c.participants.slice(0, 8).map((p) => (
              <View key={p.id} style={styles.participantRow}>
                <MaterialCommunityIcons name="account-circle-outline" size={18} color={COLORS.primary} />
                <Text style={styles.participantName}>{p.fullName}</Text>
                <Text style={styles.participantRole}>{ASSIGNMENT_ROLE_LABEL[p.role] ?? p.role}</Text>
              </View>
            ))}
          </Section>
        ) : null}

        {completed ? (
          <Section title="Kết quả chiến dịch">
            <View style={styles.resultGrid}>
              <ResultCell value={String(c.actualServings ?? c.distributionSummary.servingsServed)} label="suất đã nấu" />
              <ResultCell value={String(c.distributionSummary.peopleServed)} label="người phục vụ" />
              <ResultCell value={String(c.participants.length)} label="TNV tham gia" />
            </View>
            {c.distributions.length > 0 ? (
              <View style={{ marginTop: 12 }}>
                {c.distributions.map((d) => (
                  <View key={d.id} style={styles.distributionRow}>
                    <MaterialCommunityIcons name="hand-heart-outline" size={18} color={COLORS.primary} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.distributionTitle}>{d.roundLabel ?? 'Đợt phát suất ăn'}</Text>
                      <Text style={styles.muted}>{d.peopleServed} người - {d.servingsServed} suất</Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}
          </Section>
        ) : null}

        {completed ? (
          <Section title="Cảm nhận tình nguyện viên">
            {c.experiences.length === 0 ? (
              <Text style={styles.muted}>Chưa có cảm nhận nào.</Text>
            ) : (
              c.experiences.map((e) => (
                <View key={e.id} style={styles.experienceCard}>
                  <Text style={styles.experienceName}>{e.fullName}{e.rating ? ` - ${e.rating}/5` : ''}</Text>
                  <Text style={styles.experienceContent}>{e.content}</Text>
                </View>
              ))
            )}
            <TextInput
              mode="outlined"
              label="Cảm nhận của bạn"
              value={experienceText}
              onChangeText={setExperienceText}
              multiline
              numberOfLines={3}
              outlineColor={COLORS.outline}
              activeOutlineColor={COLORS.primary}
              style={styles.experienceInput}
            />
            <TextInput
              mode="outlined"
              label="Đánh giá (1-5)"
              value={rating}
              onChangeText={setRating}
              keyboardType="numeric"
              outlineColor={COLORS.outline}
              activeOutlineColor={COLORS.primary}
              style={styles.experienceInput}
            />
            {experienceImageUrls.length > 0 ? (
              <View style={styles.experienceImages}>
                {experienceImageUrls.map((url) => (
                  <View key={url} style={styles.experienceImageWrap}>
                    <AppImage source={{ uri: url }} style={styles.experienceImage} />
                    <Pressable
                      onPress={() => setExperienceImageUrls((prev) => prev.filter((item) => item !== url))}
                      style={styles.removeImageBtn}
                      hitSlop={8}
                    >
                      <MaterialCommunityIcons name="close" size={14} color="#fff" />
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}
            <View style={styles.photoActions}>
              <Button
                mode="outlined"
                icon="image-plus"
                textColor={COLORS.primary}
                disabled={uploadExperienceImageMut.isPending || experienceImageUrls.length >= 5}
                loading={uploadExperienceImageMut.isPending}
                onPress={() => pickImageFromLibrary('proof').then(uploadExperiencePhoto)}
                style={styles.photoButton}
              >
                Chọn ảnh
              </Button>
              <Button
                mode="outlined"
                icon="camera"
                textColor={COLORS.primary}
                disabled={uploadExperienceImageMut.isPending || experienceImageUrls.length >= 5}
                loading={uploadExperienceImageMut.isPending}
                onPress={() => captureImage('id_card', 'proof').then(uploadExperiencePhoto)}
                style={styles.photoButton}
              >
                Chụp ảnh
              </Button>
            </View>
            <Button
              mode="contained"
              buttonColor={COLORS.primary}
              onPress={handleAddExperience}
              loading={addExperienceMut.isPending}
              disabled={addExperienceMut.isPending}
            >
              Gửi cảm nhận
            </Button>
          </Section>
        ) : null}

        <VolunteerKitchenOpsPanel
          campaignId={c.id}
          isChef={verifiedSpecs.has('chef')}
          isWaiter={verifiedSpecs.has('waiter')}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function ResultCell({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.resultCell}>
      <Text style={styles.resultValue}>{value}</Text>
      <Text style={styles.resultLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    height: 56, paddingHorizontal: 20, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'space-between',
  },
  headerTitle: { fontWeight: '700', color: COLORS.onSurface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  title: { flex: 1, fontSize: 20, fontWeight: '700', color: COLORS.onSurface, lineHeight: 27 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, marginTop: 2 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  description: { fontSize: 14, color: COLORS.onSurfaceVariant, lineHeight: 21, marginBottom: 14 },
  card: {
    backgroundColor: COLORS.surface, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: COLORS.outline, gap: 10,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  infoText: { flex: 1, fontSize: 14, color: COLORS.onSurface },
  section: { marginTop: 20 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: COLORS.onSurface, marginBottom: 10 },
  roleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: COLORS.outline,
  },
  roleLabel: { fontSize: 14, fontWeight: '600', color: COLORS.onSurface },
  roleCount: { fontSize: 13, color: COLORS.onSurfaceVariant, marginTop: 2 },
  appliedPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.primaryContainer, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  appliedPillText: { fontSize: 13, fontWeight: '600', color: COLORS.primary },
  hint: { fontSize: 13, color: COLORS.onSurfaceVariant, fontStyle: 'italic', marginTop: 10, lineHeight: 19 },
  muted: { fontSize: 13, color: COLORS.onSurfaceVariant, lineHeight: 19 },
  shiftRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: COLORS.outline,
  },
  shiftLabel: { fontSize: 14, fontWeight: '600', color: COLORS.onSurface },
  shiftMeta: { fontSize: 13, color: COLORS.onSurfaceVariant, marginTop: 2 },
  bulletRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  bulletText: { flex: 1, fontSize: 14, color: COLORS.onSurface },
  scheduleTime: { fontSize: 13, fontWeight: '700', color: COLORS.primary, width: 52 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.outline, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  tagText: { fontSize: 13, color: COLORS.onSurface },
  participantRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  participantName: { flex: 1, fontSize: 14, fontWeight: '600', color: COLORS.onSurface },
  participantRole: { fontSize: 12, fontWeight: '700', color: COLORS.primary },
  resultGrid: { flexDirection: 'row', gap: 8 },
  resultCell: { flex: 1, borderRadius: 12, borderWidth: 1, borderColor: COLORS.outline, backgroundColor: COLORS.surface, padding: 10 },
  resultValue: { fontSize: 18, fontWeight: '800', color: COLORS.primary },
  resultLabel: { fontSize: 11, color: COLORS.onSurfaceVariant, marginTop: 2 },
  distributionRow: { flexDirection: 'row', gap: 8, alignItems: 'center', paddingVertical: 8 },
  distributionTitle: { fontSize: 14, fontWeight: '700', color: COLORS.onSurface },
  experienceCard: { borderRadius: 12, borderWidth: 1, borderColor: COLORS.outline, backgroundColor: COLORS.surface, padding: 12, marginBottom: 8 },
  experienceName: { fontSize: 13, fontWeight: '800', color: COLORS.onSurface },
  experienceContent: { marginTop: 4, fontSize: 13, color: COLORS.onSurfaceVariant, lineHeight: 19 },
  experienceInput: { backgroundColor: COLORS.surface, marginBottom: 8 },
  experienceImages: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  experienceImageWrap: { width: 76, height: 76, borderRadius: 12, overflow: 'hidden', position: 'relative' },
  experienceImage: { width: '100%', height: '100%' },
  removeImageBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoActions: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  photoButton: { flex: 1, borderColor: COLORS.outline },
});
