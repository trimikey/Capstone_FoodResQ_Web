import { z } from 'zod';

/**
 * Login form validation schema
 */
export const loginSchema = z.object({
  email: z
    .string()
    .email('Invalid email address')
    .min(5, 'Email must be at least 5 characters'),
  password: z
    .string()
    .min(6, 'Password must be at least 6 characters')
    .max(50, 'Password must not exceed 50 characters'),
});

export type LoginInput = z.infer<typeof loginSchema>;

/**
 * Register form validation schema
 */
export const registerSchema = z
  .object({
    email: z
      .string()
      .email('Invalid email address')
      .min(5, 'Email must be at least 5 characters'),
    password: z
      .string()
      .min(6, 'Password must be at least 6 characters')
      .max(50, 'Password must not exceed 50 characters'),
    confirmPassword: z.string(),
    name: z
      .string()
      .min(2, 'Name must be at least 2 characters')
      .max(50, 'Name must not exceed 50 characters'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export type RegisterInput = z.infer<typeof registerSchema>;

/**
 * Sign Up Basic Info (Step 1) validation schema
 */
export const signUpBasicInfoSchema = z
  .object({
    email: z
      .string()
      .email('Invalid email address')
      .min(5, 'Email must be at least 5 characters'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(50, 'Password must not exceed 50 characters')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[0-9]/, 'Password must contain at least one number'),
    confirmPassword: z.string(),
    name: z
      .string()
      .min(2, 'Name must be at least 2 characters')
      .max(50, 'Name must not exceed 50 characters'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export type SignUpBasicInfoInput = z.infer<typeof signUpBasicInfoSchema>;

/**
 * Sign Up Recipient Info (Step 2) validation schema
 */
export const signUpRecipientInfoSchema = z
  .object({
    recipientType: z.enum(['individual', 'charity']),
    idNumber: z.string().optional(),
    organizationName: z.string().optional(),
    taxId: z.string().optional(),
    address: z.string().min(10, 'Address must be at least 10 characters'),
  })
  .refine(
    (data) => {
      if (data.recipientType === 'individual') {
        return !!data.idNumber && data.idNumber.length > 0;
      }
      return (
        !!data.organizationName &&
        data.organizationName.length > 0 &&
        !!data.taxId &&
        data.taxId.length > 0
      );
    },
    {
      message: 'Please fill in all required fields for your recipient type',
      path: ['recipientType'],
    }
  );

export type SignUpRecipientInfoInput = z.infer<typeof signUpRecipientInfoSchema>;

/**
 * OTP Verification validation schema
 */
export const otpVerificationSchema = z.object({
  otp: z
    .string()
    .length(6, 'OTP must be 6 digits')
    .regex(/^\d+$/, 'OTP must contain only numbers'),
  // email là metadata truyền qua prop (không bắt buộc) — verify thực ở backend.
  email: z.string().optional(),
});

export type OtpVerificationInput = z.infer<typeof otpVerificationSchema>;

/**
 * Reset Password validation schema
 */
export const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(6, 'Password must be at least 6 characters')
      .max(50, 'Password must not exceed 50 characters')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[0-9]/, 'Password must contain at least one number'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/**
 * Forgot Password validation schema
 */
export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .email('Invalid email address')
    .min(5, 'Email must be at least 5 characters'),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

/**
 * Cập nhật hồ sơ (PATCH /users/me). Mọi field optional — chỉ gửi field thay đổi.
 * Ràng buộc khớp UpdateMeDto backend: phone theo định dạng di động VN, avatarUrl là URL.
 */
export const updateProfileSchema = z.object({
  fullName: z
    .string()
    .min(2, 'Họ tên phải có ít nhất 2 ký tự')
    .max(255, 'Họ tên không vượt quá 255 ký tự'),
  // Cho phép để trống (không đổi/không có); nếu nhập thì phải đúng định dạng VN.
  phone: z
    .string()
    .regex(/^0[35789][0-9]{8}$/, 'Số điện thoại không hợp lệ (vd 0912345678)')
    .or(z.literal('')),
  avatarUrl: z
    .string()
    .url('Đường dẫn ảnh không hợp lệ')
    .or(z.literal('')),
  address: z.string().optional(),
});

export type UpdateProfileFormInput = z.infer<typeof updateProfileSchema>;

/**
 * Tạo tin thực phẩm (provider) — khớp CreateListingDto backend.
 * Các field thời gian dùng Date (từ datetimepicker), convert ISO khi submit.
 */
const optionalPositive = z.preprocess(
  (v) => (v === '' || v == null ? undefined : Number(v)),
  z.number().positive('Phải là số dương').optional()
);

export const createListingSchema = z
  .object({
    title: z.string().min(1, 'Nhập tiêu đề').max(255, 'Tối đa 255 ký tự'),
    category: z.string().min(1, 'Chọn loại thực phẩm'),
    quantityTotal: z.coerce.number().positive('Số lượng phải lớn hơn 0'),
    quantityUnit: z.string().min(1, 'Chọn đơn vị'),
    maxPerReservation: z.coerce
      .number()
      .int('Phải là số nguyên')
      .min(1, 'Tối thiểu 1')
      .max(10, 'Tối đa 10'),
    pickupStartTime: z.date(),
    pickupEndTime: z.date(),
    expiryTime: z.date(),
    pickupAddress: z.string().min(1, 'Nhập địa chỉ lấy hàng'),
    description: z.string().optional(),
    weightPerUnitKg: optionalPositive,
    storageConditions: z.string().optional(),
    allergenNotes: z.string().optional(),
  })
  .refine((d) => d.pickupEndTime > d.pickupStartTime, {
    message: 'Giờ kết thúc phải sau giờ bắt đầu',
    path: ['pickupEndTime'],
  })
  .refine((d) => d.expiryTime >= d.pickupEndTime, {
    message: 'Hạn dùng phải từ giờ kết thúc lấy trở đi',
    path: ['expiryTime'],
  });

export type CreateListingFormInput = z.infer<typeof createListingSchema>;

/**
 * Thông tin cơ sở khi đăng ký provider (gửi kèm register).
 * businessType khớp enum BusinessType backend. lat/lng lấy từ GPS.
 */
export const signUpProviderSchema = z.object({
  businessName: z
    .string()
    .min(2, 'Nhập tên cơ sở')
    .max(255, 'Tối đa 255 ký tự'),
  businessType: z.enum(['restaurant', 'supermarket', 'bakery', 'hotel', 'other']),
  address: z.string().min(5, 'Nhập địa chỉ cơ sở'),
  phone: z
    .string()
    .regex(/^0[35789][0-9]{8}$/, 'Số điện thoại không hợp lệ (vd 0912345678)')
    .or(z.literal('')),
});

export type SignUpProviderFormInput = z.infer<typeof signUpProviderSchema>;
