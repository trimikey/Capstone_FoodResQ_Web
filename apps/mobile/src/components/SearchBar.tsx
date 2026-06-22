import { View, StyleSheet } from 'react-native';
import { Searchbar, IconButton } from 'react-native-paper';

const COLORS = {
  primary: '#10b981',
  surface: '#ffffff',
  surfaceVariant: '#f3f4f6',
  outline: '#e5e7eb',
};

interface Props {
  value: string;
  onChangeText: (text: string) => void;
  onPressFilter?: () => void;
  /** true khi đang áp dụng filter category → highlight nút */
  filterActive?: boolean;
}

/** Ô tìm kiếm + nút mở bộ lọc category. Debounce do container xử lý. */
export function SearchBar({ value, onChangeText, onPressFilter, filterActive }: Props) {
  return (
    <View style={styles.row}>
      <Searchbar
        placeholder="Tìm thực phẩm gần bạn"
        value={value}
        onChangeText={onChangeText}
        style={styles.search}
        inputStyle={styles.input}
        elevation={0}
      />
      <IconButton
        icon={filterActive ? 'filter' : 'filter-outline'}
        mode="contained"
        size={22}
        onPress={onPressFilter}
        containerColor={filterActive ? COLORS.primary : COLORS.surfaceVariant}
        iconColor={filterActive ? '#fff' : '#374151'}
        style={styles.filterBtn}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  search: {
    flex: 1,
    backgroundColor: COLORS.surfaceVariant,
    borderRadius: 14,
  },
  input: { fontSize: 15, minHeight: 0 },
  filterBtn: { margin: 0, borderRadius: 14 },
});
