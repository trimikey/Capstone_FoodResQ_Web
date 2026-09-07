'use client';

import './campaign-tokens.css';

import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { UserRole } from '@foodresq/types';
import { toast } from 'sonner';
import {
  useCampaigns,
  useCreateCampaign,
  useMyTasks,
  useMyCampaigns,
  useCampaignStats,
  useMyCampaignStats,
  useCampaignCreateConstraints,
  type Campaign,
  type MyTask,
} from '@/hooks/useCampaigns';
import { useVolunteerMe } from '@/hooks/useDeliveries';
import { useMe } from '@/hooks/useProfile';
import { useProviders } from '@/hooks/useProviders';
import CampaignCard from './_components/CampaignCard';
import CampaignTaskCard from './_components/CampaignTaskCard';
import DonationDetailModal from './_components/DonationDetailModal';
import MyCampaignCard from './_components/MyCampaignCard';
import CompletedCampaignsSection from './_components/CompletedCampaignsSection';
import CreateCampaignModal from './_components/CreateCampaignModal';
import CharityOverviewCharts from '@/components/campaigns/CharityOverviewCharts';
import SuppliersSection from './_components/SuppliersSection';
import ProviderSection from './_components/ProviderSection';
import EmbeddedTab from './_components/EmbeddedPage';
import IntakeHistorySection from './_components/IntakeHistorySection';
import ShiftInvitesSection from './_components/ShiftInvitesSection';
import type { Section } from './_components/CharitySidebar';
import { useAuthStore } from '@/stores/auth.store';
import Pagination from '@/components/shared/Pagination';

const ROLE_LABEL: Record<string, string> = {
  chef: 'Đầu bếp',
  waiter: 'Phục vụ',
  shipper: 'Giao hàng',
};

const STATUS_META: Record<string, { label: string; icon: string }> = {
  all: { label: 'Tất cả', icon: 'apps' },
  approved: { label: 'Đang tuyển', icon: 'campaign' },
  in_progress: { label: 'Đang diễn ra', icon: 'play_circle' },
  completed: { label: 'Đã hoàn tất', icon: 'verified' },
};

// Bọc ngoài để tuân thủ Next.js: component dùng useSearchParams phải nằm trong <Suspense>
// — tránh page bị deopt sang CSR-only và tránh lỗi "Invalid hook call" khi re-mount
// sau khi user switch tab browser rồi quay lại.
export default function CampaignsPage() {
  return (
    <Suspense fallback={<CampaignsSkeleton />}>
      <CampaignsPageInner />
    </Suspense>
  );
}

