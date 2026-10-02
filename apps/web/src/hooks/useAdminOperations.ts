import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

// Query key bắt đầu bằng 'admin' để các mutation sẵn có (duyệt hồ sơ, khoá tài khoản)
// làm mới luôn các trang giám sát này.

export interface AdminProvider {
  providerId: string;
  userId: string;
  businessName: string;
  businessType: string;
  taxCode: string | null;
  address: string;
  contactPhone: string | null;
  ownerName: string;
  email: string;
  accountStatus: 'pending_verification' | 'active' | 'suspended' | 'banned';
  verificationStatus: 'pending' | 'under_review' | 'approved' | 'rejected';
  isVerified: boolean;
  avgRating: number | null;
  evidenceUrls: string[];
  createdAt: string;
  listingsActive: number;
  listingsTotal: number;
  servingsGiven: number;
  ordersCompleted: number;
  ordersFinished: number;
  completionRate: number | null;
  reportsTotal: number;
  reportsPending: number;
  campaignRequests: { accepted: number; rejected: number; pending: number; expired: number };
}

export function useAdminProviders() {
  return useQuery({
    queryKey: ['admin', 'providers'],
    queryFn: async () => (await api.get('/admin/providers')).data.data as AdminProvider[],
  });
}

export interface AdminVolunteerOverview {
  volunteerId: string;
  userId: string;
  fullName: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  accountStatus: 'pending_verification' | 'active' | 'suspended' | 'banned';
  trustScore: number;
  dedicationPoints: number;
  rank: string;
  avgRating: number | null;
  verificationStatus: string;
  vehicleType: string | null;
  vehiclePlate: string | null;
  specializations: Array<{ specialization: 'chef' | 'waiter' | 'shipper'; isVerified: boolean }>;
  createdAt: string;
  shiftsUpcoming: number;
  shiftsTotal: number;
  deliveriesDelivered: number;
  deliveriesActive: number;
  deliveriesFailed: number;
  campaignShiftsDone: number;
  campaignAbsences: number;
  bulkRunsCompleted: number;
  bulkRunsCancelled: number;
}

export function useAdminVolunteersOverview() {
  return useQuery({
    queryKey: ['admin', 'volunteers-overview'],
    queryFn: async () => (await api.get('/admin/volunteers/overview')).data.data as AdminVolunteerOverview[],
  });
}

export type DeliveryMonitorGroup = 'waiting' | 'active' | 'stalled' | 'unclaimed';

export interface MonitoredDelivery {
  deliveryId: string;
  reservationId: string | null;
  group: DeliveryMonitorGroup;
  status: string;
  listingTitle: string;
  providerName: string;
  pickupAddress: string | null;
  receiverName: string;
  receiverPhone: string | null;
  deliveryAddress: string | null;
  quantity: number | null;
  distanceKm: number | null;
  scheduledAt: string | null;
  shipperName: string | null;
  shipperPhone: string | null;
  createdAt: string;
  updatedAt: string;
  minutesSinceUpdate: number;
  claimExpiresAt: string | null;
  failedReason: string | null;
}

export interface MonitoredBulkRun {
  id: string;
  status: 'requested' | 'approved' | 'picked_up';
  listingTitle: string;
  providerName: string;
  shipperName: string;
  shipperPhone: string | null;
  quantity: number;
  quantityDistributed: number;
  stops: number;
  createdAt: string;
  approvedAt: string | null;
  pickedUpAt: string | null;
}

export interface DeliveryMonitor {
  stalledAfterMinutes: number;
  unclaimedLookbackDays: number;
  counts: Record<DeliveryMonitorGroup | 'bulkRuns', number>;
  deliveries: MonitoredDelivery[];
  bulkRuns: MonitoredBulkRun[];
}

export function useAdminDeliveryMonitor() {
  return useQuery({
    queryKey: ['admin', 'delivery-monitor'],
    queryFn: async () => (await api.get('/admin/deliveries/monitor')).data.data as DeliveryMonitor,
    // Trang giám sát: tự làm mới để admin không phải bấm tải lại.
    refetchInterval: 30_000,
  });
}

export interface AdminCampaignIncident {
  id: string;
  context: 'pickup' | 'distribution';
  reasonCode: string;
  reasonLabel: string;
  detail: string | null;
  photoUrl: string | null;
  canContinue: boolean;
  delayMinutes: number | null;
  actionTaken: string | null;
  status: 'open' | 'resolved';
  resolvedAt: string | null;
  resolvedNote: string | null;
  createdAt: string;
  minutesOpen: number | null;
  campaignId: string;
  campaignTitle: string;
  campaignStatus: string;
  organizationName: string;
  organizationPhone: string | null;
  reporterName: string;
  reporterPhone: string | null;
}

export function useAdminCampaignIncidents(status?: 'open' | 'resolved') {
  return useQuery({
    queryKey: ['admin', 'campaign-incidents', status ?? 'all'],
    queryFn: async () =>
      (await api.get('/admin/campaign-incidents', { params: status ? { status } : {} })).data
        .data as AdminCampaignIncident[],
    refetchInterval: 30_000,
  });
}
