'use client';

import './campaign-tokens.css';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { AssignmentRole, UserRole } from '@foodresq/types';
import { toast } from 'sonner';
import {
  useCampaigns,
  useApplyCampaign,
  useCreateCampaign,
  useMyTasks,
  useMyCampaigns,
  type Campaign,
  type MyTask,
} from '@/hooks/useCampaigns';
import { useVolunteerMe } from '@/hooks/useDeliveries';
import { useMe } from '@/hooks/useProfile';
import { useProviders } from '@/hooks/useProviders';
import CampaignCard from './_components/CampaignCard';
import CampaignTaskCard from './_components/CampaignTaskCard';
import MyCampaignCard from './_components/MyCampaignCard';
import CompletedCampaignsSection from './_components/CompletedCampaignsSection';
import CreateCampaignModal from './_components/CreateCampaignModal';
import SuppliersSection from './_components/SuppliersSection';
import ProviderSection from './_components/ProviderSection';
import EmbeddedTab from './_components/EmbeddedPage';

type Section = 'overview' | 'mine' | 'tasks' | 'browse' | 'suppliers' | 'providers' | 'orders' | 'history';

const ROLE_LABEL: Record<string, string> = {
  chef: 'Đầu bếp',
  waiter: 'Phục vụ',
  shipper: 'Giao hàng',
};

const STATUS_META: Record<string, { label: string; icon: string }> = {
  all: { label: 'Tất cả', icon: 'apps' },
  open: { label: 'Đang tuyển', icon: 'campaign' },
  in_progress: { label: 'Đang diễn ra', icon: 'play_circle' },
  completed: { label: 'Đã hoàn tất', icon: 'verified' },
};

