export const ROLE_LABEL: Record<string, string> = {
  chef: 'Đầu bếp',
  waiter: 'Phục vụ',
  shipper: 'Giao hàng',
};

export const ROLE_META: Record<
  string,
  { label: string; icon: string; badge: string; bar: string; soft: string; text: string }
> = {
  chef: {
    label: 'Đầu bếp',
    icon: 'skillet',
    badge: 'badge-honey',
    bar: 'bg-honey-400',
    soft: 'bg-honey-50',
    text: 'text-honey-700',
  },
  waiter: {
    label: 'Phục vụ',
    icon: 'room_service',
    badge: 'badge-sky',
    bar: 'bg-sky-400',
    soft: 'bg-sky-50',
    text: 'text-sky-700',
  },
  shipper: {
    label: 'Giao hàng',
    icon: 'local_shipping',
    badge: 'badge-emerald',
    bar: 'bg-emerald-500',
    soft: 'bg-emerald-50',
    text: 'text-emerald-700',
  },
};

export default function RoleBadge({ role, size = 'sm' }: { role: string; size?: 'sm' | 'md' }) {
  const rm = ROLE_META[role];
  if (!rm) return null;
  const iconSize = size === 'md' ? 'text-[16px]' : 'text-[14px]';
  const padding = size === 'md' ? 'px-2.5 py-1' : 'px-2 py-0.5';
  return (
    <span className={`badge ${rm.badge} ${padding}`}>
      <span className={`material-symbols-outlined ${iconSize}`}>{rm.icon}</span>
      {rm.label}
    </span>
  );
}