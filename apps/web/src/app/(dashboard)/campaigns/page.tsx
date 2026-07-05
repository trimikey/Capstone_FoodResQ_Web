'use client';

import { useState, useRef } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Modal } from '@/components/shared/Modal';
import { toast } from 'sonner';
import { reverseGeocode } from '@/lib/geocode';
import {
  useCampaigns,
  useApplyCampaign,
  useCreateCampaign,
  useMyTasks,
  useMyCampaigns,
  useStartCampaign,
  useCancelCampaign,
  useCompleteCampaign,
  useAdvanceTask,
  usePledgeDonation,
  useConfirmDonation,
  useCampaignChangeRequests,
  useSubmitCampaignChange,
  useCancelCampaignChange,
  useUploadCampaignImage,
  useCompletedCampaigns,
  type Campaign,
  type MyTask,
  type CampaignChangeRequest,
  type SubmitCampaignChangeInput,
  type CompletedCampaign,
} from '@/hooks/useCampaigns';
import { useMe } from '@/hooks/useProfile';
import { mediaUrl, errMsg } from '@/lib/utils';
import { useVolunteerMe } from '@/hooks/useDeliveries';
import { AssignmentRole, UserRole } from '@foodresq/types';


// Trạng thái chiến dịch (phía tổ chức xem yêu cầu của mình)
const CAMPAIGN_STATUS_META: Record<string, { label: string; badge: string }> = {
  draft: { label: 'Chờ duyệt', badge: 'badge-honey' },
  open: { label: 'Đang tuyển', badge: 'badge-sky' },
  in_progress: { label: 'Đang diễn ra', badge: 'badge-honey' },
  completed: { label: 'Hoàn tất', badge: 'badge-emerald' },
  cancelled: { label: 'Bị từ chối / huỷ', badge: 'badge-rose' },
};

const ROLE_LABEL: Record<string, string> = { chef: 'Đầu bếp', waiter: 'Phục vụ', shipper: 'Giao hàng' };

// Bản đồ chọn vị trí (Leaflet) — chỉ tải phía client
const LocationPicker = dynamic(() => import('@/components/map/LocationPicker'), {
  ssr: false,
  loading: () => <div className="w-full h-full flex items-center justify-center text-xs text-neutral-400">Đang tải bản đồ…</div>,
});

// Trạng thái yêu cầu thay đổi chiến dịch
const CHANGE_STATUS_META: Record<string, { label: string; badge: string }> = {
  pending: { label: 'Chờ duyệt', badge: 'badge-honey' },
  approved: { label: 'Đã duyệt', badge: 'badge-emerald' },
  rejected: { label: 'Bị từ chối', badge: 'badge-rose' },
  cancelled: { label: 'Đã huỷ', badge: 'badge-neutral' },
};

// Mỗi vai trò một sắc thái màu riêng để dễ phân biệt khi quét nhanh
const ROLE_META: Record<string, { label: string; icon: string; badge: string; bar: string; soft: string; text: string }> = {
  chef: { label: 'Đầu bếp', icon: 'skillet', badge: 'badge-honey', bar: 'bg-honey-400', soft: 'bg-honey-50', text: 'text-honey-700' },
  waiter: { label: 'Phục vụ', icon: 'room_service', badge: 'badge-sky', bar: 'bg-sky-400', soft: 'bg-sky-50', text: 'text-sky-700' },
  shipper: { label: 'Giao hàng', icon: 'local_shipping', badge: 'badge-emerald', bar: 'bg-emerald-500', soft: 'bg-emerald-50', text: 'text-emerald-700' },
};

const TASK_STATUS_META: Record<string, { label: string; badge: string }> = {
  pending: { label: 'Chờ duyệt', badge: 'badge-honey' },
  rejected: { label: 'Bị từ chối', badge: 'badge-rose' },
  assigned: { label: 'Đã nhận việc', badge: 'badge-sky' },
  checked_in: { label: 'Đã điểm danh', badge: 'badge-emerald' },
  in_progress: { label: 'Đang làm', badge: 'badge-honey' },
  completed: { label: 'Hoàn thành', badge: 'badge-emerald' },
  absent: { label: 'Vắng', badge: 'badge-rose' },
  cancelled: { label: 'Đã huỷ', badge: 'badge-neutral' },
};

