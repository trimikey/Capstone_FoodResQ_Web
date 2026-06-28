import { View, StyleSheet, Pressable } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { Campaign } from '@/hooks/useCampaigns';
import { statusMeta, formatDate, formatTime, charityName, slotProgress } from '@/utils/campaign';

interface Props {
  campaign: Campaign;
  onPress: () => void;
}

const COLORS = {
  primary: '#10b981',
  surface: '#ffffff',
  onSurface: '#121c2a',
  onSurfaceVariant: '#6b7280',
  outline: '#e5e7eb',
};

/** Thẻ chiến dịch trong danh sách: tên, tổ chức, thời gian, địa chỉ, tiến độ TNV, trạng thái. */
export function CampaignCard({ campaign, onPress }: Props) {
  const sm = statusMeta(campaign.status);
  const slots = slotProgress(campaign);

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.headerRow}>
        <Text style={styles.title} numberOfLines={2}>
          {campaign.title}
        </Text>
        <View style={[styles.badge, { backgroundColor: sm.bg }]}>
          <Text style={[styles.badgeText, { color: sm.color }]}>{sm.label}</Text>
        </View>
      </View>

      <View style={styles.metaRow}>
        <MaterialCommunityIcons name="account-group-outline" size={15} color={COLORS.onSurfaceVariant} />
        <Text style={styles.metaText} numberOfLines={1}>{charityName(campaign)}</Text>
      </View>
      <View style={styles.metaRow}>
        <MaterialCommunityIcons name="calendar-clock" size={15} color={COLORS.onSurfaceVariant} />
        <Text style={styles.metaText}>
          {formatDate(campaign.scheduledDate)} · {formatTime(campaign.startTime)}–{formatTime(campaign.endTime)}
        </Text>
      </View>
      <View style={styles.metaRow}>
        <MaterialCommunityIcons name="map-marker-outline" size={15} color={COLORS.onSurfaceVariant} />
        <Text style={styles.metaText} numberOfLines={1}>{campaign.kitchenAddress}</Text>
      </View>

      {slots.length > 0 ? (
        <View style={styles.slotsRow}>
          {slots.map((s) => {
            const full = s.filled >= s.needed;
            return (
              <View key={s.role} style={styles.slotChip}>
                <Text style={[styles.slotText, full && styles.slotTextFull]}>
                  {s.label} {s.filled}/{s.needed}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.outline,
  },
  pressed: { opacity: 0.85 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  title: { flex: 1, fontSize: 16, fontWeight: '700', color: COLORS.onSurface, lineHeight: 21 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  metaText: { flex: 1, fontSize: 13, color: COLORS.onSurfaceVariant },
  slotsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  slotChip: { backgroundColor: '#f9fafb', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: COLORS.outline },
  slotText: { fontSize: 12, fontWeight: '600', color: COLORS.onSurfaceVariant },
  slotTextFull: { color: COLORS.primary },
});
