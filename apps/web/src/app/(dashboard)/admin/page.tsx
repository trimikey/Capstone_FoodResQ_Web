'use client';

import dynamic from 'next/dynamic';

// Skeleton nhẹ dùng cho fallback khi lazy-load tab
function TabSkeleton() {
  return (
    <div className="max-w-6xl mx-auto space-y-4 animate-pulse">
      <div className="h-8 w-64 bg-neutral-100 rounded-xl" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => <div key={i} className="h-28 bg-neutral-100 rounded-2xl" />)}
      </div>
      <div className="h-64 bg-neutral-100 rounded-2xl" />
    </div>
  );
}

const loading = () => <TabSkeleton />;

const DashboardTab = dynamic(() => import('./_components/DashboardTab'), { loading });
const MapTab = dynamic(() => import('./_components/MapTab'), { loading });
const DonationsTab = dynamic(() => import('./_components/DonationsTab'), { loading });
const CampaignsAdminTab = dynamic(() => import('./_components/CampaignsAdminTab'), { loading });
const FoodAdminTab = dynamic(() => import('./_components/FoodAdminTab'), { loading });
const FoodCatalogTab = dynamic(() => import('./_components/FoodCatalogTab'), { loading });
const ReportsTab = dynamic(() => import('./_components/ReportsTab'), { loading });
const UsersTab = dynamic(() => import('./_components/UsersTab'), { loading });
const SettingsTab = dynamic(() => import('./_components/SettingsTab'), { loading });

type Tab = 'dashboard' | 'map' | 'donations' | 'campaigns' | 'food' | 'catalog' | 'reports' | 'users' | 'settings';

export default function AdminPage() {
  return <AdminShell />;
}

export function AdminShell({ initialTab }: { initialTab?: string } = {}) {
  const VALID_TABS = new Set<Tab>(['dashboard', 'map', 'donations', 'campaigns', 'food', 'catalog', 'reports', 'users', 'settings']);
  const tab: Tab =
    initialTab && VALID_TABS.has(initialTab as Tab) ? (initialTab as Tab) : 'dashboard';

  return (
    <>
      {tab === 'dashboard' && <DashboardTab />}
      {tab === 'map' && <MapTab />}
      {tab === 'donations' && <DonationsTab />}
      {tab === 'campaigns' && <CampaignsAdminTab />}
      {tab === 'food' && <FoodAdminTab />}
      {tab === 'catalog' && <FoodCatalogTab />}
      {tab === 'reports' && <ReportsTab />}
      {tab === 'users' && <UsersTab />}
      {tab === 'settings' && <SettingsTab />}
    </>
  );
}
