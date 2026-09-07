/**
 * Thu nhỏ ảnh phía CLIENT trước khi upload — ảnh chụp điện thoại 3–8MB làm
 * đăng ký/eKYC chờ 4-5s (tốn cả thời gian upload lẫn thời gian server 0.5 CPU
 * decode ảnh khổng lồ). Nhận diện khuôn mặt phía BE chỉ nhìn 800px nên gửi quá
 * 1280px là phí thuần túy.
 *
 * Luôn trả JPEG (BE face-match chỉ decode được JPEG/PNG — webp chọn từ máy sẽ
 * được convert luôn ở đây). Lỗi giữa chừng thì trả nguyên file gốc, không chặn flow.
 */
export async function downscaleImage(file: File, maxDim = 1280, quality = 0.85): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
    // Đã nhỏ sẵn và đã là JPEG thì khỏi re-encode cho mất chất lượng
    if (scale === 1 && file.type === 'image/jpeg') {
      bmp.close();
      return file;
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bmp.width * scale));
    canvas.height = Math.max(1, Math.round(bmp.height * scale));
    canvas.getContext('2d')?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality),
    );
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.\w+$/i, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}
