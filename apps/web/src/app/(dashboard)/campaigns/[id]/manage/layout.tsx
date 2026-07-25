'use client';

import { useParams } from 'next/navigation';
import { ManageShell } from '../../_components/ManageShell';

export default function ManageLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  if (!id) return null;
  return <ManageShell campaignId={id}>{children}</ManageShell>;
}