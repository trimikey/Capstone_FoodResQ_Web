"use client";

import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type UploadKind = "listing" | "avatar" | "verification";

interface UploadResponse {
  success: true;
  data: { url: string };
}

/** Upload 1 ảnh qua POST /uploads/image?kind=... → trả URL public (/uploads/...). */
export function useUploadImage() {
  return useMutation({
    mutationFn: async (input: { file: File; kind: UploadKind }) => {
      const form = new FormData();
      form.append("file", input.file);
      const res = await api.post<UploadResponse>("/uploads/image", form, {
        params: { kind: input.kind },
        headers: { "Content-Type": "multipart/form-data" },
      });
      return res.data.data.url;
    },
  });
}

/**
 * Ảnh minh chứng lúc ĐĂNG KÝ NCC (GPKD, mặt tiền, ...) — dùng endpoint công khai
 * /uploads/register-evidence vì lúc đăng ký CHƯA có JWT (endpoint /uploads/image
 * yêu cầu đăng nhập nên trước đây upload luôn thất bại 401).
 */
export function useUploadVerificationImage() {
  const inner = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      const res = await api.post<UploadResponse>("/uploads/register-evidence", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return res.data.data.url;
    },
  });
  return {
    ...inner,
    uploadVerificationImage: async (file: File) => inner.mutateAsync(file),
  };
}
