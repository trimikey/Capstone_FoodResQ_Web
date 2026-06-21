import { Searchbar } from 'react-native-paper';

interface Props {
  value: string;
  onChangeText: (text: string) => void;
}

/** TODO [T2.3]: thêm debounce + nút lọc category. */
export function SearchBar({ value, onChangeText }: Props) {
  return (
    <Searchbar
      placeholder="Tìm thực phẩm gần bạn"
      value={value}
      onChangeText={onChangeText}
    />
  );
}
