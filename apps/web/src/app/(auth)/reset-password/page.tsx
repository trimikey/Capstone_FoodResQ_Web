"use client";

import { FormEvent, useState } from "react";
import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const [token, setToken] = useState(searchParams.get("token") ?? "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    setError(null);

    if (password !== confirmPassword) {
      setError("Mật khẩu xác nhận không khớp.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await api.post<{ data?: { message?: string } }>("/auth/reset-password", {
        token,
        password,
      });
      setMessage(res.data?.data?.message ?? "Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại.");
      setPassword("");
      setConfirmPassword("");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data
          ?.error?.message ?? "Không đặt lại được mật khẩu. Vui lòng kiểm tra mã và thử lại.";
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#FAFBF9] flex items-center justify-center px-6 py-12">
      <section className="w-full max-w-[440px]">
        <Link href="/login" className="inline-flex items-center gap-2 text-sm font-bold text-emerald-800 mb-8">
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          Đăng nhập
        </Link>

        <div className="mb-8">
          <h1 className="font-bold text-4xl text-emerald-800 italic tracking-tight mb-3">FoodResQ</h1>
          <h2 className="font-bold text-2xl text-neutral-800 mb-2">Đặt lại mật khẩu</h2>
          <p className="text-neutral-500 font-medium">
            Nhập mã trong email và tạo mật khẩu mới cho tài khoản của bạn.
          </p>
        </div>

        {message && (
          <div className="mb-6 p-5 bg-emerald-50 text-emerald-800 rounded-xl border border-emerald-100 font-medium">
            {message}
          </div>
        )}
        {error && (
          <div className="mb-6 p-5 bg-rose-50 text-rose-700 rounded-xl border border-rose-100 font-medium">
            {error}
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <label className="font-semibold text-base text-neutral-500 ml-1" htmlFor="reset-token">
              Mã đặt lại mật khẩu
            </label>
            <textarea
              id="reset-token"
              required
              value={token}
              onChange={(event) => setToken(event.target.value.trim())}
              placeholder="Dán mã trong email"
              className="w-full min-h-24 px-4 py-3 bg-white border-2 rounded-xl focus:ring-0 focus:border-emerald-600 transition-all font-medium outline-none placeholder:text-outline-variant border-neutral-200/30"
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-1.5">
            <label className="font-semibold text-base text-neutral-500 ml-1" htmlFor="reset-password">
              Mật khẩu mới
            </label>
            <input
              id="reset-password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="NewPassword123"
              className="w-full px-4 py-3 bg-white border-2 rounded-xl focus:ring-0 focus:border-emerald-600 transition-all font-medium outline-none placeholder:text-outline-variant border-neutral-200/30"
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-1.5">
            <label className="font-semibold text-base text-neutral-500 ml-1" htmlFor="reset-confirm">
              Xác nhận mật khẩu
            </label>
            <input
              id="reset-confirm"
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Nhập lại mật khẩu mới"
              className="w-full px-4 py-3 bg-white border-2 rounded-xl focus:ring-0 focus:border-emerald-600 transition-all font-medium outline-none placeholder:text-outline-variant border-neutral-200/30"
              disabled={isSubmitting}
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="squishy-button w-full py-3 bg-emerald-800 text-white font-bold text-lg rounded-full shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? "Đang cập nhật..." : "Lưu mật khẩu mới"}
          </button>
        </form>
      </section>
    </main>
  );
}
