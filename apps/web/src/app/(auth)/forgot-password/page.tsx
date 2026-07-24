"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage(null);
    setError(null);
    try {
      const res = await api.post<{ data?: { message?: string } }>("/auth/forgot-password", {
        email,
      });
      setMessage(
        res.data?.data?.message ??
          "Nếu email tồn tại, hướng dẫn đặt lại mật khẩu đã được gửi.",
      );
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data
          ?.error?.message ?? "Không gửi được email đặt lại mật khẩu. Vui lòng thử lại.";
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
          <h2 className="font-bold text-2xl text-neutral-800 mb-2">Quên mật khẩu?</h2>
          <p className="text-neutral-500 font-medium">
            Nhập email đã đăng ký. FoodResQ sẽ gửi liên kết và mã đặt lại mật khẩu.
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
            <label className="font-semibold text-base text-neutral-500 ml-1" htmlFor="forgot-email">
              Email
            </label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline-variant">
                mail
              </span>
              <input
                id="forgot-email"
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="example@email.com"
                className="w-full pl-12 pr-4 py-3 bg-white border-2 rounded-xl focus:ring-0 focus:border-emerald-600 transition-all font-medium outline-none placeholder:text-outline-variant border-neutral-200/30"
                disabled={isSubmitting}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="squishy-button w-full py-3 bg-emerald-800 text-white font-bold text-lg rounded-full shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? "Đang gửi..." : "Gửi email đặt lại mật khẩu"}
          </button>
        </form>
      </section>
    </main>
  );
}
