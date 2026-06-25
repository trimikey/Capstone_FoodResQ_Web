import { View, StyleSheet } from 'react-native';
import { Text, Button, Icon } from 'react-native-paper';

const COLORS = {
  primary: '#10b981',
  onSurface: '#121c2a',
  onSurfaceVariant: '#6b7280',
};

interface Props {
  variant: 'empty' | 'error';
  onRetry?: () => void;
}

/** View trạng thái rỗng / lỗi cho danh sách listing. */
export function ListingsStateView({ variant, onRetry }: Props) {
  const isError = variant === 'error';
  return (
    <View style={styles.container}>
      <Icon
        source={isError ? 'wifi-off' : 'food-off-outline'}
        size={56}
        color={COLORS.onSurfaceVariant}
      />
      <Text variant="titleMedium" style={styles.title}>
        {isError ? 'Không tải được dữ liệu' : 'Không tìm thấy thực phẩm phù hợp'}
      </Text>
      <Text variant="bodySmall" style={styles.subtitle}>
        {isError
          ? 'Kiểm tra kết nối mạng rồi thử lại.'
          : 'Thử đổi từ khoá, bộ lọc hoặc mở rộng bán kính tìm kiếm.'}
      </Text>
      {isError && onRetry && (
        <Button
          mode="contained"
          onPress={onRetry}
          style={styles.btn}
          buttonColor={COLORS.primary}
        >
          Thử lại
        </Button>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', paddingVertical: 64, gap: 8 },
  title: { fontWeight: '700', color: COLORS.onSurface, textAlign: 'center', marginTop: 8 },
  subtitle: { color: COLORS.onSurfaceVariant, textAlign: 'center', paddingHorizontal: 32 },
  btn: { marginTop: 12, borderRadius: 12 },
});
