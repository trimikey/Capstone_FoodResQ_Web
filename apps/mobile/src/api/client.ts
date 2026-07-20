import axios, { AxiosInstance, AxiosError } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';

/**
 * Axios instance for API calls
 */
const apiClient: AxiosInstance = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Request interceptor: Add authorization token to headers
 */
apiClient.interceptors.request.use(
  async (config) => {
    try {
      const accessToken = await AsyncStorage.getItem('accessToken');
      if (accessToken) {
        config.headers.Authorization = `Bearer ${accessToken}`;
      }
    } catch (error) {
      console.error('Error reading token from storage:', error);
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

/**
 * Response interceptor: Handle token refresh on 401
 */
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as any;

    // If error is 401 and we haven't already retried this request
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = await AsyncStorage.getItem('refreshToken');

        if (!refreshToken) {
          // No refresh token available, need to login again
          await handleLogout();
          return Promise.reject(error);
        }

        // Call refresh endpoint
        const refreshResponse = await axios.post(`${API_URL}/auth/refresh`, {
          refreshToken,
        });

        const { accessToken: newAccessToken } = refreshResponse.data.data;

        // Store new access token
        await AsyncStorage.setItem('accessToken', newAccessToken);

        // Update header for original request
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;

        // Retry original request with new token
        return apiClient(originalRequest);
      } catch (refreshError) {
        // Refresh failed, logout user
        await handleLogout();
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

/**
 * Callback được đăng ký từ tầng app (vd auth store) để reset session khi
 * refresh token thất bại — giúp auth guard điều hướng về login ngay lập tức
 * mà không tạo circular import (store import client, không ngược lại).
 */
let onSessionExpired: (() => void) | null = null;

export function setSessionExpiredHandler(handler: (() => void) | null): void {
  onSessionExpired = handler;
}

/**
 * Handle logout when token refresh fails
 */
async function handleLogout(): Promise<void> {
  try {
    await AsyncStorage.removeItem('accessToken');
    await AsyncStorage.removeItem('refreshToken');
    onSessionExpired?.();
  } catch (error) {
    console.error('Error during logout:', error);
  }
}

/**
 * API response type
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data: T;
  error?: {
    code: string;
    message: string;
  };
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
}

/**
 * Shape user backend trả về (NestJS dùng `fullName`, kèm vài field hồ sơ).
 * Store sẽ chuẩn hoá về `User` nội bộ (map fullName -> name).
 */
export interface ApiUser {
  id: string;
  email: string;
  fullName?: string;
  name?: string;
  phone?: string | null;
  role: string;
  status?: string;
  avatarUrl?: string | null;
  trustScore?: number;
}

/**
 * Hồ sơ đầy đủ trả về từ GET /users/me — kèm thống kê và thông tin theo vai trò.
 * Các nhánh volunteer/receiver là null nếu user không thuộc vai trò đó.
 */
export interface ApiUserProfile extends ApiUser {
  createdAt?: string;
  stats?: {
    kgSaved: number;
    completedCount: number;
    cancelledCount: number;
    providersHelped: number;
  };
  volunteer?: {
    specializations: { specialization: string; isVerified: boolean }[];
    rank: string;
    dedicationPoints: number;
  } | null;
  receiver?: {
    isCharityOrg: boolean;
    organizationName: string | null;
    address?: string | null;
    lng?: number | null;
    lat?: number | null;
  } | null;
  provider?: {
    id: string;
    businessName: string;
    businessType: string;
    address: string | null;
    contactPhone: string | null;
    taxCode?: string | null;
    isVerified?: boolean;
    avgRating?: number | null;
    verificationStatus?: string;
    lng?: number | null;
    lat?: number | null;
  } | null;
}

/** Body PATCH /users/me — cập nhật hồ sơ (tất cả field optional). */
export interface UpdateProfileInput {
  fullName?: string;
  phone?: string;
  avatarUrl?: string;
  address?: string;
  lng?: number;
  lat?: number;
}

/**
 * Login response type
 */
export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: ApiUser;
}

/**
 * Firebase auth response — như LoginResponse nhưng kèm cờ tài khoản mới
 * (để app điều hướng hoàn thiện hồ sơ/role).
 */
export interface FirebaseAuthResponse extends LoginResponse {
  isNewUser: boolean;
}

/**
 * API endpoints
 */
export const endpoints = {
  auth: {
    login: '/auth/login',
    register: '/auth/register',
    refresh: '/auth/refresh',
    logout: '/auth/logout',
    forgotPassword: '/auth/forgot-password',
    resetPassword: '/auth/reset-password',
    firebase: '/auth/firebase',
  },
  users: {
    // Hồ sơ người dùng đang đăng nhập (GET lấy chi tiết, PATCH cập nhật)
    me: '/users/me',
    // Đăng ký/kiểm tra khuôn mặt (GET trạng thái, POST enroll selfie/CCCD)
    faceEnrollment: '/users/me/face-enrollment',
  },
  listings: {
    search: '/listings',
    detail: (id: string) => `/listings/${id}`,
    // Provider (nhà cung cấp đăng tin)
    create: '/listings',
    providerMy: '/listings/provider/my',
    update: (id: string) => `/listings/${id}`,
    publish: (id: string) => `/listings/${id}/publish`,
    cancel: (id: string) => `/listings/${id}/cancel`,
  },
  reservations: {
    create: '/reservations',
    list: '/reservations/my',
    detail: (id: string) => `/reservations/${id}`,
    // Receiver huỷ đơn đã đặt / đánh giá sau khi nhận
    cancel: (id: string) => `/reservations/${id}/cancel`,
    rating: (id: string) => `/reservations/${id}/rating`,
    // Receiver nộp ảnh xác minh nhận hàng (chỉ khi status picked_up)
    pickupProof: (id: string) => `/reservations/${id}/pickup-proof`,
    // Provider quét QR nhận hàng
    scan: '/reservations/scan',
    confirmPickup: (id: string) => `/reservations/${id}/confirm-pickup`,
    // Provider xem đơn đặt vào tin của mình
    providerMy: '/reservations/provider/my',
  },
  reports: {
    // Báo cáo vấn đề (listing/user/delivery/campaign)
    create: '/reports',
    my: '/reports/my',
  },
  esg: {
    providerMe: '/esg/provider/me',
  },
  deliveries: {
    // Receiver theo dõi đơn giao tận nơi (trạng thái + vị trí shipper)
    track: (reservationId: string) => `/deliveries/track/${reservationId}`,
    // Volunteer (shipper): danh sách lời mời / đơn đang giao / lịch sử / thành tích
    myOffers: '/deliveries/my/offers',
    myActive: '/deliveries/my/active',
    myHistory: '/deliveries/my/history',
    myStats: '/deliveries/my/stats',
    // Volunteer: phản hồi lời mời + điều khiển vòng đời đơn giao
    accept: (id: string) => `/deliveries/${id}/accept`,
    reject: (id: string) => `/deliveries/${id}/reject`,
    cancel: (id: string) => `/deliveries/${id}/cancel`,
    fail: (id: string) => `/deliveries/${id}/fail`,
    // PATCH multipart {status, photo?} — chuyển bước (kèm ảnh QC/proof)
    updateStatus: (id: string) => `/deliveries/${id}/status`,
  },
  volunteers: {
    // Hồ sơ tình nguyện viên + trạng thái sẵn sàng + vị trí hiện tại
    me: '/volunteers/me',
    availability: '/volunteers/me/availability',
    location: '/volunteers/me/location',
  },
  campaigns: {
    // Chiến dịch bếp ăn cộng đồng (charity tạo). Provider: xem + quyên góp nguyên liệu.
    list: '/campaigns',
    detail: (id: string) => `/campaigns/${id}`,
    // Provider quyên góp nguyên liệu cho 1 chiến dịch (status pledged → charity xác nhận)
    donate: (id: string) => `/campaigns/${id}/donations`,
    // Charity-org (receiver isCharityOrg) quản lý bếp ăn của mình
    my: '/campaigns/my',
    create: '/campaigns',
    completed: '/campaigns/completed',
    uploadImage: '/campaigns/upload-image',
    start: (id: string) => `/campaigns/${id}/start`,
    cancel: (id: string) => `/campaigns/${id}/cancel`,
    complete: (id: string) => `/campaigns/${id}/complete`,
    changeRequests: (id: string) => `/campaigns/${id}/change-requests`,
    cancelChangeRequest: (id: string) => `/campaigns/change-requests/${id}/cancel`,
    // Charity xác nhận đã nhận 1 lượt quyên góp (status pledged → received)
    confirmDonation: (donationId: string) => `/campaigns/donations/${donationId}/confirm`,
    // Volunteer: đăng ký 1 vai trò (chef/waiter/shipper) trong chiến dịch
    apply: (id: string) => `/campaigns/${id}/apply`,
    // Volunteer: các công việc đã đăng ký
    myTasks: '/campaigns/my-tasks',
    // Volunteer: chuyển bước công việc (assigned → checked_in → in_progress → completed) + ảnh minh chứng
    advanceTask: (assignmentId: string) => `/campaigns/assignments/${assignmentId}/advance`,
  },
  recipes: {
    // Thư viện công thức nấu ăn (đầu bếp/chef đóng góp). List + detail công khai.
    list: '/recipes',
    mine: '/recipes/mine',
    detail: (id: string) => `/recipes/${id}`,
    create: '/recipes',
    uploadImage: '/recipes/upload-image',
    update: (id: string) => `/recipes/${id}`,
    delete: (id: string) => `/recipes/${id}`,
  },
  kitchen: {
    // Vận hành bếp trong 1 chiến dịch: ca làm việc + thực đơn (nối công thức)
    shifts: (campaignId: string) => `/campaigns/${campaignId}/shifts`,
    applyShift: (campaignId: string, shiftId: string) =>
      `/campaigns/${campaignId}/shifts/${shiftId}/apply`,
    menuItems: (campaignId: string) => `/campaigns/${campaignId}/menu-items`,
    removeMenuItem: (itemId: string) => `/campaigns/menu-items/${itemId}`,
  },
  notifications: {
    my: '/notifications/my',
    unreadCount: '/notifications/unread-count',
    read: (id: string) => `/notifications/${id}/read`,
    readAll: '/notifications/read-all',
  },
};

export default apiClient;
