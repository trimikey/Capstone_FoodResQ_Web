export enum UserRole {
  ADMIN = 'admin',
  PROVIDER = 'provider',
  RECEIVER = 'receiver',
  VOLUNTEER = 'volunteer',
}

export enum UserStatus {
  PENDING_VERIFICATION = 'pending_verification',
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  BANNED = 'banned',
}

export enum BusinessType {
  RESTAURANT = 'restaurant',
  SUPERMARKET = 'supermarket',
  BAKERY = 'bakery',
  HOTEL = 'hotel',
  OTHER = 'other',
}

export enum VerificationStatus {
  PENDING = 'pending',
  UNDER_REVIEW = 'under_review',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export enum VolunteerRank {
  NEWCOMER = 'newcomer',
  ACTIVE = 'active',
  EXPERIENCED = 'experienced',
  EXPERT = 'expert',
}

export enum VolunteerSpecialization {
  SHIPPER = 'shipper',
  CHEF = 'chef',
  WAITER = 'waiter',
}

// Phải khớp enum food_category trong Postgres (9 giá trị thực).
export enum FoodCategory {
  COOKED_MEAL = 'cooked_meal',
  BAKERY = 'bakery',
  FRESH_FRUIT = 'fresh_fruit',
  BEVERAGE = 'beverage',
  VEGETABLES = 'vegetables',
  RAW_PROTEIN = 'raw_protein',
  DRY_GOODS = 'dry_goods',
  CANNED_PACKAGED = 'canned_packaged',
  OTHER = 'other',
}

export enum ListingStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  FULLY_RESERVED = 'fully_reserved',
  COMPLETED = 'completed',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
}

export enum QuantityUnit {
  KG = 'kg',
  PORTION = 'portion',
  ITEM = 'item',
  BOX = 'box',
  LITER = 'liter',
}

export enum ReservationStatus {
  CONFIRMED = 'confirmed',
  PICKED_UP = 'picked_up',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
  NO_SHOW = 'no_show',
}

export enum PickupVerificationType {
  FACE = 'face',
  ID_CARD = 'id_card',
}

export enum DeliveryStatus {
  PENDING_ASSIGNMENT = 'pending_assignment',
  ASSIGNED = 'assigned',
  HEADING_TO_PROVIDER = 'heading_to_provider',
  QC_COMPLETED = 'qc_completed',
  IN_TRANSIT = 'in_transit',
  DELIVERED = 'delivered',
  FAILED = 'failed',
}

export enum CampaignStatus {
  DRAFT = 'draft',
  OPEN = 'open',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum AssignmentRole {
  CHEF = 'chef',
  WAITER = 'waiter',
  SHIPPER = 'shipper',
}

export enum AssignmentStatus {
  ASSIGNED = 'assigned',
  CHECKED_IN = 'checked_in',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  ABSENT = 'absent',
  CANCELLED = 'cancelled',
}

export enum VerificationRequestType {
  PROVIDER_REGISTRATION = 'provider_registration',
  CHARITY_REGISTRATION = 'charity_registration',
  VOLUNTEER_CHEF_CERT = 'volunteer_chef_cert',
  RECEIVER_INCOME_PROOF = 'receiver_income_proof',
}

export enum TrustScoreReason {
  LATE_CANCELLATION = 'late_cancellation',
  NO_SHOW = 'no_show',
  BAD_RATING_RECEIVED = 'bad_rating_received',
  FOOD_SAFETY_VIOLATION = 'food_safety_violation',
  HOARDING_DETECTED = 'hoarding_detected',
  MANUAL_PENALTY = 'manual_penalty',
  SUCCESSFUL_RESCUE = 'successful_rescue',
  HIGH_RATING_RECEIVED = 'high_rating_received',
  MANUAL_BONUS = 'manual_bonus',
}

export enum OfferStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  EXPIRED = 'expired',
}

export enum ReportTargetType {
  USER = 'user',
  LISTING = 'listing',
  DELIVERY = 'delivery',
  CAMPAIGN = 'campaign',
}

export enum ReportReason {
  SPOILED_FOOD = 'spoiled_food',
  FAKE_ACCOUNT = 'fake_account',
  HOARDING = 'hoarding',
  NO_SHOW_PROVIDER = 'no_show_provider',
  UNSAFE_FOOD = 'unsafe_food',
  HARASSMENT = 'harassment',
  FRAUD = 'fraud',
  OTHER = 'other',
}

export enum ReportStatus {
  PENDING = 'pending',
  UNDER_REVIEW = 'under_review',
  RESOLVED = 'resolved',
  DISMISSED = 'dismissed',
}
