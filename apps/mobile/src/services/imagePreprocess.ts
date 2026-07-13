export type ImageKind = 'listing' | 'recipe' | 'avatar' | 'proof';
type ImageManipulatorModule = typeof import('expo-image-manipulator');

const LIMITS: Record<ImageKind, { maxWidth: number; compress: number }> = {
  listing: { maxWidth: 1400, compress: 0.72 },
  recipe: { maxWidth: 1400, compress: 0.74 },
  avatar: { maxWidth: 720, compress: 0.78 },
  proof: { maxWidth: 1280, compress: 0.78 },
};

export async function preprocessImage(uri: string, kind: ImageKind): Promise<string> {
  const { maxWidth, compress } = LIMITS[kind];
  try {
    // Expo native modules require a rebuilt dev client after installation.
    // If the current client does not include ExpoImageManipulator yet, keep upload flow working.
    const ImageManipulator = require('expo-image-manipulator') as ImageManipulatorModule;
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: maxWidth } }],
      { compress, format: ImageManipulator.SaveFormat.JPEG }
    );
    return result.uri;
  } catch {
    return uri;
  }
}