export default function CampaignsPage() {
  const { data: me } = useMe();
  const isVolunteer = me?.role === UserRole.VOLUNTEER;
  const isProvider = me?.role === UserRole.PROVIDER;
  // Chỉ TỔ CHỨC TỪ THIỆN (receiver + isCharityOrg) mới tạo & quản lý chiến dịch
  const isCharity = me?.role === UserRole.RECEIVER && !!me?.receiver?.isCharityOrg;

  const { data, isLoading } = useCampaigns();
  const { data: vol } = useVolunteerMe(); // chỉ chạy khi là volunteer (endpoint role-guarded)
  const { data: myTasks } = useMyTasks(!!isVolunteer);
  const { data: myCampaigns } = useMyCampaigns(isCharity);
  const apply = useApplyCampaign();
  const create = useCreateCampaign();
  const [showForm, setShowForm] = useState(false);
  const [page, setPage] = useState(1);

  const campaigns = data ?? [];
  const PER_PAGE = 5;
  const totalPages = Math.max(1, Math.ceil(campaigns.length / PER_PAGE));
  const curPage = Math.min(page, totalPages);
  const pageCampaigns = campaigns.slice((curPage - 1) * PER_PAGE, curPage * PER_PAGE);
  // Vai trò TNV được phép ứng tuyển (theo chuyên môn đã đăng ký)
  const myRoles = (vol?.specializations ?? []).map((s) => s.specialization);

  async function handleApply(id: string, role: AssignmentRole) {
    try {
      await apply.mutateAsync({ id, role });
      toast.success(`Đã gửi đăng ký vai trò ${ROLE_LABEL[role]} — chờ quản trị viên duyệt`);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Đăng ký thất bại';
      toast.error(msg);
    }
  }

  return (
    <div className="min-h-screen bg-mesh-brand pb-24">
      <div className="max-w-4xl mx-auto px-6 md:px-12 py-10 space-y-7">
        {/* Hero header */}
        <div 
          className="relative overflow-hidden rounded-3xl elevation-brand p-7 md:p-9 text-white"
          style={{
            backgroundImage: `linear-gradient(to right, rgba(6, 78, 59, 0.95), rgba(6, 78, 59, 0.6)), url('/charity_bg.png')`,
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          }}
        >
          <span className="material-symbols-outlined absolute -right-6 -top-6 text-white/20 text-[180px] select-none pointer-events-none animate-floaty">soup_kitchen</span>
          <div className="relative flex flex-col sm:flex-row sm:items-end justify-between gap-5 z-10">
            <div>
              <span className="inline-flex items-center gap-1.5 bg-white/15 backdrop-blur px-3 py-1 rounded-full text-xs font-semibold mb-3">
                <span className="material-symbols-outlined text-[15px]">volunteer_activism</span> Hoạt động cộng đồng
              </span>
              <h1 className="font-headline-lg font-extrabold text-3xl md:text-4xl leading-tight">Bếp ăn cộng đồng</h1>
              <p className="text-sm text-white/80 mt-2 max-w-md">Cùng nấu &amp; trao bữa ăn ấm cho người cần. Mỗi suất ăn là một câu chuyện tử tế.</p>
            </div>
            {isCharity && (
              <button onClick={() => setShowForm(true)} className="squishy-button shrink-0 inline-flex items-center gap-2 px-5 py-3 bg-white text-emerald-800 rounded-2xl font-bold text-sm shadow-lg hover:bg-emerald-50 transition-colors">
                <span className="material-symbols-outlined text-[20px]">add</span> Gửi yêu cầu chiến dịch
              </button>
            )}
          </div>
          {/* Mini stats */}
          <div className="relative mt-6 flex flex-wrap gap-2.5">
            <HeroStat icon="campaign" value={campaigns.length} label="chiến dịch đang mở" />
            {isVolunteer && <HeroStat icon="assignment_turned_in" value={myTasks?.length ?? 0} label="việc của bạn" />}
          </div>
        </div>

        {/* Chiến dịch của tổ chức (gồm yêu cầu chờ duyệt) */}
        {isCharity && myCampaigns && myCampaigns.length > 0 && (
          <section className="space-y-3">
            <h2 className="font-extrabold text-lg text-neutral-900 flex items-center gap-2">
              <span className="material-symbols-outlined text-emerald-600">campaign</span> Chiến dịch của tôi
            </h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {myCampaigns.map((c) => <MyCampaignCard key={c.id} c={c} />)}
            </div>
          </section>
        )}

        {/* Việc của tôi (TNV đã đăng ký) — có quy trình làm việc */}
        {isVolunteer && myTasks && myTasks.length > 0 && (
          <section className="space-y-3">
            <h2 className="font-extrabold text-lg text-neutral-900 flex items-center gap-2">
              <span className="material-symbols-outlined text-emerald-600">assignment_ind</span> Việc của tôi
            </h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {myTasks.map((t) => <CampaignTaskCard key={t.id} t={t} />)}
            </div>
          </section>
        )}

        {(isVolunteer || isProvider) && (
          <h2 className="font-extrabold text-lg text-neutral-900 pt-1 flex items-center gap-2">
            <span className="material-symbols-outlined text-honey-500">local_fire_department</span>
            {isProvider ? 'Chiến dịch cần hỗ trợ nguyên liệu' : 'Chiến dịch đang tuyển'}
          </h2>
        )}

        {isLoading && (
          <div className="space-y-4">{[0, 1].map((i) => <div key={i} className="h-48 skeleton" />)}</div>
        )}

        {!isLoading && campaigns.length === 0 && (
          <div className="text-center py-16 bg-white rounded-3xl border border-dashed border-neutral-200 elevation-1">
            <div className="w-20 h-20 mx-auto rounded-full bg-brand-gradient-soft flex items-center justify-center">
              <span className="material-symbols-outlined text-emerald-600 text-[44px]">soup_kitchen</span>
            </div>
            <p className="font-bold text-neutral-700 mt-4">Chưa có chiến dịch nào đang mở</p>
            <p className="text-sm text-neutral-400 mt-1">Quay lại sau hoặc theo dõi thông báo để không bỏ lỡ.</p>
          </div>
        )}

        <div className="space-y-4">
          {pageCampaigns.map((c) => (
            <CampaignCard key={c.id} c={c} myRoles={isVolunteer ? myRoles : []} onApply={handleApply} applying={apply.isPending} isProvider={isProvider} />
          ))}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between gap-3 pt-2">
            <span className="text-xs text-neutral-500 font-medium">
              Hiển thị {(curPage - 1) * PER_PAGE + 1}–{Math.min(campaigns.length, curPage * PER_PAGE)} trên {campaigns.length}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={curPage <= 1}
                className="w-9 h-9 rounded-full bg-white border border-neutral-200 flex items-center justify-center text-neutral-600 hover:bg-neutral-50 disabled:opacity-30 transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">chevron_left</span>
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`w-9 h-9 rounded-full text-sm font-bold transition-colors ${
                    p === curPage ? 'bg-emerald-700 text-white' : 'bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                  }`}
                >
                  {p}
                </button>
              ))}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={curPage >= totalPages}
                className="w-9 h-9 rounded-full bg-white border border-neutral-200 flex items-center justify-center text-neutral-600 hover:bg-neutral-50 disabled:opacity-30 transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">chevron_right</span>
              </button>
            </div>
          </div>
        )}

        {/* Câu chuyện thành công — chiến dịch đã hoàn tất */}
        <CompletedCampaignsSection />
      </div>

      {showForm && <CreateCampaignModal onClose={() => setShowForm(false)} onSubmit={create.mutateAsync} pending={create.isPending} />}
    </div>
  );
}

function HeroStat({ icon, value, label }: { icon: string; value: number; label: string }) {
  return (
    <div className="inline-flex items-center gap-2.5 bg-white/12 backdrop-blur rounded-2xl pl-3 pr-4 py-2 border border-white/15">
      <span className="material-symbols-outlined text-[20px] text-honey-200">{icon}</span>
      <div className="leading-none">
        <span className="font-extrabold text-lg">{value}</span>
        <span className="text-[11px] text-white/70 ml-1.5">{label}</span>
      </div>
    </div>
  );
}

// ── Câu chuyện thành công: các chiến dịch đã hoàn tất (dạng post) ──
function CompletedCampaignsSection() {
  const { data } = useCompletedCampaigns();
  const items = data ?? [];
  if (items.length === 0) return null;
  return (
    <section className="space-y-3 pt-2">
      <h2 className="font-extrabold text-lg text-neutral-900 flex items-center gap-2">
        <span className="material-symbols-outlined text-amber-500">workspace_premium</span> Câu chuyện thành công
      </h2>
      <div className="grid sm:grid-cols-2 gap-4">
        {items.map((c) => <CompletedCampaignCard key={c.id} c={c} />)}
      </div>
    </section>
  );
}

