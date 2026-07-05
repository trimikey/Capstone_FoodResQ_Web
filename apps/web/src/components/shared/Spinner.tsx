// Spinner tròn dùng chung. Màu lấy theo `currentColor` — set màu qua text-* trong className.
const SIZES = {
  sm: 'w-5 h-5 border-2',
  md: 'w-6 h-6 border-2',
  lg: 'w-10 h-10 border-4',
} as const;

export function Spinner({
  size = 'md',
  className = '',
}: {
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <span
      role="status"
      aria-label="Đang tải"
      className={`inline-block animate-spin rounded-full border-current border-t-transparent ${SIZES[size]} ${className}`}
    />
  );
}
