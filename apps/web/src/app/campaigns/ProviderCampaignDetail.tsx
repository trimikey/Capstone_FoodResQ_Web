'use client';

import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { useMe } from '@/hooks/useProfile';
import {
  usePledgeDonation,
  type PublicCampaignDetail,
} from '@/hooks/useCampaigns';
import { Modal } from '@/components/shared/Modal';
import { errMsg } from '@/lib/utils';

/**
 * Trang chi tiết chiến dịch dành cho NCC (Nhà cung cấp).
 *
 * Khác với CampaignPublicDetailPage (cho volunteer/receiver/khách):
 *  - Banner gradient cam "Hỗ trợ nguyên liệu cho chiến dịch"
 *  - Card hồ sơ NCC hiển thị trạng thái xác minh
 *  - Bảng "Nguyên liệu cần hỗ trợ" + nút "Đăng ký cung cấp" cho từng món
 *  - Modal donate mở khi NCC bấm nút
 */
export default function ProviderCampaignDetail({ c }: { c: PublicCampaignDetail }) {
  const router = useRouter();
  const { data: me } = useMe();
  const provider = me?.provider;
  const verified = provider?.isVerified === true;
  const [donateItem, setDonateItem] = useState<{ name: string; unit?: string } | null>(null);

  // Map donation theo itemName để hiển thị đã có NCC đăng ký
  type DonationRow = PublicCampaignDetail['donations'][number];
  const donationsByItem = (c.donations ?? []).reduce<Record<string, DonationRow[]>>(
    (acc, d) => {
      const key = d.itemName.trim().toLowerCase();
      if (!acc[key]) acc[key] = [];
      acc[key].push(d);
      return acc;
    },
    {},
  );

  // Chuẩn hoá supplyItems (string[] | object[])
  type NormalizedSupply = { name: string; quantity?: number | null; unit?: string | null };
  const supplyList: NormalizedSupply[] = (c.supplyItems ?? []).map((s) =>
    typeof s === 'string' ? { name: s } : { name: s.name, quantity: s.quantity, unit: s.unit },
  );

  // Trích danh sách "đã hứa góp / đã nhận" cho bảng lịch sử
  const allDonations = c.donations ?? [];

  const dateFormatted = new Date(c.scheduledDate).toLocaleDateString('vi-VN', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  return (
    <div className="cm-page cm-scope min-h-screen bg-[var(--cm-cream-50)]">
      {/* ─── Banner gradient xanh (đồng bộ với trang public) ─── */}
      <section className="cm-provider-detail-hero">
        <button
          type="button"
          onClick={() => router.push('/campaigns')}
          className="cm-provider-detail-back"
          aria-label="Quay lại"
        >
          <span className="material-symbols-outlined text-[20px]">arrow_back</span>
        </button>
        <div className="cm-provider-detail-hero-deco">
          <span className="material-symbols-outlined text-[140px]">inventory_2</span>
        </div>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center gap-5">
          <div className="cm-provider-detail-hero-icon">
            <span className="material-symbols-outlined text-[34px]">volunteer_activism</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-widest text-amber-100">
              Cổng hỗ trợ nguyên liệu
            </p>
            <h1 className="text-white font-extrabold text-2xl md:text-3xl leading-tight mt-1">
              Hỗ trợ nguyên liệu cho chiến dịch
            </h1>
            <p className="text-amber-50 text-sm mt-1.5 max-w-2xl">
              Đăng ký cung cấp nguyên liệu cho <b>{c.title}</b> — góp phần vào bữa ăn ấm cho cộng đồng.
              Ban tổ chức sẽ xác nhận và phối hợp nhận hàng.
            </p>
            <div className="flex items-center gap-3 mt-3 text-[12px] text-amber-50 flex-wrap">
              <span className="inline-flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">event</span>
                {dateFormatted}
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">schedule</span>
                {c.startTime} – {c.endTime}
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">place</span>
                {c.kitchenAddress}
              </span>
            </div>
          </div>
          {verified && (
            <button
              type="button"
              onClick={() => {
                const first = supplyList[0];
                if (first) setDonateItem({ name: first.name, unit: first.unit ?? undefined });
                else toast.info('Chiến dịch chưa liệt kê nguyên liệu cần hỗ trợ.');
              }}
              className="cm-provider-detail-cta"
            >
              <span className="material-symbols-outlined text-[18px]">add_circle</span>
              Đăng ký hỗ trợ
            </button>
          )}
        </div>
      </section>

      {/* ─── Grid 2 cột: NCC info + nội dung chiến dịch ─── */}
      <div className="max-w-6xl mx-auto px-4 md:px-8 lg:px-10 py-8 space-y-6">
        {/* 2 col: Provider profile + Quick info */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Card hồ sơ NCC */}
          <div className="lg:col-span-1 cm-provider-card">
            <div className="flex items-start gap-3">
              <div className="cm-provider-card-icon">
                <span className="material-symbols-outlined text-[22px]">storefront</span>
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-extrabold text-base text-neutral-900">Hồ sơ nhà cung cấp</h2>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Trạng thái đối tác của bạn trên hệ thống.
                </p>
              </div>
            </div>

            {!provider && (
              <div className="cm-provider-card-empty">
                <p className="text-sm text-neutral-600">
                  Bạn chưa có hồ sơ NCC.{' '}
                  <Link href="/provider/create" className="font-bold text-amber-700 hover:underline">
                    Đăng ký ngay
                  </Link>
                </p>
              </div>
            )}

            {provider && (
              <>
                <div className="cm-provider-card-status mt-3">
                  {verified ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-[11px] font-extrabold">
                      <span className="material-symbols-outlined text-[14px]">verified</span>
                      Đã xác minh — có thể đăng ký hỗ trợ
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-[11px] font-extrabold">
                      <span className="material-symbols-outlined text-[14px]">hourglass_top</span>
                      Hồ sơ chờ duyệt — không thể đăng ký
                    </span>
                  )}
                </div>

                <dl className="cm-provider-card-grid mt-3">
                  <Row label="Tên doanh nghiệp" value={provider.businessName} />
                  <Row label="Loại hình" value={provider.businessType} />
                  <Row label="Địa chỉ" value={provider.address} />
                  {provider.contactPhone && (
                    <Row label="Số điện thoại" value={provider.contactPhone} />
                  )}
                </dl>

                {!verified && (
                  <Link
                    href="/provider/create"
                    className="cm-provider-card-cta inline-flex items-center gap-1.5 mt-3"
                  >
                    <span className="material-symbols-outlined text-[14px]">edit</span>
                    Cập nhật hồ sơ để được duyệt
                  </Link>
                )}
              </>
            )}
          </div>

          {/* Card thông tin nhanh chiến dịch */}
          <div className="lg:col-span-2 cm-provider-card">
            <div className="flex items-start gap-3">
              <div className="cm-provider-card-icon !bg-emerald-50 !text-emerald-700">
                <span className="material-symbols-outlined text-[22px]">campaign</span>
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-extrabold text-base text-neutral-900 truncate">{c.title}</h2>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Tổ chức: {c.organizationName ?? 'Cộng đồng'}
                </p>
              </div>
              <span className="cm-provider-card-stat-chip">
                <span className="material-symbols-outlined text-[14px] text-amber-500">restaurant</span>
                {c.expectedServings?.toLocaleString('vi-VN') ?? '—'} suất dự kiến
              </span>
            </div>

            {c.description && (
              <p className="text-[13px] text-neutral-700 leading-relaxed mt-3 whitespace-pre-line">
                {c.description}
              </p>
            )}

            {/* Quick stats */}
            <div className="cm-provider-card-stats">
              <MiniStat icon="schedule" label="Diễn ra" value={dateFormatted} />
              <MiniStat
                icon="access_time"
                label="Khung giờ"
                value={`${c.startTime} – ${c.endTime}`}
              />
              <MiniStat icon="place" label="Bếp" value={c.kitchenAddress} />
              <MiniStat
                icon="inventory"
                label="Nguyên liệu"
                value={`${supplyList.length} món cần hỗ trợ`}
              />
            </div>
          </div>
        </div>

        {/* ─── Bảng nguyên liệu cần hỗ trợ ─── */}
        <section className="cm-provider-card !p-0 overflow-hidden">
          <header className="px-5 md:px-6 py-4 border-b border-neutral-100 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-amber-600">inventory_2</span>
              <div>
                <h3 className="font-extrabold text-base text-neutral-900">
                  Nguyên liệu cần hỗ trợ
                </h3>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Bấm "Đăng ký cung cấp" trên món bạn muốn đóng góp — ban tổ chức sẽ xác nhận.
                </p>
              </div>
            </div>
            <span className="text-xs font-bold text-neutral-500">
              {supplyList.length} món
            </span>
          </header>

          {supplyList.length === 0 ? (
            <div className="text-center py-12">
              <span className="material-symbols-outlined text-neutral-300 text-[44px]">
                inventory_2
              </span>
              <p className="font-bold text-neutral-700 mt-2">Chưa có nguyên liệu nào được liệt kê.</p>
              <p className="text-xs text-neutral-400 mt-1">
                Ban tổ chức chưa cập nhật danh sách — quay lại sau nhé.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 text-[11px] font-extrabold uppercase tracking-wide text-neutral-500">
                  <tr>
                    <th className="text-left px-5 md:px-6 py-3 w-[40%]">Nguyên liệu</th>
                    <th className="text-left px-3 py-3">Yêu cầu</th>
                    <th className="text-left px-3 py-3">Đã hứa góp</th>
                    <th className="text-left px-3 py-3">Trạng thái</th>
                    <th className="text-right px-5 md:px-6 py-3">Hành động</th>
                  </tr>
                </thead>
                <tbody>
                  {supplyList.map((s, i) => {
                    const donations = donationsByItem[s.name.trim().toLowerCase()] ?? [];
                    const received = donations.filter((d) => d.status === 'received').length;
                    const promised = donations.filter((d) => d.status !== 'received').length;
                    const providers = Array.from(new Set(donations.map((d) => d.provider.businessName)));
                    return (
                      <tr
                        key={`${s.name}-${i}`}
                        className="border-t border-neutral-100 hover:bg-amber-50/30 transition-colors"
                      >
                        <td className="px-5 md:px-6 py-3.5 align-middle">
                          <div className="flex items-center gap-3">
                            <span className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                              <span className="material-symbols-outlined text-[18px]">
                                {iconForSupply(s.name)}
                              </span>
                            </span>
                            <div className="min-w-0">
                              <p className="font-bold text-neutral-800 truncate">{s.name}</p>
                              {providers.length > 0 && (
                                <p className="text-[11px] text-neutral-500 truncate mt-0.5">
                                  NCC đăng ký: {providers.slice(0, 2).join(', ')}
                                  {providers.length > 2 ? `, +${providers.length - 2}` : ''}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3.5 align-middle">
                          {s.quantity != null ? (
                            <span className="font-extrabold text-neutral-900">
                              {s.quantity}
                              {s.unit ? ` ${s.unit}` : ''}
                            </span>
                          ) : (
                            <span className="text-neutral-400 text-xs">— không giới hạn</span>
                          )}
                        </td>
                        <td className="px-3 py-3.5 align-middle">
                          <span className="font-bold text-emerald-700">
                            {received + promised}
                          </span>
                          <span className="text-xs text-neutral-400"> lượt</span>
                        </td>
                        <td className="px-3 py-3.5 align-middle">
                          {received > 0 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold">
                              <span className="material-symbols-outlined text-[12px]">
                                check_circle
                              </span>
                              Đã nhận
                            </span>
                          ) : promised > 0 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-bold">
                              <span className="material-symbols-outlined text-[12px]">
                                hourglass_top
                              </span>
                              Đã hứa
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-500 text-[11px] font-bold">
                              Chưa có
                            </span>
                          )}
                        </td>
                        <td className="px-5 md:px-6 py-3.5 align-middle text-right">
                          <button
                            type="button"
                            disabled={!verified}
                            onClick={() =>
                              setDonateItem({ name: s.name, unit: s.unit ?? undefined })
                            }
                            className="cm-provider-donate-btn"
                            title={
                              verified
                                ? 'Đăng ký cung cấp nguyên liệu này'
                                : 'Cần duyệt hồ sơ NCC để đăng ký'
                            }
                          >
                            <span className="material-symbols-outlined text-[14px]">
                              add_task
                            </span>
                            Đăng ký cung cấp
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ─── Lịch sử hứa góp gần đây ─── */}
        {allDonations.length > 0 && (
          <section className="cm-provider-card !p-0 overflow-hidden">
            <header className="px-5 md:px-6 py-4 border-b border-neutral-100">
              <h3 className="font-extrabold text-base text-neutral-900 inline-flex items-center gap-2">
                <span className="material-symbols-outlined text-emerald-600">volunteer_activism</span>
                Các NCC đã đăng ký ({allDonations.length})
              </h3>
            </header>
            <ul className="divide-y divide-neutral-100">
              {allDonations.map((d) => (
                <li
                  key={d.id}
                  className="px-5 md:px-6 py-3 flex items-center gap-3"
                >
                  <div className="w-10 h-10 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[18px]">storefront</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-neutral-800 truncate">
                      {d.provider.businessName}
                    </p>
                    <p className="text-xs text-neutral-500 truncate">
                      {d.itemName}
                      {d.quantity ? ` · ${d.quantity}` : ''}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                      d.status === 'received'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-amber-50 text-amber-700 border-amber-200'
                    }`}
                  >
                    {d.status === 'received' ? 'Đã nhận' : 'Đã hứa'}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Back CTA */}
        <div className="flex items-center justify-center pt-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="text-sm font-bold text-neutral-500 hover:text-neutral-900 inline-flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
            Quay lại danh sách chiến dịch
          </button>
        </div>
      </div>

      {donateItem && (
        <DonateModal
          campaignId={c.id}
          item={donateItem}
          onClose={() => setDonateItem(null)}
        />
      )}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-[10px] font-extrabold uppercase tracking-wide text-neutral-400">
        {label}
      </dt>
      <dd className="text-[13px] font-semibold text-neutral-800">{value}</dd>
    </div>
  );
}

function MiniStat({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="cm-provider-card-stat">
      <span className="cm-provider-card-stat-icon">
        <span className="material-symbols-outlined text-[16px]">{icon}</span>
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-extrabold uppercase tracking-wide text-neutral-400">
          {label}
        </p>
        <p className="text-[13px] font-bold text-neutral-800 truncate">{value}</p>
      </div>
    </div>
  );
}

function iconForSupply(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('gạo') || lower.includes('cơm')) return 'rice_bowl';
  if (lower.includes('rau') || lower.includes('củ') || lower.includes('salad')) return 'eco';
  if (lower.includes('thịt') || lower.includes('cá') || lower.includes('hải sản')) return 'set_meal';
  if (lower.includes('trứng')) return 'egg';
  if (lower.includes('sữa')) return 'water_drop';
  if (lower.includes('bánh')) return 'bakery_dining';
  if (lower.includes('nước')) return 'local_drink';
  if (lower.includes('dầu') || lower.includes('gia vị') || lower.includes('muối')) return 'cooking_oil';
  return 'inventory_2';
}

// ─── Modal donate nguyên liệu ─────────────────────────────────────

function DonateModal({
  campaignId,
  item,
  onClose,
}: {
  campaignId: string;
  item: { name: string; unit?: string };
  onClose: () => void;
}) {
  const donate = usePledgeDonation();
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');

  async function submit() {
    if (!quantity.trim()) {
      toast.error('Nhập số lượng nguyên liệu bạn muốn cung cấp.');
      return;
    }
    try {
      await donate.mutateAsync({
        campaignId,
        itemName: item.name,
        quantity: quantity.trim(),
        note: note.trim() || undefined,
      });
      toast.success(`Đã gửi đăng ký "${item.name}" — ban tổ chức sẽ xác nhận.`);
      onClose();
    } catch (e) {
      toast.error(errMsg(e, 'Đăng ký thất bại'));
    }
  }

  return (
    <Modal
      onClose={onClose}
      align="center"
      className="bg-white rounded-3xl border border-neutral-150 w-full max-w-md elevation-3 overflow-hidden"
    >
      <div className="bg-brand-gradient px-6 py-5 text-white">
        <h3 className="font-extrabold text-lg flex items-center gap-2">
          <span className="material-symbols-outlined">add_task</span>
          Đăng ký cung cấp nguyên liệu
        </h3>
        <p className="text-xs text-white/80 mt-1">
          Hỗ trợ nguyên liệu cho chiến dịch — ghi rõ số lượng & lời nhắn.
        </p>
      </div>

      <div className="p-6 space-y-4">
        <div className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-white text-amber-600 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[20px]">
              {iconForSupply(item.name)}
            </span>
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-wide text-amber-700">
              Nguyên liệu
            </p>
            <p className="font-extrabold text-neutral-900 truncate">{item.name}</p>
          </div>
        </div>

        <label className="block space-y-1">
          <span className="text-xs font-bold text-neutral-600 uppercase tracking-wide">
            Số lượng dự kiến cung cấp <span className="text-rose-500">*</span>
          </span>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="VD: 10 kg, 5 thùng, 20 phần…"
              className="input-base flex-1"
            />
            {item.unit && (
              <span className="text-sm font-bold text-neutral-500 shrink-0">{item.unit}</span>
            )}
          </div>
        </label>

        <label className="block space-y-1">
          <span className="text-xs font-bold text-neutral-600 uppercase tracking-wide">
            Lời nhắn (tuỳ chọn)
          </span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={300}
            placeholder="Ghi chú thêm cho BTC — ví dụ: thời gian có thể giao, hình thức đóng gói…"
            className="input-base resize-none"
          />
        </label>

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 border border-neutral-200 text-neutral-700 hover:bg-neutral-50 font-bold text-sm rounded-xl"
          >
            Huỷ
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={donate.isPending}
            className="flex-1 py-3 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-sm rounded-xl disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
          >
            {donate.isPending ? (
              <>
                <span className="material-symbols-outlined text-[16px] animate-spin">
                  progress_activity
                </span>
                Đang gửi...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[16px]">send</span>
                Gửi đăng ký
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