function CompletedCampaignCard({ c }: { c: CompletedCampaign }) {
  return (
    <Link href={`/campaigns/${c.id}`}
      className="card-interactive bg-white border border-neutral-150 rounded-3xl overflow-hidden elevation-1 block group">
      <div className="relative h-36">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={c.imageUrls?.[0] ? mediaUrl(c.imageUrls[0]) : '/vn-pho.jpg'} alt={c.title}
          className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
        <span className="absolute top-3 left-3 inline-flex items-center gap-1 bg-amber-400/95 text-amber-950 px-2.5 py-1 rounded-full text-[11px] font-bold">
          <span className="material-symbols-outlined text-[13px]">verified</span> Đã hoàn thành
        </span>
        <h3 className="absolute bottom-3 left-3 right-3 font-extrabold text-white text-base leading-snug line-clamp-2">{c.title}</h3>
      </div>
      <div className="p-4">
        <p className="text-xs text-neutral-500 flex items-center gap-1">
          <span className="material-symbols-outlined text-[14px]">event</span>
          {new Date(c.scheduledDate).toLocaleDateString('vi-VN')}
          {c.organizationName ? ` · ${c.organizationName}` : ''}
        </p>
        <div className="flex flex-wrap gap-3 mt-2.5 text-xs">
          {(c.actualServings != null || c.peopleServed > 0) && (
            <span className="inline-flex items-center gap-1 font-bold text-emerald-700">
              <span className="material-symbols-outlined text-[15px]">restaurant</span>
              {c.actualServings ?? 0} suất
            </span>
          )}
          {c.peopleServed > 0 && (
            <span className="inline-flex items-center gap-1 font-bold text-sky-700">
              <span className="material-symbols-outlined text-[15px]">diversity_3</span>
              {c.peopleServed} người
            </span>
          )}
          <span className="inline-flex items-center gap-1 font-bold text-honey-700">
            <span className="material-symbols-outlined text-[15px]">volunteer_activism</span>
            {c.volunteers} TNV
          </span>
          {c.experienceCount > 0 && (
            <span className="inline-flex items-center gap-1 font-bold text-neutral-500">
              <span className="material-symbols-outlined text-[15px]">format_quote</span>
              {c.experienceCount} cảm nhận
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

// ── Thẻ chiến dịch của TỔ CHỨC: vòng đời (chờ duyệt → bắt đầu → kết thúc) ──
function MyCampaignCard({ c }: { c: Campaign }) {
  const start = useStartCampaign();
  const cancelCampaign = useCancelCampaign();
  const complete = useCompleteCampaign();
  const confirmDon = useConfirmDonation();
  const [servings, setServings] = useState('');
  const [finishing, setFinishing] = useState(false);
  const [showChange, setShowChange] = useState(false);
  const st = CAMPAIGN_STATUS_META[c.status] ?? { label: c.status, badge: 'badge-neutral' };

  // Đã qua ngày diễn ra (so theo lịch UTC, đồng bộ với backend daysUntil)
  const overdue = (() => {
    const [yy, mm, dd] = c.scheduledDate.slice(0, 10).split('-').map(Number);
    const now = new Date();
    return Date.UTC(yy, mm - 1, dd) < Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  })();

  async function doConfirm(donationId: string) {
    try { await confirmDon.mutateAsync(donationId); toast.success('Đã xác nhận nhận nguyên liệu'); }
    catch (e) { toast.error(errMsg(e, 'Xác nhận thất bại')); }
  }

  async function doStart() {
    try { await start.mutateAsync(c.id); toast.success('Đã bắt đầu chiến dịch'); }
    catch (e) { toast.error(errMsg(e, 'Không bắt đầu được')); }
  }
  async function doCancel() {
    if (!window.confirm('Huỷ chiến dịch quá hạn này? Hành động không thể hoàn tác.')) return;
    try { await cancelCampaign.mutateAsync(c.id); toast.success('Đã huỷ chiến dịch quá hạn'); }
    catch (e) { toast.error(errMsg(e, 'Huỷ thất bại')); }
  }
  async function doComplete() {
    const n = Number(servings);
    if (Number.isNaN(n) || n < 0) { toast.error('Nhập số suất ăn hợp lệ'); return; }
    try { await complete.mutateAsync({ id: c.id, actualServings: n }); toast.success('Đã kết thúc chiến dịch'); setFinishing(false); }
    catch (e) { toast.error(errMsg(e, 'Không kết thúc được')); }
  }

  return (
    <div className="card-interactive bg-white border border-neutral-150 rounded-2xl p-4 elevation-1">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="font-bold text-neutral-900 text-sm truncate">{c.title}</h3>
        <span className={`badge ${st.badge} shrink-0`}>{st.label}</span>
      </div>
      <p className="text-xs text-neutral-500 flex items-center gap-1">
        <span className="material-symbols-outlined text-[14px]">event</span>
        {new Date(c.scheduledDate).toLocaleDateString('vi-VN')} · {c.startTime}–{c.endTime}
      </p>
      <p className="text-xs text-neutral-500 truncate flex items-center gap-1 mt-0.5">
        <span className="material-symbols-outlined text-[14px]">place</span>{c.kitchenAddress}
      </p>

      <div className="flex items-center gap-3 mt-2">
        <button onClick={() => setShowChange(true)}
          className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:text-emerald-900 transition-colors">
          <span className="material-symbols-outlined text-[15px]">tune</span>
          Chi tiết &amp; yêu cầu thay đổi
        </button>
        <Link href={`/kitchen/${c.id}`}
          className="inline-flex items-center gap-1 text-[11px] font-bold text-honey-700 hover:text-honey-900 transition-colors">
          <span className="material-symbols-outlined text-[15px]">soup_kitchen</span>
          Quản lý bếp
        </Link>
      </div>

      {c.status === 'draft' && (
        <p className="text-[11px] text-honey-700 mt-2 flex items-center gap-1">
          <span className="material-symbols-outlined text-[14px]">hourglass_top</span> Đang chờ quản trị viên duyệt
        </p>
      )}
      {c.status === 'open' && (
        overdue ? (
          <div className="mt-3 space-y-2">
            <p className="text-[11px] text-rose-600 flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">event_busy</span> Đã quá ngày diễn ra mà chưa bắt đầu
            </p>
            <button onClick={doCancel} disabled={cancelCampaign.isPending}
              className="w-full py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold disabled:opacity-50 transition-colors">
              {cancelCampaign.isPending ? 'Đang huỷ...' : 'Huỷ chiến dịch quá hạn'}
            </button>
          </div>
        ) : (
          <button onClick={doStart} disabled={start.isPending}
            className="mt-3 w-full py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold disabled:opacity-50 transition-colors">
            {start.isPending ? 'Đang bắt đầu...' : 'Bắt đầu chiến dịch'}
          </button>
        )
      )}
      {c.status === 'in_progress' && (
        finishing ? (
          <div className="mt-3 flex items-center gap-2">
            <input type="number" min={0} value={servings} onChange={(e) => setServings(e.target.value)} placeholder="Số suất ăn"
              className="flex-1 input-base !py-1.5 text-xs" autoFocus />
            <button onClick={doComplete} disabled={complete.isPending} className="px-3 py-2 bg-emerald-700 text-white rounded-xl text-xs font-bold disabled:opacity-50">Xong</button>
            <button onClick={() => setFinishing(false)} className="px-2 py-2 text-neutral-400 text-xs">Huỷ</button>
          </div>
        ) : (
          <button onClick={() => setFinishing(true)}
            className="mt-3 w-full py-2 bg-honey-500 hover:bg-honey-600 text-white rounded-xl text-xs font-bold transition-colors">
            Kết thúc &amp; nhập số suất
          </button>
        )
      )}
      {c.status === 'completed' && c.actualServings != null && (
        <p className="text-[11px] text-emerald-700 mt-2 flex items-center gap-1 font-semibold">
          <span className="material-symbols-outlined text-[14px]">check_circle</span> Đã phục vụ {c.actualServings} suất
        </p>
      )}

      {/* Nguyên liệu được quyên góp — tổ chức xác nhận đã nhận */}
      {c.donations && c.donations.length > 0 && (
        <div className="border-t border-neutral-100 mt-3 pt-3 space-y-1.5">
          <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-wide flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">inventory_2</span> Nguyên liệu quyên góp ({c.donations.length})
          </p>
          {c.donations.map((d) => {
            const ds = DONATION_STATUS[d.status] ?? { label: d.status, cls: 'badge-neutral' };
            return (
              <div key={d.id} className="flex items-center gap-2 text-xs">
                <span className="font-semibold text-neutral-700 truncate">{d.quantity ? `${d.quantity} ` : ''}{d.itemName}</span>
                <span className="text-neutral-400 truncate">· {d.provider.businessName}</span>
                {d.status === 'pledged' ? (
                  <button onClick={() => doConfirm(d.id)} disabled={confirmDon.isPending}
                    className="ml-auto px-2.5 py-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded-full text-[10px] font-bold disabled:opacity-50 transition-colors shrink-0">
                    Đã nhận
                  </button>
                ) : (
                  <span className={`badge ${ds.cls} ml-auto shrink-0`}>{ds.label}</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showChange && <CampaignChangeModal c={c} onClose={() => setShowChange(false)} />}
    </div>
  );
}

// ── Modal: tổ chức xem chi tiết & gửi yêu cầu thay đổi (chờ admin duyệt) ──
function CampaignChangeModal({ c, onClose }: { c: Campaign; onClose: () => void }) {
  const { data: requests, isLoading } = useCampaignChangeRequests(c.id);
  const submit = useSubmitCampaignChange();
  const cancel = useCancelCampaignChange();

  const editable = c.status === 'open';
  const orig = {
    scheduledDate: c.scheduledDate.slice(0, 10),
    startTime: c.startTime.slice(0, 5),
    endTime: c.endTime.slice(0, 5),
    kitchenAddress: c.kitchenAddress,
    chefSlotsNeeded: c.chefSlotsNeeded,
    waiterSlotsNeeded: c.waiterSlotsNeeded,
    shipperSlotsNeeded: c.shipperSlotsNeeded,
  };
  const [f, setF] = useState(orig);
  const [reason, setReason] = useState('');

  const hasPending = (requests ?? []).some((r) => r.status === 'pending');

  // Số ngày còn lại tới ngày diễn ra (để hiển thị nhắc nhở quy tắc khoá sửa)
  const [yy, mm, dd] = c.scheduledDate.slice(0, 10).split('-').map(Number);
  const today = new Date();
  const daysLeft = Math.round(
    (Date.UTC(yy, mm - 1, dd) - Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())) / 86_400_000,
  );

  function diffInput(): SubmitCampaignChangeInput {
    const out: SubmitCampaignChangeInput = {};
    if (f.scheduledDate !== orig.scheduledDate) out.scheduledDate = f.scheduledDate;
    if (f.startTime !== orig.startTime) out.startTime = f.startTime;
    if (f.endTime !== orig.endTime) out.endTime = f.endTime;
    if (f.kitchenAddress.trim() !== orig.kitchenAddress) out.kitchenAddress = f.kitchenAddress.trim();
    if (Number(f.chefSlotsNeeded) !== orig.chefSlotsNeeded) out.chefSlotsNeeded = Number(f.chefSlotsNeeded);
    if (Number(f.waiterSlotsNeeded) !== orig.waiterSlotsNeeded) out.waiterSlotsNeeded = Number(f.waiterSlotsNeeded);
    if (Number(f.shipperSlotsNeeded) !== orig.shipperSlotsNeeded) out.shipperSlotsNeeded = Number(f.shipperSlotsNeeded);
    return out;
  }

  async function doSubmit(e: React.FormEvent) {
    e.preventDefault();
    const input = diffInput();
    if (Object.keys(input).length === 0) { toast.error('Bạn chưa thay đổi trường nào.'); return; }
    if (reason.trim()) input.reason = reason.trim();
    try {
      await submit.mutateAsync({ id: c.id, input });
      toast.success('Đã gửi yêu cầu thay đổi — chờ quản trị viên duyệt.');
      setReason('');
    } catch (err) {
      toast.error(errMsg(err, 'Gửi yêu cầu thất bại'));
    }
  }

  async function doCancel(id: string) {
    try { await cancel.mutateAsync(id); toast.success('Đã huỷ yêu cầu.'); }
    catch (err) { toast.error(errMsg(err, 'Huỷ thất bại')); }
  }

  return (
    <Modal onClose={onClose} align="top" className="bg-white rounded-3xl border border-neutral-150 w-full max-w-lg my-8 elevation-3 overflow-hidden">
        <div className="bg-brand-gradient px-6 py-5 text-white flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="material-symbols-outlined">tune</span>
            <div className="min-w-0">
              <h3 className="font-extrabold text-lg truncate">{c.title}</h3>
              <p className="text-xs text-white/80">Yêu cầu thay đổi · chờ admin duyệt</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white"><span className="material-symbols-outlined">close</span></button>
        </div>

        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          {!editable && (
            <div className="rounded-xl bg-neutral-50 border border-neutral-200 p-3 text-xs text-neutral-600 flex items-start gap-2">
              <span className="material-symbols-outlined text-[16px] text-neutral-400">info</span>
              Chỉ gửi được yêu cầu thay đổi khi chiến dịch đang ở trạng thái <b>&nbsp;Đang tuyển</b>. Trạng thái hiện tại: {CAMPAIGN_STATUS_META[c.status]?.label ?? c.status}.
            </div>
          )}

          {editable && (
            <form onSubmit={doSubmit} className="space-y-4">
              <div className="rounded-xl bg-honey-50 border border-honey-200 p-3 text-xs text-honey-800 flex items-start gap-2">
                <span className="material-symbols-outlined text-[16px]">schedule</span>
                Chỉ sửa được khi còn đủ số ngày tối thiểu tới ngày diễn ra. Còn <b>&nbsp;{daysLeft} ngày</b>.
              </div>

              <div className="grid grid-cols-3 gap-3">
                <label className="text-xs font-bold text-neutral-600 space-y-1 block">Ngày
                  <input type="date" value={f.scheduledDate} onChange={(e) => setF({ ...f, scheduledDate: e.target.value })} className="input-base" />
                </label>
                <label className="text-xs font-bold text-neutral-600 space-y-1 block">Bắt đầu
                  <input type="time" value={f.startTime} onChange={(e) => setF({ ...f, startTime: e.target.value })} className="input-base" />
                </label>
                <label className="text-xs font-bold text-neutral-600 space-y-1 block">Kết thúc
                  <input type="time" value={f.endTime} onChange={(e) => setF({ ...f, endTime: e.target.value })} className="input-base" />
                </label>
              </div>

              <label className="text-xs font-bold text-neutral-600 space-y-1 block">Địa chỉ bếp
                <input value={f.kitchenAddress} onChange={(e) => setF({ ...f, kitchenAddress: e.target.value })} className="input-base" minLength={5} />
              </label>

              <div className="grid grid-cols-3 gap-3">
                <label className="text-xs font-bold text-honey-700 space-y-1 block">Đầu bếp
                  <input type="number" min={c.chefSlotsFilled} value={f.chefSlotsNeeded} onChange={(e) => setF({ ...f, chefSlotsNeeded: Number(e.target.value) })} className="input-base" />
                </label>
                <label className="text-xs font-bold text-sky-700 space-y-1 block">Phục vụ
                  <input type="number" min={c.waiterSlotsFilled} value={f.waiterSlotsNeeded} onChange={(e) => setF({ ...f, waiterSlotsNeeded: Number(e.target.value) })} className="input-base" />
                </label>
                <label className="text-xs font-bold text-emerald-700 space-y-1 block">Giao hàng
                  <input type="number" min={c.shipperSlotsFilled} value={f.shipperSlotsNeeded} onChange={(e) => setF({ ...f, shipperSlotsNeeded: Number(e.target.value) })} className="input-base" />
                </label>
              </div>

              <label className="text-xs font-bold text-neutral-600 space-y-1 block">Lý do thay đổi (tuỳ chọn)
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={500} className="input-base" placeholder="VD: Đổi giờ vì bếp bận buổi sáng" />
              </label>

              <button type="submit" disabled={submit.isPending || hasPending}
                className="w-full py-3 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-sm rounded-xl disabled:opacity-50 transition-colors">
                {hasPending ? 'Đã có yêu cầu đang chờ duyệt' : submit.isPending ? 'Đang gửi...' : 'Gửi yêu cầu thay đổi'}
              </button>
            </form>
          )}

          {/* Lịch sử yêu cầu thay đổi */}
          <div className="border-t border-neutral-100 pt-4">
            <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-wide mb-2">Lịch sử yêu cầu</p>
            {isLoading && <div className="h-12 skeleton rounded-xl" />}
            {!isLoading && (requests ?? []).length === 0 && (
              <p className="text-xs text-neutral-400">Chưa có yêu cầu thay đổi nào.</p>
            )}
            <div className="space-y-2">
              {(requests ?? []).map((r) => <ChangeRequestRow key={r.id} r={r} onCancel={doCancel} cancelling={cancel.isPending} />)}
            </div>
          </div>
        </div>
    </Modal>
  );
}

function ChangeRequestRow({ r, onCancel, cancelling }: { r: CampaignChangeRequest; onCancel: (id: string) => void; cancelling: boolean }) {
  const st = CHANGE_STATUS_META[r.status] ?? { label: r.status, badge: 'badge-neutral' };
  const parts: string[] = [];
  if (r.scheduledDate) parts.push(`Ngày → ${new Date(r.scheduledDate).toLocaleDateString('vi-VN')}`);
  if (r.startTime || r.endTime) parts.push(`Giờ → ${r.startTime ?? '?'}–${r.endTime ?? '?'}`);
  if (r.kitchenAddress) parts.push(`Địa chỉ → ${r.kitchenAddress}`);
  if (r.chefSlotsNeeded != null) parts.push(`Đầu bếp → ${r.chefSlotsNeeded}`);
  if (r.waiterSlotsNeeded != null) parts.push(`Phục vụ → ${r.waiterSlotsNeeded}`);
  if (r.shipperSlotsNeeded != null) parts.push(`Giao hàng → ${r.shipperSlotsNeeded}`);

  return (
    <div className="rounded-xl border border-neutral-150 p-3 bg-neutral-50/50">
      <div className="flex items-center justify-between gap-2">
        <span className={`badge ${st.badge}`}>{st.label}</span>
        <span className="text-[10px] text-neutral-400">{new Date(r.createdAt).toLocaleString('vi-VN')}</span>
      </div>
      <ul className="mt-1.5 text-xs text-neutral-700 space-y-0.5">
        {parts.map((p, i) => <li key={i} className="flex items-center gap-1"><span className="material-symbols-outlined text-[13px] text-emerald-600">arrow_right</span>{p}</li>)}
      </ul>
      {r.reason && <p className="mt-1 text-[11px] text-neutral-500 italic">“{r.reason}”</p>}
      {r.reviewNote && <p className="mt-1 text-[11px] text-rose-600">Ghi chú admin: {r.reviewNote}</p>}
      {r.status === 'pending' && (
        <button onClick={() => onCancel(r.id)} disabled={cancelling}
          className="mt-2 text-[11px] font-bold text-rose-600 hover:text-rose-800 disabled:opacity-50">
          Huỷ yêu cầu
        </button>
      )}
    </div>
  );
}

// ── Thẻ công việc của TNV: quy trình điểm danh → làm → hoàn thành (+ ảnh) ──
const TASK_NEXT: Record<string, (role: string) => { label: string; needsPhoto: boolean } | null> = {
  assigned: () => ({ label: 'Điểm danh tại bếp', needsPhoto: false }),
  checked_in: (role) => ({ label: role === 'chef' ? 'Bắt đầu nấu (chụp nguyên liệu)' : 'Bắt đầu làm việc', needsPhoto: role === 'chef' }),
  in_progress: (role) => ({ label: role === 'shipper' ? 'Hoàn thành (ảnh đã giao)' : 'Hoàn thành (ảnh kết quả)', needsPhoto: true }),
};
const TASK_STEPS = [
  { key: 'assigned', label: 'Nhận việc' },
  { key: 'checked_in', label: 'Điểm danh' },
  { key: 'in_progress', label: 'Đang làm' },
  { key: 'completed', label: 'Hoàn thành' },
];

function CampaignTaskCard({ t }: { t: MyTask }) {
  const advance = useAdvanceTask();
  const fileRef = useRef<HTMLInputElement>(null);
  const rm = ROLE_META[t.role];
  const st = TASK_STATUS_META[t.status] ?? { label: t.status, badge: 'badge-neutral' };
  const stepIdx = TASK_STEPS.findIndex((s) => s.key === t.status);
  const next = TASK_NEXT[t.status]?.(t.role) ?? null;
  const campaignRunning = t.campaign.status === 'in_progress';

  async function go(photo?: File) {
    try {
      const res = await advance.mutateAsync({ assignmentId: t.id, photo });
      toast.success(res.pointsAwarded ? `Hoàn thành! +${res.pointsAwarded} điểm cống hiến 🎉` : 'Đã cập nhật bước');
    } catch (e) {
      toast.error(errMsg(e, 'Cập nhật thất bại'));
    }
  }
  function onClickAction() {
    if (!next) return;
    if (next.needsPhoto) fileRef.current?.click();
    else void go();
  }

  return (
    <div className="card-interactive bg-white border border-neutral-150 rounded-2xl p-4 elevation-1">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className={`badge ${rm?.badge ?? 'badge-neutral'}`}>
          <span className="material-symbols-outlined text-[14px]">{rm?.icon ?? 'work'}</span>{rm?.label ?? t.role}
        </span>
        <span className={`badge ${st.badge}`}>{st.label}</span>
      </div>
      <h3 className="font-bold text-neutral-900 text-sm truncate">{t.campaign.title}</h3>
      <p className="text-xs text-neutral-500 mt-1.5 flex items-center gap-1">
        <span className="material-symbols-outlined text-[14px]">event</span>
        {new Date(t.campaign.scheduledDate).toLocaleDateString('vi-VN')} · {t.campaign.startTime}–{t.campaign.endTime}
      </p>
      <p className="text-xs text-neutral-500 truncate flex items-center gap-1 mt-0.5">
        <span className="material-symbols-outlined text-[14px]">place</span>{t.campaign.kitchenAddress}
      </p>

      {(t.role === 'chef' || t.role === 'waiter') && (
        <Link href={`/kitchen/${t.campaign.id}`}
          className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-honey-700 hover:text-honey-900 transition-colors">
          <span className="material-symbols-outlined text-[15px]">soup_kitchen</span>
          {t.role === 'chef' ? 'Thực đơn & nhật ký ATTP' : 'Ghi phân phát suất ăn'}
        </Link>
      )}

      {/* Thanh tiến trình 4 bước */}
      <div className="flex items-center gap-1 mt-3">
        {TASK_STEPS.map((s, i) => (
          <div key={s.key} className={`flex-1 h-1.5 rounded-full ${i <= stepIdx ? 'bg-emerald-500' : 'bg-neutral-200'}`} title={s.label} />
        ))}
      </div>

      {/* Hành động kế tiếp */}
      {t.status === 'pending' ? (
        <p className="text-[11px] text-honey-700 mt-2 flex items-center gap-1 font-semibold">
          <span className="material-symbols-outlined text-[14px]">hourglass_top</span> Chờ quản trị viên duyệt đăng ký
        </p>
      ) : t.status === 'rejected' ? (
        <p className="text-[11px] text-rose-600 mt-2 flex items-center gap-1 font-semibold">
          <span className="material-symbols-outlined text-[14px]">cancel</span> Đăng ký chưa được duyệt
        </p>
      ) : t.status === 'completed' ? (
        <p className="text-[11px] text-emerald-700 mt-2 flex items-center gap-1 font-semibold">
          <span className="material-symbols-outlined text-[14px]">verified</span> Đã hoàn thành — cảm ơn bạn!
        </p>
      ) : !campaignRunning ? (
        <p className="text-[11px] text-neutral-400 mt-2 flex items-center gap-1">
          <span className="material-symbols-outlined text-[14px]">schedule</span> Chờ tổ chức bắt đầu chiến dịch
        </p>
      ) : next ? (
        <>
          <button onClick={onClickAction} disabled={advance.isPending}
            className="mt-2.5 w-full py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5">
            {next.needsPhoto && <span className="material-symbols-outlined text-[16px]">photo_camera</span>}
            {advance.isPending ? 'Đang xử lý...' : next.label}
          </button>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png" capture="environment" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void go(f); e.target.value = ''; }} />
        </>
      ) : null}
    </div>
  );
}

function Slot({ role, filled, needed, canApply, onApply, applying, overdue }: {
  role: AssignmentRole; filled: number; needed: number; canApply: boolean;
  onApply: (role: AssignmentRole) => void; applying: boolean; overdue?: boolean;
}) {
  if (needed <= 0) return null;
  const full = filled >= needed;
  const rm = ROLE_META[role];
  const pct = Math.min(100, Math.round((filled / needed) * 100));
  return (
    <div className={`rounded-2xl border border-neutral-150 p-3 ${rm.soft}`}>
      <div className="flex items-center gap-1.5">
        <span className={`material-symbols-outlined text-[18px] ${rm.text}`}>{rm.icon}</span>
        <span className="text-xs font-bold text-neutral-700">{rm.label}</span>
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="font-extrabold text-lg text-neutral-900">{filled}</span>
        <span className="text-xs text-neutral-400">/ {needed}</span>
      </div>
      {/* progress */}
      <div className="mt-1.5 h-1.5 rounded-full bg-white/70 overflow-hidden">
        <div className={`h-full rounded-full ${rm.bar} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      {canApply && (
        <button
          onClick={() => onApply(role)}
          disabled={full || applying || overdue}
          className="mt-2.5 w-full py-1.5 rounded-lg text-[11px] font-bold disabled:opacity-40 disabled:cursor-not-allowed bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
        >
          {overdue ? 'Hết hạn' : full ? 'Đã đủ' : 'Đăng ký'}
        </button>
      )}
    </div>
  );
}

// myRoles: vai trò TNV được phép ứng tuyển (rỗng = không phải TNV, không hiện nút)
const DONATION_STATUS: Record<string, { label: string; cls: string }> = {
  pledged: { label: 'Đã hứa góp', cls: 'badge-honey' },
  received: { label: 'Đã nhận', cls: 'badge-emerald' },
  cancelled: { label: 'Đã huỷ', cls: 'badge-neutral' },
};

function CampaignCard({ c, myRoles, onApply, applying, isProvider }: {
  c: Campaign; myRoles: string[]; onApply: (id: string, role: AssignmentRole) => void; applying: boolean; isProvider?: boolean;
}) {
  const pledge = usePledgeDonation();
  const [donating, setDonating] = useState(false);
  const [item, setItem] = useState('');
  const [qty, setQty] = useState('');
  const dateStr = new Date(c.scheduledDate).toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' });
  // Đã qua ngày diễn ra (so theo lịch UTC, đồng bộ với backend) → không còn nhận đăng ký
  const overdue = (() => {
    const [yy, mm, dd] = c.scheduledDate.slice(0, 10).split('-').map(Number);
    const now = new Date();
    return Date.UTC(yy, mm - 1, dd) < Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  })();

  async function doPledge() {
    if (item.trim().length < 1) { toast.error('Nhập tên nguyên liệu'); return; }
    try {
      await pledge.mutateAsync({ campaignId: c.id, itemName: item.trim(), quantity: qty.trim() || undefined });
      toast.success('Đã gửi quyên góp — chờ tổ chức xác nhận. Cảm ơn bạn!');
      setItem(''); setQty(''); setDonating(false);
    } catch (e) { toast.error(errMsg(e, 'Quyên góp thất bại')); }
  }
  return (
    <div className="card-interactive bg-white border border-neutral-150 rounded-3xl overflow-hidden elevation-1">
      {/* Colored header strip */}
      <div className="bg-brand-gradient-soft px-5 pt-5 pb-4 border-b border-emerald-100/60">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-extrabold text-neutral-900 text-lg leading-snug">{c.title}</h3>
            <p className="text-xs text-neutral-500 mt-1.5 flex items-center gap-1">
              <span className="material-symbols-outlined text-[15px] text-emerald-600">place</span>{c.kitchenAddress}
            </p>
          </div>
          <div className="shrink-0 text-center bg-white rounded-2xl px-3 py-2 border border-emerald-100 elevation-1">
            <p className="text-[10px] font-bold text-emerald-600 uppercase">{dateStr}</p>
            <p className="text-xs font-extrabold text-neutral-800 mt-0.5">{c.startTime}–{c.endTime}</p>
          </div>
        </div>
        {c.description && <p className="text-sm text-neutral-600 mt-3 line-clamp-2">{c.description}</p>}
        <Link href={`/campaigns/${c.id}`}
          className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-emerald-700 hover:text-emerald-900 transition-colors">
          <span className="material-symbols-outlined text-[15px]">open_in_new</span> Xem chi tiết chiến dịch
        </Link>
      </div>

      <div className="p-5 space-y-3">
        <div className="grid grid-cols-3 gap-2.5">
          <Slot role={AssignmentRole.CHEF} filled={c.chefSlotsFilled} needed={c.chefSlotsNeeded} canApply={myRoles.includes('chef')} onApply={(r) => onApply(c.id, r)} applying={applying} overdue={overdue} />
          <Slot role={AssignmentRole.WAITER} filled={c.waiterSlotsFilled} needed={c.waiterSlotsNeeded} canApply={myRoles.includes('waiter')} onApply={(r) => onApply(c.id, r)} applying={applying} overdue={overdue} />
          <Slot role={AssignmentRole.SHIPPER} filled={c.shipperSlotsFilled} needed={c.shipperSlotsNeeded} canApply={myRoles.includes('shipper')} onApply={(r) => onApply(c.id, r)} applying={applying} overdue={overdue} />
        </div>
        {overdue && (
          <p className="text-[11px] text-rose-600 flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">event_busy</span>
            Đã qua ngày diễn ra — chiến dịch không còn nhận đăng ký.
          </p>
        )}
        {!overdue && myRoles.length === 0 && (
          <p className="text-[11px] text-neutral-400 flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">info</span>
            Chỉ tình nguyện viên mới đăng ký được — theo đúng chuyên môn của mình.
          </p>
        )}

        {/* Tình nguyện viên đã tham gia (chỉ người đã được duyệt) */}
        {(() => {
          const approved = (c.assignments ?? []).filter((a) => !['pending', 'rejected', 'cancelled'].includes(a.status));
          if (approved.length === 0) return null;
          return (
          <div className="border-t border-neutral-100 pt-3">
            <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-wide mb-2">
              Đã tham gia ({approved.length})
            </p>
            <div className="flex flex-wrap gap-1.5">
              {approved.map((a) => {
                const rm = ROLE_META[a.role];
                return (
                  <span key={a.id} className="inline-flex items-center gap-1.5 bg-neutral-50 border border-neutral-150 rounded-full pl-1 pr-2.5 py-0.5">
                    <span className={`w-5 h-5 rounded-full ${rm?.soft ?? 'bg-neutral-100'} flex items-center justify-center text-[9px] font-bold ${rm?.text ?? 'text-neutral-700'}`}>
                      {a.volunteer.user.fullName.charAt(0).toUpperCase()}
                    </span>
                    <span className="text-[11px] font-semibold text-neutral-700">{a.volunteer.user.fullName}</span>
                    <span className={`text-[10px] font-bold ${rm?.text ?? 'text-neutral-500'}`}>· {ROLE_LABEL[a.role]}</span>
                  </span>
                );
              })}
            </div>
          </div>
          );
        })()}

        {/* Nguyên liệu được quyên góp */}
        {c.donations && c.donations.length > 0 && (
          <div className="border-t border-neutral-100 pt-3">
            <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-wide mb-2 flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">inventory_2</span> Nguyên liệu quyên góp ({c.donations.length})
            </p>
            <div className="space-y-1.5">
              {c.donations.map((d) => {
                const ds = DONATION_STATUS[d.status] ?? { label: d.status, cls: 'badge-neutral' };
                return (
                  <div key={d.id} className="flex items-center gap-2 text-xs">
                    <span className="material-symbols-outlined text-[15px] text-emerald-600">volunteer_activism</span>
                    <span className="font-semibold text-neutral-700">{d.quantity ? `${d.quantity} ` : ''}{d.itemName}</span>
                    <span className="text-neutral-400">· {d.provider.businessName}</span>
                    <span className={`badge ${ds.cls} ml-auto`}>{ds.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Provider: quyên góp nguyên liệu */}
        {isProvider && (
          <div className="border-t border-neutral-100 pt-3">
            {donating ? (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input value={item} onChange={(e) => setItem(e.target.value)} placeholder="Nguyên liệu (vd: Gạo)" className="input-base !py-2 text-sm flex-1" autoFocus />
                  <input value={qty} onChange={(e) => setQty(e.target.value)} placeholder="20 kg" className="input-base !py-2 text-sm w-24" />
                </div>
                <div className="flex gap-2">
                  <button onClick={doPledge} disabled={pledge.isPending} className="flex-1 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold disabled:opacity-50 transition-colors">
                    {pledge.isPending ? 'Đang gửi...' : 'Gửi quyên góp'}
                  </button>
                  <button onClick={() => setDonating(false)} className="px-3 py-2 text-neutral-400 text-xs">Huỷ</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setDonating(true)} className="w-full py-2 border border-emerald-200 text-emerald-700 hover:bg-emerald-50 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5">
                <span className="material-symbols-outlined text-[16px]">add</span> Quyên góp nguyên liệu
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function CreateCampaignModal({ onClose, onSubmit, pending }: {
  onClose: () => void;
  onSubmit: (input: import('@/hooks/useCampaigns').CreateCampaignInput) => Promise<unknown>;
  pending: boolean;
}) {
  const [f, setF] = useState({
    title: '', description: '', kitchenAddress: '',
    scheduledDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    startTime: '08:00', endTime: '12:00',
    chefSlotsNeeded: 2, waiterSlotsNeeded: 3, shipperSlotsNeeded: 2, expectedServings: 100,
    lng: 106.6297, lat: 10.8231, // mặc định tâm HCM, người dùng chọn lại trên bản đồ
  });
  const [geocoding, setGeocoding] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  // Bấm/kéo ghim trên bản đồ → lưu toạ độ thật & tự điền địa chỉ khớp điểm vừa chọn
  async function onMapPick(lng: number, lat: number) {
    setF((prev) => ({ ...prev, lng, lat }));
    setGeocoding(true);
    const address = await reverseGeocode(lat, lng);
    setGeocoding(false);
    setF((prev) => ({ ...prev, kitchenAddress: address ?? `${lat.toFixed(6)}, ${lng.toFixed(6)}` }));
  }
  const upload = useUploadCampaignImage();
  const imgInputRef = useRef<HTMLInputElement>(null);
  const [menu, setMenu] = useState<{ name: string; type: string }[]>([]);
  const [schedule, setSchedule] = useState<{ time: string; label: string }[]>([]);
  const [supplies, setSupplies] = useState<string[]>([]);

  async function onPickImage(file: File) {
    try {
      const res = await upload.mutateAsync(file);
      setImageUrl(res.url);
    } catch (err) {
      toast.error(errMsg(err, 'Tải ảnh thất bại'));
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (f.title.trim().length < 5) { toast.error('Tiêu đề tối thiểu 5 ký tự'); return; }
    try {
      await onSubmit({
        ...f,
        imageUrls: imageUrl ? [imageUrl] : undefined,
        menuItems: menu.filter((m) => m.name.trim()).map((m) => ({ name: m.name.trim(), type: m.type.trim() })),
        scheduleItems: schedule.filter((s) => s.label.trim()).map((s) => ({ time: s.time.trim(), label: s.label.trim() })),
        supplyItems: supplies.map((s) => s.trim()).filter(Boolean),
      });
      toast.success('Đã gửi yêu cầu. Chiến dịch sẽ hiển thị sau khi quản trị viên duyệt.');
      onClose();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Tạo thất bại';
      toast.error(msg);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/55 backdrop-blur-sm z-50 flex items-start justify-center p-4 overflow-y-auto animate-fade-in-up">
      <form onSubmit={submit} className="bg-white rounded-3xl border border-neutral-150 w-full max-w-4xl my-8 elevation-3 overflow-hidden">
        <div className="bg-brand-gradient px-6 py-5 text-white flex items-center gap-3">
          <span className="material-symbols-outlined">soup_kitchen</span>
          <div>
            <h3 className="font-extrabold text-lg">Gửi yêu cầu chiến dịch</h3>
            <p className="text-xs text-white/80">Quản trị viên sẽ duyệt trước khi mở</p>
          </div>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
          {/* ── Cột trái: thông tin & vị trí ── */}
          <div className="space-y-4">
          <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Tiêu đề *" className="input-base" required minLength={5} />
          <textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Mô tả" rows={2} className="input-base" />
          <input value={f.kitchenAddress} onChange={(e) => setF({ ...f, kitchenAddress: e.target.value })} placeholder="Địa chỉ bếp *" className="input-base" required minLength={5} />

          {/* Chọn vị trí bếp trên bản đồ — tự điền địa chỉ theo điểm đã chọn */}
          <div className="space-y-1">
            <p className="text-xs font-bold text-neutral-500 flex items-center gap-1">
              <span className="material-symbols-outlined text-[15px] text-emerald-600">location_on</span>
              Chọn vị trí bếp trên bản đồ (bấm hoặc kéo ghim)
            </p>
            <div className="h-56 rounded-xl overflow-hidden border border-neutral-200">
              <LocationPicker lng={f.lng} lat={f.lat} onPick={onMapPick} />
            </div>
            <p className="text-[11px] text-neutral-400">
              {geocoding ? 'Đang lấy địa chỉ…' : `Toạ độ: ${f.lat.toFixed(5)}, ${f.lng.toFixed(5)}`}
            </p>
          </div>

          {/* Ảnh chiến dịch */}
          <div>
            <input ref={imgInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
              onChange={(e) => { const file = e.target.files?.[0]; if (file) void onPickImage(file); e.target.value = ''; }} />
            {imageUrl ? (
              <div className="relative rounded-xl overflow-hidden border border-neutral-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={mediaUrl(imageUrl)} alt="Ảnh chiến dịch" className="w-full h-40 object-cover" />
                <button type="button" onClick={() => setImageUrl(null)}
                  className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/55 text-white flex items-center justify-center hover:bg-black/75">
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => imgInputRef.current?.click()} disabled={upload.isPending}
                className="w-full py-6 border-2 border-dashed border-neutral-200 rounded-xl text-neutral-500 hover:border-emerald-400 hover:text-emerald-700 transition-colors flex flex-col items-center gap-1 disabled:opacity-50">
                <span className="material-symbols-outlined">{upload.isPending ? 'hourglass_top' : 'add_photo_alternate'}</span>
                <span className="text-xs font-bold">{upload.isPending ? 'Đang tải ảnh...' : 'Thêm ảnh chiến dịch'}</span>
              </button>
            )}
          </div>
          </div>

          {/* ── Cột phải: thời gian, nhân lực, thực đơn, lịch trình, vật phẩm ── */}
          <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <input type="date" value={f.scheduledDate} onChange={(e) => setF({ ...f, scheduledDate: e.target.value })} className="input-base" required />
            <input type="time" value={f.startTime} onChange={(e) => setF({ ...f, startTime: e.target.value })} className="input-base" required />
            <input type="time" value={f.endTime} onChange={(e) => setF({ ...f, endTime: e.target.value })} className="input-base" required />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <label className="text-xs font-bold text-honey-700 space-y-1 block">Đầu bếp<input type="number" min={0} value={f.chefSlotsNeeded} onChange={(e) => setF({ ...f, chefSlotsNeeded: Number(e.target.value) })} className="input-base" /></label>
            <label className="text-xs font-bold text-sky-700 space-y-1 block">Phục vụ<input type="number" min={0} value={f.waiterSlotsNeeded} onChange={(e) => setF({ ...f, waiterSlotsNeeded: Number(e.target.value) })} className="input-base" /></label>
            <label className="text-xs font-bold text-emerald-700 space-y-1 block">Giao hàng<input type="number" min={0} value={f.shipperSlotsNeeded} onChange={(e) => setF({ ...f, shipperSlotsNeeded: Number(e.target.value) })} className="input-base" /></label>
          </div>
          {/* Thực đơn trong ngày */}
          <div className="border-t border-neutral-100 pt-3 space-y-2">
            <p className="text-xs font-bold text-neutral-500 flex items-center gap-1"><span className="material-symbols-outlined text-[15px]">restaurant_menu</span> Thực đơn trong ngày</p>
            {menu.map((m, i) => (
              <div key={i} className="flex gap-2">
                <input value={m.name} onChange={(e) => setMenu(menu.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} placeholder="Tên món (vd: Cơm thịt kho)" className="input-base !py-2 text-sm flex-1" />
                <input value={m.type} onChange={(e) => setMenu(menu.map((x, j) => j === i ? { ...x, type: e.target.value } : x))} placeholder="Loại (Món chính...)" className="input-base !py-2 text-sm w-32" />
                <button type="button" onClick={() => setMenu(menu.filter((_, j) => j !== i))} className="px-2 text-neutral-400 hover:text-rose-500"><span className="material-symbols-outlined text-[18px]">close</span></button>
              </div>
            ))}
            <button type="button" onClick={() => setMenu([...menu, { name: '', type: '' }])} className="text-xs font-bold text-emerald-700 inline-flex items-center gap-1"><span className="material-symbols-outlined text-[15px]">add</span> Thêm món</button>
          </div>

          {/* Lịch trình hoạt động */}
          <div className="border-t border-neutral-100 pt-3 space-y-2">
            <p className="text-xs font-bold text-neutral-500 flex items-center gap-1"><span className="material-symbols-outlined text-[15px]">schedule</span> Lịch trình hoạt động</p>
            {schedule.map((s, i) => (
              <div key={i} className="flex gap-2">
                <input value={s.time} onChange={(e) => setSchedule(schedule.map((x, j) => j === i ? { ...x, time: e.target.value } : x))} placeholder="06:00 - 08:00" className="input-base !py-2 text-sm w-32" />
                <input value={s.label} onChange={(e) => setSchedule(schedule.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} placeholder="Mô tả công việc" className="input-base !py-2 text-sm flex-1" />
                <button type="button" onClick={() => setSchedule(schedule.filter((_, j) => j !== i))} className="px-2 text-neutral-400 hover:text-rose-500"><span className="material-symbols-outlined text-[18px]">close</span></button>
              </div>
            ))}
            <button type="button" onClick={() => setSchedule([...schedule, { time: '', label: '' }])} className="text-xs font-bold text-emerald-700 inline-flex items-center gap-1"><span className="material-symbols-outlined text-[15px]">add</span> Thêm mốc</button>
          </div>

          {/* Vật phẩm cần thiết */}
          <div className="border-t border-neutral-100 pt-3 space-y-2">
            <p className="text-xs font-bold text-neutral-500 flex items-center gap-1"><span className="material-symbols-outlined text-[15px]">inventory_2</span> Vật phẩm cần thiết</p>
            {supplies.map((s, i) => (
              <div key={i} className="flex gap-2">
                <input value={s} onChange={(e) => setSupplies(supplies.map((x, j) => j === i ? e.target.value : x))} placeholder="vd: Gạo sạch" className="input-base !py-2 text-sm flex-1" />
                <button type="button" onClick={() => setSupplies(supplies.filter((_, j) => j !== i))} className="px-2 text-neutral-400 hover:text-rose-500"><span className="material-symbols-outlined text-[18px]">close</span></button>
              </div>
            ))}
            <button type="button" onClick={() => setSupplies([...supplies, ''])} className="text-xs font-bold text-emerald-700 inline-flex items-center gap-1"><span className="material-symbols-outlined text-[15px]">add</span> Thêm vật phẩm</button>
          </div>
          </div>
          </div>

          <div className="flex gap-3 pt-5 mt-4 border-t border-neutral-100">
            <button type="button" onClick={onClose} className="flex-1 py-3 border border-neutral-200 text-neutral-700 font-bold text-sm rounded-xl hover:bg-neutral-50 transition-colors">Huỷ</button>
            <button type="submit" disabled={pending} className="flex-1 py-3 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-sm rounded-xl disabled:opacity-50 transition-colors">{pending ? 'Đang gửi...' : 'Gửi yêu cầu'}</button>
          </div>
        </div>
      </form>
    </div>
  );
}
