'use client';

import { useParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { useMyTasks } from '@/hooks/useCampaigns';
import VolunteerKitchenSidebar from './_components/VolunteerKitchenSidebar';
import { KitchenChefProvider } from './_components/KitchenChefContext';

const ACTIVE_CHEF_STATUSES = ['assigned', 'checked_in', 'in_progress'];

export default function KitchenLayout({ children }: { children: ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const { data: tasks } = useMyTasks();
  const task = tasks?.find(
    (item) =>
      item.campaign.id === id &&
      item.role === 'chef' &&
      ACTIVE_CHEF_STATUSES.includes(item.status),
  );

  if (!task) {
    return <KitchenChefProvider>{children}</KitchenChefProvider>;
  }

  return (
    <KitchenChefProvider task={task}>
      <div className="min-h-screen">
        <VolunteerKitchenSidebar task={task} />
        <div className="lg:ml-56">{children}</div>
      </div>
    </KitchenChefProvider>
  );
}
