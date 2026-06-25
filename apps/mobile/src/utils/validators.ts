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
  // email/phone là metadata truyền qua prop (không bắt buộc) — verify thực ở backend/Firebase.
  // Không validate ở đây để luồng phone_login (không có email) submit được.
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

// Đăng nhập bằng số điện thoại VN (0xxxxxxxxx) — chuẩn hoá về E.164 trước khi gửi Firebase.
export const phoneSignInSchema = z.object({
  phone: z
    .string()
    .regex(/^0[35789][0-9]{8}$/, 'Số điện thoại không hợp lệ (vd 0912345678)'),
});

export type PhoneSignInInput = z.infer<typeof phoneSignInSchema>;

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
});

export type UpdateProfileFormInput = z.infer<typeof updateProfileSchema>;
