import { Image, ImageProps } from 'expo-image';

/**
 * Ảnh dùng chung toàn app — bọc expo-image với cache + hiệu ứng fade khi load.
 * Thay cho <Image> của react-native (không cache, không transition).
 * Docs: https://docs.expo.dev/versions/latest/sdk/image/
 */
export function AppImage(props: ImageProps) {
  return (
    <Image
      contentFit="cover"
      transition={250}
      cachePolicy="memory-disk"
      {...props}
    />
  );
}

export default AppImage;
