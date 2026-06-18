import QRCode from 'react-native-qrcode-svg';

interface Props {
  /** chuỗi qrToken từ reservation */
  value: string;
  size?: number;
}

/** TODO [T3.3]: bọc khung trắng + logo FoodResQ; countdown 30' đặt ở màn order detail. */
export function QRDisplay({ value, size = 220 }: Props) {
  return <QRCode value={value} size={size} />;
}
