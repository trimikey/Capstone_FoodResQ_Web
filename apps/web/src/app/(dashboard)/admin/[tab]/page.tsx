import { AdminShell } from '../_components/AdminShell';

/**
 * Route động cho các tab con của admin — khớp với các mục trong sidebar
 * admin/layout.tsx (vd: /admin/campaigns, /admin/users, /admin/reports…).
 * Toàn bộ UI được render từ AdminShell, chỉ khác initialTab.
 */
export default async function AdminTabPage({
  params,
}: {
  params: Promise<{ tab: string }>;
}) {
  const { tab } = await params;
  return <AdminShell initialTab={tab} />;
}