function CampaignsSkeleton() {
  // Sidebar do (dashboard)/campaigns/layout.tsx render ngoài Suspense boundary,
  // nên skeleton này chỉ cần mô phỏng main content — không giả lập sidebar nữa.
  return (
    <div className="cm-page cm-scope">
      <div className="cm-console">
        <main className="cm-content min-w-0 space-y-4">
          <div className="h-10 w-full max-w-xl skeleton rounded-2xl" />
          <div className="h-32 w-full skeleton rounded-2xl" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-24 skeleton rounded-2xl" />
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}

function CampaignsPageInner() {
  const { data: me } = useMe();
  const isVolunteer = me?.role === UserRole.VOLUNTEER;
  const isProvider = me?.role === UserRole.PROVIDER;
  const isCharity = me?.role === UserRole.RECEIVER && !!me?.receiver?.isCharityOrg;
  // Tài khoản chưa được admin duyệt (pending / banned) → chặn mọi thao tác,
  // chỉ cho xem trang tổng quan (đọc) chứ không cho đăng ký / tạo chiến dịch.
  const isAccountActive = me?.status === 'active';

  const router = useRouter();

  const { data, isLoading } = useCampaigns();
  const globalStats = useCampaignStats();
  const myStats = useMyCampaignStats(isCharity);
  const { data: vol } = useVolunteerMe(isVolunteer);
  const { data: myTasks } = useMyTasks(!!isVolunteer);
  const { data: myCampaigns } = useMyCampaigns(isCharity);
  // Admin bật "Cho phép bắt đầu/điểm danh sớm" thì tổ chức được bấm Bắt đầu trước
  // giờ vận hành — card phải biết cấu hình này mới hiện đúng nút.
  const { data: campaignConstraints } = useCampaignCreateConstraints(isCharity);
  // Đăng ký ca chỉ thực hiện ở TRANG CHI TIẾT chiến dịch (nơi chọn được ca + ngày trực).
  const create = useCreateCampaign();

  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<string>('all');

  // Sidebar giờ do (dashboard)/campaigns/layout.tsx render (pattern /provider).
  // Khi user bấm "Tạo chiến dịch" trên sidebar → layout dispatch custom event,
  // page lắng nghe và mở CreateCampaignModal tương ứng.
  // Tài khoản tổ chức chưa được admin duyệt thì không mở form tạo chiến dịch —
  // BE cũng đã chặn (ActiveAccountGuard), đây là lớp chặn sớm cho UX.
  const openCreateForm = useCallback(() => {
    if (!isAccountActive) {
      toast.error('Tài khoản của bạn đang chờ quản trị viên duyệt — chưa thể tạo chiến dịch.');
      return;
    }
    setShowForm(true);
  }, [isAccountActive]);

  useEffect(() => {
    window.addEventListener('campaigns:open-create', openCreateForm);
    return () => window.removeEventListener('campaigns:open-create', openCreateForm);
  }, [openCreateForm]);

  // Đọc tab hiện tại từ query string ?tab=orders|history; mặc định overview.
  // Dùng URL param làm source of truth — tránh re-render lặp khi switch tab browser.
  const searchParams = useSearchParams();
  const section: Section = (() => {
    const t = searchParams?.get('tab');
    if (
      t === 'orders' ||
      t === 'history' ||
      t === 'overview' ||
      t === 'mine' ||
      t === 'tasks' ||
      t === 'schedule' ||
      t === 'browse' ||
      t === 'suppliers' ||
      t === 'providers'
    ) {
      return t;
    }
    return 'overview';
  })();

  // Handler cho sidebar/button click → cập nhật state + URL
  const handleSetSection = (key: Section) => {
    const current = new URLSearchParams(Array.from(searchParams?.entries() ?? []));
    if (key === 'overview') current.delete('tab');
    else current.set('tab', key);
    const qs = current.toString();
    router.replace(qs ? `/campaigns?${qs}` : '/campaigns');
  };

  const myRoles = (vol?.specializations ?? []).map((s: { specialization: string }) => s.specialization);

  const allCampaigns = useMemo(() => data ?? [], [data]);

  // Ô tìm kiếm nằm ở thanh trên của MỌI tab nên phải tìm trên cả chiến dịch công khai
  // lẫn chiến dịch của chính tổ chức (bản nháp/đã kết thúc không nằm trong danh sách
  // công khai — trước đây gõ tên chúng thì không ra kết quả nào).
  const searchPool = useMemo(() => {
    const byId = new Map(allCampaigns.map((c) => [c.id, c]));
    for (const c of myCampaigns ?? []) byId.set(c.id, c);
    return [...byId.values()];
  }, [allCampaigns, myCampaigns]);

  const searching = search.trim().length > 0;

  const filteredCampaigns = useMemo(() => {
    return (searching ? searchPool : allCampaigns).filter((c) => {
      if (filter !== 'all' && c.status !== filter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        if (
          !c.title.toLowerCase().includes(q) &&
          !c.kitchenAddress.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [allCampaigns, searchPool, searching, filter, search]);

  // === Aggregate stats for greeting / KPI ===
  const stats = useMemo(() => {
    const my = myCampaigns ?? [];
    const active = my.filter((c) => c.status === 'approved' || c.status === 'in_progress');
    const drafts = my.filter((c) => c.status === 'pending_approval');
    const finished = my.filter((c) => c.status === 'completed' || c.status === 'cancelled');
    const pendingApprovals = my.reduce((sum, c) => {
      const pending = (c.assignments ?? []).filter((a) => a.status === 'pending').length;
      return sum + pending;
    }, 0);
    const totalVolunteers = my.reduce(
      (sum, c) => sum + (c.assignments ?? []).filter((a) => a.status !== 'pending' && a.status !== 'rejected' && a.status !== 'cancelled').length,
      0,
    );
    return { active, drafts, finished, pendingApprovals, totalVolunteers, all: my };
  }, [myCampaigns]);

  // === Rail navigation: workflow-only (NO stories in main nav) ===
  const railEntries = useMemo(() => {
    const entries: Array<{ key: Section; label: string; icon: string; badge?: string | number }> = [
      { key: 'overview', label: 'Tổng quan', icon: 'dashboard' },
    ];
    if (isCharity) {
      const mineBadge =
        stats.active.length + stats.drafts.length + stats.finished.length || undefined;
      entries.push(
        { key: 'mine', label: 'Chiến dịch của tôi', icon: 'inventory_2', badge: mineBadge },
        { key: 'suppliers', label: 'Nhà cung cấp', icon: 'storefront' },
        { key: 'orders', label: 'Đơn nhận', icon: 'bookmark' },
        { key: 'history', label: 'Lịch sử đơn', icon: 'history' },
      );
    }
    if (isVolunteer) {
      entries.push({
        key: 'tasks',
        label: 'Việc của tôi',
        icon: 'assignment_ind',
        badge: myTasks?.length || undefined,
      });
    }
    if (isProvider) {
      entries.push({ key: 'providers', label: 'Nhà cung cấp', icon: 'storefront' });
    }
    entries.push({ key: 'browse', label: 'Khám phá cộng đồng', icon: 'travel_explore' });
    return entries;
  }, [isCharity, isProvider, isVolunteer, stats, myTasks]);

  const greetingName = me?.receiver?.organizationName ?? me?.fullName?.split(' ')[0] ?? 'bạn';
  const greetingSubtitle = isCharity
    ? 'Quản lý chiến dịch, duyệt tình nguyện viên, theo dõi tiến độ.'
    : isVolunteer
      ? 'Các chiến dịch đang tuyển & công việc bạn đang tham gia.'
      : isProvider
        ? 'Các chiến dịch cần hỗ trợ nguyên liệu.'
        : 'Khám phá các chiến dịch thiện nguyện trên FoodResQ.';

  return (
    <div className="cm-page cm-scope">
      <div className="cm-console">
        {/* Sidebar được render bởi (dashboard)/campaigns/layout.tsx
            (pattern giống /provider: fixed + lg:ml-56 main wrapper).
            Page này chỉ render main content. */}
        <main className="cm-content min-w-0 space-y-6">
          {/* Top bar: search + role */}
          <div className="cm-topbar">
            <label className="cm-topbar-search">
              <span className="material-symbols-outlined text-[18px]">search</span>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm chiến dịch theo tên hoặc địa chỉ…"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  aria-label="Xoá tìm kiếm"
                  className="text-neutral-400 hover:text-neutral-700"
                >
                  <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
              )}
            </label>
          </div>

          {/* Đang gõ tìm kiếm → hiện KẾT QUẢ, bất kể đang ở tab nào.
              Trước đây ô tìm kiếm nằm ở mọi tab nhưng chỉ tab "Khám phá" dùng tới
              filteredCampaigns, nên ở Tổng quan gõ vào không có gì xảy ra. */}
          {searching && (
            <SearchResultsSection
              query={search}
              isLoading={isLoading}
              filtered={filteredCampaigns}
              filter={filter}
              setFilter={setFilter}
              isVolunteer={isVolunteer}
              isProvider={isProvider}
              isCharity={isCharity}
              isAccountActive={isAccountActive}
              myRoles={myRoles}
              onClear={() => setSearch('')}
            />
          )}

          {/* ═════ OVERVIEW (default) ═════ */}
          {!searching && section === 'overview' && (
            <OverviewDashboard
              isCharity={isCharity}
              isVolunteer={isVolunteer}
              isProvider={isProvider}
              isAccountActive={isAccountActive}
              meName={greetingName}
              greetingSubtitle={greetingSubtitle}
              stats={stats}
              globalStats={isCharity ? myStats.data : globalStats.data}
              allCampaigns={allCampaigns}
              myTasks={myTasks}
              onCreate={openCreateForm}
              onJumpTo={handleSetSection}
            />
          )}

          {/* ═════ MINE — Gom 3 trang (đang chạy / chờ duyệt / đã kết thúc) thành 1 ═════ */}
          {!searching && section === 'mine' && isCharity && (
            <MineTabbedSection
              stats={stats}
              allowEarlyStart={campaignConstraints?.allowEarlyStart ?? false}
              onCreate={openCreateForm}
              onJumpTo={handleSetSection}
            />
          )}

          {/* ═════ TASKS (volunteer) ═════ */}
          {!searching && section === 'tasks' && isVolunteer && (
            <div className="space-y-5">
              {/* Lời mời nhận ca đặt TRÊN danh sách việc: đây là thứ đang chờ TNV phản
                  hồi, còn danh sách dưới là việc đã nhận. */}
              <ShiftInvitesSection />
              <TasksSection myTasks={myTasks ?? []} />
            </div>
          )}

          {/* ═════ BROWSE (community) ═════ */}
          {!searching && section === 'browse' && (
            <BrowseSection
              isLoading={isLoading}
              filtered={filteredCampaigns}
              search={search}
              filter={filter}
              setFilter={setFilter}
              isVolunteer={isVolunteer}
              isProvider={isProvider}
              isCharity={isCharity}
              isAccountActive={isAccountActive}
              myRoles={myRoles}
            />
          )}
          {!searching && section === 'suppliers' && isCharity && (
            <SuppliersSection campaigns={stats.active} />
          )}
          {!searching && section === 'providers' && isProvider && (
            <ProviderSection />
          )}
          {!searching && section === 'orders' && isCharity && (
            <EmbeddedTab source="reservations" title="Đơn nhận của tôi" />
          )}
          {/* Tổ chức nhận hàng qua quyên góp/yêu cầu NCC chứ không đặt chỗ, nên tab này
              KHÔNG dùng lại trang lịch sử đặt chỗ của người nhận cá nhân (luôn rỗng). */}
          {!searching && section === 'history' && isCharity && <IntakeHistorySection />}
        </main>
      </div>

      {/* === Mobile sticky action bar (charity) === */}
      {isCharity && (
        <div className="cm-actionbar-console">
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="cm-btn-ember flex-1 inline-flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            Tạo chiến dịch
          </button>
        </div>
      )}

      {showForm && (
        <CreateCampaignModal
          onClose={() => setShowForm(false)}
          onSubmit={create.mutateAsync}
          pending={create.isPending}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// OVERVIEW DASHBOARD — default landing for every persona
// ─────────────────────────────────────────────────────────────────────────────

function OverviewDashboard({
  isCharity,
  isVolunteer,
  isProvider,
  isAccountActive,
  meName,
  greetingSubtitle,
  stats,
  globalStats,
  allCampaigns,
  myTasks,
  onCreate,
  onJumpTo,
}: {
  isCharity: boolean;
  isVolunteer: boolean;
  isProvider: boolean;
  isAccountActive: boolean;
  meName: string;
  greetingSubtitle: string;
  stats: { active: Campaign[]; drafts: Campaign[]; finished: Campaign[]; pendingApprovals: number; totalVolunteers: number; all: Campaign[] };
  globalStats?: { mealsServed: number; peopleServed: number; completedCampaigns: number; completionRate: number; totalCampaigns: number; activeCampaigns: number };
  allCampaigns: Campaign[];
  myTasks: MyTask[] | undefined;
  onCreate: () => void;
  onJumpTo: (s: Section) => void;
}) {
  const gs = globalStats;
  return (
    <>
      {/* Banner cảnh báo khi tài khoản chưa được admin duyệt */}
      {!isAccountActive && (isVolunteer || isProvider || isCharity) && (
        <div className="cm-alert">
          <div className="cm-alert-icon">
            <span className="material-symbols-outlined text-[18px]">hourglass_top</span>
          </div>
          <div className="cm-alert-body">
            <p className="cm-alert-title">
              Tài khoản của bạn đang chờ quản trị viên duyệt
            </p>
            <p className="cm-alert-sub">
              {isVolunteer
                ? 'Bạn có thể khám phá chiến dịch nhưng chưa thể đăng ký tham gia cho đến khi admin phê duyệt hồ sơ tình nguyện viên.'
                : isProvider
                  ? 'Bạn có thể xem chiến dịch nhưng chưa thể hứa góp nguyên liệu cho đến khi admin phê duyệt hồ sơ nhà cung cấp.'
                  : 'Admin đang xác minh giấy tờ tổ chức của bạn. Trong thời gian chờ, bạn có thể xem trang nhưng chưa thể tạo chiến dịch hay thao tác quản lý.'}
            </p>
          </div>
        </div>
      )}

      {/* Greeting hero */}
      <div className="cm-greeting">
        <div className="relative z-10 min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-widest text-[#6EE7B7]">
            {isCharity ? 'Workspace quản lý' : isVolunteer ? 'Công việc của bạn' : 'Cộng đồng'}
          </p>
          <h1 className="cm-greeting-title mt-1">
            Xin chào, {meName} {isCharity ? '👋' : '🌿'}
          </h1>
          <p className="cm-greeting-sub">{greetingSubtitle}</p>
        </div>
        
      </div>

      {/* KPI tiles — impact / higher-level metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPITile
          label="Suất ăn đã phát"
          value={gs?.mealsServed ?? 0}
          icon="inventory"
          tone="mint"
          sub={isCharity ? 'Chiến dịch của tổ chức' : 'Tất cả chiến dịch'}
          onClick={() => onJumpTo('mine')}
        />
        <KPITile
          label="Người được phục vụ"
          value={gs?.peopleServed ?? 0}
          icon="group"
          tone="sky"
          sub={isCharity ? 'Người nhận từ tổ chức' : 'Tổng cộng đồng'}
          onClick={() => onJumpTo('mine')}
        />
        <KPITile
          label="Chiến dịch đã hoàn tất"
          value={gs?.completedCampaigns ?? 0}
          icon="verified"
          tone="ink"
          sub={isCharity ? 'Của tổ chức' : 'Thành công'}
          onClick={() => onJumpTo('mine')}
        />
        <KPITile
          label="Tỉ lệ hoàn thành"
          value={gs?.completionRate ?? 0}
          icon="percent"
          tone="ember"
          sub={gs ? `${gs.completionRate}% hoàn thành` : '— chưa có chiến dịch'}
          onClick={() => onJumpTo('mine')}
        />
      </div>

      {/* Biểu đồ gộp toàn tổ chức — chỉ charity; TNV/NCC có dashboard riêng. */}
      {isCharity && isAccountActive && <CharityOverviewCharts />}

      {/* Pending approval alert (charity, only when there's something pending) */}
      {isCharity && stats.pendingApprovals > 0 && (
        <div className="cm-alert">
          <div className="cm-alert-icon">
            <span className="material-symbols-outlined text-[18px]">pending_actions</span>
          </div>
          <div className="cm-alert-body">
            <p className="cm-alert-title">
              {stats.pendingApprovals} tình nguyện viên đang chờ bạn duyệt
            </p>
            <p className="cm-alert-sub">Vào trang chiến dịch đang chạy để xem hồ sơ.</p>
          </div>
          <button type="button" onClick={() => onJumpTo('mine')} className="cm-alert-cta">
            Duyệt ngay →
          </button>
        </div>
      )}

      {/* Active campaigns list (charity) OR recommended for volunteer/provider */}
      {isCharity ? (
        <section>
          <div className="cm-section-head">
            <h2 className="cm-section-title">
              <span className="material-symbols-outlined text-emerald-600">play_circle</span>
              Đang chạy ({stats.active.length})
            </h2>
            <button
              type="button"
              onClick={() => onJumpTo('mine')}
              className="text-xs font-bold text-neutral-500 hover:text-neutral-900"
            >
              Xem tất cả →
            </button>
          </div>
          {stats.active.length === 0 ? (
            <EmptyState
              icon="soup_kitchen"
              title="Chưa có chiến dịch đang chạy"
              description="Bấm 'Tạo chiến dịch' ở góc trên bên phải hoặc trong thanh bên để bắt đầu."
              action={{ label: 'Tạo chiến dịch đầu tiên', onClick: onCreate, icon: 'add' }}
            />
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {stats.active.slice(0, 4).map((c) => (
                <ActiveCard key={c.id} c={c} />
              ))}
            </div>
          )}
        </section>
      ) : (
        <section>
          <div className="cm-section-head">
            <h2 className="cm-section-title">
              <span className="material-symbols-outlined text-emerald-600">
                {isVolunteer ? 'recommend' : 'campaign'}
              </span>
              {isVolunteer
                ? 'Gợi ý cho bạn'
                : isProvider
                  ? 'Đang cần hỗ trợ nguyên liệu'
                  : 'Đang tuyển'}
            </h2>
            <button
              type="button"
              onClick={() => onJumpTo('browse')}
              className="text-xs font-bold text-neutral-500 hover:text-neutral-900"
            >
              Xem tất cả →
            </button>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {allCampaigns
              .filter((c) => c.status === 'approved')
              .slice(0, 4)
              .map((c) => (
                <CampaignCard
                  key={c.id}
                  c={c}
                  myRoles={isVolunteer ? (myTasks ?? []).map((t) => t.role) : []}
                  isProvider={isProvider}
                  disabled={!isAccountActive}
                />
              ))}
          </div>
        </section>
      )}

      {/* Activity feed */}
      <ActivityFeed campaigns={stats.all.slice(0, 6)} />

      {/* Stories (footer-style for non-charity) */}
      {!isCharity && <CompletedCampaignsSection />}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function KPITile({
  label, value, icon, tone, sub, onClick,
}: {
  label: string;
  value: number;
  icon: string;
  tone: 'mint' | 'ember' | 'sky' | 'ink';
  sub: string;
  onClick?: () => void;
}) {
  const toneBg = {
    mint: 'bg-emerald-50 text-emerald-700',
    ember: 'bg-[#FFF1EF] text-[#B91C1C]',
    sky: 'bg-sky-50 text-sky-700',
    ink: 'bg-neutral-100 text-neutral-700',
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className="cm-tile text-left hover:border-neutral-300 transition-colors"
    >
      <div className="flex items-center justify-between">
        <span className="cm-tile-label">{label}</span>
        <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${toneBg}`}>
          <span className="material-symbols-outlined text-[16px]">{icon}</span>
        </span>
      </div>
      <span className="cm-tile-value">{value.toLocaleString('vi-VN')}</span>
      <span className="cm-tile-sub">{sub}</span>
    </button>
  );
}

function ActiveCard({ c }: { c: Campaign }) {
  const dateStr = new Date(c.scheduledDate).toLocaleDateString('vi-VN', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  });
  const total = c.chefSlotsNeeded + c.waiterSlotsNeeded + c.shipperSlotsNeeded;
  const filled =
    c.chefSlotsFilled + c.waiterSlotsFilled + c.shipperSlotsFilled;
  const pct = total > 0 ? Math.round((filled / total) * 100) : 0;
  return (
    <div className="cm-active">
      <div className="cm-active-head">
        <Link href={`/campaigns/${c.id}`} className="min-w-0 flex-1">
          <h3 className="cm-active-title">{c.title}</h3>
        </Link>
        <span
          className={`cm-chip ${
            c.status === 'in_progress' ? 'cm-chip--mint' : 'cm-chip--sky'
          }`}
        >
          {c.status === 'in_progress' ? 'Đang chạy' : 'Đang tuyển'}
        </span>
      </div>
      <div className="cm-active-meta">
        <span>
          <span className="material-symbols-outlined text-[14px]">event</span>
          {dateStr} · {c.startTime}–{c.endTime}
        </span>
        <span>
          <span className="material-symbols-outlined text-[14px]">place</span>
          <span className="truncate max-w-[180px] inline-block align-middle">{c.kitchenAddress}</span>
        </span>
      </div>
      <div className="cm-active-progress">
        <div className="cm-active-bar">
          <div className="cm-active-bar-fill" style={{ width: `${pct}%` }} />
        </div>
        <span className="cm-active-bar-label">{filled}/{total} TNV</span>
      </div>
      <div className="cm-active-actions">
        <Link href={`/campaigns/${c.id}/manage`} className="cm-active-link">
          Quản lý
        </Link>
        <Link href={`/campaigns/${c.id}`} className="cm-active-link">
          Xem chi tiết
        </Link>
      </div>
    </div>
  );
}

function ActivityFeed({ campaigns }: { campaigns: Campaign[] }) {
  // Bấm vào dòng "hứa góp" → mở chi tiết đơn quyên góp + phân công TNV đi nhận
  const [selected, setSelected] = useState<{ campaign: Campaign; donation: NonNullable<Campaign['donations']>[number] } | null>(null);

  const events = useMemo(() => {
    const list: Array<{
      kind: 'apply' | 'donate' | 'complete';
      title: React.ReactNode;
      time: string;
      variant: 'mint' | 'ember' | 'sky' | 'honey';
      donation?: { campaign: Campaign; donation: NonNullable<Campaign['donations']>[number] };
    }> = [];
    for (const c of campaigns) {
      for (const a of c.assignments ?? []) {
        list.push({
          kind: 'apply',
          title: (
            <>
              <b>{a.volunteer.user.fullName}</b> đăng ký vai trò{' '}
              <b>{ROLE_LABEL[a.role] ?? a.role}</b> cho chiến dịch <b>{c.title}</b>
            </>
          ),
          time: 'Gần đây',
          variant: 'mint',
        });
      }
      for (const d of c.donations ?? []) {
        list.push({
          kind: 'donate',
          title: (
            <>
              <b>{d.provider.businessName}</b> hứa góp{' '}
              <b>
                {d.quantity ? `${d.quantity} ` : ''}
                {d.itemName}
              </b>{' '}
              cho <b>{c.title}</b>
            </>
          ),
          time: (d.pickupAssigneeIds ?? []).length > 0
            ? `Đã phân công ${(d.pickupAssigneeIds ?? []).length} shipper đi nhận`
            : d.status === 'pledged'
              ? 'Bấm để xem chi tiết & phân công shipper đi nhận'
              : 'Gần đây',
          variant: 'honey',
          donation: { campaign: c, donation: d },
        });
      }
      if (c.status === 'completed') {
        list.push({
          kind: 'complete',
          title: (
            <>
              Chiến dịch <b>{c.title}</b> đã hoàn tất — cảm ơn tình nguyện viên!
            </>
          ),
          time: 'Gần đây',
          variant: 'sky',
        });
      }
    }
    return list.slice(0, 8);
  }, [campaigns]);

  if (events.length === 0) {
    return null;
  }

  return (
    <section>
      <div className="cm-section-head">
        <h2 className="cm-section-title">
          <span className="material-symbols-outlined text-emerald-600">timeline</span>
          Hoạt động gần đây
        </h2>
      </div>
      <div className="cm-feed">
        {events.map((e, i) => (
          <div
            key={i}
            className={`cm-feed-item ${e.donation ? 'cursor-pointer hover:bg-neutral-50' : ''}`}
            onClick={e.donation ? () => setSelected(e.donation!) : undefined}
            role={e.donation ? 'button' : undefined}
          >
            <div className={`cm-feed-dot ${e.variant !== 'mint' ? `cm-feed-dot--${e.variant}` : ''}`}>
              <span className="material-symbols-outlined text-[18px]">
                {e.kind === 'apply' ? 'person_add' : e.kind === 'donate' ? 'inventory_2' : 'verified'}
              </span>
            </div>
            <div className="cm-feed-body">
              <p className="cm-feed-title">{e.title}</p>
              <p className="cm-feed-time">{e.time}</p>
            </div>
            {e.donation && (
              <span className="material-symbols-outlined text-[18px] text-neutral-300 self-center">chevron_right</span>
            )}
          </div>
        ))}
      </div>
      {selected && (
        <DonationDetailModal
          campaign={selected.campaign}
          donation={selected.donation}
          onClose={() => setSelected(null)}
        />
      )}
    </section>
  );
}

function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: string;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void; icon?: string };
}) {
  return (
    <div className="cm-card p-10 text-center">
      <div className="w-20 h-20 mx-auto rounded-full bg-[#FFF6F4] flex items-center justify-center">
        <span className="material-symbols-outlined text-[#E04A3F] text-[40px]">{icon}</span>
      </div>
      <p className="font-bold text-neutral-700 mt-4">{title}</p>
      <p className="text-sm text-neutral-400 mt-1 max-w-sm mx-auto">{description}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="cm-btn-ember mt-5 inline-flex items-center gap-2"
        >
          {action.icon && <span className="material-symbols-outlined text-[18px]">{action.icon}</span>}
          {action.label}
        </button>
      )}
    </div>
  );
}

function SectionList({
  title,
  icon,
  campaigns,
  emptyTitle,
  emptySubtitle,
  renderCard,
}: {
  title: string;
  icon: string;
  campaigns: Campaign[];
  emptyTitle: string;
  emptySubtitle: string;
  renderCard: (c: Campaign) => React.ReactNode;
}) {
  return (
    <section>
      <div className="cm-section-head">
        <h2 className="cm-section-title">
          <span className="material-symbols-outlined text-emerald-600">{icon}</span>
          {title} ({campaigns.length})
        </h2>
      </div>
      {campaigns.length === 0 ? (
        <EmptyState icon="inventory_2" title={emptyTitle} description={emptySubtitle} />
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">{campaigns.map(renderCard)}</div>
      )}
    </section>
  );
}

function PendingSection({
  stats,
  onJumpTo,
}: {
  stats: { all: Campaign[]; pendingApprovals: number };
  onJumpTo: (s: Section) => void;
}) {
  const pendingRows = stats.all.flatMap((c) =>
    (c.assignments ?? [])
      .filter((a) => a.status === 'pending')
      .map((a) => ({ campaign: c, assignment: a })),
  );
  return (
    <section>
      <div className="cm-section-head">
        <h2 className="cm-section-title">
          <span className="material-symbols-outlined text-[#B91C1C]">pending_actions</span>
          Chờ duyệt ({pendingRows.length})
        </h2>
      </div>
      {pendingRows.length === 0 ? (
        <EmptyState
          icon="task_alt"
          title="Không có đơn đăng ký nào đang chờ"
          description="Mọi đơn đăng ký đã được xử lý — tuyệt vời!"
        />
      ) : (
        <div className="cm-card overflow-hidden">
          {pendingRows.slice(0, 20).map(({ campaign, assignment }) => (
            <div key={assignment.id} className="cm-row">
              <span className="cm-row-thumb">
                {assignment.volunteer.user.fullName.charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="font-bold text-sm text-neutral-900 truncate">
                  {assignment.volunteer.user.fullName}
                </p>
                <p className="text-xs text-neutral-500 truncate">{campaign.title}</p>
              </div>
              <span className="cm-row-meta text-xs text-neutral-600 font-semibold">
                {ROLE_LABEL[assignment.role] ?? assignment.role}
              </span>
              <span className="cm-row-when text-xs text-neutral-400">Vừa xong</span>
              <Link
                href={`/campaigns/${campaign.id}/manage`}
                className="cm-active-link !text-emerald-700 hover:!bg-emerald-50"
              >
                Xem →
              </Link>
            </div>
          ))}
          {pendingRows.length > 20 && (
            <div className="p-3 text-center">
              <button
                type="button"
                onClick={() => onJumpTo('mine')}
                className="text-xs font-bold text-emerald-700 hover:text-emerald-900"
              >
                Xem tất cả {pendingRows.length} đơn →
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function StatsSection({
  stats,
}: {
  stats: { active: Campaign[]; finished: Campaign[]; totalVolunteers: number; all: Campaign[] };
}) {
  const totalServings = stats.all.reduce((sum, c) => sum + (c.actualServings ?? 0), 0);
  return (
    <section>
      <div className="cm-section-head">
        <h2 className="cm-section-title">
          <span className="material-symbols-outlined text-emerald-600">monitoring</span>
          Thống kê tổng quan
        </h2>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="cm-tile">
          <span className="cm-tile-label">Tổng chiến dịch</span>
          <span className="cm-tile-value">{stats.all.length}</span>
          <span className="cm-tile-sub">Tất cả trạng thái</span>
        </div>
        <div className="cm-tile">
          <span className="cm-tile-label">TNV đã tham gia</span>
          <span className="cm-tile-value">{stats.totalVolunteers}</span>
          <span className="cm-tile-sub">Không tính đơn pending</span>
        </div>
        <div className="cm-tile">
          <span className="cm-tile-label">Suất ăn phát được</span>
          <span className="cm-tile-value">{totalServings.toLocaleString('vi-VN')}</span>
          <span className="cm-tile-sub">Từ các chiến dịch đã kết thúc</span>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MINE — Gom 3 trang (đang chạy / chờ duyệt / đã kết thúc) thành 1 trang duy nhất
// ─────────────────────────────────────────────────────────────────────────────

/** Số chiến dịch mỗi trang ở tab "Chiến dịch của tôi". */
const MINE_PER_PAGE = 8;

type MineTab = 'all' | 'recruiting' | 'running' | 'pending' | 'finished';

const MINE_TABS: Array<{ key: MineTab; label: string; icon: string }> = [
  { key: 'all', label: 'Tất cả', icon: 'apps' },
  // "Đang tuyển" (approved) tách khỏi "Đang chạy" (in_progress): giai đoạn tuyển
  // quân là lúc tổ chức cần theo dõi sát nhất — gộp chung làm mờ mất tiến độ.
  { key: 'recruiting', label: 'Đang tuyển', icon: 'how_to_reg' },
  { key: 'running', label: 'Đang chạy', icon: 'play_circle' },
  { key: 'pending', label: 'Chờ duyệt', icon: 'pending_actions' },
  { key: 'finished', label: 'Đã kết thúc', icon: 'verified' },
];

function MineTabbedSection({
  stats,
  allowEarlyStart,
  onCreate,
  onJumpTo,
}: {
  stats: { active: Campaign[]; drafts: Campaign[]; finished: Campaign[]; pendingApprovals: number; totalVolunteers: number; all: Campaign[] };
  allowEarlyStart: boolean;
  onCreate: () => void;
  onJumpTo: (s: Section) => void;
}) {
  const [tab, setTab] = useState<MineTab>('all');
  // Phân trang phía client: danh sách chiến dịch của một tổ chức là hữu hạn và đã
  // nằm sẵn trong cache, cắt trang tại chỗ thì đổi trang tức thì, không gọi lại API.
  const [minePage, setMinePage] = useState(1);

  // Gom 3 nhóm: active (đang chạy), drafts (campaign chờ admin duyệt), finished
  /** Cắt danh sách theo trang đang xem. */
  function pageSlice<T>(list: T[]): T[] {
    return list.slice((minePage - 1) * MINE_PER_PAGE, minePage * MINE_PER_PAGE);
  }
  function totalPagesOf(list: unknown[]): number {
    return Math.max(1, Math.ceil(list.length / MINE_PER_PAGE));
  }

  // Đổi tab thì về trang 1 — ở lại trang 5 của tab cũ sẽ ra danh sách trống.
  useEffect(() => {
    setMinePage(1);
  }, [tab]);

  // stats.active gồm cả approved (đang tuyển) lẫn in_progress (đang chạy) — tách ra
  // để mỗi tab phản ánh đúng một giai đoạn.
  const recruiting = stats.active.filter((c) => c.status === 'approved');
  const running = stats.active.filter((c) => c.status === 'in_progress');
  const pendingCampaigns = stats.drafts;
  const finished = stats.finished;
  const pendingTNVCount = stats.pendingApprovals;

  // Đăng ký TNV chờ duyệt (gộp các assignment pending từ tất cả campaign)
  const pendingRows = useMemo(() => {
    return stats.all.flatMap((c) =>
      (c.assignments ?? [])
        .filter((a) => a.status === 'pending')
        .map((a) => ({ campaign: c, assignment: a })),
    );
  }, [stats.all]);

  const counts: Record<MineTab, number> = {
    all: recruiting.length + running.length + pendingCampaigns.length + finished.length + pendingTNVCount,
    recruiting: recruiting.length,
    running: running.length,
    pending: pendingRows.length + pendingCampaigns.length,
    finished: finished.length,
  };

  // Có nội dung "chờ duyệt" gì không (TNV + draft campaign)
  const hasPendingContent = pendingRows.length > 0 || pendingCampaigns.length > 0;

  return (
    <section className="space-y-5">
      {/* Header + tabs */}
      <div className="cm-section-head !flex-col sm:!flex-row sm:items-center gap-3">
        <h2 className="cm-section-title">
          <span className="material-symbols-outlined text-emerald-600">inventory_2</span>
          Chiến dịch của tôi
        </h2>
        <button
          type="button"
          onClick={onCreate}
          className="cm-btn-ember inline-flex items-center gap-1.5 text-sm !px-4 !py-2"
        >
          <span className="material-symbols-outlined text-[16px]">add</span>
          Tạo chiến dịch
        </button>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {MINE_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            aria-pressed={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`cm-filter-chip inline-flex items-center gap-1.5 ${
              tab === t.key ? '!bg-[#236c2a] !text-white !border-[#236c2a] ' : ''
            }`}
          >
            <span className="material-symbols-outlined text-[14px]">{t.icon}</span>
            {t.label}
            <span
              className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                tab === t.key
                  ? 'bg-white/20 text-white'
                  : 'bg-neutral-100 text-neutral-600'
              }`}
            >
              {counts[t.key]}
            </span>
          </button>
        ))}
      </div>

      {/* Alert pending nếu có */}
      {pendingTNVCount > 0 && (tab === 'all' || tab === 'pending') && (
        <div className="cm-alert">
          <div className="cm-alert-icon">
            <span className="material-symbols-outlined text-[18px]">pending_actions</span>
          </div>
          <div className="cm-alert-body">
            <p className="cm-alert-title">
              {pendingTNVCount} tình nguyện viên đang chờ bạn duyệt
            </p>
            <p className="cm-alert-sub">Vào trang quản lý chiến dịch đang chạy để xem hồ sơ.</p>
          </div>
          <Link
            href={`/campaigns/${recruiting[0]?.id ?? running[0]?.id ?? pendingCampaigns[0]?.id ?? ''}/manage`}
            className="cm-alert-cta"
          >
            Duyệt ngay →
          </Link>
        </div>
      )}

      {/* ════════ Tab "Đang tuyển" / "Đang chạy" / "Đã kết thúc": chỉ grid campaign ════════ */}
      {(tab === 'recruiting' || tab === 'running' || tab === 'finished') && (() => {
        const gridList = tab === 'recruiting' ? recruiting : tab === 'running' ? running : finished;
        const emptyMeta = {
          recruiting: {
            icon: 'how_to_reg',
            title: 'Chưa có chiến dịch đang tuyển',
            description: 'Chiến dịch được admin duyệt sẽ mở tuyển tình nguyện viên và hiển thị ở đây.',
          },
          running: {
            icon: 'soup_kitchen',
            title: 'Chưa có chiến dịch đang chạy',
            description: 'Bấm "Tạo chiến dịch" để bắt đầu hoạt động đầu tiên.',
          },
          finished: {
            icon: 'verified',
            title: 'Chưa có chiến dịch kết thúc',
            description: 'Các chiến dịch hoàn tất sẽ hiển thị ở đây.',
          },
        }[tab];
        return gridList.length === 0 ? (
          <EmptyState
            icon={emptyMeta.icon}
            title={emptyMeta.title}
            description={emptyMeta.description}
            action={{ label: 'Tạo chiến dịch', onClick: onCreate, icon: 'add' }}
          />
        ) : (
          <>
            <div className="grid sm:grid-cols-2 gap-3">
              {pageSlice(gridList).map((c) => (
                <MyCampaignCard key={c.id} c={c} allowEarlyStart={allowEarlyStart} />
              ))}
            </div>
            <Pagination
              page={minePage}
              totalPages={totalPagesOf(gridList)}
              onChange={setMinePage}
              total={gridList.length}
              perPage={MINE_PER_PAGE}
              unit="chiến dịch"
            />
          </>
        );
      })()}

      {/* ════════ Tab "Tất cả": grid các campaign (active + draft + finished), bỏ qua đơn TNV (xem riêng bên dưới) ════════ */}
      {tab === 'all' && (
        <>
          {recruiting.length + running.length + pendingCampaigns.length + finished.length === 0 ? (
            <EmptyState
              icon="soup_kitchen"
              title="Chưa có chiến dịch nào"
              description="Bấm 'Tạo chiến dịch' ở góc trên bên phải hoặc trong thanh bên để bắt đầu."
              action={{ label: 'Tạo chiến dịch đầu tiên', onClick: onCreate, icon: 'add' }}
            />
          ) : (
            <>
              <div className="grid sm:grid-cols-2 gap-3">
                {pageSlice([...recruiting, ...running, ...pendingCampaigns, ...finished]).map((c) => (
                  <MyCampaignCard key={c.id} c={c} allowEarlyStart={allowEarlyStart} />
                ))}
              </div>
              <Pagination
                page={minePage}
                totalPages={totalPagesOf([...recruiting, ...running, ...pendingCampaigns, ...finished])}
                onChange={setMinePage}
                total={recruiting.length + running.length + pendingCampaigns.length + finished.length}
                perPage={MINE_PER_PAGE}
                unit="chiến dịch"
              />
            </>
          )}
        </>
      )}

      {/* ════════ Tab "Chờ duyệt": ưu tiên đơn TNV chờ duyệt + draft campaigns ════════ */}
      {tab === 'pending' && (
        <>
          {!hasPendingContent ? (
            <EmptyState
              icon="task_alt"
              title="Không có gì đang chờ duyệt"
              description="Mọi đơn đăng ký và chiến dịch đã được xử lý — tuyệt vời!"
            />
          ) : (
            <>
              {pendingRows.length > 0 && (
                <PendingRegistrationsBlock pendingRows={pendingRows} />
              )}
              {pendingCampaigns.length > 0 && (
                <section className="space-y-3">
                  <div className="cm-section-head !mb-2">
                    <h3 className="cm-section-title !text-base">
                      <span className="material-symbols-outlined text-amber-600 text-[18px]">
                        hourglass_top
                      </span>
                      Chiến dịch chờ admin duyệt ({pendingCampaigns.length})
                    </h3>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {pendingCampaigns.map((c) => (
                      <MyCampaignCard key={c.id} c={c} allowEarlyStart={allowEarlyStart} />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </>
      )}

      {/* Inline pending registrations block — hiện ở tab "Tất cả" (nếu có) */}
      {tab === 'all' && pendingRows.length > 0 && (
        <PendingRegistrationsBlock pendingRows={pendingRows} />
      )}

    </section>
  );
}

function PendingRegistrationsBlock({
  pendingRows,
}: {
  pendingRows: Array<{ campaign: Campaign; assignment: { id: string; role: string; volunteer: { user: { fullName: string } } } }>;
}) {
  return (
    <div className="space-y-3">
      <div className="cm-section-head !mb-2">
        <h3 className="cm-section-title !text-base">
          <span className="material-symbols-outlined text-[#B91C1C] text-[18px]">
            pending_actions
          </span>
          Đơn đăng ký đang chờ ({pendingRows.length})
        </h3>
      </div>
      <div className="cm-card overflow-hidden">
        {pendingRows.slice(0, 10).map(({ campaign, assignment }) => (
          <div key={assignment.id} className="cm-row">
            <span className="cm-row-thumb">
              {assignment.volunteer.user.fullName.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="font-bold text-sm text-neutral-900 truncate">
                {assignment.volunteer.user.fullName}
              </p>
              <p className="text-xs text-neutral-500 truncate">{campaign.title}</p>
            </div>
            <span className="cm-row-meta text-xs text-neutral-600 font-semibold">
              {ROLE_LABEL[assignment.role] ?? assignment.role}
            </span>
            <span className="cm-row-when text-xs text-neutral-400">Vừa xong</span>
            <Link
              href={`/campaigns/${campaign.id}/manage`}
              className="cm-active-link !text-emerald-700 hover:!bg-emerald-50"
            >
              Duyệt →
            </Link>
          </div>
        ))}
        {pendingRows.length > 10 && (
          <div className="p-3 text-center">
            <span className="text-xs font-bold text-neutral-400">
              +{pendingRows.length - 10} đơn khác — mở trang quản lý để xem tất cả
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function isSameUtcDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

function taskEndDate(t: MyTask): Date | null {
  const datePart = t.campaign.scheduledDate?.slice(0, 10);
  if (!datePart) return null;
  const timePart = (t.campaign.endTime ?? '23:59').slice(0, 5);
  const d = new Date(`${datePart}T${timePart}:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isOverdue(t: MyTask, now: Date): boolean {
  if (t.status === 'completed' || t.status === 'cancelled' || t.status === 'absent') return false;
  const end = taskEndDate(t);
  if (!end) return false;
  return end.getTime() < now.getTime();
}

function TasksSection({ myTasks }: { myTasks: MyTask[] }) {
  const now = new Date();
  const todayKey = now.toISOString().slice(0, 10);
  const isToday = (t: MyTask) =>
    Boolean(t.campaign.scheduledDate?.slice(0, 10) === todayKey);

  // 1 TNV nhận nhiều ca cùng chiến dịch → BE trả nhiều task giống hệt nhau ngoài
  // ca trực. Gộp theo chiến dịch + vai trò thành 1 thẻ (KHÔNG theo trạng thái —
  // ca sáng đã điểm danh còn ca chiều mới nhận việc vẫn là một chiến dịch, tách ra
  // sẽ ra 2 thẻ trùng nhau); thẻ tự liệt kê các ca bên trong, mỗi ca kèm trạng
  // thái và link nhiệm vụ riêng.
  const taskGroupKey = (t: MyTask) => `${t.campaign.id}:${t.role}`;
  const taskGroups = new Map<string, MyTask[]>();
  for (const t of myTasks) {
    const k = taskGroupKey(t);
    taskGroups.set(k, [...(taskGroups.get(k) ?? []), t]);
  }
  // Trong nhóm: ca hiển thị theo thứ tự thời gian; thẻ đại diện lấy ca "đang
  // hoạt động" nhất để chip trạng thái đầu thẻ phản ánh việc cần làm ngay.
  const STATUS_RANK = ['in_progress', 'checked_in', 'assigned', 'pending', 'rejected', 'completed', 'absent', 'cancelled'];
  const rank = (t: MyTask) => {
    const i = STATUS_RANK.indexOf(t.status);
    return i === -1 ? STATUS_RANK.length : i;
  };
  for (const list of taskGroups.values()) {
    list.sort((a, b) =>
      `${a.workDate ?? ''}:${a.shift?.startTime ?? ''}`.localeCompare(
        `${b.workDate ?? ''}:${b.shift?.startTime ?? ''}`,
      ),
    );
  }
  const repOf = (list: MyTask[]) => [...list].sort((a, b) => rank(a) - rank(b))[0];
  const dedupedTasks = myTasks.filter((t) => repOf(taskGroups.get(taskGroupKey(t))!).id === t.id);
  const groupOf = (t: MyTask) => taskGroups.get(taskGroupKey(t));

  const todayTasks = dedupedTasks.filter(isToday);
  const upcomingTasks = dedupedTasks.filter((t) => !isToday(t));
  const overdueTodayCount = todayTasks.filter((t) => isOverdue(t, now)).length;

  return (
    <section>
      <div className="cm-section-head">
        <h2 className="cm-section-title">
          <span className="material-symbols-outlined text-emerald-600">assignment_ind</span>
          Việc của tôi ({dedupedTasks.length})
        </h2>
      </div>
      {myTasks.length === 0 ? (
        <EmptyState
          icon="assignment"
          title="Chưa có công việc nào"
          description="Hãy vào Khám phá cộng đồng để đăng ký một chiến dịch."
        />
      ) : (
        <div className="space-y-4">
          {overdueTodayCount > 0 && (
            <aside role="alert" className="cm-urgent-banner">
              <span className="material-symbols-outlined">priority_high</span>
              <div>
                <p className="font-bold text-rose-900 text-sm">
                  Có {overdueTodayCount} công việc KHẨN đã quá hạn hôm nay
                </p>
                <p className="text-xs text-rose-700 mt-0.5">
                  Bạn cần hoàn thành hoặc cập nhật trạng thái — bấm vào thẻ bên dưới để xử lý.
                </p>
              </div>
            </aside>
          )}

          {todayTasks.length > 0 && (
            <div>
              <p className="cm-tasks-group-title">
                <span className="material-symbols-outlined text-amber-600">wb_sunny</span>
                Việc hôm nay ({todayTasks.length})
              </p>
              <div className="grid sm:grid-cols-2 gap-3">
                {todayTasks.map((t) => (
                  <CampaignTaskCard key={t.id} t={t} group={groupOf(t)} />
                ))}
              </div>
            </div>
          )}

          {upcomingTasks.length > 0 && (
            <div>
              <p className="cm-tasks-group-title">
                <span className="material-symbols-outlined text-emerald-600">event_upcoming</span>
                Sắp tới ({upcomingTasks.length})
              </p>
              <div className="grid sm:grid-cols-2 gap-3">
                {upcomingTasks.map((t) => (
                  <CampaignTaskCard key={t.id} t={t} group={groupOf(t)} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * Kết quả tìm kiếm — hiện đè lên tab đang mở khi ô tìm kiếm có nội dung.
 *
 * Ô tìm kiếm nằm ở thanh trên của mọi tab, nên nếu chỉ tab "Khám phá" phản ứng thì
 * ở các tab khác người dùng gõ mà không thấy gì xảy ra. Ở đây tìm trên cả chiến dịch
 * công khai lẫn chiến dịch của chính tổ chức.
 */
function SearchResultsSection({
  query,
  isLoading,
  filtered,
  filter,
  setFilter,
  isVolunteer,
  isProvider,
  isAccountActive,
  myRoles,
  onClear,
}: {
  query: string;
  isLoading: boolean;
  filtered: Campaign[];
  filter: string;
  setFilter: (s: string) => void;
  isVolunteer: boolean;
  isProvider: boolean;
  isCharity: boolean;
  isAccountActive: boolean;
  myRoles: string[];
  onClear: () => void;
}) {
  return (
    <section>
      <div className="cm-section-head">
        <h2 className="cm-section-title">
          <span className="material-symbols-outlined text-emerald-600">search</span>
          Kết quả cho “{query.trim()}”
        </h2>
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-neutral-500">{filtered.length} kết quả</span>
          <button
            type="button"
            onClick={onClear}
            className="text-xs font-bold text-emerald-700 hover:underline inline-flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-[14px]">close</span>
            Xoá tìm kiếm
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {(Object.keys(STATUS_META) as Array<keyof typeof STATUS_META>).map((k) => {
          const meta = STATUS_META[k];
          return (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(k)}
              aria-pressed={filter === k}
              className="cm-filter-chip inline-flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[14px]">{meta.icon}</span>
              {meta.label}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="grid sm:grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-48 skeleton rounded-2xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="search_off"
          title="Không tìm thấy chiến dịch nào"
          description={`Không có chiến dịch nào khớp với “${query.trim()}”. Thử từ khoá khác hoặc bỏ bộ lọc trạng thái.`}
        />
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {filtered.map((c) => (
            <CampaignCard
              key={c.id}
              c={c}
              myRoles={isVolunteer ? myRoles : []}
              isProvider={isProvider}
              disabled={!isAccountActive}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function BrowseSection({
  isLoading,
  filtered,
  filter,
  setFilter,
  isVolunteer,
  isProvider,
  isCharity,
  isAccountActive,
  myRoles,
}: {
  isLoading: boolean;
  filtered: Campaign[];
  search: string;
  filter: string;
  setFilter: (s: string) => void;
  isVolunteer: boolean;
  isProvider: boolean;
  isCharity: boolean;
  isAccountActive: boolean;
  myRoles: string[];
}) {
  return (
    <section>
      <div className="cm-section-head">
        <h2 className="cm-section-title">
          <span className="material-symbols-outlined text-emerald-600">travel_explore</span>
          Khám phá cộng đồng
        </h2>
        <span className="text-xs font-bold text-neutral-500">{filtered.length} kết quả</span>
      </div>

      {!isAccountActive && (isVolunteer || isProvider) && (
        <div className="cm-alert mb-3">
          <div className="cm-alert-icon">
            <span className="material-symbols-outlined text-[18px]">hourglass_top</span>
          </div>
          <div className="cm-alert-body">
            <p className="cm-alert-title">Tài khoản đang chờ admin duyệt</p>
            <p className="cm-alert-sub">
              Bạn có thể xem chi tiết chiến dịch nhưng chưa thể đăng ký tham gia.
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {(Object.keys(STATUS_META) as Array<keyof typeof STATUS_META>).map((k) => {
          const meta = STATUS_META[k];
          return (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(k)}
              aria-pressed={filter === k}
              className="cm-filter-chip inline-flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[14px]">{meta.icon}</span>
              {meta.label}
            </button>
          );
        })}
      </div>
      {isLoading ? (
        <div className="grid sm:grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-48 skeleton rounded-2xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="search_off"
          title="Không tìm thấy chiến dịch"
          description="Thử bỏ bộ lọc hoặc đổi từ khoá."
        />
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {filtered.map((c) => (
            <CampaignCard
              key={c.id}
              c={c}
              myRoles={isVolunteer ? myRoles : []}
              isProvider={isProvider}
              // Khi tài khoản chưa active: vô hiệu hoá nút đăng ký (đi qua wrapper).
              disabled={!isAccountActive}
            />
          ))}
        </div>
      )}
      {!isLoading && filtered.length > 0 && (
        <CompletedCampaignsSection />
      )}
    </section>
  );
}
