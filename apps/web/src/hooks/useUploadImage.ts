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

/** Convenience wrapper riêng cho ảnh minh chứng duyệt NCC (GPKD, mặt tiền, ...). */
export function useUploadVerificationImage() {
  const inner = useUploadImage();
  return {
    ...inner,
    uploadVerificationImage: async (file: File) =>
      inner.mutateAsync({ file, kind: "verification" as UploadKind }),
  };
}
