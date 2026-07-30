'use client';

import Link from 'next/link';
import { useMe } from '@/hooks/useProfile';
import { useProviders } from '@/hooks/useProviders';
import { type FormEvent, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { errMsg, mediaUrl } from '@/lib/utils';

/**
 * Trang Nhà cung cấp (NCC) — hiển thị khi user có role = PROVIDER.
 *
 * Gồm 2 khối chính (theo mockup):
 *  1) Banner gradient cam "Tham gia chương trình" — CTA cho NCC chưa có hồ sơ / chưa duyệt.
 *  2) Card trắng "Hồ sơ nhà cung cấp" — hiện trạng thái hồ sơ, thông tin doanh nghiệp,
 *     nút quản lý tin đăng / tạo tin đăng / xin gia hạn.
 *  3) (Phụ) Danh sách NCC hợp tác với các chiến dịch — để NCC chủ động tìm charity.
 */
export default function ProviderSection() {
  const { data: me } = useMe();
  const provider = me?.provider;
  const { data: suppliers } = useProviders();
  const [showProposalForm, setShowProposalForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    businessName: '',
    contactName: '',
    contactPhone: '',
    contactEmail: '',
    address: '',
    note: '',
    durationMonths: 1,
  });

  // ── Status mapping ────────────────────────────────────────────────
  const status: 'none' | 'pending' | 'reviewing' | 'verified' | 'rejected' =
    !provider
      ? 'none'
      : provider.isVerified
        ? 'verified'
        : provider.verificationStatus === 'rejected'
          ? 'rejected'
          : provider.verificationStatus === 'under_review'
            ? 'reviewing'
            : 'pending';

  const STATUS_META: Record<typeof status, { label: string; icon: string; cls: string }> = {
    none: {
      label: 'Chưa đăng ký',
      icon: 'storefront',
      cls: 'bg-neutral-100 text-neutral-600 border-neutral-200',
    },
    pending: {
      label: 'Chờ duyệt hồ sơ',
      icon: 'hourglass_top',
      cls: 'bg-amber-50 text-amber-700 border-amber-200',
    },
    reviewing: {
      label: 'Đang xét duyệt',
      icon: 'pending_actions',
      cls: 'bg-sky-50 text-sky-700 border-sky-200',
    },
    verified: {
      label: 'Đã xác minh',
      icon: 'verified',
      cls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    },
    rejected: {
      label: 'Bị từ chối',
      icon: 'cancel',
      cls: 'bg-rose-50 text-rose-700 border-rose-200',
    },
  };
  const st = STATUS_META[status];

  // ── Submit proposal (gia hạn / mở rộng NCC) ──────────────────────
  async function submitProposal(e: FormEvent) {
    e.preventDefault();
    if (form.businessName.trim().length < 3) {
      toast.error('Tên nhà cung cấp tối thiểu 3 ký tự.');
      return;
    }
    setSubmitting(true);
    try {
      const r = await api.post<{ message: string }>('/campaigns/provider-proposals', {
        businessName: form.businessName.trim(),
        contactName: form.contactName.trim() || undefined,
        contactPhone: form.contactPhone.trim() || undefined,
        contactEmail: form.contactEmail.trim() || undefined,
        address: form.address.trim() || undefined,
        note: form.note.trim() || undefined,
        durationMonths: form.durationMonths,
      });
      toast.success(r.data?.message ?? 'Đã ghi nhận đề xuất.');
      setShowProposalForm(false);
    } catch (e) {
      toast.error(errMsg(e, 'Gửi đề xuất thất bại'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="space-y-6">
      {/* ─── 1) Banner gradient cam — CTA tham gia chương trình ─── */}
      <div className="cm-provider-hero">
        <div className="cm-provider-hero-deco">
          <span className="material-symbols-outlined text-[120px]">storefront</span>
        </div>
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center gap-5">
          <div className="cm-provider-hero-icon">
            <span className="material-symbols-outlined text-[32px]">volunteer_activism</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-widest text-amber-100">
              Chương trình đối tác FoodResQ
            </p>
            <h2 className="text-white font-extrabold text-2xl leading-tight mt-1">
              Tham gia chương trình
            </h2>
            <p className="text-amber-50 text-sm mt-1.5 max-w-xl">
              Đăng ký trở thành nhà cung cấp để chia sẻ thực phẩm dư thừa tới các chiến dịch
              cộng đồng — được xác minh, nhận đề xuất tự động, mở rộng tệp khách hàng từ thiện.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            {!provider && (
              <Link
                href="/provider/create"
                className="cm-provider-hero-cta inline-flex items-center justify-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[18px]">add_business</span>
                Đăng ký NCC
              </Link>
            )}
            {status === 'verified' && (
              <Link
                href="/provider/create"
                className="cm-provider-hero-cta inline-flex items-center justify-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[18px]">add</span>
                Đăng tin mới
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* ─── 2) Card hồ sơ nhà cung cấp ─── */}
      <div className="cm-provider-profile">
        <div className="cm-provider-profile-head">
          <div className="cm-provider-profile-icon">
            <span className="material-symbols-outlined text-[24px]">storefront</span>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-extrabold text-base text-neutral-900">Hồ sơ nhà cung cấp</h3>
            <p className="text-xs text-neutral-500 mt-0.5">
              Trạng thái & thông tin doanh nghiệp của bạn trên hệ thống.
            </p>
          </div>
          <span
            className={`cm-provider-status-chip ${st.cls}`}
            title={st.label}
          >
            <span className="material-symbols-outlined text-[14px]">{st.icon}</span>
            {st.label}
          </span>
        </div>

        {status === 'none' && (
          <div className="cm-provider-empty">
            <p className="text-sm text-neutral-600">
              Bạn chưa đăng ký hồ sơ nhà cung cấp. Bấm{' '}
              <Link href="/provider/create" className="font-bold text-amber-700 hover:underline">
                Đăng ký NCC
              </Link>{' '}
              để bắt đầu.
            </p>
          </div>
        )}

        {status !== 'none' && provider && (
          <div className="cm-provider-profile-grid">
            <ProfileRow label="Tên doanh nghiệp" value={provider.businessName} />
            <ProfileRow label="Loại hình" value={provider.businessType} />
            <ProfileRow
              label="Số điện thoại"
              value={provider.contactPhone ?? '—'}
            />
            <ProfileRow label="Địa chỉ" value={provider.address} />
            <ProfileRow
              label="Mã số thuế"
              value={provider.taxCode ?? '—'}
            />
            {provider.avgRating != null && (
              <ProfileRow
                label="Đánh giá"
                value={
                  <span className="inline-flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px] text-amber-500">
                      star
                    </span>
                    <span className="font-bold">{provider.avgRating.toFixed(1)}</span>
                    <span className="text-neutral-400 text-xs">/ 5</span>
                  </span>
                }
              />
            )}
          </div>
        )}

        {/* CTA bar */}
        <div className="cm-provider-profile-actions">
          {status === 'verified' && (
            <>
              <Link href="/provider" className="cm-provider-action">
                <span className="material-symbols-outlined text-[16px]">inventory_2</span>
                Quản lý tin đăng
              </Link>
              <Link href="/provider/create" className="cm-provider-action">
                <span className="material-symbols-outlined text-[16px]">add</span>
                Tạo tin đăng
              </Link>
            </>
          )}
          {(status === 'verified' || status === 'rejected') && (
            <button
              type="button"
              onClick={() => setShowProposalForm((v) => !v)}
              className="cm-provider-action cm-provider-action--ghost"
            >
              <span className="material-symbols-outlined text-[16px]">schedule</span>
              Gia hạn / mở rộng hợp tác
            </button>
          )}
          {status === 'pending' && (
            <p className="text-xs text-amber-700 inline-flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[14px]">info</span>
              Hồ sơ đang được admin xét — thường mất 24h.
            </p>
          )}
          {status === 'reviewing' && (
            <p className="text-xs text-sky-700 inline-flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[14px]">pending_actions</span>
              Admin đang xem xét hồ sơ — sẽ có thông báo khi có kết quả.
            </p>
          )}
          {status === 'rejected' && (
            <p className="text-xs text-rose-700 inline-flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[14px]">error</span>
              Hồ sơ bị từ chối. Gửi lại đề xuất hoặc liên hệ admin.
            </p>
          )}
        </div>
      </div>

      {/* ─── 3) Proposal form (gia hạn / mở rộng) ─── */}
      {showProposalForm && (
        <form onSubmit={submitProposal} className="cm-provider-proposal">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-amber-600">schedule</span>
            <h4 className="font-bold text-neutral-900">Gia hạn / mở rộng hợp tác</h4>
          </div>
          <p className="text-xs text-neutral-500 mt-1">
            Gửi đề xuất mở rộng thời gian hợp tác với hệ thống. Admin sẽ phản hồi trong 24h.
          </p>
          <div className="grid sm:grid-cols-2 gap-3 mt-3">
            <ProposalField label="Tên nhà cung cấp *">
              <input
                value={form.businessName}
                onChange={(e) => setForm({ ...form, businessName: e.target.value })}
                placeholder={provider?.businessName ?? 'Tên doanh nghiệp'}
                className="cm-provider-input"
                required
              />
            </ProposalField>
            <ProposalField label="Người liên hệ">
              <input
                value={form.contactName}
                onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                placeholder="Họ tên"
                className="cm-provider-input"
              />
            </ProposalField>
            <ProposalField label="Số điện thoại">
              <input
                value={form.contactPhone}
                onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
                placeholder="0901xxxxxx"
                className="cm-provider-input"
              />
            </ProposalField>
            <ProposalField label="Email">
              <input
                type="email"
                value={form.contactEmail}
                onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
                placeholder="contact@example.com"
                className="cm-provider-input"
              />
            </ProposalField>
            <ProposalField label="Địa chỉ" full>
              <input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder={provider?.address ?? 'Địa chỉ bếp / cửa hàng'}
                className="cm-provider-input"
              />
            </ProposalField>
            <ProposalField label="Lời nhắn" full>
              <textarea
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                rows={2}
                placeholder="Lý do gia hạn, quy mô ước tính…"
                className="cm-provider-input resize-none"
              />
            </ProposalField>
            <ProposalField label="Thời hạn muốn gia hạn" full>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={1}
                  max={24}
                  value={form.durationMonths}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      durationMonths: Math.max(1, Math.min(24, Number(e.target.value) || 1)),
                    })
                  }
                  className="cm-provider-input !w-24"
                />
                <span className="text-sm text-neutral-600">tháng</span>
                <div className="flex gap-1">
                  {[1, 3, 6, 12].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setForm({ ...form, durationMonths: m })}
                      className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                        form.durationMonths === m
                          ? 'bg-amber-500 text-white border-amber-500'
                          : 'bg-white text-neutral-600 border-neutral-200 hover:border-amber-300'
                      }`}
                    >
                      {m} tháng
                    </button>
                  ))}
                </div>
              </div>
            </ProposalField>
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <button
              type="button"
              onClick={() => setShowProposalForm(false)}
              className="px-4 py-2 text-sm font-semibold text-neutral-600 bg-neutral-100 hover:bg-neutral-200 rounded-lg"
            >
              Huỷ
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-amber-500 hover:bg-amber-600 text-white rounded-lg disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[16px]">send</span>
              {submitting ? 'Đang gửi…' : 'Gửi đề xuất'}
            </button>
          </div>
        </form>
      )}

      {/* ─── 4) NCC network (tìm đối tác) ─── */}
      <div className="cm-provider-network">
        <div className="cm-provider-network-head">
          <div>
            <h3 className="font-extrabold text-sm text-neutral-900">
              Mạng lưới nhà cung cấp
            </h3>
            <p className="text-xs text-neutral-500 mt-0.5">
              Xem các NCC khác đang hợp tác với các chiến dịch cộng đồng.
            </p>
          </div>
          <span className="text-xs font-bold text-neutral-500">
            {suppliers?.length ?? 0} NCC
          </span>
        </div>

        {!suppliers || suppliers.length === 0 ? (
          <div className="cm-provider-network-empty">
            <span className="material-symbols-outlined text-[40px] text-neutral-300">
              diversity_3
            </span>
            <p className="text-sm text-neutral-500 mt-2">
              Chưa có nhà cung cấp nào đang hoạt động.
            </p>
          </div>
        ) : (
          <div className="cm-provider-network-list">
            {suppliers.slice(0, 6).map((s) => (
              <div key={s.id} className="cm-provider-network-item">
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center overflow-hidden shrink-0">
                  {s.avatarUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={mediaUrl(s.avatarUrl)} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="material-symbols-outlined text-amber-600 text-[20px]">
                      storefront
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm text-neutral-800 truncate">
                    {s.providerProfile?.businessName ?? s.fullName}
                  </p>
                  <p className="text-xs text-neutral-500 truncate">
                    {s.providerProfile?.businessType ?? 'NCC'}
                  </p>
                </div>
                <span className="cm-provider-network-count">
                  <span className="material-symbols-outlined text-[12px]">local_offer</span>
                  {s.activeListingsCount ?? 0}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ─── Sub-components ────────────────────────────────────────────────

function ProfileRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="cm-provider-profile-row">
      <span className="cm-provider-profile-label">{label}</span>
      <span className="cm-provider-profile-value">{value}</span>
    </div>
  );
}

function ProposalField({
  label,
  full,
  children,
}: {
  label: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={`flex flex-col gap-1 ${full ? 'sm:col-span-2' : ''}`}>
      <span className="text-xs font-semibold text-neutral-700">{label}</span>
      {children}
    </label>
  );
}
