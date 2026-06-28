import { useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Portal, Dialog, Button, TextInput, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface Props {
  visible: boolean;
  providerName: string;
  submitting?: boolean;
  onDismiss: () => void;
  onSubmit: (score: number, comment?: string) => void;
}

const COLORS = {
  primary: '#10b981',
  star: '#f59e0b',
  onSurface: '#121c2a',
  onSurfaceVariant: '#6b7280',
  outline: '#e5e7eb',
};

/** Hộp thoại đánh giá nhà cung cấp: chọn 1-5 sao + nhận xét tuỳ chọn. */
export function RatingDialog({ visible, providerName, submitting, onDismiss, onSubmit }: Props) {
  const [score, setScore] = useState(0);
  const [comment, setComment] = useState('');

  const reset = () => {
    setScore(0);
    setComment('');
  };

  const handleDismiss = () => {
    if (submitting) return;
    reset();
    onDismiss();
  };

  const handleSubmit = () => {
    if (score < 1) return;
    onSubmit(score, comment.trim() || undefined);
  };

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={handleDismiss} style={styles.dialog}>
        <Dialog.Title style={styles.title}>Đánh giá nhà cung cấp</Dialog.Title>
        <Dialog.Content>
          <Text style={styles.providerName}>{providerName}</Text>

          <View style={styles.stars}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable key={n} onPress={() => setScore(n)} hitSlop={6} disabled={submitting}>
                <MaterialCommunityIcons
                  name={n <= score ? 'star' : 'star-outline'}
                  size={40}
                  color={n <= score ? COLORS.star : COLORS.outline}
                />
              </Pressable>
            ))}
          </View>

          <TextInput
            mode="outlined"
            placeholder="Nhận xét (tuỳ chọn)"
            value={comment}
            onChangeText={setComment}
            multiline
            numberOfLines={3}
            outlineColor={COLORS.outline}
            activeOutlineColor={COLORS.primary}
            style={styles.input}
            disabled={submitting}
          />
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={handleDismiss} textColor={COLORS.onSurfaceVariant} disabled={submitting}>
            Huỷ
          </Button>
          <Button
            mode="contained"
            onPress={handleSubmit}
            buttonColor={COLORS.primary}
            loading={submitting}
            disabled={submitting || score < 1}
          >
            Gửi đánh giá
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  dialog: { borderRadius: 20 },
  title: { fontSize: 18, fontWeight: '700', color: COLORS.onSurface },
  providerName: { fontSize: 15, fontWeight: '600', color: COLORS.onSurface, textAlign: 'center' },
  stars: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginVertical: 18 },
  input: { backgroundColor: '#fff' },
});
