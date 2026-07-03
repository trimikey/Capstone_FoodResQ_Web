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
  // Nhóm ăn liền (ready_to_eat)
  COOKED_MEAL = 'cooked_meal', // Cơm, cháo, bún, phở, mì, món đã nấu chín
  BAKERY = 'bakery', // Bánh mì, bánh ngọt, bánh bao
  FRESH_FRUIT = 'fresh_fruit', // Trái cây tươi ăn ngay
  BEVERAGE = 'beverage', // Đồ uống
  // Nhóm nguyên liệu thô (raw_ingredient)
  VEGETABLES = 'vegetables', // Rau, củ, quả tươi (nguyên liệu)
  RAW_PROTEIN = 'raw_protein', // Thịt, cá, hải sản, trứng sống/chưa nấu
  DRY_GOODS = 'dry_goods', // Gạo, mì gói, đồ khô, gia vị
  CANNED_PACKAGED = 'canned_packaged', // Đồ hộp, đồ đóng gói đóng sẵn
  // Khác
  OTHER = 'other',
}

/** Nhóm lớn của thực phẩm — suy ra từ FoodCategory, không lưu riêng trong DB. */
export enum FoodGroup {
  READY_TO_EAT = 'ready_to_eat', // Thực phẩm ăn liền
  RAW_INGREDIENT = 'raw_ingredient', // Nguyên liệu thô / chưa chế biến
  OTHER = 'other',
}

/** Map loại chi tiết → nhóm lớn. */
export const FOOD_CATEGORY_GROUP: Record<FoodCategory, FoodGroup> = {
  [FoodCategory.COOKED_MEAL]: FoodGroup.READY_TO_EAT,
  [FoodCategory.BAKERY]: FoodGroup.READY_TO_EAT,
  [FoodCategory.FRESH_FRUIT]: FoodGroup.READY_TO_EAT,
  [FoodCategory.BEVERAGE]: FoodGroup.READY_TO_EAT,
  [FoodCategory.VEGETABLES]: FoodGroup.RAW_INGREDIENT,
  [FoodCategory.RAW_PROTEIN]: FoodGroup.RAW_INGREDIENT,
  [FoodCategory.DRY_GOODS]: FoodGroup.RAW_INGREDIENT,
  [FoodCategory.CANNED_PACKAGED]: FoodGroup.RAW_INGREDIENT,
  [FoodCategory.OTHER]: FoodGroup.OTHER,
};

/** Danh sách loại chi tiết thuộc một nhóm lớn. */
export const FOOD_GROUP_CATEGORIES: Record<FoodGroup, FoodCategory[]> = {
  [FoodGroup.READY_TO_EAT]: [
    FoodCategory.COOKED_MEAL,
    FoodCategory.BAKERY,
    FoodCategory.FRESH_FRUIT,
    FoodCategory.BEVERAGE,
  ],
  [FoodGroup.RAW_INGREDIENT]: [
    FoodCategory.VEGETABLES,
    FoodCategory.RAW_PROTEIN,
    FoodCategory.DRY_GOODS,
    FoodCategory.CANNED_PACKAGED,
  ],
  [FoodGroup.OTHER]: [FoodCategory.OTHER],
};

/** Nhãn tiếng Việt cho loại chi tiết — dùng cho UI/admin. */
export const FOOD_CATEGORY_LABEL: Record<FoodCategory, string> = {
  [FoodCategory.COOKED_MEAL]: 'Món đã nấu (cơm, cháo, bún, mì...)',
  [FoodCategory.BAKERY]: 'Bánh ngọt / bánh mì',
  [FoodCategory.FRESH_FRUIT]: 'Trái cây tươi',
  [FoodCategory.BEVERAGE]: 'Đồ uống',
  [FoodCategory.VEGETABLES]: 'Rau củ quả',
  [FoodCategory.RAW_PROTEIN]: 'Thịt, cá, trứng (sống/chưa nấu)',
  [FoodCategory.DRY_GOODS]: 'Đồ khô (gạo, mì gói, gia vị)',
  [FoodCategory.CANNED_PACKAGED]: 'Đồ hộp / đóng gói',
  [FoodCategory.OTHER]: 'Khác',
};

/** Nhãn tiếng Việt cho nhóm lớn. */
export const FOOD_GROUP_LABEL: Record<FoodGroup, string> = {
  [FoodGroup.READY_TO_EAT]: 'Thực phẩm ăn liền',
  [FoodGroup.RAW_INGREDIENT]: 'Nguyên liệu thô',
  [FoodGroup.OTHER]: 'Khác',
};

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

/** Trạng thái yêu cầu thay đổi chiến dịch do tổ chức từ thiện gửi, chờ admin duyệt. */
export enum CampaignChangeStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled',
}

export enum AssignmentStatus {
  PENDING = 'pending', // TNV vừa đăng ký, chờ admin duyệt
  ASSIGNED = 'assigned',
  CHECKED_IN = 'checked_in',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  ABSENT = 'absent',
  REJECTED = 'rejected', // admin từ chối đăng ký
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

/** Độ khó của công thức trong thư viện bếp. */
export enum RecipeDifficulty {
  EASY = 'easy',
  MEDIUM = 'medium',
  HARD = 'hard',
}

/** Loại kiểm tra an toàn thực phẩm (nhật ký HACCP-lite của đầu bếp). */
export enum SafetyCheckType {
  TEMPERATURE = 'temperature',
  HYGIENE = 'hygiene',
  STORAGE = 'storage',
  CROSS_CONTAMINATION = 'cross_contamination',
  HANDWASHING = 'handwashing',
  OTHER = 'other',
}

/** Kết quả một lần kiểm tra ATTP. */
export enum SafetyCheckResult {
  PASS = 'pass',
  WARNING = 'warning',
  FAIL = 'fail',
}
