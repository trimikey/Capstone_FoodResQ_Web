import { View, StyleSheet, Pressable } from 'react-native';
import { Text, ProgressBar } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { Campaign } from '@/hooks/useCampaigns';
import { statusMeta, formatDate, formatTime, charityName, slotProgress } from '@/utils/campaign';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { mobileColors as COLORS, elevation, radius, spacing } from '@/theme/design';

interface Props {
  campaign: Campaign;
  onPress: () => void;
}

/** Thẻ chiến dịch trong danh sách: tên, tổ chức, thời gian, địa chỉ, tiến độ TNV, trạng thái. */
export function CampaignCard({ campaign, onPress }: Props) {
  const sm = statusMeta(campaign.status);
  const slots = slotProgress(campaign);
  const totalNeeded = slots.reduce((sum, slot) => sum + slot.needed, 0);
  const totalFilled = slots.reduce((sum, slot) => sum + slot.filled, 0);
  const progress = totalNeeded > 0 ? Math.min(totalFilled / totalNeeded, 1) : 0;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.accentRail} />
      <View style={styles.topRow}>
        <View style={styles.iconBox}>
          <MaterialCommunityIcons name="pot-steam-outline" size={22} color={COLORS.purple} />
        </View>
        <View style={styles.titleWrap}>
          <Text style={styles.kicker}>{charityName(campaign)}</Text>
          <Text style={styles.title} numberOfLines={2}>
            {campaign.title}
          </Text>
        </View>
        <StatusBadge label={sm.label} tone={campaign.status === 'cancelled' ? 'danger' : campaign.status === 'completed' ? 'success' : 'info'} />
      </View>

      <View style={styles.infoPanel}>
        <MetaLine
          icon="calendar-clock"
          text={`${formatDate(campaign.scheduledDate)} · ${formatTime(campaign.startTime)}-${formatTime(campaign.endTime)}`}
        />
        <MetaLine icon="map-marker-outline" text={campaign.kitchenAddress} />
      </View>

      {slots.length > 0 ? (
        <View style={styles.staffPanel}>
          <View style={styles.staffHeader}>
            <Text style={styles.staffTitle}>Tình nguyện viên</Text>
            <Text style={styles.staffCount}>{totalFilled}/{totalNeeded}</Text>
          </View>
          <ProgressBar progress={progress} color={COLORS.purple} style={styles.progress} />
          <View style={styles.slotsRow}>
            {slots.map((s) => {
              const full = s.filled >= s.needed;
              return (
                <View key={s.role} style={[styles.slotChip, full && styles.slotChipFull]}>
                  <Text style={[styles.slotText, full && styles.slotTextFull]}>
                    {s.label} {s.filled}/{s.needed}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}
      <View style={styles.cardFooter}>
        <Text style={styles.footerText}>Mở chi tiết và đăng ký vai trò</Text>
        <MaterialCommunityIcons name="arrow-right" size={18} color={COLORS.purple} />
      </View>
    </Pressable>
  );
}

function MetaLine({ icon, text }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; text: string }) {
  return (
    <View style={styles.metaRow}>
      <MaterialCommunityIcons name={icon} size={16} color={icon === 'calendar-clock' ? COLORS.indigo : COLORS.orange} />
      <Text style={styles.metaText} numberOfLines={1}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'relative',
    backgroundColor: COLORS.surface,
    borderRadius: 28,
    padding: spacing.xl,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    overflow: 'hidden',
    ...elevation.card,
  },
  accentRail: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 7,
    backgroundColor: COLORS.purple,
  },
  pressed: { opacity: 0.85 },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.purpleContainer,
  },
  titleWrap: { flex: 1 },
  kicker: {
    fontSize: 11,
    fontWeight: '900',
    color: COLORS.purple,
    textTransform: 'uppercase',
  },
  title: { marginTop: 3, fontSize: 19, fontWeight: '900', color: COLORS.onSurface, lineHeight: 24 },
  infoPanel: {
    marginTop: spacing.lg,
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.xl,
    backgroundColor: COLORS.surfaceContainerLow,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  metaText: { flex: 1, fontSize: 13, fontWeight: '600', color: COLORS.onSurfaceVariant },
  staffPanel: { marginTop: spacing.md, gap: spacing.sm },
  staffHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  staffTitle: { fontSize: 13, fontWeight: '800', color: COLORS.onSurface },
  staffCount: { fontSize: 13, fontWeight: '900', color: COLORS.purple },
  progress: { height: 7, borderRadius: radius.pill, backgroundColor: COLORS.surfaceContainerLow },
  slotsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  slotChip: {
    backgroundColor: COLORS.neutralContainer,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
  slotChipFull: { backgroundColor: COLORS.successContainer },
  slotText: { fontSize: 12, fontWeight: '800', color: COLORS.onSurfaceVariant },
  slotTextFull: { color: COLORS.teal },
  cardFooter: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.outlineVariant,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  footerText: { color: COLORS.purple, fontSize: 12, fontWeight: '900' },
});