export default function CampaignsPage() {
  const { data: me } = useMe();
  const isVolunteer = me?.role === UserRole.VOLUNTEER;
  const isProvider = me?.role === UserRole.PROVIDER;
  const isCharity = me?.role === UserRole.RECEIVER && !!me?.receiver?.isCharityOrg;

  const { data, isLoading } = useCampaigns();
  const { data: vol } = useVolunteerMe(isVolunteer);
  const { data: myTasks } = useMyTasks(!!isVolunteer);
  const { data: myCampaigns } = useMyCampaigns(isCharity);
  const apply = useApplyCampaign();
  const create = useCreateCampaign();

  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<string>('all');

  // Đọc tab hiện tại từ query string ?tab=orders|history; mặc định overview
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialSection: Section = (() => {
    const t = searchParams.get('tab');
    if (
      t === 'orders' ||
      t === 'history' ||
      t === 'overview' ||
      t === 'mine' ||
      t === 'tasks' ||
      t === 'browse' ||
      t === 'suppliers' ||
      t === 'providers'
    ) {
      return t;
    }
    return 'overview';
  })();
  const [section, setSection] = useState<Section>(initialSection);

  // Đồng bộ section → ?tab=...
  const handleSetSection = (key: Section) => {
    setSection(key);
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    if (key === 'overview') params.delete('tab');
    else params.set('tab', key);
    const qs = params.toString();
    router.replace(qs ? `/campaigns?${qs}` : '/campaigns');
  };

  useEffect(() => {
    setSection(initialSection);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSection]);

  const myRoles = (vol?.specializations ?? []).map((s: { specialization: string }) => s.specialization);

  const allCampaigns = data ?? [];
  const filteredCampaigns = useMemo(() => {
    return allCampaigns.filter((c) => {
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
  }, [allCampaigns, filter, search]);

  // === Aggregate stats for greeting / KPI ===
  const stats = useMemo(() => {
    const my = myCampaigns ?? [];
    const active = my.filter((c) => c.status === 'open' || c.status === 'in_progress');
    const drafts = my.filter((c) => c.status === 'draft');
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

  async function handleApply(id: string, role: AssignmentRole) {
    try {
      await apply.mutateAsync({ id, role });
      toast.success(`Đã gửi đăng ký vai trò ${ROLE_LABEL[role]} — chờ quản trị viên duyệt`);
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? 'Đăng ký thất bại';
      toast.error(msg);
    }
  }

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
        {/* ─── Sidebar rail ─── */}
        <aside className="cm-rail" aria-label="Điều hướng chiến dịch">
          <div className="cm-rail-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/Logo_FoodResQ.png"
              alt="FoodResQ Logo"
              className="h-8 w-auto object-contain shrink-0"
            />
            <div>
              <p className="font-extrabold text-sm text-[var(--cm-ink-900)] leading-tight">
                Bếp ăn cộng đồng
              </p>
              <p className="text-[11px] text-neutral-500 font-medium mt-0.5">
                FoodResQ · {isCharity ? 'Quản lý' : 'Khám phá'}
              </p>
            </div>
          </div>

          <ul className="cm-rail-list">
            {railEntries.map((entry) => (
              <li key={entry.key}>
                <button
                  type="button"
                  aria-current={section === entry.key}
                  onClick={() => handleSetSection(entry.key)}
                  className="cm-rail-link"
                >
                  <span className="material-symbols-outlined text-[18px]">{entry.icon}</span>
                  <span>{entry.label}</span>
                  {entry.badge != null && <span className="badge">{entry.badge}</span>}
                </button>
              </li>
            ))}
          </ul>

          {/* Create CTA pinned to bottom of rail (charity only) */}
          {isCharity && (
            <div className="cm-rail-bottom">
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="cm-btn-ember w-full inline-flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-[18px]">add</span>
                <span>Tạo chiến dịch</span>
              </button>
            </div>
          )}
        </aside>

        {/* ─── Main content column ─── */}
        <main className="min-w-0 space-y-6">
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

          {/* ═════ OVERVIEW (default) ═════ */}
          {section === 'overview' && (
            <OverviewDashboard
              isCharity={isCharity}
              isVolunteer={isVolunteer}
              isProvider={isProvider}
              meName={greetingName}
              greetingSubtitle={greetingSubtitle}
              stats={stats}
              allCampaigns={allCampaigns}
              myTasks={myTasks}
              onCreate={() => setShowForm(true)}
              onJumpTo={handleSetSection}
            />
          )}

          {/* ═════ MINE — Gom 3 trang (đang chạy / chờ duyệt / đã kết thúc) thành 1 ═════ */}
          {section === 'mine' && isCharity && (
            <MineTabbedSection
              stats={stats}
              onCreate={() => setShowForm(true)}
              onJumpTo={handleSetSection}
            />
          )}

          {/* ═════ TASKS (volunteer) ═════ */}
          {section === 'tasks' && isVolunteer && (
            <TasksSection myTasks={myTasks ?? []} />
          )}

          {/* ═════ BROWSE (community) ═════ */}
          {section === 'browse' && (
            <BrowseSection
              isLoading={isLoading}
              filtered={filteredCampaigns}
              search={search}
              filter={filter}
              setFilter={setFilter}
              isVolunteer={isVolunteer}
              isProvider={isProvider}
              isCharity={isCharity}
              myRoles={myRoles}
              onApply={handleApply}
              applying={apply.isPending}
            />
          )}
          {section === 'suppliers' && isCharity && (
            <SuppliersSection />
          )}
          {section === 'providers' && isProvider && (
            <ProviderSection />
          )}
          {section === 'orders' && isCharity && (
            <EmbeddedTab source="reservations" title="Đơn nhận của tôi" />
          )}
          {section === 'history' && isCharity && (
            <EmbeddedTab source="history" title="Lịch sử đơn hàng" />
          )}
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
  meName,
  greetingSubtitle,
  stats,
  allCampaigns,
  myTasks,
  onCreate,
  onJumpTo,
}: {
  isCharity: boolean;
  isVolunteer: boolean;
  isProvider: boolean;
  meName: string;
  greetingSubtitle: string;
  stats: { active: Campaign[]; drafts: Campaign[]; finished: Campaign[]; pendingApprovals: number; totalVolunteers: number; all: Campaign[] };
  allCampaigns: Campaign[];
  myTasks: MyTask[] | undefined;
  onCreate: () => void;
  onJumpTo: (s: Section) => void;
}) {
  return (
    <>
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

      {/* KPI tiles — impact / higher-level metrics (khác Mine tab stats) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPITile
          label="Suất ăn đã phát"
          value={Number(stats.all.reduce((s, c) => s + (c.actualServings ?? 0), 0))}
          icon="inventory"
          tone="mint"
          sub="Tất cả chiến dịch"
          onClick={() => onJumpTo('mine')}
        />
        <KPITile
          label="Người được phục vụ"
          value={stats.all.reduce((s, c) => s + (c.distributionSummary?.peopleServed ?? c.peopleServed ?? 0), 0)}
          icon="group"
          tone="sky"
          sub="Tổng cộng đồng"
          onClick={() => onJumpTo('mine')}
        />
        <KPITile
          label="Chiến dịch đã hoàn tất"
          value={stats.finished.length}
          icon="verified"
          tone="ink"
          sub="Thành công"
          onClick={() => onJumpTo('mine')}
        />
        <KPITile
          label="Tỉ lệ hoàn thành"
          value={stats.all.length > 0 ? Math.round((stats.finished.length / stats.all.length) * 100) : 0}
          icon="percent"
          tone="ember"
          sub={stats.all.length > 0 ? `${Math.round((stats.finished.length / stats.all.length) * 100)}% hoàn thành` : '— chưa có chiến dịch'}
          onClick={() => onJumpTo('mine')}
        />
      </div>

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
              .filter((c) => c.status === 'open')
              .slice(0, 4)
              .map((c) => (
                <CampaignCard
                  key={c.id}
                  c={c}
                  myRoles={isVolunteer ? (myTasks ?? []).map((t) => t.role) : []}
                  onApply={() => undefined}
                  applying={false}
                  isProvider={isProvider}
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
  const events = useMemo(() => {
    const list: Array<{ kind: 'apply' | 'donate' | 'complete'; title: React.ReactNode; time: string; variant: 'mint' | 'ember' | 'sky' | 'honey' }> = [];
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
          time: 'Gần đây',
          variant: 'honey',
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
          <div key={i} className="cm-feed-item">
            <div className={`cm-feed-dot ${e.variant !== 'mint' ? `cm-feed-dot--${e.variant}` : ''}`}>
              <span className="material-symbols-outlined text-[18px]">
                {e.kind === 'apply' ? 'person_add' : e.kind === 'donate' ? 'inventory_2' : 'verified'}
              </span>
            </div>
            <div className="cm-feed-body">
              <p className="cm-feed-title">{e.title}</p>
              <p className="cm-feed-time">{e.time}</p>
            </div>
          </div>
        ))}
      </div>
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

type MineTab = 'all' | 'running' | 'pending' | 'finished';

const MINE_TABS: Array<{ key: MineTab; label: string; icon: string }> = [
  { key: 'all', label: 'Tất cả', icon: 'apps' },
  { key: 'running', label: 'Đang chạy', icon: 'play_circle' },
  { key: 'pending', label: 'Chờ duyệt', icon: 'pending_actions' },
  { key: 'finished', label: 'Đã kết thúc', icon: 'verified' },
];

function MineTabbedSection({
  stats,
  onCreate,
  onJumpTo,
}: {
  stats: { active: Campaign[]; drafts: Campaign[]; finished: Campaign[]; pendingApprovals: number; totalVolunteers: number; all: Campaign[] };
  onCreate: () => void;
  onJumpTo: (s: Section) => void;
}) {
  const [tab, setTab] = useState<MineTab>('all');

  // Gom 3 nhóm: active (đang chạy), drafts + pendingTNV (chờ duyệt), finished (đã kết thúc)
  const running = stats.active;
  const pendingCampaigns = stats.drafts;
  const finished = stats.finished;
  const pendingTNVCount = stats.pendingApprovals;

  const counts: Record<MineTab, number> = {
    all: running.length + pendingCampaigns.length + finished.length,
    running: running.length,
    pending: pendingCampaigns.length + pendingTNVCount,
    finished: finished.length,
  };

  const visible = useMemo(() => {
    if (tab === 'all') return [...running, ...pendingCampaigns, ...finished];
    if (tab === 'running') return running;
    if (tab === 'pending') return pendingCampaigns;
    return finished;
  }, [tab, running, pendingCampaigns, finished]);

  // Đăng ký TNV chờ duyệt (gộp các assignment pending từ tất cả campaign)
  const pendingRows = useMemo(() => {
    return stats.all.flatMap((c) =>
      (c.assignments ?? [])
        .filter((a) => a.status === 'pending')
        .map((a) => ({ campaign: c, assignment: a })),
    );
  }, [stats.all]);

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
              tab === t.key ? '!bg-emerald-700 !text-white !border-emerald-700' : ''
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
            href={`/campaigns/${running[0]?.id ?? pendingCampaigns[0]?.id ?? ''}/manage`}
            className="cm-alert-cta"
          >
            Duyệt ngay →
          </Link>
        </div>
      )}

      {/* Grid chiến dịch */}
      {visible.length === 0 ? (
        <EmptyState
          icon={tab === 'finished' ? 'verified' : 'soup_kitchen'}
          title={
            tab === 'running'
              ? 'Chưa có chiến dịch đang chạy'
              : tab === 'pending'
                ? 'Không có chiến dịch chờ duyệt'
                : tab === 'finished'
                  ? 'Chưa có chiến dịch kết thúc'
                  : 'Chưa có chiến dịch nào'
          }
          description={
            tab === 'running'
              ? 'Bấm "Tạo chiến dịch" để bắt đầu hoạt động đầu tiên.'
              : tab === 'pending'
                ? 'Các chiến dịch chưa được duyệt sẽ hiển thị ở đây.'
                : tab === 'finished'
                  ? 'Các chiến dịch hoàn tất sẽ hiển thị ở đây.'
                  : 'Bấm "Tạo chiến dịch" ở góc trên bên phải hoặc trong thanh bên để bắt đầu.'
          }
          action={{ label: 'Tạo chiến dịch', onClick: onCreate, icon: 'add' }}
        />
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {visible.map((c) => (
            <MyCampaignCard key={c.id} c={c} />
          ))}
        </div>
      )}

      {/* Inline pending registrations block — show khi tab all / pending */}
      {(tab === 'all' || tab === 'pending') && pendingRows.length > 0 && (
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
      )}

    </section>
  );
}

function TasksSection({ myTasks }: { myTasks: MyTask[] }) {
  return (
    <section>
      <div className="cm-section-head">
        <h2 className="cm-section-title">
          <span className="material-symbols-outlined text-emerald-600">assignment_ind</span>
          Việc của tôi ({myTasks.length})
        </h2>
      </div>
      {myTasks.length === 0 ? (
        <EmptyState
          icon="assignment"
          title="Chưa có công việc nào"
          description="Hãy vào Khám phá cộng đồng để đăng ký một chiến dịch."
        />
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {myTasks.map((t) => (
            <CampaignTaskCard key={t.id} t={t} />
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
  myRoles,
  onApply,
  applying,
}: {
  isLoading: boolean;
  filtered: Campaign[];
  search: string;
  filter: string;
  setFilter: (s: string) => void;
  isVolunteer: boolean;
  isProvider: boolean;
  isCharity: boolean;
  myRoles: string[];
  onApply: (id: string, role: AssignmentRole) => void;
  applying: boolean;
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
              onApply={onApply}
              applying={applying}
              isProvider={isProvider}
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