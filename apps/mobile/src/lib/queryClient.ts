import { QueryClient } from '@tanstack/react-query';

/**
 * QueryClient dùng chung cho toàn app.
 * Mặc định hợp lý cho mobile: không refetch khi focus lại (tốn data),
 * giữ cache 5 phút, retry 1 lần cho lỗi mạng tạm thời.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 phút coi như còn "tươi"
      gcTime: 1000 * 60 * 5, // giữ cache 5 phút
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});
