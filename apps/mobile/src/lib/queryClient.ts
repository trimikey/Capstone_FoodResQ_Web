import { QueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';

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
      retry: (failureCount, error) => {
        if (isAxiosError(error) && error.response?.status === 401) return false;
        return failureCount < 1;
      },
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});
